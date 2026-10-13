// The load that finds the first bottleneck on purpose (K10): sign-ins
// through the browser flow, the authorization code with PKCE as Steward
// does it, arriving at a rate that climbs in stages. Modelled on the
// Keycloak benchmark project's authorization-code scenario. The runner
// beside this script reads Prometheus at each stage; the knee is the stage
// where the token endpoint's p95 or the pool's wait leaves the floor.
import http from "k6/http";
import { check, sleep } from "k6";
import crypto from "k6/crypto";
import encoding from "k6/encoding";

const base = __ENV.BASE;
const realm = `${base}/realms/steward`;
const redirect = `${__ENV.STEWARD_URL || "http://localhost:3000"}/api/auth/oidc/callback`;
function failed(step, response) {
  console.warn(
    `${new Date().toISOString()} ${step} ${response.status} ${response.error || ""} ${String(response.body || "").slice(0, 160)}`,
  );
}

const stages = (__ENV.STAGES || "2:60s,5:60s,10:60s,20:60s,40:60s")
  .split(",")
  .map((s) => ({ target: Number(s.split(":")[0]), duration: s.split(":")[1] }));

export const options = {
  scenarios: {
    logins: {
      executor: "ramping-arrival-rate",
      startRate: 1,
      timeUnit: "1s",
      preAllocatedVUs: 20,
      maxVUs: 200,
      stages,
    },
  },
  thresholds: {
    http_req_failed: ["rate<0.01"],
  },
};

function pkce() {
  const verifier = encoding.b64encode(crypto.randomBytes(48), "rawurl");
  const challenge = encoding.b64encode(
    crypto.sha256(verifier, "binary"),
    "rawurl",
  );
  return { verifier, challenge };
}

export default function signInThroughTheBrowserFlow() {
  const { verifier, challenge } = pkce();
  const state = encoding.b64encode(crypto.randomBytes(16), "rawurl");
  const page = http.get(
    `${realm}/protocol/openid-connect/auth?response_type=code&client_id=steward&redirect_uri=${encodeURIComponent(redirect)}&scope=openid&state=${state}&code_challenge=${challenge}&code_challenge_method=S256`,
    { tags: { name: "page" } },
  );
  if (!check(page, { "login page": (r) => r.status === 200 })) {
    failed("page", page);
    return;
  }
  const action = /<form[^>]*action="([^"]+)"/.exec(page.body);
  if (!action) return;
  // The form's action is absolute, built from the server's fixed hostname,
  // which on a laptop is localhost:8080 and not where this script runs
  // from; the origin is swapped for the base this script reaches.
  const submitted = http.post(
    action[1].replace(/&amp;/g, "&").replace(/^https?:\/\/[^/]+/, base),
    { username: __ENV.USERNAME, password: __ENV.PASSWORD, credentialId: "" },
    // Named, since each form action carries its own session code and k6
    // would otherwise count every one as a series of its own.
    { redirects: 0, tags: { name: "submit" } },
  );
  const location = submitted.headers["Location"] || "";
  const code = /[?&]code=([^&]+)/.exec(location);
  if (!check(submitted, { "a code came back": () => Boolean(code) })) {
    failed("submit", submitted);
    return;
  }
  const tokens = http.post(`${realm}/protocol/openid-connect/token`, {
    grant_type: "authorization_code",
    code: code[1],
    redirect_uri: redirect,
    client_id: "steward",
    client_secret: __ENV.CLIENT_SECRET,
    code_verifier: verifier,
  });
  if (!check(tokens, { "tokens issued": (r) => r.status === 200 }))
    failed("tokens", tokens);
  sleep(0.1);
}
