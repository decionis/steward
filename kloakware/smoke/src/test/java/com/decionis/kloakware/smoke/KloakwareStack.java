package com.decionis.kloakware.smoke;

import java.nio.file.Path;
import java.time.Duration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.testcontainers.Testcontainers;
import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.Network;
import org.testcontainers.containers.PostgreSQLContainer;
import org.testcontainers.containers.output.Slf4jLogConsumer;
import org.testcontainers.containers.startupcheck.OneShotStartupCheckStrategy;
import org.testcontainers.containers.wait.strategy.Wait;
import org.testcontainers.images.builder.ImageFromDockerfile;
import org.testcontainers.images.builder.Transferable;
import org.testcontainers.utility.DockerImageName;
import org.testcontainers.utility.MountableFile;

/**
 * The local kloakware stack as the smoke test sees it: PostgreSQL, the server
 * image built from {@code server/Dockerfile}, and keycloak-config-cli applying
 * the realm and then the dev overlay, exactly as the compose file does.
 *
 * <p>Every credential is generated for the run and discarded with it. Nothing
 * is read from a file or from the environment, so the test proves the image
 * and the realm, not a developer's machine.
 */
final class KloakwareStack implements AutoCloseable {

  private static final Logger LOG = LoggerFactory.getLogger(KloakwareStack.class);

  /** The same images the compose file runs, pinned by digest there and here. */
  static final DockerImageName POSTGRES =
      DockerImageName.parse(
              "docker.io/library/postgres:17-alpine@sha256:b0f9560a2de083e2cc7382e75f808c7381a32852a7ec49117deedb300e552b24")
          .asCompatibleSubstituteFor("postgres");

  static final DockerImageName CONFIG_CLI =
      DockerImageName.parse(
          "docker.io/adorsys/keycloak-config-cli:6.5.1-26.5.5@sha256:0955d98c8a341898b7aa177477edf8a1e90569ae50bbe7598141c1270b773274");

  static final String REALM = "steward";
  static final String DEV_USER = "erin.example";

  /** The Steward origin the realm's redirect and logout URIs are built from. */
  static final String STEWARD_URL = "http://localhost:3000";

  /** The BankID simulator, the same script the compose file runs, pinned like it. */
  /** The entry in front of the two nodes, the same image and config as the compose file. */
  static final DockerImageName HAPROXY =
      DockerImageName.parse(
          "docker.io/library/haproxy:3.2-alpine@sha256:5d97434a423c2533cfeb42874d45cf6d69a840b60334582dfbfd5008e94c80be");

  /** The certificate maker (K11): the stack's authority, the terminator's and the steward-fapi client's key pairs. */
  private static final DockerImageName OPENSSL =
      DockerImageName.parse(
          "docker.io/alpine/openssl:3.5.9@sha256:e8a2319d15637db5296c0ff540bb028cfabc480b22fcdd4a020582393d32673f");
  /** The mutual-TLS terminator (K11) in front of the proxy's second entry, as the compose file runs it. */
  private static final DockerImageName NGINX =
      DockerImageName.parse(
          "docker.io/library/nginx:1.29-alpine@sha256:5616878291a2eed594aee8db4dade5878cf7edcb475e59193904b198d9b830de");
  /** The collector the nodes trace to, printing what arrives; the observability test reads it. */
  static final DockerImageName OTEL_COLLECTOR =
      DockerImageName.parse(
          "docker.io/otel/opentelemetry-collector-contrib:0.162.0@sha256:39923a8e431bd1f57be82411999d389fcfe40857492e4365456d97a4c1f74be6");

  static final DockerImageName PYTHON =
      DockerImageName.parse("docker.io/library/python:3-alpine@sha256:15de367b7dfee010efaa3072f82cefc560f4544a11f620943d2a4705d04a2a4f");

  private final Path root;
  private final Network network = Network.newNetwork();
  private final PostgreSQLContainer<?> database;
  private final GenericContainer<?> bankId;
  private final GenericContainer<?> ldap;
  private final GenericContainer<?> collector;
  private final GenericContainer<?> server;
  private final GenericContainer<?> second;
  private final GenericContainer<?> proxy;
  private final GenericContainer<?> terminator;
  /** The mail sink (K14): the realm's mails, kept and listed. */
  private final GenericContainer<?> mail;
  /** The SiteMinder agent stood in (K13): started once the realm is applied, since it fetches the realm's key. */
  private GenericContainer<?> agent;
  /** What the certificate maker produced, read out of its container before the terminator starts. */
  private Pki pki;
  /** The kloakware-ci service account's secret in the master realm (K11). */
  final String ciClientSecret = secret();
  private final AuditReceiver auditReceiver = new AuditReceiver();

