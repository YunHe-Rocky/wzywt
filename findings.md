# Findings

Origin validation, middleware, session cookies and PM2 settings must agree.
PM2 must explicitly clear cached entry settings after mode switches.
Deployment regressions run through npm run test:deploy (Git Bash on Windows).

NextURL normalizes loopback IPs to localhost in outgoing redirects; skipMiddlewareUrlNormalize preserves the approved origin. Verified against a built server in headless Edge.
