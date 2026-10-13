package com.decionis.kloakware.audit;

import java.util.List;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.BlockingQueue;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicLong;
import org.jboss.logging.Logger;

/**
 * The one rule every sink lives under: nothing that handles a sign-in waits
 * on a sink. Records are offered to a bounded queue and one daemon thread
 * drains it to the real sinks; when the queue is full, because standard
 * output is blocked or Steward is slow, the newest record is dropped and
 * counted, and the login thread moves on. A dropped record is a warning in
 * the server log; a blocked login thread would be an outage.
 */
public final class AsyncAuditSink implements AuditSink {

  private static final Logger LOG = Logger.getLogger(AsyncAuditSink.class);
  static final int CAPACITY = 10_000;

  private final List<AuditSink> sinks;
  private final BlockingQueue<AuditEvent> queue = new ArrayBlockingQueue<>(CAPACITY);
  private final AtomicLong dropped = new AtomicLong();
  private final Thread drain;
  private volatile boolean closing;

  public AsyncAuditSink(List<AuditSink> sinks) {
    this.sinks = List.copyOf(sinks);
    this.drain = new Thread(this::drain, "kloakware-audit");
    this.drain.setDaemon(true);
    this.drain.start();
  }

  @Override
  public void publish(AuditEvent event) {
    if (!queue.offer(event)) {
      long count = dropped.incrementAndGet();
      if (count == 1 || count % 1000 == 0) {
        LOG.warnf("steward-audit: the queue is full; %d record(s) dropped so far", count);
      }
    }
  }

  long dropped() {
    return dropped.get();
  }

  private void drain() {
    while (!closing || !queue.isEmpty()) {
      try {
        AuditEvent event = queue.poll(250, TimeUnit.MILLISECONDS);
        if (event == null) continue;
        for (AuditSink sink : sinks) {
          try {
            sink.publish(event);
          } catch (RuntimeException error) {
            LOG.warnf("steward-audit: a sink failed on a %s record: %s", event.type(), error.getMessage());
          }
        }
      } catch (InterruptedException interrupted) {
        Thread.currentThread().interrupt();
        return;
      }
    }
  }

  @Override
  public void close() {
    closing = true;
    try {
      drain.join(5_000);
    } catch (InterruptedException interrupted) {
      Thread.currentThread().interrupt();
    }
    for (AuditSink sink : sinks) sink.close();
  }
}
