import { user } from "./public-fixtures";
// A document's fixture identity cannot change when a protected redirect drops query labels.
const params = new URLSearchParams(location.search);
export function useAuth() {
  return { loaded: true, user: params.get("role") === "guest" ? null : { ...user, username: params.get("case") === "long" ? "ABCDEFGHIJKLMNOPQRSTUVWXYZ山河同游0123456789" : user.username } };
}
