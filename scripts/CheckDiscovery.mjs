#!/usr/bin/env node

/**
 * Validates the machine-discovery files and, with --check-links, the public
 * links inside them.
 *
 * Two copies of each file exist on purpose: public/llms.txt is what the
 * running application serves at /llms.txt, in every data mode, from the
 * container, the tarball and the hosted demo alike; llms.txt at the root is
 * what GitHub readers and raw URLs find. They must be byte-identical, and
 * llms-full.txt must embed llms.txt verbatim, or an agent reading one surface
 * is told something the other does not say.
 *
 * Links to this repository are checked against the working tree, so a file
 * renamed or removed without updating the discovery copy fails here rather
 * than 404-ing for the next agent. Other hosts must be on the allowlist below
 * and, with --check-links, must answer; the weekly discovery workflow runs
 * that, because links rot without anyone touching the repository.
 *
 * Usage:
 *   node scripts/CheckDiscovery.mjs                 # structure and local links
 *   node scripts/CheckDiscovery.mjs --check-links   # also probe public links
 */

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root), "utf8");

const REPOSITORY = "https://github.com/decionis/steward";
const TITLE = "# Decionis Steward";
const ALLOWED_HOSTS = new Set([
  "github.com",
  "decionis.com",
  "api.decionis.com",
  "decionis-steward.vercel.app",
  "llmstxt.org",
]);
/** Named as configuration values, not as pages: an API origin answers nothing useful to a probe. */
const NOT_PROBED = new Set(["api.decionis.com"]);

const problems = [];

// --- The pairs ---------------------------------------------------------------
const short = read("public/llms.txt");
const full = read("public/llms-full.txt");
if (read("llms.txt") !== short)
  problems.push("llms.txt differs from public/llms.txt");
if (read("llms-full.txt") !== full) {
  problems.push("llms-full.txt differs from public/llms-full.txt");
}
if (!full.startsWith(short))
  problems.push("llms-full.txt must embed llms.txt verbatim");

// --- The shape (https://llmstxt.org/) ----------------------------------------
const lines = short.split("\n");
if (lines[0] !== TITLE) problems.push(`first line must be "${TITLE}"`);
const firstH2 = lines.findIndex((line) => line.startsWith("## "));
const blockquote = lines.findIndex((line) => line.startsWith("> "));
if (blockquote < 0 || (firstH2 >= 0 && blockquote > firstH2)) {
  problems.push("a blockquote summary must precede the first H2 section");
}
for (const heading of ["## Documentation", "## Optional"]) {
  if (!lines.includes(heading)) problems.push(`missing section ${heading}`);
}
let section = null;
for (const [index, line] of lines.entries()) {
  if (line.startsWith("## ")) section = line;
  if (section && line.startsWith("- ") && section !== "## Routing") {
    if (!/^- \[[^\]]+\]\(https:\/\/[^)\s]+\)(: .+)?$/.test(line)) {
      problems.push(
        `line ${index + 1}: a file-list entry is "- [name](https url): notes", got ${line.slice(0, 60)}`,
      );
    }
  }
}
if (/http:\/\/(?!localhost|127\.0\.0\.1)/.test(full)) {
  problems.push("plain http:// link to a public host found; use https");
}

// --- Links -------------------------------------------------------------------
const trim = (value) => value.replace(/[.,;:)]+$/, "");
const urls = [
  ...new Set(
    [...full.matchAll(/https:\/\/[^\s)<>\]"'`]+/g)].map((m) => trim(m[0])),
  ),
];
const remote = [];
for (const url of urls) {
  const { host, pathname } = new URL(url);
  if (!ALLOWED_HOSTS.has(host)) {
    problems.push(`host not on the discovery allowlist: ${url}`);
    continue;
  }
  const local = url.match(new RegExp(`^${REPOSITORY}/blob/master/(.+)$`))?.[1];
  if (local) {
    if (!existsSync(new URL(decodeURIComponent(local), root))) {
      problems.push(`links a file that does not exist in the tree: ${local}`);
    }
    continue;
  }
  if (
    url.startsWith(REPOSITORY) &&
    (pathname.endsWith("/steward") || url.includes("#readme"))
  )
    continue;
  if (NOT_PROBED.has(host)) continue;
  remote.push(url);
}

if (process.argv.includes("--check-links")) {
  const probe = async (url) => {
    for (const method of ["HEAD", "GET"]) {
      try {
        const response = await fetch(url, {
          method,
          redirect: "manual",
          signal: AbortSignal.timeout(10_000),
          headers: { "user-agent": "decionis-steward-discovery-check" },
        });
        if (response.status >= 200 && response.status < 400) return true;
      } catch {
        // fall through to GET, then report
      }
    }
    return false;
  };
  const results = await Promise.all(
    remote.map(async (url) => [url, await probe(url)]),
  );
  for (const [url, ok] of results)
    if (!ok) problems.push(`does not resolve: ${url}`);
}

if (problems.length > 0) {
  console.error(`Discovery check failed:\n- ${problems.join("\n- ")}`);
  process.exit(1);
}
console.log(
  `Discovery OK — pairs identical, shape valid, ${urls.length - remote.length} repository links present, ${remote.length} public links${process.argv.includes("--check-links") ? " resolve" : " on the allowlist"}.`,
);
void resolve;
