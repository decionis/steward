package com.decionis.kloakware.audit;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.util.List;
import java.util.Map;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;

class AsyncAuditSinkTest {

  @Test
  void publishReturnsAtOnceAndTheRecordsReachEverySinkInOrder() throws Exception {
    List<String> seen = new CopyOnWriteArrayList<>();
    CountDownLatch three = new CountDownLatch(3);
    AuditSink slow =
        event -> {
          seen.add(event.type());
          three.countDown();
        };
    AsyncAuditSink outlet = new AsyncAuditSink(List.of(slow));

    long before = System.nanoTime();
    for (String type : List.of("LOGIN", "LOGOUT", "LOGIN_ERROR")) outlet.publish(AuditEvent.of(Map.of("type", type)));
    assertTrue(System.nanoTime() - before < 50_000_000L, "publish does not wait on the sink");

    assertTrue(three.await(5, TimeUnit.SECONDS));
    assertEquals(List.of("LOGIN", "LOGOUT", "LOGIN_ERROR"), seen);
    outlet.close();
  }

  @Test
  void aBlockedSinkCostsRecords_neverTheCaller() throws Exception {
    CountDownLatch release = new CountDownLatch(1);
    AuditSink blocked =
        event -> {
          try {
            release.await();
          } catch (InterruptedException ignored) {
            Thread.currentThread().interrupt();
          }
        };
    AsyncAuditSink outlet = new AsyncAuditSink(List.of(blocked));

    for (int i = 0; i < AsyncAuditSink.CAPACITY + 5; i++) outlet.publish(AuditEvent.of(Map.of("type", "LOGIN")));

    assertTrue(outlet.dropped() >= 1, "the overflow is counted, not waited on");
    release.countDown();
    outlet.close();
  }

  @Test
  void aSinkThatThrowsDoesNotStopTheOthers() throws Exception {
    CountDownLatch reached = new CountDownLatch(1);
    AuditSink failing =
        event -> {
          throw new IllegalStateException("down");
        };
    AsyncAuditSink outlet = new AsyncAuditSink(List.of(failing, event -> reached.countDown()));
    outlet.publish(AuditEvent.of(Map.of("type", "LOGOUT")));
    assertTrue(reached.await(5, TimeUnit.SECONDS));
    outlet.close();
  }
}
