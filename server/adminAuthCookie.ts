/** HttpOnly cookie name for organizer session tokens. */
export const ADMIN_SESSION_COOKIE = "hackuta_admin_session";

const ONE_DAY_SECONDS = 24 * 60 * 60;

export function adminSessionCookieOptions(secure: boolean) {
  return {
    httpOnly: true,
    secure,
    sameSite: "strict" as const,
    path: "/",
    maxAge: ONE_DAY_SECONDS,
  };
}

export function serializeAdminSessionCookie(
  sessionToken: string,
  secure: boolean,
) {
  const { httpOnly, sameSite, path, maxAge } = adminSessionCookieOptions(secure);
  const flags = [
    `${ADMIN_SESSION_COOKIE}=${encodeURIComponent(sessionToken)}`,
    `Max-Age=${maxAge}`,
    `Path=${path}`,
    `SameSite=${sameSite}`,
    httpOnly ? "HttpOnly" : "",
    secure ? "Secure" : "",
  ].filter(Boolean);
  return flags.join("; ");
}

export function clearAdminSessionCookie(secure: boolean) {
  const { path } = adminSessionCookieOptions(secure);
  const flags = [
    `${ADMIN_SESSION_COOKIE}=`,
    "Max-Age=0",
    `Path=${path}`,
    "SameSite=strict",
    "HttpOnly",
    secure ? "Secure" : "",
  ].filter(Boolean);
  return flags.join("; ");
}

export function readAdminSessionCookie(cookieHeader: string | null | undefined) {
  if (!cookieHeader) {
    return null;
  }
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${ADMIN_SESSION_COOKIE}=`)) {
      continue;
    }
    const value = trimmed.slice(ADMIN_SESSION_COOKIE.length + 1);
    try {
      return decodeURIComponent(value);
    } catch {
      return null;
    }
  }
  return null;
}

export function isSecureRequest(request: Request) {
  if (request.headers.get("x-forwarded-proto") === "https") {
    return true;
  }
  return new URL(request.url).protocol === "https:";
}
