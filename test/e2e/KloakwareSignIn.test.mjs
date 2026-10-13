/**
 * The sign-in through kloakware, end to end, against a running Steward and a
 * running kloakware (kloakware/deploy/compose): the redirect out, the realm's
 * own login page, the redirect back, the session, the backchannel logout
 * from the issuer, and sign-out from Steward. Run by
 * test/e2e/RunKloakwareSignIn.sh, locally and in the kloakware workflow.
 *
 *   STEWARD_URL           where this script reaches Steward      (http://localhost:3000)
 *   STEWARD_PUBLIC_URL    where the realm sends the browser back  (the same, or host.docker.internal)
 *   KLOAKWARE_URL         where this script reaches kloakware    (http://localhost:8080)
 *   KLOAKWARE_DEV_USER_PASSWORD, KLOAKWARE_BOOTSTRAP_ADMIN_PASSWORD   from the compose .env
 */
import assert from "node:assert/strict";
import { test } from "node:test";

const STEWARD = (process.env.STEWARD_URL ?? "http://localhost:3000").replace(
  /\/+$/,
  "",
);
const STEWARD_PUBLIC = (process.env.STEWARD_PUBLIC_URL ?? STEWARD).replace(
  /\/+$/,
  "",
);
const KLOAKWARE = (
  process.env.KLOAKWARE_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");
const REALM = `${KLOAKWARE}/realms/steward`;
const USER = process.env.KLOAKWARE_DEV_USER ?? "erin.example";
const PASSWORD = required("KLOAKWARE_DEV_USER_PASSWORD");
const ADMIN_PASSWORD = required("KLOAKWARE_BOOTSTRAP_ADMIN_PASSWORD");

function required(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

/** A browser's cookie jar: one per host, Secure ignored as a browser does on a trustworthy origin. */
class Jar {
  cookies = new Map();
  absorb(response) {
    for (const header of response.headers.getSetCookie?.() ?? []) {
      const [pair, ...attributes] = header.split(";");
      const at = pair.indexOf("=");
      const name = pair.slice(0, at).trim();
      const value = pair.slice(at + 1).trim();
      const maxAge = attributes
        .map((a) => a.trim().toLowerCase())
        .find((a) => a.startsWith("max-age="));
      if (maxAge === "max-age=0" || value === "") this.cookies.delete(name);
      else this.cookies.set(name, value);
    }
  }
  header() {
    return [...this.cookies]
      .map(([name, value]) => `${name}=${value}`)
      .join("; ");
  }
}

/** The realm redirects to STEWARD_PUBLIC; this process reaches Steward at STEWARD. */
function local(url) {
  return url.startsWith(STEWARD_PUBLIC)
    ? STEWARD + url.slice(STEWARD_PUBLIC.length)
    : url;
}

async function browse(jar, url, init = {}) {
  const response = await fetch(local(url), {
    ...init,
    redirect: "manual",
    headers: { ...(init.headers ?? {}), cookie: jar.header() },
  });
  jar.absorb(response);
  return response;
}

async function signIn(stewardJar, kloakwareJar, returnTo = "/signals") {
  // 1. Out: Steward sends the browser to the issuer with a sealed flow.
  const out = await browse(
    stewardJar,
    `${STEWARD}/api/auth/oidc/start?returnTo=${encodeURIComponent(returnTo)}`,
  );
  assert.equal(out.status, 302, "start redirects");
  const authorization = out.headers.get("location");
  assert.ok(
    authorization.startsWith(`${REALM}/protocol/openid-connect/auth?`),
    authorization,
  );
  assert.ok(
    stewardJar.cookies.has("steward_oidc_flow"),
    "the flow cookie is set",
  );
  const query = new URL(authorization).searchParams;
  assert.equal(query.get("code_challenge_method"), "S256");
  assert.equal(
    query.get("redirect_uri"),
    `${STEWARD_PUBLIC}/api/auth/oidc/callback`,
  );

  // 2. The realm's login page.
  const page = await browse(kloakwareJar, authorization);
  assert.equal(page.status, 200, "the login page");
  const action = /<form[^>]*action="([^"]+)"/
    .exec(await page.text())?.[1]
    ?.replace(/&amp;/g, "&");
  assert.ok(action, "the login form");

  // 3. Credentials, then back to Steward with a code.
  const back = await browse(kloakwareJar, action, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      username: USER,
      password: PASSWORD,
      credentialId: "",
    }).toString(),
  });
  assert.equal(back.status, 302, "the realm redirects back");
  const callback = back.headers.get("location");
  assert.ok(
    callback.startsWith(`${STEWARD_PUBLIC}/api/auth/oidc/callback?`),
    callback,
  );

  // 4. The callback: a Steward session, one opaque cookie, and the return.
  const done = await browse(stewardJar, callback);
  assert.equal(
    done.status,
    302,
    `the callback redirects: ${done.status} ${await done.text()}`,
  );
  assert.equal(new URL(done.headers.get("location")).pathname, returnTo);
  assert.ok(
    stewardJar.cookies.has("steward_session"),
    "the session cookie is set",
  );
  assert.ok(
    !stewardJar.cookies.has("steward_oidc_flow"),
    "the flow cookie is cleared",
  );
}

