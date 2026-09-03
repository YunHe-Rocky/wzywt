# Confirmed root cause: stale-session deletion race

Updated: 2026-09-03

The controlled live test against `http://192.168.1.72:8001` reproduced the race without exposing credentials or cookie values:

- disposable account registration: HTTP 200;
- password change and session-version increment: HTTP 200;
- `GET /api/auth/me` with the retained old cookie: HTTP 200 and `user: null`;
- stale response cookie attributes: `Path=/`, `Max-Age=0`, `HttpOnly`, `SameSite=lax`;
- independently checked current cookie: HTTP 200 and the expected user;
- disposable account deletion in `finally`: HTTP 200.

Therefore an invalid read-only request from an old tab can return after a successful login and delete the browser-wide newly issued session cookie. The repair boundary is:

- do not call `session.destroy()` while merely reading or validating authentication state;
- continue to fail closed for missing users, temporary users, version mismatch, and banned users;
- retain `session.destroy()` for explicit logout and successful account deletion only.
