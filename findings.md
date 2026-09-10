# Findings

## Promotional video (2026-09-10)
- Live public homepage returned HTTP 200 and presents the promise: friend-group 5v5 internal matches, strength-aware team balancing, role-preference support, room-code joining, hero/equipment reference, and post-match continuity.
- Strongest positioning is a friend-group match organizer, not a generic game news site or professional esports platform.
- Brand language is warm rivalry: "今晚，峡谷见。", "熟悉的朋友，也可以是好对手。", and "和朋友，好好打一场。"
- Visual system uses deep navy (#080f17), muted gold (#d3b783), light gold (#edd7aa), restrained glass panels, and a nocturnal arena hero image.
- Approved output is about 60 seconds, 16:9 1080p, Mandarin male voice, original percussion/electronic music, and real website UI as the visual core.
- Desktop capture confirms the homepage is the strongest hero shot: the real UI already combines the arena artwork, the headline, two core promises, the three-step flow, and a prominent event-hall CTA in one 16:9 frame.
- The unauthenticated tournament hall is intentionally a login gate. It supports the low-friction "login then join" narrative, but it should not be presented as evidence of a populated room list.
- The hero catalog clearly exposes 132 heroes and role/profession filtering, but many portrait tiles were not loaded in the first capture; recapture or crop the strong heading/filter region rather than show placeholder-heavy cards.
- The equipment catalog is visually production-ready for the montage: 121 items, filter chips, readable item art, prices, and attributes appear in the first viewport.
- The scrolled homepage gives a clean three-step narrative plus the "create room / browse hero / browse equipment" preparation flow, making it stronger than the login-gated hall for the middle montage.
- The 390px mobile capture preserves the complete hero promise, CTAs, core benefits, three-step flow, and dock without horizontal overflow; it is suitable for a floating-phone shot that proves mobile readiness.

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
