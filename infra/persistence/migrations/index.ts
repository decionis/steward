import { InitialSchema1758800000000 } from "./1758800000000-InitialSchema";
import { SessionIssuer1760400000000 } from "./1760400000000-SessionIssuer";

/** Listed by hand, in order; a bundler cannot glob them. */
export const MIGRATIONS = [
  InitialSchema1758800000000,
  SessionIssuer1760400000000,
];
