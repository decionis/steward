import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { join, relative, sep } from "node:path";
import { after, before, describe, it } from "node:test";
import { pathToFileURL } from "node:url";

// Resolve from the invoking package so CI exercises each independent lockfile.
const projectRequire = createRequire(join(process.cwd(), "package.json"));
const configRequire = createRequire(
  projectRequire.resolve("eslint-config-next"),
);
const pluginRequire = createRequire(
  configRequire.resolve("@next/eslint-plugin-next"),
);
const rootDirsEntry = pluginRequire.resolve("./utils/get-root-dirs.js");
const { getRootDirs } = pluginRequire(rootDirsEntry);

describe("Next.js lint directory scanner", () => {
  let fixture;

  before(() => {
    fixture = realpathSync(mkdtempSync(join(tmpdir(), "steward-next-lint-")));
    for (const directory of [
      "apps/alpha/pages",
      "apps/beta/pages",
      "apps/.hidden/pages",
      "packages/service",
      "sites/site-1",
      "sites/site-2",
    ]) {
      mkdirSync(join(fixture, directory), { recursive: true });
    }
    writeFileSync(join(fixture, "apps/readme.txt"), "test fixture");
    symlinkSync(
      join(fixture, "apps/alpha"),
      join(fixture, "apps/linked"),
      "dir",
    );
  });

  after(() => rmSync(fixture, { recursive: true, force: true }));

  const path = (suffix) => join(fixture, suffix).split(sep).join("/");
  const roots = (rootDir) =>
    getRootDirs({ cwd: process.cwd(), settings: { next: { rootDir } } }).sort();

  it("defaults to the ESLint context directory", () => {
    assert.deepEqual(getRootDirs({ cwd: fixture, settings: {} }), [fixture]);
  });

  it("keeps an explicit directory without expanding its descendants", () => {
    assert.deepEqual(roots(path("apps/alpha")), [path("apps/alpha")]);
    assert.deepEqual(roots(path("apps/alpha/")), [path("apps/alpha")]);
  });

  it("matches directories and directory symlinks, excluding files and hidden entries", () => {
    const expected = ["apps/alpha", "apps/beta", "apps/linked"].map(path);
    assert.deepEqual(roots(path("apps/*")), expected);
    assert.deepEqual(roots(path("apps/*/")), expected);
  });

  it("preserves relative patterns as relative results", () => {
    const base = relative(process.cwd(), fixture).split(sep).join("/");
    assert.deepEqual(roots(`${base}/apps/*`), [
      `${base}/apps/alpha`,
      `${base}/apps/beta`,
      `${base}/apps/linked`,
    ]);
  });

  it("supports brace alternatives and numeric ranges", () => {
    assert.deepEqual(roots(path("apps/{alpha,beta}")), [
      path("apps/alpha"),
      path("apps/beta"),
    ]);
    assert.deepEqual(roots(path("sites/site-{1..2}")), [
      path("sites/site-1"),
      path("sites/site-2"),
    ]);
  });

  it("combines literal and glob entries in rootDir arrays", () => {
    assert.deepEqual(roots([path("apps/alpha"), path("packages/*"), null]), [
      path("apps/alpha"),
      path("packages/service"),
    ]);
  });

  it("keeps explicit symlink roots and follows them for nested matches", () => {
    assert.deepEqual(roots(path("apps/linked")), [path("apps/linked")]);
    assert.deepEqual(roots(path("apps/**/pages")), [
      path("apps/alpha/pages"),
      path("apps/beta/pages"),
      path("apps/linked/pages"),
    ]);
  });

  it("includes directory symlinks through the ES module build as well", async () => {
    const packagePath = pluginRequire.resolve("fast-glob/package.json");
    const manifest = pluginRequire(packagePath);
    const entry = new URL(
      manifest.exports["."].import,
      pathToFileURL(packagePath),
    );
    const { globSync } = await import(entry.href);
    assert.deepEqual(
      globSync(path("apps/linked"), {
        onlyDirectories: true,
        expandDirectories: false,
        absolute: true,
      }),
      [`${path("apps/linked")}/`],
    );
  });

  it("normalizes backslash separators before resolving paths", () => {
    assert.deepEqual(roots(path("apps/alpha").replaceAll("/", "\\")), [
      path("apps/alpha"),
    ]);
  });

  it("returns no directories for missing roots or files", () => {
    assert.deepEqual(roots(path("apps/missing")), []);
    assert.deepEqual(roots(path("apps/readme.txt")), []);
  });

  it("handles deeply nested braces below the old parser's length limit without crashing", () => {
    const script = `
      const assert = require('node:assert/strict');
      const { getRootDirs } = require(${JSON.stringify(rootDirsEntry)});
      const rootDir = '{'.repeat(4500) + 'a,b' + '}'.repeat(4500);
      assert.ok(rootDir.length < 10000);
      assert.deepEqual(getRootDirs({cwd: process.cwd(), settings: {next: {rootDir}}}), []);
    `;
    const result = spawnSync(process.execPath, ["-e", script], {
      cwd: fixture,
      encoding: "utf8",
      timeout: 3000,
      maxBuffer: 64 * 1024,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
  });
});
