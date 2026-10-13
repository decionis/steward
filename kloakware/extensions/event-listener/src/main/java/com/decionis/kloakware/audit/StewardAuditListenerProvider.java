package com.decionis.kloakware.audit;

import java.util.Set;
import org.keycloak.events.Event;
import org.keycloak.events.EventListenerProvider;
import org.keycloak.events.EventType;
import org.keycloak.events.admin.AdminEvent;

/** The per-request listener: filters by type, builds the record, offers it to the outlet and returns. */
public final class StewardAuditListenerProvider implements EventListenerProvider {

  private final AuditSink outlet;
  private final Set<EventType> eventTypes;

  StewardAuditListenerProvider(AuditSink outlet, Set<EventType> eventTypes) {
    this.outlet = outlet;
    this.eventTypes = eventTypes;
  }

  @Override
  public void onEvent(Event event) {
    if (event.getType() == null || !eventTypes.contains(event.getType())) return;
    publish(AuditEvent.from(event));
  }

  @Override
  public void onEvent(AdminEvent event, boolean includeRepresentation) {
    publish(AuditEvent.from(event));
  }

  @Override
  public void close() {}

  private void publish(AuditEvent record) {
    outlet.publish(record);
  }
}
