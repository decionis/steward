import { StewardRuntimeConfig } from "@/infra/config/StewardRuntimeConfig";
import { Persistence } from "./Persistence";

export interface StartupOutcome {
  opened: boolean;
  message: string;
}

/**
 * What the server does before its first request (called from
 * instrumentation.ts on the Node.js runtime): read the configuration and,
 * outside demo mode, open Steward's own database and apply or check the
 * migrations. A failure is a refusal to serve, not a degraded start: the
 * reason goes to standard error and the process exits.
 */
export async function startPersistence(
  environment: NodeJS.ProcessEnv = process.env,
  exit: (code: number) => void = (code) => process.exit(code),
): Promise<StartupOutcome> {
  let config: StewardRuntimeConfig;
  try {
    config = StewardRuntimeConfig.fromEnvironment(environment);
  } catch (error) {
    return refuse(error, exit);
  }
  if (!config.persistence) {
    return { opened: false, message: "Steward persists nothing in demo mode" };
  }
  try {
    await Persistence.open(config.persistence);
  } catch (error) {
    return refuse(error, exit);
  }
  const status = Persistence.status();
  const message = `Steward database ready: ${status?.dialect ?? config.persistence.dialect}${status?.file ? ` at ${status.file}` : ""}, ${status?.appliedAtStart.length ?? 0} migration(s) applied at start`;
  console.log(message);
  return { opened: true, message };
}

function refuse(error: unknown, exit: (code: number) => void): StartupOutcome {
  const message = `Steward cannot start: ${error instanceof Error ? error.message : String(error)}`;
  console.error(message);
  exit(1);
  return { opened: false, message };
}
