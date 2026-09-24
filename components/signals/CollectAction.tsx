"use client";

import { useState } from "react";
import styles from "./Signals.module.css";

interface CollectResponse {
  message?: string;
  batch?: { signals: unknown[] };
  result?: {
    accepted: number;
    rejected: { signalId: string; reason: string }[];
  };
}

/**
 * "Collect now": pull from one source and forward the batch upstream. The
 * button is disabled for a source that is not configured, and for a session
 * without the OPERATOR role; the service enforces the same two conditions.
 */
export function CollectAction({
  sourceId,
  enabled,
  canCollect,
}: {
  sourceId: string;
  enabled: boolean;
  canCollect: boolean;
}) {
  const [status, setStatus] = useState<"idle" | "working" | "done" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function collect() {
    setStatus("working");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/steward/signals/sources/${sourceId}/collect`,
        { method: "POST" },
      );
      const body = (await response.json()) as CollectResponse;
      if (!response.ok)
        throw new Error(body.message ?? "Collection did not complete");
      const collected = body.batch?.signals.length ?? 0;
      const accepted = body.result?.accepted ?? 0;
      const rejected = body.result?.rejected.length ?? 0;
      setStatus("done");
      setMessage(
        `Collected ${collected} signal${collected === 1 ? "" : "s"}; ${accepted} accepted upstream${rejected ? `, ${rejected} rejected` : ""}.`,
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Collection did not complete",
      );
    }
  }

  if (!canCollect) {
    return <p className={styles.collectNote}>Operator role required</p>;
  }

  return (
    <div className={styles.collect}>
      <button
        type="button"
        disabled={!enabled || status === "working"}
        onClick={collect}
      >
        {enabled ? "Collect now" : "Not configured"}
      </button>
      {message ? (
        <p
          className={
            status === "error" ? styles.collectError : styles.collectSuccess
          }
          role="status"
        >
          {message}
        </p>
      ) : (
        <p className={styles.collectNote}>
          {enabled
            ? "Forwards a batch upstream; nothing is stored here."
            : "Configure this source on the server to collect from it."}
        </p>
      )}
    </div>
  );
}
