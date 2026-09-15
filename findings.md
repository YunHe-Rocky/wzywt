# Findings

## Participation rate percentage fix (2026-09-10)
- Screenshot values such as 63 and 72 are percentage points copied from the game result screen.
- OCR parser and its real-image contract currently emit percentage points, for example 55.
- Match confirmation and correction validation require canonical values no greater than 1.
- The confirmation table currently labels the field as 0-1 and directly renders the draft value, exposing the mismatch.
- Existing tests and persisted records use fractional canonical values such as 0.5; changing database semantics to 0-100 would require a migration and risk old-record corruption.
- Safe boundary: OCR 55 -> canonical 0.55 -> UI 55% -> submit 0.55.
- `normalizeRecognitionPayload` in the feature model is the correct OCR-to-domain boundary; the recognition service calls it before saving normalized results.
- Confirmation is submitted through a dedicated client API and server use case, so the web layer can remain presentation-only and server validation can stay canonical.
- The same percent conversion is needed in the super-admin correction form; its server validator also caps participation rate at 1.
- A local draft can mix legacy OCR percentage points (>1) and canonical hand-edited fractions (<=1). Normalize only each unambiguous value above 1; group-wide conversion could silently corrupt a valid 0.63 into 0.0063.
- The mocked human-factors browser suite already loads a canonical 0.65 match stat and can assert both visible 65% and the submitted 0.63 request body without a real database.
- Existing normalized recognition JSON can also contain legacy percentage points. The UI merge path now applies the same unambiguous `>1` compatibility normalization, while new recognition results are canonicalized at ingestion.
- Changing normalized recognition value semantics without changing its version would make persisted old JSON ambiguous, especially for a real 1% value. New normalized results need an explicit version discriminator so legacy version 1 always converts from percentage points and canonical version 2 never double-converts.

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
- Visual QA of scenes 01 and 04 confirms the navy/gold typography remains readable at 1080p, the hook preserves the arena focal point, and the data-to-split diagram communicates the three balancing inputs without inventing numeric outcomes.
- Visual QA of scenes 02 and 03 confirms the pain-point contrast is immediately legible and the live homepage remains readable inside the browser frame. The product reveal does not claim a populated live lobby or show fabricated users.
- Visual QA of scenes 05 and 06 confirms both five-role teams are symmetric and the cross-device room-flow composition remains readable. The mobile frame is a genuine public capture, not a mockup of nonexistent behavior.
- Visual QA of scenes 07 and 08 confirms the catalog counts are sourced from current public captures, the final URL has strong contrast, and the CTA frame holds the brand, slogan, arena art, and genuine mobile UI without crowding.
- User correctly identified that scene 07 captured the hero catalog before lazy-loaded portraits completed. The capture gate is being changed to require six visible hero images with nonzero natural dimensions and full opacity before the frame is accepted.
- The gated recapture succeeded after about 17 seconds: all six first-row hero portraits are fully visible at capture time. This replaces the placeholder-heavy source for scene 07.
- Rebuilt scene 07 now shows six fully rendered hero portraits beside the loaded equipment cards; the user-identified placeholder defect is absent in the accepted scene board.
- Fresh final-video frame extraction at 1.0s and 45.5s confirms the encoded MP4 preserves the intended opening and the corrected loaded hero/equipment montage. The large contact sheet preview rendered unusually dark in the image viewer, so acceptance relies on the underlying individual extracted frames plus full-stream decode rather than that viewer thumbnail.

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
