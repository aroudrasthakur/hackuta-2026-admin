/** Loads the organizer session token from the HttpOnly cookie via same-origin API. */
let localDevSessionRequest: Promise<void> | null = null;

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

export async function startLocalDevAdminSession() {
  if (!localDevSessionRequest) {
    localDevSessionRequest = fetch("/api/admin/dev-sign-in", {
      method: "POST",
      credentials: "include",
    }).then(async (response) => {
      if (!response.ok) {
        const payload = (await response.json()) as { error?: string };
        throw new Error(payload.error ?? "Local development sign-in failed.");
      }
    });
    void localDevSessionRequest.catch(() => {
      localDevSessionRequest = null;
    });
  }
  await localDevSessionRequest;
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
