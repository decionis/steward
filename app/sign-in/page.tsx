import Link from "next/link";
import { StewardRuntimeConfig } from "@/infra/config/StewardRuntimeConfig";
import styles from "./SignIn.module.css";

export const dynamic = "force-dynamic";

const FAILURES: Record<string, string> = {
  flow_missing:
    "The sign-in took too long or started in another browser. Start it again.",
  state_mismatch:
    "The sign-in that came back is not the one this browser started. Start it again.",
  issuer_refused:
    "Your organisation's sign-in refused the request. Start it again, and if it repeats, tell the team that runs Steward.",
  token_invalid:
    "The sign-in could not be verified. Start it again, and if it repeats, tell the team that runs Steward.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; error?: string }>;
}) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/") ? query.returnTo : "/";
  const failure = query.error ? FAILURES[query.error] : undefined;
  const config = StewardRuntimeConfig.fromEnvironment();
  const kloakware = config.oidc !== null;
  const signInBase =
    process.env.NEXT_PUBLIC_DECIONIS_SIGN_IN_URL ??
    "https://decionis.com/sign-in";
  const signInUrl = new URL(signInBase);
  signInUrl.searchParams.set("returnTo", returnTo);
  const organisationUrl = `/api/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`;

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.mark}>D</div>
        <p className={styles.eyebrow}>Decionis Steward</p>
        <h1>Customer decisions, inside policy.</h1>
        {failure ? (
          <p className={styles.failure} role="alert">
            {failure}
          </p>
        ) : null}
        <p className={styles.copy}>
          {kloakware
            ? "Sign in with your organisation's account to review account friction, expansion evidence and governed actions."
            : "Sign in through Decionis to review account friction, expansion evidence and governed actions."}
        </p>
        {kloakware ? (
          <a className={styles.button} href={organisationUrl}>
            Sign in with your organisation account
          </a>
        ) : null}
        <Link
          className={kloakware ? styles.buttonSecondary : styles.button}
          href={signInUrl.toString()}
        >
          Continue with Decionis
        </Link>
        <p className={styles.note}>
          Your organization, roles and policy access stay in Decionis.
        </p>
        <p className={styles.note}>
          Steward is free and open source, and demo mode needs no account. A
          Decionis workspace decides in shadow at no charge; what is paid is the
          platform executing an approved review.{" "}
          <a href="https://github.com/decionis/steward/blob/master/OpenCore.md">
            The boundary, in full.
          </a>
        </p>
      </section>
    </main>
  );
}