async function session(jar) {
  const response = await browse(jar, `${STEWARD}/api/auth/session`);
  return {
    status: response.status,
    body: response.status === 200 ? await response.json() : null,
  };
}

async function adminToken() {
  const response = await fetch(
    `${KLOAKWARE}/realms/master/protocol/openid-connect/token`,
    {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "password",
        client_id: "admin-cli",
        username: "admin",
        password: ADMIN_PASSWORD,
      }).toString(),
    },
  );
  assert.equal(response.status, 200, "the admin token");
  return (await response.json()).access_token;
}

async function until(check, attempts = 20) {
  for (let i = 0; i < attempts; i++) {
    if (await check()) return true;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return false;
}

test("an operator signs in through kloakware and Steward knows who they are", async () => {
  const stewardJar = new Jar();
  const kloakwareJar = new Jar();
  await signIn(stewardJar, kloakwareJar);

  const { status, body } = await session(stewardJar);
  assert.equal(status, 200);
  assert.equal(body.signedInThrough, "KLOAKWARE");
  assert.equal(body.mode, "LIVE");
  assert.equal(body.displayName, "Erin Example");
  assert.ok(
    body.roles.includes("ADMIN") && body.roles.includes("APPROVER"),
    JSON.stringify(body.roles),
  );
  assert.ok(!body.accessToken, "no token leaves the server");
});

test("a logout at the issuer ends the Steward session through the backchannel", async () => {
  const stewardJar = new Jar();
  const kloakwareJar = new Jar();
  await signIn(stewardJar, kloakwareJar);
  assert.equal((await session(stewardJar)).status, 200);

  const token = await adminToken();
  const users = await (
    await fetch(
      `${KLOAKWARE}/admin/realms/steward/users?username=${USER}&exact=true`,
      {
        headers: { authorization: `Bearer ${token}` },
      },
    )
  ).json();
  assert.equal(users.length, 1);
  const logout = await fetch(
    `${KLOAKWARE}/admin/realms/steward/users/${users[0].id}/logout`,
    {
      method: "POST",
      headers: { authorization: `Bearer ${token}` },
    },
  );
  assert.equal(logout.status, 204, "the issuer ends the user's sessions");

  const ended = await until(
    async () => (await session(stewardJar)).status === 401,
  );
  assert.ok(
    ended,
    "Steward's session ends once the issuer's backchannel logout arrives",
  );
});

test("signing out of Steward ends its session and sends the browser to the issuer's end-session endpoint", async () => {
  const stewardJar = new Jar();
  const kloakwareJar = new Jar();
  await signIn(stewardJar, kloakwareJar, "/");

  const out = await browse(stewardJar, `${STEWARD}/api/auth/oidc/sign-out`, {
    method: "POST",
  });
  assert.equal(out.status, 303);
  const location = new URL(out.headers.get("location"));
  assert.equal(
    `${location.origin}${location.pathname}`,
    `${REALM}/protocol/openid-connect/logout`,
  );
  assert.equal(
    location.searchParams.get("post_logout_redirect_uri"),
    `${STEWARD_PUBLIC}/sign-in`,
  );
  assert.ok(
    location.searchParams.get("id_token_hint"),
    "the ID token hint, so the issuer asks nothing",
  );
  assert.ok(
    !stewardJar.cookies.has("steward_session"),
    "the session cookie is cleared",
  );

  const stale = new Jar();
  stale.cookies.set("steward_session", "revoked-or-unknown");
  assert.equal((await session(stale)).status, 401);
});

test("the sign-in reaches Steward's own record through kloakware's audit listener", async () => {
  // K5: the listener posts a signed LOGIN record to /api/activities/kloakware,
  // and Steward keeps it as an activity beside its own SIGNED_IN, attributed
  // to the user who signs in as that issuer subject.
  const database = process.env.STEWARD_E2E_DATABASE;
  assert.ok(database, "STEWARD_E2E_DATABASE names Steward's embedded database");
  const { default: Database } = await import("better-sqlite3");

  const stewardJar = new Jar();
  const kloakwareJar = new Jar();
  await signIn(stewardJar, kloakwareJar, "/");
  const { body } = await session(stewardJar);

  const kinds = () => {
    const db = new Database(database, { readonly: true });
    try {
      return db
        .prepare(
          "SELECT kind, user_id AS userId FROM activities WHERE user_id = ? ORDER BY occurred_at",
        )
        .all(body.subject);
    } finally {
      db.close();
    }
  };
  const recorded = await until(async () =>
    kinds().some((row) => row.kind === "KLOAKWARE_LOGIN"),
  );
  assert.ok(
    recorded,
    `the KLOAKWARE_LOGIN activity arrived: ${JSON.stringify(kinds())}`,
  );
  assert.ok(
    kinds().some((row) => row.kind === "SIGNED_IN"),
    "beside Steward's own SIGNED_IN",
  );
});

test("a sign-in that comes back without its flow lands on the sign-in page with a reason", async () => {
  const jar = new Jar();
  const response = await browse(
    jar,
    `${STEWARD}/api/auth/oidc/callback?code=x&state=y`,
  );
  assert.equal(response.status, 302);
  const location = new URL(response.headers.get("location"));
  assert.equal(location.pathname, "/sign-in");
  assert.equal(location.searchParams.get("error"), "flow_missing");
});
