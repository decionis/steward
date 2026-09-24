"use client";

import { useState } from "react";
import type { OpportunityReview } from "@/domain/opportunities/CustomerOpportunity";
import styles from "./Dashboard.module.css";

export interface ReviewActionProps {
  opportunityId: string;
  canReview: boolean;
  /**
   * The disposition the operator saw when the page rendered. The platform
   * re-evaluates on every review, so the disposition it returns can differ
   * from the one that was on screen. When it does, the operator is told;
   * the re-evaluation is the platform's control, this only makes it visible.
   */
  displayedDisposition?: string;
}

interface ReviewResponseBody {
  message?: string;
  opportunity?: { status?: string; disposition?: string };
}

export function ReviewAction({
  opportunityId,
  canReview,
  displayedDisposition,
}: ReviewActionProps) {
  const [status, setStatus] = useState<"idle" | "saving" | "saved" | "error">(
    "idle",
  );
  const [message, setMessage] = useState<string | null>(null);

  async function submit(decision: OpportunityReview["decision"]) {
    setStatus("saving");
    setMessage(null);
    try {
      const response = await fetch(
        `/api/steward/opportunities/${opportunityId}/review`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ decision }),
        },
      );
      const body = (await response.json()) as ReviewResponseBody;
      if (!response.ok)
        throw new Error(body.message ?? "Review could not be saved");

      const returned = body.opportunity?.disposition;
      const changed =
        displayedDisposition !== undefined &&
        returned !== undefined &&
        returned !== displayedDisposition;

      setStatus("saved");
      setMessage(
        `Recorded as ${body.opportunity?.status?.toLowerCase() ?? "reviewed"}.` +
          (changed
            ? ` The platform's disposition changed since this page loaded: it is now ${returned}.`
            : ""),
      );
    } catch (error) {
      setStatus("error");
      setMessage(
        error instanceof Error ? error.message : "Review could not be saved",
      );
    }
  }

  if (!canReview) {
    return <p className={styles.reviewNotice}>Approver role required</p>;
  }

  return (
    <div className={styles.reviewArea}>
      <div className={styles.reviewButtons}>
        <button
          disabled={status === "saving"}
          onClick={() => submit("APPROVE")}
          type="button"
        >
          Accept recommendation
        </button>
        <button
          disabled={status === "saving"}
          onClick={() => submit("HOLD")}
          type="button"
        >
          Hold
        </button>
        <button
          disabled={status === "saving"}
          onClick={() => submit("REJECT")}
          type="button"
        >
          Reject
        </button>
      </div>
      {message ? (
        <p
          className={
            status === "error" ? styles.reviewError : styles.reviewSuccess
          }
          role="status"
        >
          {message}
        </p>
      ) : (
        <p className={styles.reviewNotice}>
          Records a review only; no downstream limit is changed.
        </p>
      )}
    </div>
  );
}
