const SESSION_TOKEN_KEY = "hackuta-admin-session-token";
const SESSION_EXPIRES_KEY = "hackuta-admin-session-expires";

export type StoredAdminSession = {
  sessionToken: string;
  expiresAt: number;
};

export function readStoredAdminSession(): StoredAdminSession | null {
  const sessionToken = sessionStorage.getItem(SESSION_TOKEN_KEY);
  const expiresRaw = sessionStorage.getItem(SESSION_EXPIRES_KEY);
  if (!sessionToken || !expiresRaw) {
    return null;
  }
  const expiresAt = Number(expiresRaw);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearStoredAdminSession();
    return null;
  }
  return { sessionToken, expiresAt };
}

export function writeStoredAdminSession(session: StoredAdminSession) {
  sessionStorage.setItem(SESSION_TOKEN_KEY, session.sessionToken);
  sessionStorage.setItem(SESSION_EXPIRES_KEY, String(session.expiresAt));
}

export function clearStoredAdminSession() {
  sessionStorage.removeItem(SESSION_TOKEN_KEY);
  sessionStorage.removeItem(SESSION_EXPIRES_KEY);
}
