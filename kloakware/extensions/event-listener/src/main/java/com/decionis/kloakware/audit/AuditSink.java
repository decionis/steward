package com.decionis.kloakware.audit;

/** Where audit records go. A sink never throws into the login thread: it logs and moves on. */
public interface AuditSink extends AutoCloseable {
  void publish(AuditEvent event);

  @Override
  default void close() {}
}
