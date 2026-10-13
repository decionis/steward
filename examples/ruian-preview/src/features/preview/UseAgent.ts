"use client";
import { useEffect, useRef, useState } from "react";
import type { AgentResponse, PreviewRequest } from "@/domain/PreviewContracts";

export function useAgent() {
  const [result, setResult] = useState<AgentResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const controller = useRef<AbortController | null>(null);
  useEffect(() => () => controller.current?.abort(), []);
  function reset() {
    controller.current?.abort();
    controller.current = null;
    setResult(null);
    setError("");
    setLoading(false);
  }
  async function run(input: PreviewRequest) {
    controller.current?.abort();
    const current = new AbortController();
    controller.current = current;
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const response = await fetch("/api/agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        signal: current.signal,
      });
      const data = await response.json();
      if (!response.ok)
        throw new Error(
          response.status === 429
            ? "The preview has reached its request limit. Please try again in a few minutes."
            : response.status === 400
              ? "Please select a merchant and confirm the sample consent where required."
              : "The live assistant is unavailable right now. Please try again shortly; the sample catalogue is still here to explore.",
        );
      if (current === controller.current) setResult(data as AgentResponse);
    } catch (failure) {
      if (!current.signal.aborted && current === controller.current)
        setError(
          failure instanceof Error
            ? failure.message
            : "Something interrupted the preview. Please try again.",
        );
    } finally {
      if (current === controller.current) setLoading(false);
    }
  }
  return { result, loading, error, run, reset };
}
