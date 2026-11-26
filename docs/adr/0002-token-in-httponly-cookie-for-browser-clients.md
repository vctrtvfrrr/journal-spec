# Token in an HttpOnly cookie for browser Clients

Native Clients (Android, TUI) keep the Device token in their own storage and send it as `Authorization: Bearer`. A browser Client cannot do that safely: a token that JavaScript can read is stolen by any XSS, and Device tokens do not expire. We decided that the contract offers two transports for the same token. Browser Clients log in with `token_delivery: cookie` and get the token in a `__Host-journal_token` cookie (`HttpOnly; Secure; SameSite=Strict; Path=/`, no `Domain`). Native Clients keep the Bearer header. The cookie is only a transport: it carries the token of a Device and nothing else.

## Considered options

- **A backend-for-frontend (BFF) on the web server** that keeps the token and proxies requests to the API: rejected, because it adds one more process to run and one more point of failure for a single-owner Journal.
- **The token in `localStorage` or memory, sent as Bearer by the browser**: rejected, because any XSS can read it.
- **Cookie mode only for a same-origin deployment** (API mounted under a path of the web host): rejected, because it ties the contract to one topology. The owner must be free to move the API to a subdomain without a contract change.

## Consequences

- The `__Host-` prefix forces `Path=/` and no `Domain`, so the browser binds the cookie to the exact API host. The contract does not depend on a path prefix such as `/api` or on a domain.
- The cookie works only when the web Client and the API share a registrable domain: the same host, or sibling subdomains. With different registrable domains, the browser treats the cookie as third-party and does not send it, so a browser Client there would have to fall back to Bearer.
- CSRF protection: a request authenticated by the cookie that uses POST, PUT, PATCH or DELETE, and a login with `token_delivery: cookie`, passes only with `Sec-Fetch-Site: same-origin`, or `same-site` with an `Origin` on the API's list of trusted origins. Anything else gets 403, also when `Sec-Fetch-Site` is missing (fail closed). The mechanism is in the contract; the list of trusted origins is deployment configuration, and it also decides which origins get CORS responses with credentials. With sibling subdomains, the browser Client must send its requests with credentials (`credentials: 'include'` in `fetch`). Bearer requests skip the check, because a browser never attaches that header on its own.
- Every POST, PUT, PATCH and DELETE declares 403 (G-10).
- A request with an `Authorization` header is authenticated by it, and the cookie is ignored.
- The checks run in this order: contract version (400), authentication (401), origin (403), then 404, 405 and 415. Login is the exception: `token_delivery` is in the body, so login checks the origin after 415 and the body's 400, and before the attempt limit (429) and the password. A 403 on login does not count as a failed login, so a hostile page cannot use up the owner's login attempts.
- Browsers cap `Max-Age` at 400 days, but tokens do not expire. `GET /devices/current`, which a browser Client calls on start, sets the cookie again with a full `Max-Age`.
- `DELETE /devices/current` is the logout for every Client. It and `DELETE /devices/{id}` on the calling Device expire the cookie.
