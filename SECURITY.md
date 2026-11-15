# Security

CareCircle stores health information about elderly people, so security is a core feature.

## Measures

| Area | Implementation |
| --- | --- |
| Passcodes | scrypt (N=16384, r=8, p=1) with a random per-circle salt, constant-time verification |
| Brute force | 5 failed joins per circle code per 15 minutes; identical errors for unknown code vs wrong passcode |
| Sessions | 256-bit random tokens in `httpOnly`, `Secure`, `SameSite=Lax` cookies; only SHA-256 hashes stored; expired sessions pruned |
| Authorization | Every query is scoped by `circle_id` (tested); role rules keep the elder in control of membership |
| Input | Every Server Action validates input with zod; all SQL is parameterised |
| Abuse | Postgres-backed rate limits on circle creation, demos, AI calls and manual reminder runs |
| Browser | Per-request nonce CSP with `strict-dynamic` (no inline scripts), HSTS, `X-Frame-Options: DENY`, COOP/CORP, `nosniff`, strict Referrer- and Permissions-Policy |
| Transport | TLS with certificate verification to the managed database |
| Secrets | Read through a validated env module; the Gemini key is sent in a header, never a URL; cron secret compared in constant time |
| Email | Header-injection-safe subjects; recipients in BCC |
| AI | Model output is schema-validated; prescriptions are only saved after a human confirms; only aggregate data is sent for digests |
| Dependencies | `npm audit` clean; Dependabot and CodeQL enabled |

## Reporting a vulnerability

Please open a private security advisory on GitHub (Security → Report a vulnerability) rather than a public issue.
