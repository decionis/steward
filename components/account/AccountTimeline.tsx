import { History } from "lucide-react";
import { RelativeTime } from "@/components/common/RelativeTime";
import type { AccountTimelineEvent } from "@/domain/accounts/CustomerAccount";
import styles from "./Account.module.css";

export function AccountTimeline({
  events,
}: {
  events: AccountTimelineEvent[];
}) {
  return (
    <section className={styles.sidePanel}>
      <div className={styles.panelHeading}>
        <div>
          <span>Decision memory</span>
          <h2>Account timeline</h2>
        </div>
        <History size={18} aria-hidden="true" />
      </div>
      <ol className={styles.timeline}>
        {events.map((event) => (
          <li key={event.id} data-kind={event.kind}>
            <span aria-hidden="true" />
            <div>
              <strong>{event.title}</strong>
              <p>{event.detail}</p>
              <small>
                {event.kind} · <RelativeTime value={event.occurredAt} />
              </small>
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
