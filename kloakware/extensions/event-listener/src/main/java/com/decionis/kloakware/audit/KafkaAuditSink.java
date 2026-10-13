package com.decionis.kloakware.audit;

import java.util.Properties;
import org.apache.kafka.clients.producer.KafkaProducer;
import org.apache.kafka.clients.producer.Producer;
import org.apache.kafka.clients.producer.ProducerRecord;
import org.apache.kafka.common.serialization.StringSerializer;
import org.jboss.logging.Logger;

/**
 * Publishes each record to a Kafka topic, keyed by realm. Present only in a
 * JAR built with the `kafka` profile; the factory checks for the client
 * before constructing this, so a default build with a bootstrap server
 * configured fails at start with a sentence rather than at the first event
 * with a stack trace.
 */
public final class KafkaAuditSink implements AuditSink {

  private static final Logger LOG = Logger.getLogger(KafkaAuditSink.class);

  private final Producer<String, String> producer;
  private final String topic;

  public KafkaAuditSink(String bootstrapServers, String topic) {
    Properties properties = new Properties();
    properties.put("bootstrap.servers", bootstrapServers);
    properties.put("key.serializer", StringSerializer.class.getName());
    properties.put("value.serializer", StringSerializer.class.getName());
    properties.put("acks", "all");
    properties.put("client.id", "kloakware-audit");
    this.producer = new KafkaProducer<>(properties);
    this.topic = topic;
  }

  @Override
  public void publish(AuditEvent event) {
    Object realm = event.fields().get("realm");
    producer.send(
        new ProducerRecord<>(topic, realm == null ? null : realm.toString(), event.toJson()),
        (metadata, error) -> {
          if (error != null) LOG.warnf("Kafka refused a %s event: %s", event.type(), error.getMessage());
        });
  }

  @Override
  public void close() {
    producer.close();
  }
}
