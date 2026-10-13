package com.decionis.kloakware.audit;

import java.io.PrintStream;

/**
 * One JSON line per event on standard output, prefixed so a log pipeline can
 * route it: what every deployment gets, with no configuration, and what a
 * CloudWatch or Loki query reads.
 */
public final class StdoutAuditSink implements AuditSink {

  public static final String PREFIX = "kloakware-audit ";

  private final PrintStream out;

  public StdoutAuditSink() {
    this(System.out);
  }

  StdoutAuditSink(PrintStream out) {
    this.out = out;
  }

  @Override
  public void publish(AuditEvent event) {
    out.println(PREFIX + event.toJson());
  }
}
