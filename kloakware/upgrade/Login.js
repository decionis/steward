// The login load the upgrade rehearsal runs while the cluster rolls: a
// handful of users signing in and refreshing, without pause beyond a
// breath, with the threshold that decides the rehearsal: not one failed
// request. The password grant costs an argon2 hash per login and the
// refresh reads the session's row from whichever node answers, which is
// what a node leaving mid-flight must not break. Every failure is logged
// with its time, so the rehearsal's log says when it happened.
import http from "k6/http";
import { check, sleep } from "k6";

export const options = {
  vus: 5,
  duration: __ENV.DURATION || "120s",
  thresholds: {
    http_req_failed: ["rate==0"],
    checks: ["rate==1"],
  },
};

const base = __ENV.BASE;
const token = `${base}/realms/steward/protocol/openid-connect/token`;

function failed(step, response) {
  console.warn(
    `${new Date().toISOString()} ${step} ${response.status} ${response.error || ""} ${String(response.body || "").slice(0, 160)}`,
  );
}

export default function signInAndRefresh() {
  const login = http.post(token, {
    grant_type: "password",
    client_id: "kloakware-smoke",
    username: __ENV.USERNAME,
    password: __ENV.PASSWORD,
    scope: "openid",
  });
  if (!check(login, { "a token is issued": (r) => r.status === 200 }))
    failed("login", login);
  if (login.status === 200) {
    const refreshed = http.post(token, {
      grant_type: "refresh_token",
      client_id: "kloakware-smoke",
      refresh_token: login.json("refresh_token"),
    });
    if (!check(refreshed, { "the session refreshes": (r) => r.status === 200 }))
      failed("refresh", refreshed);
  }
  sleep(0.5);
}
