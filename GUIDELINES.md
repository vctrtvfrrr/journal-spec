# Guidelines

House rules for `openapi.yaml`, on top of Redocly's `recommended-strict` ruleset. Each rule is enforced by `bun run lint`, and its error message starts with the rule ID. Configuration lives in `redocly.yaml` and `redocly/guidelines.ts`; each rule has a failing fixture in `test/guidelines.test.ts`.

## Errors

**G-01: Errors are problem details.** Every 4xx and 5xx response uses `application/problem+json` with the `Problem`, `ValidationProblem` or `ContractVersionProblem` schema, alone or combined with `anyOf`. Use `anyOf`, not `oneOf`: a `ValidationProblem` is also a valid `Problem`, so `oneOf` rejects it.

**G-02: Secured operations declare 401.** Every operation that requires a token declares a 401 response. Login and `GET /health` (`security: []`) are the exceptions.

**G-03: Every operation declares 500.**

**G-05: Operations with a request body declare 415.**

**G-06: Operations on a path with an ID declare 400 and 404.** The 400 covers an ID that is not a UUID. An upsert (`PUT`) declares no 404, because a missing ID creates the resource.

**G-10: Operations that change data declare 403.** Every POST, PUT, PATCH and DELETE operation declares a 403 response, login included, for a cookie request that does not come from a trusted origin. See [ADR 0002](docs/adr/0002-token-in-httponly-cookie-for-browser-clients.md).

## Request bodies

**G-04: Request body schemas are closed.** Every request body schema sets `additionalProperties: false`, so the API rejects unknown and read-only fields with 400.

## Contract version

See [ADR 0001](docs/adr/0001-additive-evolution-and-minimum-contract-version.md).

**G-07: Every response carries `Contract-Version`.** Every response references `#/components/headers/ContractVersion`, including errors.

**G-08: Every operation accepts `Contract-Version`.** Every operation references `#/components/parameters/ContractVersion`, and its 400 response can be a `ContractVersionProblem`. An operation with `x-contract-version-exempt: true` is the exception: `GET /health` serves probes, which send no `Contract-Version`.

## Naming

**G-09: Names follow one casing per kind.** `operationId` is camelCase, schema names are PascalCase, and property names are snake_case.

## Evolution

Enforced at release by `oasdiff`, not by the linter. See ADR 0001.

- From 1.0.0 on, the contract changes only by adding. Removing something requires deprecating it first and then a major version.
- Adding a value to an enum that appears in a response is a breaking change.
- A patch release changes only descriptions and examples.
