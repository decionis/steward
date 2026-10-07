# Next.js lint directory scanner

The Next.js ESLint plugin used `fast-glob → micromatch → braces`. The last
published `braces` release, 3.0.3, is affected by
[GHSA-vfj7-8cjw-p6xm](https://github.com/advisories/GHSA-vfj7-8cjw-p6xm)
and has no patched release as of 7 October 2026. Both the core app and the
standalone Ruian preview remove that dependency chain from their lockfiles.

Each package has a version-scoped pnpm override replacing the plugin's
`fast-glob` dependency with `tinyglobby` 0.2.17. The reviewed plugin versions
(15.5.20 and 16.3.6) use only `globSync` in `get-root-dirs.js`. A small patch
disables implicit directory expansion, preserves absolute versus relative
paths, and normalizes trailing separators. The override is deliberately
limited to these plugin versions; it is not a general replacement for the
full `fast-glob` API.

The pinned `fdir` 6.5.0 dependency also needs a one-line fix in each of its
CommonJS and ES module builds: include a matched directory symlink itself
before traversing its contents. Without it, a configured symlink root would
silently disappear from Next.js lint checks. Both packages carry the same
patch because the preview has an independent installation and deployment.

`test/automation/NextLintGlob.test.mjs` exercises the installed Next.js plugin
from the current working directory. It covers explicit roots, directory-only
globs, relative and absolute paths, arrays, brace patterns, separators,
symlinks, and deeply nested brace input in a child process with a deadline.
The audit workflow runs it against both installations, along with production
and build-toolchain audits and the production license policy. No advisory
exception or audit threshold change is used.

Run the compatibility checks from the repository root:

```sh
node --test test/automation/NextLintGlob.test.mjs
pnpm --dir examples/ruian-preview exec node --test ../../test/automation/NextLintGlob.test.mjs
```

When updating the Next.js lint plugin, review its glob call sites again and
run these tests. Remove the scoped override and plugin patch together when
an upstream release no longer pulls in the vulnerable parser. Remove the
`fdir` pin and patches when its symlink fix is available upstream or the
replacement is no longer needed. Keep both lockfiles and patch sets aligned.
