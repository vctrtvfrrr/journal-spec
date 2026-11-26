# Additive evolution and minimum contract version

Published Clients (Android, TUI, PWA) keep running old versions for an indefinite time, so the API must serve the contract of every Client that is still supported. We decided that the contract evolves only in an additive way, that removing something requires a deprecation followed by a major, and that the major defines the minimum accepted version: with the contract at `X.y.z`, the API accepts Clients from `X.0.0` up.

## Considered options

- **Break with a major bump and the API serving several majors at the same time** (e.g. `/v1` and `/v2`): rejected, because keeping two surfaces is too expensive for a single-owner Journal.
- **Additive only, forever, with no minimum version**: rejected, because nothing could ever be removed.
- **Minimum version configured separately in the API**: rejected, because deriving it from the major gives the same result without a second source of truth.

## Consequences

- Every request and every response carries the `Contract-Version` header. In the request, it is the contract version the Client was generated from; in the response, it is the API's version. In the request it is required from the start, because no Client was published before this decision.
- The version check comes before any other check, including authentication, 404, 405, and 415. This way an old Client with a revoked token sees "update" and not "log in". The exception is the CORS preflight (`OPTIONS` with `Origin` and `Access-Control-Request-Method`): the browser never sends custom headers in it, and checking it would block every request from a web Client.
- A Client below the minimum, or with the header missing or malformed, receives 400 with the `ContractVersionProblem` problem: fixed `type` `tag:journal,2026:contract-version-unsupported` and the `minimum_version` extension. All other problems stay `about:blank`. We do not use 426: RFC 9110 reserves that status for protocol switching and requires the `Upgrade` header.
- A Client newer than the API is accepted. For this reason the API deploys before the Clients.
- Clients must ignore unknown fields in responses (tolerant reader). Without this, adding a response field would be a breaking change.
- Enums that appear in responses are frozen: a new value is a breaking change and only goes into a major. The alternative, extensible enums with a required fallback in every Client, was rejected because of the cost of maintaining that fallback in all three Clients.
- Versioning: a patch changes only docs and examples, a minor only adds, a major drops old Clients.
- While the contract is at `0.x`, breaking changes are free, as long as they come with at least a minor bump, and the minimum does not apply. The first published Client marks `1.0.0`.
