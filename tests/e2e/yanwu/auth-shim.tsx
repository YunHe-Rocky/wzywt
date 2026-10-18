type Role = "guest" | "user" | "admin";

function fixtureRole(): Role {
  const value = new URLSearchParams(location.search).get("role");
  return value === "admin" || value === "guest" ? value : "user";
}

function fixtureUser() {
  const role = fixtureRole();
  if (role === "guest") return null;
  return { userId: role === "admin" ? 1 : 7, username: role === "admin" ? "演武堂主" : "云中客", role, avatar: null, securityQuestion: "用于界面验收的问题" };
}

export function useAuth() {
  return { user: fixtureUser(), loaded: true, logout: async () => undefined };
}

export async function getCurrentUser() {
  return { ok: true, status: 200, data: { user: fixtureUser() } };
}

export async function changePassword() { return { ok: true, status: 200, data: { verified: true } }; }
export async function deleteAccount() { return { ok: true, status: 200, data: {} }; }
export async function logout() { return { ok: true, status: 200, data: {} }; }
export async function submitAuthentication() { return { ok: true, status: 200, data: {} }; }
export async function getSecurityQuestion() { return { ok: true, status: 200, data: { question: "用于界面验收的问题" } }; }
export async function resetPassword() { return { ok: true, status: 200, data: {} }; }
