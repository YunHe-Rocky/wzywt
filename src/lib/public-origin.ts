/** Shared by Edge middleware and the Node 24 deployment preflight. */
export function parsePublicOrigin(value: string, requireHttps = false): string {
  const url = new URL(value);
  if (value !== value.trim() || /[\\\s]/.test(value)
    || !["http:", "https:"].includes(url.protocol)
    || (requireHttps && url.protocol !== "https:")
    || url.username || url.password || url.pathname !== "/" || url.search || url.hash
    || (value !== url.origin && value !== `${url.origin}/`)) {
    throw new Error("PUBLIC_ORIGIN must be an origin without credentials, path, query or fragment; production requires HTTPS");
  }
  return url.origin;
}
