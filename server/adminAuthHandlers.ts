import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { e2eMockSignIn, e2eMockSignOut } from "../shared/admin/e2e/mockAdminStore.ts";
import { SIGN_IN_FAILED_MESSAGE } from "../shared/admin/errors.ts";
import {
  clearAdminSessionCookie,
  isSecureRequest,
  readAdminSessionCookie,
  serializeAdminSessionCookie,
} from "./adminAuthCookie.ts";
import { getAdminSignInClientIp, isLoopbackAdminRequest } from "./adminRequestClient.ts";

function isE2eMockAuthEnabled() {
  return process.env.VITE_E2E_MOCK === "true";
}

type AdminSignInFailureCode = "INVALID_CREDENTIALS" | "ACCOUNT_INACTIVE" | "SIGN_IN_RATE_LIMITED";

type AdminSignInResult =
  | { ok: true; sessionToken: string; expiresAt: number }
  | { ok: false; code: AdminSignInFailureCode; error: string };

const adminSignInRef = makeFunctionReference<
  "mutation",
  { email: string; password: string; clientIp?: string },
  AdminSignInResult
>("admin/auth:signIn");

const adminSignOutRef = makeFunctionReference<
  "mutation",
  { sessionToken: string },
  { ok: true }
>("admin/auth:signOut");

export type AdminAuthApiConfig = {
  convexUrl?: string;
  devAuth?: {
    enabled: boolean;
    email?: string;
    password?: string;
  };
};

function convexUrl(configuredUrl?: string) {
  return (
    configuredUrl?.trim() ||
    process.env.VITE_CONVEX_URL?.trim() ||
    process.env.CONVEX_URL?.trim()
  );
}

function createConvexClient(configuredUrl?: string) {
  const url = convexUrl(configuredUrl);
  if (!url) {
    throw new Error("Missing VITE_CONVEX_URL for organizer auth API.");
  }
  return new ConvexHttpClient(url);
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  headers.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

function signInErrorStatus(code: AdminSignInFailureCode) {
  if (code === "ACCOUNT_INACTIVE") {
    return 403;
  }
  if (code === "SIGN_IN_RATE_LIMITED") {
    return 429;
  }
  return 401;
}

export async function handleAdminSignIn(request: Request, configuredUrl?: string) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secure = isSecureRequest(request);
  let email: string;
  let password: string;
  try {
    const body = await readJsonBody<{ email?: string; password?: string }>(request);
    email = String(body.email ?? "");
    password = String(body.password ?? "");
  } catch {
    return jsonResponse({ error: "Invalid request body." }, { status: 400 });
  }

  try {
    if (isE2eMockAuthEnabled()) {
      const result = e2eMockSignIn(email, password);
      if (!result.ok) {
        return jsonResponse({ code: result.code, error: result.error }, { status: 401 });
      }
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        serializeAdminSessionCookie(result.sessionToken, secure),
      );
      return jsonResponse({ ok: true, expiresAt: result.expiresAt }, { headers });
    }

    const client = createConvexClient(configuredUrl);
    const clientIp = getAdminSignInClientIp(request);
    const result = await client.mutation(adminSignInRef, { email, password, clientIp });
    if (!result.ok) {
      return jsonResponse(
        { code: result.code, error: result.error },
        { status: signInErrorStatus(result.code) },
      );
    }
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      serializeAdminSessionCookie(result.sessionToken, secure),
    );
    return jsonResponse({ ok: true, expiresAt: result.expiresAt }, { headers });
  } catch (error) {
    // Keep config and Convex details in server logs only.
    console.error("Organizer sign-in failed", error);
    return jsonResponse({ error: SIGN_IN_FAILED_MESSAGE }, { status: 500 });
  }
}

async function handleAdminDevSignIn(
  request: Request,
  config: AdminAuthApiConfig,
) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }
  if (!config.devAuth?.enabled) {
    return new Response("Not Found", { status: 404 });
  }
  if (!isLoopbackAdminRequest(request)) {
    return jsonResponse(
      { error: "Dev sign-in is only available from localhost." },
      { status: 403 },
    );
  }
  if (!config.devAuth.email || !config.devAuth.password) {
    return jsonResponse(
      { error: "Set ADMIN_DEV_AUTH_EMAIL and ADMIN_DEV_AUTH_PASSWORD in .env.local." },
      { status: 503 },
    );
  }

  const signInRequest = new Request(request.url, {
    method: "POST",
    headers: request.headers,
    body: JSON.stringify({
      email: config.devAuth.email,
      password: config.devAuth.password,
    }),
  });
  return handleAdminSignIn(signInRequest, config.convexUrl);
}

export async function handleAdminSignOut(request: Request, configuredUrl?: string) {
  if (request.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const secure = isSecureRequest(request);
  const sessionToken = readAdminSessionCookie(request.headers.get("cookie"));
  if (sessionToken) {
    try {
      if (isE2eMockAuthEnabled()) {
        e2eMockSignOut(sessionToken);
      } else {
        const client = createConvexClient(configuredUrl);
        await client.mutation(adminSignOutRef, { sessionToken });
      }
    } catch {
      // Always clear the browser cookie even if the server row is already gone.
    }
  }

  const headers = new Headers();
  headers.append("Set-Cookie", clearAdminSessionCookie(secure));
  return jsonResponse({ ok: true }, { headers });
}

export async function handleAdminSessionToken(request: Request) {
  if (request.method !== "GET") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const sessionToken = readAdminSessionCookie(request.headers.get("cookie"));
  if (!sessionToken) {
    return new Response(null, {
      status: 401,
      headers: {
        "Cache-Control": "no-store, no-cache, must-revalidate, private",
      },
    });
  }

  return new Response(sessionToken, {
    status: 200,
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
    },
  });
}

export async function routeAdminAuthRequest(
  request: Request,
  config: AdminAuthApiConfig = {},
) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/admin/sign-in") {
    return handleAdminSignIn(request, config.convexUrl);
  }
  if (pathname === "/api/admin/sign-out") {
    return handleAdminSignOut(request, config.convexUrl);
  }
  if (pathname === "/api/admin/session-token") {
    return handleAdminSessionToken(request);
  }
  if (pathname === "/api/admin/dev-sign-in") {
    return handleAdminDevSignIn(request, config);
  }
  return new Response("Not Found", { status: 404 });
}
