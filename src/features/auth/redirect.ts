// A fixed parsing base keeps SSR and browser navigation on the same relative-only policy.
const PARSING_ORIGIN = "https://auth-return.invalid";

export function safeAuthRedirect(requested: string | null): string {
  if (!requested || !requested.startsWith("/") || /[\\\u0000-\u0020\u007f]/.test(requested)) return "/";
  try {
    const url = new URL(requested, PARSING_ORIGIN);
    const decodedPath = decodeURIComponent(url.pathname);
    if (url.origin !== PARSING_ORIGIN || url.username || url.password
      || decodedPath.startsWith("//") || /[\\\u0000-\u001f\u007f]/.test(decodedPath)) return "/";
    return url.pathname + url.search + url.hash;
  } catch {
    return "/";
  }
}

export function loginTransitionRedirect(requested: string | null): string {
  const url = new URL(safeAuthRedirect(requested), PARSING_ORIGIN);
  url.searchParams.set("_from", "login");
  return url.pathname + url.search + url.hash;
}
