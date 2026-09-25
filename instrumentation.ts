/**
 * Runs once when the server starts (Next.js instrumentation). On the Node.js
 * runtime it opens Steward's own database and applies or checks migrations
 * before the first request; a failure is a refusal to serve
 * (docs/Persistence.md, "Migrations"). The work lives in
 * infra/persistence/Startup.ts, loaded only on that runtime, so the edge
 * build of this file carries none of it.
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  if (process.env.NEXT_PHASE === "phase-production-build") return;
  const { startPersistence } = await import("./infra/persistence/Startup");
  await startPersistence();
}
