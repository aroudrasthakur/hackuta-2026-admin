import { ConvexHttpClient } from "convex/browser";
import { makeFunctionReference } from "convex/server";
import { e2eMockSignIn, e2eMockSignOut } from "../shared/admin/e2e/mockAdminStore.ts";
import {
  clearAdminSessionCookie,
  isSecureRequest,
  readAdminSessionCookie,
  serializeAdminSessionCookie,
} from "./adminAuthCookie.ts";

function isE2eMockAuthEnabled() {
  return process.env.VITE_E2E_MOCK === "true";
}

type AdminSignInResult =
  | { ok: true; sessionToken: string; expiresAt: number }
  | { ok: false; error: string };

const adminSignInRef = makeFunctionReference<
  "mutation",
  { email: string; password: string },
  AdminSignInResult
>("admin/auth:signIn");

const adminSignOutRef = makeFunctionReference<
  "mutation",
  { sessionToken: string },
  { ok: true }
>("admin/auth:signOut");

function convexUrl() {
  return process.env.VITE_CONVEX_URL?.trim() || process.env.CONVEX_URL?.trim();
}

function createConvexClient() {
  const url = convexUrl();
  if (!url) {
    throw new Error("Missing VITE_CONVEX_URL for organizer auth API.");
  }
  return new ConvexHttpClient(url);
}

function jsonResponse(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify(body), { ...init, headers });
}

async function readJsonBody<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export async function handleAdminSignIn(request: Request) {
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
        return jsonResponse({ error: result.error }, { status: 401 });
      }
      const headers = new Headers();
      headers.append(
        "Set-Cookie",
        serializeAdminSessionCookie(result.sessionToken, secure),
      );
      return jsonResponse({ ok: true, expiresAt: result.expiresAt }, { headers });
    }

    const client = createConvexClient();
    const result = await client.mutation(adminSignInRef, { email, password });
    if (!result.ok) {
      const status = result.error.includes("inactive") ? 403 : 401;
      return jsonResponse({ error: result.error }, { status });
    }
    const headers = new Headers();
    headers.append(
      "Set-Cookie",
      serializeAdminSessionCookie(result.sessionToken, secure),
    );
    return jsonResponse({ ok: true, expiresAt: result.expiresAt }, { headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Sign-in failed.";
    return jsonResponse({ error: message }, { status: 401 });
  }
}

export async function handleAdminSignOut(request: Request) {
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
        const client = createConvexClient();
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
    return new Response(null, { status: 401 });
  }

  return new Response(sessionToken, {
    status: 200,
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}

export async function routeAdminAuthRequest(request: Request) {
  const { pathname } = new URL(request.url);
  if (pathname === "/api/admin/sign-in") {
    return handleAdminSignIn(request);
  }
  if (pathname === "/api/admin/sign-out") {
    return handleAdminSignOut(request);
  }
  if (pathname === "/api/admin/session-token") {
    return handleAdminSessionToken(request);
  }
  return new Response("Not Found", { status: 404 });
}
