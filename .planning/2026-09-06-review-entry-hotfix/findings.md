# Findings

- HEAD 03e089b on codex/arena-glass-redesign; extensive pre-existing CI/auth/scheduler/deployment changes.
- Auth redirect uses req.url and drops search. Device redirect trusts Host/X-Forwarded-Proto without explicit trust configuration.
- AuthForm accepts slash-backslash redirects and appends login query after a possible fragment.
- Device routing is missing from check and CI. Auth-session/resources and a Chromium real-session E2E are already present: preserve and extend.
- E2E uses direct localhost HTTP, omits sessionVersion/private-resource revocation; visual login test hardcodes Windows Chrome.
- Use configured PUBLIC_ORIGIN for deployment. Development falls back to request origin without forwarding headers. Production redirects fail closed on absent/malformed origin.
- CI uses real Nginx HTTPS before Next on port 8001 with an isolated database and Playwright Chromium/WebKit.
