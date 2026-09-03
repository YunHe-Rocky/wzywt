# Live session-race evidence

Updated: 2026-09-03

- Live health release is `20260903044304-99de8ee21a3e-422497`, based on commit `99de8ee`; it does not include the current local auth transition fix.
- Clean disposable-account browser checks pass on both desktop (`/me`) and iPhone-sized mobile (`/m/me`). Registration, explicit re-login, profile APIs, roles, and heroes all returned success; disposable accounts were deleted in `finally`.
- The live server issues a non-secure, HttpOnly, SameSite=Lax session cookie on the current HTTP origin, so a blanket Secure-cookie failure is disproven for newly created accounts.
- The remaining high-probability path is a shared-browser race: `GET /api/auth/me` and `requireAuth()` currently destroy invalid, banned, or session-version-mismatched sessions. A late response from an old tab may therefore emit a deletion cookie after a new login has issued a valid cookie.
- Next validation: create one disposable account, retain its old cookie, increment the account session version through password change, call `GET /api/auth/me` with the stale cookie, inspect only whether the response contains deletion attributes, verify the current cookie remains valid, and delete the disposable account.
- No automatic production deployment workflow exists in the repository. Production deployment still requires the documented `scripts/deploy.sh` path on the server.
- One earlier disposable account remains orphaned because the first reproduction script assumed registration would return to `/login` and timed out before reaching cleanup. Its random credentials were not retained. No direct database cleanup will be attempted because production connection details and unauthorized administrative access are outside scope.
