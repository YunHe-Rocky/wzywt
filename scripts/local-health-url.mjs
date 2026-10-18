import { isIP } from "node:net";
export function localHealthUrl(host = "127.0.0.1", port = 8001) {
  const address = host.replace(/^\[|\]$/g, "");
  const target = address === "0.0.0.0" ? "127.0.0.1" : address === "::" ? "::1" : address;
  if (!isIP(target) && target !== "localhost") throw new Error("Health probe host must be a local listening IP or localhost");
  if (!Number.isInteger(Number(port)) || Number(port) < 1 || Number(port) > 65535) throw new Error("Invalid health probe port");
  return `http://${isIP(target) === 6 ? `[${target}]` : target}:${port}/api/health?mode=live`;
}
