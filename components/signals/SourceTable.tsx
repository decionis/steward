import { RelativeTime } from "@/components/common/RelativeTime";
import { StatusBadge } from "@/components/common/StatusBadge";
import type { SignalSource } from "@/domain/signals/SignalSource";
import { CollectAction } from "./CollectAction";
import styles from "./Signals.module.css";

function healthTone(health: SignalSource["health"]) {
  if (health === "HEALTHY") return "positive" as const;
  if (health === "DEGRADED" || health === "STALE") return "warning" as const;
  return "critical" as const;
}

export function SourceTable({
  sources,
  canCollect,
}: {
  sources: SignalSource[];
  canCollect: boolean;
}) {
  if (sources.length === 0) {
    return (
      <p className={styles.boundary}>
        No signal sources are configured on this deployment. Connectors for
        uploaded documents, MCP servers, CRM and ERP systems and file servers
        arrive with the workstreams in docs/SignalConnectors.md.
      </p>
    );
  }

  return (
    <div className={styles.tableWrap}>
      <table className={styles.table} aria-label="Signal sources">
        <thead>
          <tr>
            <th>Source</th>
            <th>Kind</th>
            <th>Collects</th>
            <th>Health</th>
            <th>Last collected</th>
            <th>Signals</th>
            <th aria-label="Collect" />
          </tr>
        </thead>
        <tbody>
          {sources.map((source) => (
            <tr key={source.id}>
              <td>
                <strong>{source.name}</strong>
                <small>{source.target}</small>
              </td>
              <td>{source.kind.replaceAll("_", " ")}</td>
              <td>
                <div className={styles.categories}>
                  {source.categories.map((category) => (
                    <StatusBadge key={category} tone="neutral">
                      {category}
                    </StatusBadge>
                  ))}
                </div>
              </td>
              <td>
                <StatusBadge tone={healthTone(source.health)} dot>
                  {source.health}
                </StatusBadge>
              </td>
              <td>
                {source.lastCollectedAt ? (
                  <RelativeTime value={source.lastCollectedAt} />
                ) : (
                  "Never"
                )}
              </td>
              <td>{source.signalsCollected}</td>
              <td>
                <CollectAction
                  sourceId={source.id}
                  enabled={source.enabled}
                  canCollect={canCollect}
                />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
