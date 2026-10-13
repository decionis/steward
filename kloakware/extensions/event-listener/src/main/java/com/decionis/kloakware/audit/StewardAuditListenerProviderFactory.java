package com.decionis.kloakware.audit;

import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import java.util.stream.Collectors;
import org.jboss.logging.Logger;
import org.keycloak.Config;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventListenerProviderFactory;
import org.keycloak.events.EventType;
import org.keycloak.models.KeycloakSession;
import org.keycloak.models.KeycloakSessionFactory;

/**
 * The factory behind the `steward-audit` event listener: one per server,
 * configured once at start from the SPI options, enabled per realm in the
 * realm file (`eventsListeners`). The sinks are built here and shared;
 * each provider is a thin, per-request view over them.
 *
 * <pre>
 *   --spi-events-listener-steward-audit-sink-url=https://steward.example/api/activities/kloakware
 *   --spi-events-listener-steward-audit-sink-secret=...
 *   --spi-events-listener-steward-audit-event-types=LOGIN,LOGOUT,LOGIN_ERROR,...
 *   --spi-events-listener-steward-audit-kafka-bootstrap-servers=broker:9092   (kafka profile)
 *   --spi-events-listener-steward-audit-kafka-topic=kloakware-audit
 * </pre>
 *
 * As environment: KC_SPI_EVENTS_LISTENER_STEWARD_AUDIT_SINK_URL and so on.
 */
public class StewardAuditListenerProviderFactory implements EventListenerProviderFactory {

  public static final String ID = "steward-audit";
  static final String DEFAULT_EVENT_TYPES =
      "LOGIN,LOGOUT,LOGIN_ERROR,CODE_TO_TOKEN,REFRESH_TOKEN_ERROR,UPDATE_PASSWORD,UPDATE_PASSWORD_ERROR,"
          + "RESET_PASSWORD,UPDATE_TOTP,REMOVE_TOTP,UPDATE_CREDENTIAL,REMOVE_CREDENTIAL,"
          + "IDENTITY_PROVIDER_LOGIN,IDENTITY_PROVIDER_FIRST_LOGIN,FEDERATED_IDENTITY_LINK,"
          + "PERMISSION_TOKEN_ERROR,USER_DISABLED_BY_PERMANENT_LOCKOUT,USER_DISABLED_BY_TEMPORARY_LOCKOUT";

  private static final Logger LOG = Logger.getLogger(StewardAuditListenerProviderFactory.class);

  private final List<AuditSink> sinks = new ArrayList<>();
  private AsyncAuditSink outlet;
  private Set<EventType> eventTypes = EnumSet.noneOf(EventType.class);

  @Override
  public EventListenerProvider create(KeycloakSession session) {
    return new StewardAuditListenerProvider(outlet, eventTypes);
  }

  @Override
  public void init(Config.Scope config) {
    eventTypes = parseEventTypes(config.get("event-types", DEFAULT_EVENT_TYPES));
    sinks.add(new StdoutAuditSink());

    String sinkUrl = config.get("sink-url");
    if (sinkUrl != null && !sinkUrl.isBlank()) {
      String secret = config.get("sink-secret");
      if (secret == null || secret.isBlank()) {
        throw new IllegalStateException(
            "steward-audit: sink-secret is required with sink-url; Steward verifies every record");
      }
      sinks.add(new HttpAuditSink(sinkUrl, secret));
      LOG.infof("steward-audit: records go to %s, signed", sinkUrl);
    }

    String bootstrap = config.get("kafka-bootstrap-servers");
    if (bootstrap != null && !bootstrap.isBlank()) {
      if (!kafkaClientPresent()) {
        throw new IllegalStateException(
            "steward-audit: kafka-bootstrap-servers is set but this image was built without the kafka profile (mvn -Pkafka)");
      }
      sinks.add(new KafkaAuditSink(bootstrap, config.get("kafka-topic", "kloakware-audit")));
      LOG.infof("steward-audit: records go to Kafka at %s", bootstrap);
    }
    // Every sink behind one bounded queue and one thread: a request thread
    // never writes to standard output or the network for an audit record.
    outlet = new AsyncAuditSink(sinks);
  }

  @Override
  public void postInit(KeycloakSessionFactory factory) {}

  @Override
  public void close() {
    if (outlet != null) outlet.close();
    sinks.clear();
  }

  @Override
  public String getId() {
    return ID;
  }

  static Set<EventType> parseEventTypes(String list) {
    return Arrays.stream(list.split(","))
        .map(String::trim)
        .filter(name -> !name.isEmpty())
        .map(
            name -> {
              try {
                return EventType.valueOf(name);
              } catch (IllegalArgumentException unknown) {
                LOG.warnf("steward-audit: unknown event type %s is ignored", name);
                return null;
              }
            })
        .filter(type -> type != null)
        .collect(Collectors.toCollection(() -> EnumSet.noneOf(EventType.class)));
  }

  private static boolean kafkaClientPresent() {
    try {
      Class.forName("org.apache.kafka.clients.producer.KafkaProducer");
      return true;
    } catch (ClassNotFoundException absent) {
      return false;
    }
  }
}
