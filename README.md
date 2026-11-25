# Journal Spec

The OpenAPI contract that defines the HTTP routes, request and response bodies, and errors for the Journal app.

## Checking the contract

```bash
bun install
bun run check
```

`bun run check` validates the contract against OpenAPI 3.1 and the house rules in [GUIDELINES.md](GUIDELINES.md), typechecks and tests the tooling, and compares it with the latest release using `oasdiff`.

## Releasing

Bump `info.version` in `openapi.yaml` and push to `master`. CI runs every check and, when they pass, creates the `v<version>` tag and a Gitea release with the changelog. A push without a version bump is a draft: CI only reports problems. Clients and the API pin the contract as a Git submodule at a release tag. See [ADR 0001](docs/adr/0001-additive-evolution-and-minimum-contract-version.md) for the versioning policy.
