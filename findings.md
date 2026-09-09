# Findings

## Deployment/OCR retrospective (2026-09-09)
- OCR endpoint/token are not selected by deployment dotenv parsing; duplicate or Markdown OCR values evade preflight.
- PM2 explicitly replaces Redis settings but not OCR settings, leaving stale inherited values possible.
- Backup preflight lacks directory search permission checks and uses generic diagnostics; relative override is canonicalized before absolute-path validation.
- Cloud path in pasted error is backup parent; documented dedicated child is bakup/yanwutang. Preserve user's choice; inspect live ancestry before permissions repair.
- Six images are now present under public/test; previous missing-samples statement is stale.
- User explicitly approved HTTP for production loopback OCR only. Shared runtime/preflight policy accepts exact localhost, canonical 127/8 and ::1; non-loopback production addresses still require HTTPS.
- Real loopback HTTP regression confirms POST multipart and Bearer token transport, and refuses redirects. Public website HTTPS and cookie policy unchanged.

## OCR local endpoint follow-up (2026-09-09)
- recognition-provider only checks NODE_ENV and ignores DEPLOY_ENVIRONMENT.
- public-origin already validates production/local and canonical private hostnames; reuse this policy.
- ecosystem.config.js already propagates DEPLOY_ENVIRONMENT; no PM2 changes needed.
- The OCR preview still only parses DATA, not the website's six-page contract.

Origin validation, middleware, session cookies and PM2 settings must agree.
PM2 must explicitly clear cached entry settings after mode switches.
Deployment regressions run through npm run test:deploy (Git Bash on Windows).

NextURL normalizes loopback IPs to localhost in outgoing redirects; skipMiddlewareUrlNormalize preserves the approved origin. Verified against a built server in headless Edge.

## Room/archive/tactic follow-up
- Tournament completed is assigned on split; match SUBMITTED is the archive publication boundary.
- requireMatchViewer currently permits any submitted archive and participant drafts.
- listTournamentMatches uses public-submitted OR participant; needs submitted AND participant for ordinary users.
- getTacticAccess restricts ordinary users to own side but exempts global admin; UI exposes both side links.
- Layer RED reproduced: drafts leak across blank layers, clock overrides new layer, refresh erases dirty draft, index shifts selection after deletion, error Toast loop leaves access loading.
- Fixed layer identity/version tracking and explicit inline error recovery; manager archive access remains separate from own-side-only tactics.
- Ordinary archive responses suppress opponent rows, raw recognition, screenshots and consistency details; direct draft/outsider requests denied. Draft list exposes only minimal metadata for own-team tactics.
- Review found no layer bootstrap for team without owner after own-side restriction: adding default layer to new rooms and explicit idempotent own-side initializer for legacy empty rooms (not a GET mutation).
- Review found global admins hidden by local archive filter: server canViewArchive now authoritative and management prop includes global admin.
- Actual dev requests prove tactic-map-source.jpg 404; no image exists in public. User asked for original map asynchronously. Neutral coordinate-grid fallback must explicitly state it is not actual terrain.