  private final String databasePassword = secret();
  final String adminPassword = secret();
  final String clientSecret = secret();
  final String stewardApiSecret = secret();
  /** The legacy dashboard's secret (K13): the application behind the SiteMinder agent, now a client. */
  final String legacyClientSecret = secret();
  final String devUserPassword = secret();
  final String auditSecret = secret();
  final String brokerClientSecret = secret();
  final String ldapBindPassword = secret();
  final String stewardDbPassword = secret();

  KloakwareStack(Path root) {
    this.root = root.toAbsolutePath().normalize();

    database =
        new PostgreSQLContainer<>(POSTGRES)
            .withNetwork(network)
            .withNetworkAliases("db")
            .withDatabaseName("kloakware")
            .withUsername("kloakware")
            .withPassword(databasePassword)
            // Steward's own database, stood in beside kloakware's as the
            // compose file does, for the steward-users storage to read.
            .withEnv("STEWARD_DB_PASSWORD", stewardDbPassword)
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/steward-db/Init.sh"), 0755),
                "/docker-entrypoint-initdb.d/10-steward.sh");

    // OpenLDAP from the compose file's own Dockerfile, seeded at start.
    ldap =
        new GenericContainer<>(
                new ImageFromDockerfile("kloakware/ldap:smoke", false)
                    .withDockerfile(this.root.resolve("deploy/compose/ldap/Dockerfile")))
            .withNetwork(network)
            .withNetworkAliases("ldap")
            .withEnv("LDAP_ADMIN_PASSWORD", ldapBindPassword)
            .withEnv("LDAP_USER_PASSWORD", devUserPassword)
            .withExposedPorts(389)
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("ldap"))
            .waitingFor(
                Wait.forLogMessage(".*slapd starting.*\\n", 1).withStartupTimeout(Duration.ofMinutes(2)));

    bankId =
        new GenericContainer<>(PYTHON)
            .withNetwork(network)
            .withNetworkAliases("bankid")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/bankid/Simulator.py")),
                "/sim/Simulator.py")
            .withCommand("python3", "-I", "/sim/Simulator.py")
            .withExposedPorts(8090)
            .waitingFor(Wait.forLogMessage(".*bankid simulator listening.*\\n", 1));

    mail =
        new GenericContainer<>(PYTHON)
            .withNetwork(network)
            .withNetworkAliases("mail")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/mail/Sink.py")), "/mail/Sink.py")
            .withCommand("python3", "-I", "/mail/Sink.py")
            .withExposedPorts(8025)
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("mail"))
            .waitingFor(Wait.forHttp("/").forPort(8025).forStatusCode(200).withStartupTimeout(Duration.ofMinutes(1)));

    collector =
        new GenericContainer<>(OTEL_COLLECTOR)
            .withNetwork(network)
            .withNetworkAliases("otel-collector")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("observability/otel-collector.yaml")),
                "/etc/otelcol/config.yaml")
            .withCommand("--config=/etc/otelcol/config.yaml")
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("otel"))
            .waitingFor(Wait.forLogMessage(".*Everything is ready.*\\n", 1));

    // The audit listener posts to Steward; here, to a receiver in this JVM,
    // reached from the container as host.testcontainers.internal.
    auditReceiver.start();
    Testcontainers.exposeHostPorts(auditReceiver.port());

    Map<String, String> runtime = new HashMap<>();
    runtime.put("KC_DB_URL", "jdbc:postgresql://db:5432/kloakware");
    runtime.put(
        "KC_SPI_EVENTS_LISTENER_STEWARD_AUDIT_SINK_URL",
        "http://host.testcontainers.internal:" + auditReceiver.port() + "/api/activities/kloakware");
    runtime.put("KC_SPI_EVENTS_LISTENER_STEWARD_AUDIT_SINK_SECRET", auditSecret);
    runtime.put("KC_DB_USERNAME", "kloakware");
    runtime.put("KC_DB_PASSWORD", databasePassword);
    runtime.put("KC_BOOTSTRAP_ADMIN_USERNAME", "admin");
    runtime.put("KC_BOOTSTRAP_ADMIN_PASSWORD", adminPassword);
    // No hostname is configured: URLs derive from each request, which is what
    // a test reaching a mapped port needs. A deployment sets KC_HOSTNAME.
    runtime.put("KC_HOSTNAME_STRICT", "false");
    runtime.put("KC_HTTP_ENABLED", "true");
    // The proxies say what the client saw: plain http on the proxy's first
    // entry, https behind the terminator (K11), and the issuer follows.
    runtime.put("KC_PROXY_HEADERS", "xforwarded");
    // Observability (K10), as the compose file runs it: every trace to the
    // collector, JSON on standard output.
    runtime.put("KC_TRACING_ENDPOINT", "http://otel-collector:4317");
    runtime.put("KC_TRACING_SAMPLER_RATIO", "1.0");
    runtime.put("KC_LOG_CONSOLE_OUTPUT", "json");

    // The Dockerfile at the project root, its .dockerignore honoured: the
    // extensions are compiled into the image here, as everywhere. Built
    // once, run twice: a cluster of two, discovered through jdbc-ping in the
    // shared database (K7). The tests reach the first node by name; the
    // cluster test reaches the second as well.
    // -Dkloakware.keycloak.image=<quay reference> builds the same Dockerfile
    // on another Keycloak: the upgrade rehearsal runs this suite against the
    // next release before the pin moves (K9).
    ImageFromDockerfile image =
        new ImageFromDockerfile("kloakware/server:smoke", false)
            .withDockerfile(this.root.resolve("Dockerfile"));
    String keycloakImage = System.getProperty("kloakware.keycloak.image", "");
    if (!keycloakImage.isBlank()) {
      image = image.withBuildArg("KEYCLOAK_IMAGE", keycloakImage);
    }
    server = node(image, runtime, "kloakware-1").withNetworkAliases("kloakware-1");
    second = node(image, runtime, "kloakware-2").withNetworkAliases("kloakware-2");

    // The proxy holds the name every client uses, as on a laptop: round-robin
    // over both nodes, so every test runs against the cluster, and one
    // address, so every node issues the same issuer. A node reached on its
    // own address would name that address, and the other would refuse its
    // tokens.
    proxy =
        new GenericContainer<>(HAPROXY)
            .withNetwork(network)
            .withNetworkAliases("kloakware")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/haproxy/haproxy.cfg")),
                "/usr/local/etc/haproxy/haproxy.cfg")
            // The edge rate limits (K11), the compose file's defaults: per
            // source per ten seconds, the token endpoint and the login post.
            .withEnv("KLOAKWARE_EDGE_TOKEN_RATE", String.valueOf(EDGE_TOKEN_RATE))
            .withEnv("KLOAKWARE_EDGE_LOGIN_RATE", String.valueOf(EDGE_LOGIN_RATE))
            .withExposedPorts(8080)
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("haproxy"))
            .waitingFor(
                Wait.forHttp("/haproxy/health").forPort(8080).forStatusCode(200).withStartupTimeout(Duration.ofMinutes(1)));

    // The terminator (K11): nginx verifying the client certificate against
    // the stack's authority and passing it to the proxy's second entry in the
    // header the nodes' nginx lookup reads. Its files come from the maker,
    // once that has run, so they are copied in at start.
    terminator =
        new GenericContainer<>(NGINX)
            .withNetwork(network)
            .withNetworkAliases("kloakware-mtls")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/mtls/nginx.conf")),
                "/etc/nginx/nginx.conf")
            .withExposedPorts(8443)
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("nginx"))
            .waitingFor(
                Wait.forHttp("/haproxy/health")
                    .forPort(8443)
                    .usingTls()
                    .allowInsecure()
                    .forStatusCode(200)
                    .withStartupTimeout(Duration.ofMinutes(1)));
  }

  /** The compose file's defaults for the edge limits; the rate-limit test counts against them. */
  static final int EDGE_TOKEN_RATE = 300;

  static final int EDGE_LOGIN_RATE = 60;

  /**
   * Runs the certificate maker as the compose file does and reads what it
   * made: the terminator gets its certificate and key and the authority, the
   * realm gets the client's certificate, the tests get the client's key.
   */
  private void makeCertificates() {
    try (GenericContainer<?> maker =
        new GenericContainer<>(OPENSSL)
            .withNetwork(network)
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/mtls/MakeCerts.sh")),
                "/mtls/MakeCerts.sh")
            .withCreateContainerCmdModifier(
                cmd -> cmd.withEntrypoint("/bin/sh", "/mtls/MakeCerts.sh", "/certs"))
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("mtls"))
            .withStartupCheckStrategy(
                new OneShotStartupCheckStrategy().withTimeout(Duration.ofMinutes(2)))) {
      maker.start();
      pki =
          new Pki(
              maker.copyFileFromContainer("/certs/ca.crt", Pki::read),
              maker.copyFileFromContainer("/certs/server.crt", Pki::read),
              maker.copyFileFromContainer("/certs/server.key", Pki::read),
              maker.copyFileFromContainer("/certs/steward-fapi.crt", Pki::read),
              maker.copyFileFromContainer("/certs/steward-fapi.key", Pki::read),
              maker.copyFileFromContainer("/certs/steward-fapi.der.b64", Pki::read));
    }
    terminator
        .withCopyToContainer(Transferable.of(pki.caCertificatePem), "/certs/ca.crt")
        .withCopyToContainer(Transferable.of(pki.serverCertificatePem), "/certs/server.crt")
        .withCopyToContainer(Transferable.of(pki.serverKeyPem), "/certs/server.key");
  }

  private GenericContainer<?> node(ImageFromDockerfile image, Map<String, String> runtime, String name) {
    return new GenericContainer<>(image)
        .withNetwork(network)
        .withEnv(runtime)
        .withEnv("KC_CACHE_EMBEDDED_NODE_NAME", name)
        .withExposedPorts(8080, 9000)
        .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix(name))
        .waitingFor(
            Wait.forHttp("/health/ready")
                .forPort(9000)
                .forStatusCode(200)
                .withStartupTimeout(Duration.ofMinutes(4)))
        .dependsOn(database);
  }

  void start() {
    database.start();
    bankId.start();
    ldap.start();
    collector.start();
    mail.start();
    makeCertificates();
    server.start();
    // The second node after the first: on an empty database both would race
    // to create the schema, and the loser exits.
    second.start();
    proxy.start();
    terminator.start();
    // The realms first, with config-cli's defaults: what it created before
    // and no longer finds in the file, it removes. Corp before steward, since
    // steward's brokers point at it. Then the dev overlay, which must not
    // remove the realm's clients it does not mention.
    applyRealm(realmFiles(), Map.of());
    applyMaster();
    applyDevOverlay();
    startAgent();
  }

  /**
   * The legacy agent shim, as the compose file runs it: HAProxy verifying the
   * realm's token with the key its entrypoint fetched, setting the headers the
   * applications behind a SiteMinder agent read, and echoing them.
   */
  private void startAgent() {
    agent =
        new GenericContainer<>(HAPROXY)
            .withNetwork(network)
            .withNetworkAliases("legacy-agent")
            .withEnv("KLOAKWARE_REALM_URL", "http://kloakware:8080/realms/steward")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/legacy-agent/haproxy.cfg")),
                "/usr/local/etc/haproxy/haproxy.cfg")
            .withCopyFileToContainer(
                MountableFile.forHostPath(this.root.resolve("deploy/compose/legacy-agent/Entrypoint.sh")),
                "/usr/local/etc/haproxy/Entrypoint.sh")
            .withCreateContainerCmdModifier(
                cmd -> cmd.withEntrypoint("/bin/sh", "/usr/local/etc/haproxy/Entrypoint.sh"))
            .withExposedPorts(8082)
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("legacy-agent"))
            .waitingFor(
                Wait.forHttp("/agent/health").forPort(8082).forStatusCode(200).withStartupTimeout(Duration.ofMinutes(2)));
    agent.start();
  }

  /** The mail sink's listing: every mail the realm sent, as JSON. */
  String mailBaseUrl() {
    return "http://" + host() + ":" + mail.getMappedPort(8025);
  }

  /** The kloakware directory, for the fixtures the migration test reads. */
  Path root() {
    return root;
  }

  /** The legacy application behind the agent shim, as a client reaches it. */
  String agentBaseUrl() {
    return "http://" + host() + ":" + agent.getMappedPort(8082);
  }

  private List<Path> realmFiles() {
    return List.of(root.resolve("config/realms/corp.json"), root.resolve("config/realms/steward.json"));
  }

  /**
   * Applies the realm file again, then the dev overlay, as the compose file
   * does on a laptop: what is committed for this environment is the pair.
   */
  void reapplyRealm() {
    applyRealm(realmFiles(), Map.of());
    applyMaster();
    applyDevOverlay();
  }

  /**
   * The master realm's one addition (K11): the kloakware-ci service account,
   * after the realms since master's per-realm clients exist only once the
   * realms do, and without deleting what else master holds.
   */
  private void applyMaster() {
    applyRealm(
        List.of(root.resolve("config/realms/master.json")),
        Map.of("IMPORT_MANAGED_CLIENT", "no-delete"));
  }

  /**
   * The realm files applied as the kloakware-ci service account would apply
   * them from the promotion pipeline: client credentials against the master
   * realm, no administrator password anywhere. Throws when it does not
   * converge.
   */
  void applyRealmAsCi() {
    Map<String, String> login = new HashMap<>();
    login.put("KEYCLOAK_GRANT_TYPE", "client_credentials");
    login.put("KEYCLOAK_CLIENT_ID", "kloakware-ci");
    login.put("KEYCLOAK_CLIENT_SECRET", ciClientSecret);
    login.put("KEYCLOAK_LOGIN_REALM", "master");
    applyRealm(realmFiles(), login, false);
    // The dev overlay again, as the compose file runs it: the pipeline's
    // apply removed the dev clients the next test classes sign in with.
    applyDevOverlay();
  }

  /**
   * The dev overlay, laptop and CI only. It relaxes TLS on the master and
   * steward realms because a laptop runs plain HTTP and Docker Desktop may
   * present the host's traffic from an address outside the private ranges,
   * which "external" refuses; it seeds the operator and the smoke client; and
   * it must not remove the clients it does not mention.
   */
  private void applyDevOverlay() {
    applyRealm(
        List.of(
            root.resolve("config/realms/dev/master-dev.json"),
            root.resolve("config/realms/dev/steward-dev.json"),
            root.resolve("config/realms/dev/corp-dev.json")),
        Map.of("IMPORT_MANAGED_CLIENT", "no-delete"));
  }

  private void applyRealm(List<Path> files, Map<String, String> overrides) {
    applyRealm(files, overrides, true);
  }

  private void applyRealm(List<Path> files, Map<String, String> overrides, boolean asAdmin) {
    String target =
        files.stream().map(f -> "/config/" + f.getFileName()).collect(Collectors.joining(","));
    Map<String, String> environment = new HashMap<>();
    environment.put("KEYCLOAK_URL", "http://kloakware:8080");
    if (asAdmin) {
      environment.put("KEYCLOAK_USER", "admin");
      environment.put("KEYCLOAK_PASSWORD", adminPassword);
    }
    environment.put("KEYCLOAK_AVAILABILITYCHECK_ENABLED", "true");
    environment.put("KEYCLOAK_AVAILABILITYCHECK_TIMEOUT", "120s");
    environment.put("IMPORT_FILES_LOCATIONS", target);
    environment.put("IMPORT_VARSUBSTITUTION_ENABLED", "true");
    // An unchanged file must still converge the realm: the whole point of
    // re-applying is to undo what was changed by hand.
    environment.put("IMPORT_CACHE_ENABLED", "false");
    environment.put("STEWARD_URL", STEWARD_URL);
    environment.put("KLOAKWARE_BANKID_URL", "http://bankid:8090");
    environment.put("KLOAKWARE_STEWARD_CLIENT_SECRET", clientSecret);
    environment.put("KLOAKWARE_STEWARD_API_SECRET", stewardApiSecret);
    environment.put("KLOAKWARE_LEGACY_CLIENT_SECRET", legacyClientSecret);
    environment.put("KLOAKWARE_DEV_USER_PASSWORD", devUserPassword);
    // The brokers (K6): the browser, this JVM, reaches the corp realm at the
    // mapped port; the server reaches it at its own. The ldap URL and the
    // Steward database's URL and user are left to the realm file's defaults,
    // which name the compose services this stack aliases the same way.
    environment.put("KLOAKWARE_PUBLIC_URL", baseUrl());
    environment.put("KLOAKWARE_INTERNAL_URL", "http://localhost:8080");
    environment.put("KLOAKWARE_BROKER_CLIENT_SECRET", brokerClientSecret);
    environment.put("KLOAKWARE_LDAP_BIND_PASSWORD", ldapBindPassword);
    environment.put("STEWARD_DB_PASSWORD", stewardDbPassword);
    // The financial-grade client's certificate (K11), from the maker, and
    // the CI service account's secret for the master realm's file.
    environment.put("KLOAKWARE_FAPI_CLIENT_CERTIFICATE", pki.clientCertificateBase64Der);
    environment.put("KLOAKWARE_CI_CLIENT_SECRET", ciClientSecret);
    environment.putAll(overrides);

    GenericContainer<?> container = new GenericContainer<>(CONFIG_CLI).withNetwork(network);
    for (Path file : files) {
      container =
          container.withCopyFileToContainer(
              MountableFile.forHostPath(file), "/config/" + file.getFileName());
    }
    try (GenericContainer<?> cli =
        container
            .withEnv(environment)
            .withLogConsumer(new Slf4jLogConsumer(LOG).withPrefix("config-cli"))
            .withStartupCheckStrategy(
                new OneShotStartupCheckStrategy().withTimeout(Duration.ofMinutes(4)))) {
      // A one-shot container: start() returns when it has exited with 0 and
      // throws when it has not, so a realm that fails to apply fails here.
      cli.start();
    }
  }

  /** The cluster as its clients see it: the proxy, round-robin over both nodes. */
  String baseUrl() {
    return "http://" + host() + ":" + proxy.getMappedPort(8080);
  }

  /** The cluster through the mutual-TLS terminator (K11): https, the client certificate verified. */
  String mtlsBaseUrl() {
    return "https://" + host() + ":" + terminator.getMappedPort(8443);
  }

  String mtlsRealmUrl() {
    return mtlsBaseUrl() + "/realms/steward";
  }

  /** The authority, the terminator's and the client's material the maker produced. */
  Pki pki() {
    return pki;
  }

  /** The first node on its own address; its issuer is that address, so tokens are not for sharing. */
  String firstBaseUrl() {
    return "http://" + host() + ":" + server.getMappedPort(8080);
  }

  String managementUrl() {
    return "http://" + host() + ":" + server.getMappedPort(9000);
  }

  /** The second node of the cluster, reached directly; up unless the cluster test has stopped it. */
  String secondBaseUrl() {
    return "http://" + host() + ":" + second.getMappedPort(8080);
  }

  String secondManagementUrl() {
    return "http://" + host() + ":" + second.getMappedPort(9000);
  }

  /** Stops the second node, or starts it again as a new container that joins the cluster. */
  void second(boolean up) {
    if (up) {
      second.start();
    } else {
      second.stop();
    }
  }

  /**
   * The address the tests use, never the name "localhost": the JDK's cookie
   * manager (JDK-7169142, still in 17) stores a cookie for a host without a
   * dot under "localhost.local" and cannot match it on the next request. The
   * browser test keeps its own jar for the Secure flag as well; the IP keeps
   * every other client on the plain manager working.
   */
  private String host() {
    String host = server.getHost();
    return "localhost".equals(host) ? "127.0.0.1" : host;
  }

  String realmUrl() {
    return baseUrl() + "/realms/" + REALM;
  }

  /** The admin API root for the steward realm, through the bootstrap admin. */
  String adminUrl() {
    return baseUrl() + "/admin/realms/" + REALM;
  }

  String masterTokenUrl() {
    return baseUrl() + "/realms/master/protocol/openid-connect/token";
  }

  AuditReceiver auditReceiver() {
    return auditReceiver;
  }

  /** What the collector printed so far: the spans the nodes sent it. */
  String collectorLogs() {
    return collector.getLogs();
  }

  /** The corp realm, the stand-in corporate identity provider, as the browser reaches it. */
  String corpRealmUrl() {
    return baseUrl() + "/realms/corp";
  }

  /** The stand-in Steward database from this JVM, as the steward user, for seeding rows. */
  String stewardJdbcUrl() {
    return "jdbc:postgresql://" + host() + ":" + database.getMappedPort(5432) + "/steward";
  }

  /** Pauses or resumes the directory: what users see when it is down. */
  void directory(boolean up) {
    if (up) {
      ldap.getDockerClient().unpauseContainerCmd(ldap.getContainerId()).exec();
    } else {
      ldap.getDockerClient().pauseContainerCmd(ldap.getContainerId()).exec();
    }
  }

  /**
   * What the servers wrote so far, both nodes: the audit listener's
   * standard-output sink is read here, and under the proxy's round-robin
   * the node that served a request is either.
   */
  String serverLogs() {
    return server.getLogs() + "\n" + second.getLogs();
  }

  @Override
  public void close() {
    if (agent != null) agent.stop();
    terminator.stop();
    proxy.stop();
    second.stop();
    server.stop();
    collector.stop();
    mail.stop();
    ldap.stop();
    bankId.stop();
    database.stop();
    auditReceiver.stop();
    network.close();
  }

  /**
   * Random, and within the realm's password policy: twelve or more characters
   * with a digit, lower and upper case and a symbol, nothing of the username.
   */
  private static String secret() {
    return "Kw!1-" + UUID.randomUUID();
  }
}
