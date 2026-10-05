/** Loads the organizer session token from the HttpOnly cookie via same-origin API. */
export async function fetchAdminSessionToken() {
  const response = await fetch("/api/admin/session-token", {
    method: "GET",
    credentials: "include",
  });
  if (!response.ok) {
    return null;
  }
  const token = (await response.text()).trim();
  return token.length >= 32 ? token : null;
}

export async function signInWithAdminCookie(email: string, password: string) {
  const response = await fetch("/api/admin/sign-in", {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  const payload = (await response.json()) as { error?: string; expiresAt?: number };
  if (!response.ok) {
    throw new Error(payload.error ?? "Sign-in failed.");
  }
  return payload.expiresAt ?? Date.now();
}

export async function signOutAdminCookie() {
  await fetch("/api/admin/sign-out", {
    method: "POST",
    credentials: "include",
  });
}
