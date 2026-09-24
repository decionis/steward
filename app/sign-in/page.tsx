import Link from "next/link";
import styles from "./SignIn.module.css";

export const dynamic = "force-dynamic";

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string }>;
}) {
  const query = await searchParams;
  const returnTo = query.returnTo?.startsWith("/") ? query.returnTo : "/";
  const signInBase =
    process.env.NEXT_PUBLIC_DECIONIS_SIGN_IN_URL ??
    "https://decionis.com/sign-in";
  const signInUrl = new URL(signInBase);
  signInUrl.searchParams.set("returnTo", returnTo);

  return (
    <main className={styles.page}>
      <section className={styles.card}>
        <div className={styles.mark}>D</div>
        <p className={styles.eyebrow}>Decionis Steward</p>
        <h1>Customer decisions, inside policy.</h1>
        <p className={styles.copy}>
          Sign in through Decionis to review account friction, expansion
          evidence and governed actions.
        </p>
        <Link className={styles.button} href={signInUrl.toString()}>
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
