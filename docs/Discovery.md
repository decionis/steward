# Machine discovery

Steward describes itself to the agents that evaluate it, the same way it describes itself to the
people who do: with facts that are verified against the tree, and nothing else.

## The surfaces

| Surface             | Where                                       | Who reads it                                        |
| ------------------- | ------------------------------------------- | --------------------------------------------------- |
| `README.md`         | Repository root                             | People                                              |
| `llms.txt`          | `public/llms.txt`, served at `/llms.txt`    | Agents: the concise map, per https://llmstxt.org/   |
| `llms-full.txt`     | `public/llms-full.txt`, at `/llms-full.txt` | Agents: the superset, embedding `llms.txt` verbatim |
| Root copies         | `llms.txt`, `llms-full.txt`                 | GitHub readers and raw URLs; byte-identical         |
| OCI labels          | The image manifest                          | Registries and scanners                             |
| Docker Hub overview | `packaging/dockerhub/README.md`             | People on Docker Hub, published by the workflow     |

The application serves the two files in every data mode. In live mode the session middleware lets
them through without a Decionis session, as it does `/api/health` and `/sign-in`, so a prospective
adopter's agent can read them before anyone signs in. The `X-Robots-Tag: noindex` every other
response carries is overridden to `all` on those two paths: the operator console stays out of
search engines; the description of it does not.

## The rules

1. **Verify before claiming.** A capability named in a discovery file exists in shipped code and is
   covered by tests. Distinguish what this repository ships from what Decionis operates.
2. **Absolute public links only.** A repository link is `https://github.com/decionis/steward/blob/master/…`
   and the file must exist in the tree; any other host must be on the allowlist in
   `scripts/CheckDiscovery.mjs`.
3. **No figure without a measurement.** No latency, throughput, accuracy or security-effectiveness
   number appears unless a checked-in test or measurement pins it.
4. **No surface that does not exist.** No OpenAPI, MCP, `security.txt` or registry manifest is
   claimed unless the corresponding callable surface is in this repository.
5. **Same words everywhere.** `README.md`, `llms.txt`, `llms-full.txt`, the OCI labels and the
   Docker Hub overview use one product vocabulary. Rename a thing in all of them in one pull
   request.
6. **Remove the claim with the capability.** A capability removed or renamed takes its discovery
   copy with it, in the same pull request.

## The gate

`pnpm discovery` runs `scripts/CheckDiscovery.mjs`: the pairs are identical, `llms-full.txt`
embeds `llms.txt`, the shape follows the specification, every repository link resolves in the
tree, every other host is on the allowlist. It is part of `pnpm verify`. The
[discovery workflow](../.github/workflows/discovery.yml) runs it with `--check-links` on every pull
request and every Monday, so a public link that stops answering is found by us rather than by an
agent.

## Pull-request checklist

- [ ] Claims match shipped code and tested behaviour
- [ ] `README.md`, `llms.txt` and `llms-full.txt` remain consistent
- [ ] All external URLs are absolute and resolve
- [ ] No unsupported performance, security or availability figure was introduced
- [ ] `pnpm discovery` and `pnpm verify` pass
