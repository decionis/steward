import { Check, Loader2, Sparkles } from "lucide-react";
import type { AgentResponse } from "@/domain/PreviewContracts";
import styles from "./Preview.module.css";

export function AgentStatus({
  loading,
  error,
}: {
  loading: boolean;
  error: string;
}) {
  return (
    <div aria-live="polite" aria-atomic="true">
      {loading && (
        <div className={styles.loading}>
          <Loader2 size={18} className={styles.spin} />
          <span>Checking the merchant guide and preparing your preview…</span>
        </div>
      )}
      {error && (
        <div className={styles.error} role="alert">
          {error}
        </div>
      )}
    </div>
  );
}
export function AgentPanel({
  result,
  children,
}: {
  result: AgentResponse;
  children?: React.ReactNode;
}) {
  return (
    <section className={styles.agentResult} aria-label="AI response">
      <div className={styles.resultEyebrow}>
        <span>
          <Sparkles size={14} /> Prepared by Steward
        </span>
        <span className={styles.draftBadge}>Live AI · sample data</span>
      </div>
      <h3>{result.headline}</h3>
      <p>{result.summary}</p>
      {children}
      <div className={styles.sourceRow}>
        {result.sources.map((source) => (
          <span key={source}>
            <Check size={12} />
            {source}
          </span>
        ))}
      </div>
    </section>
  );
}
