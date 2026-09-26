# Support

Where to take each kind of question about Decionis Steward.

| You have                                                                                          | Where it goes                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A suspected vulnerability                                                                         | Privately, never in a public issue, pull request or discussion: [GitHub Security Advisories](https://github.com/decionis/steward/security/advisories/new) or [security@decionis.com](mailto:security@decionis.com). [SECURITY.md](./SECURITY.md) has the response targets. |
| A bug in Steward, or a feature request                                                            | An [issue](https://github.com/decionis/steward/issues/new/choose), from its template.                                                                                                                                                                                      |
| A question, or an idea to talk through first                                                      | [Discussions](https://github.com/decionis/steward/discussions).                                                                                                                                                                                                            |
| Policy evaluation, connector credentials, execution grants, Decision Dossiers or the audit ledger | The Decionis platform owns these, not this repository: [decionis.com/contact](https://decionis.com/contact).                                                                                                                                                               |

## Before you open an issue

- Only the latest commit on `master` is supported. There are no maintained release branches and no
  backports ([SECURITY.md](./SECURITY.md#supported-versions)), so check the issue against it.
- Say which version or commit you run, how you run it (a container image tag, or a local
  `pnpm dev`), and whether you saw it in `demo` or `live` data mode.
- Leave credentials, tokens and real operator data out of an issue, a log excerpt or a screenshot.

## What to expect

There is no response-time commitment for issues, discussions or pull requests. The targets in
[SECURITY.md](./SECURITY.md) apply to vulnerability reports.

Participation follows the [code of conduct](./CODE_OF_CONDUCT.md).
