import type { IncomingMessage, ServerResponse } from "node:http";

export async function readNodeRequestBody(req: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks);
}

export async function writeNodeResponse(res: ServerResponse, response: Response) {
  res.statusCode = response.status;
  response.headers.forEach((value, key) => {
    res.setHeader(key, value);
  });
  const body = Buffer.from(await response.arrayBuffer());
  res.end(body);
}

export function toWebRequest(req: IncomingMessage, body: Buffer) {
  const host = req.headers.host ?? "127.0.0.1";
  const forwardedProto = headerValue(req.headers["x-forwarded-proto"]);
  const protocol = forwardedProto === "https" || forwardedProto === "http" ? forwardedProto : "http";
  const url = new URL(req.url ?? "/", `${protocol}://${host}`);
  const method = req.method ?? "GET";
  const init: RequestInit = {
    method,
    headers: nodeHeadersToWeb(req.headers),
  };
  if (method !== "GET" && method !== "HEAD" && body.length > 0) {
    init.body = new Uint8Array(body);
  }
  return new Request(url, init);
}

export async function pipeNodeAdminAuth(
  req: IncomingMessage,
  res: ServerResponse,
  handle: (request: Request) => Promise<Response>,
) {
  try {
    const body = await readNodeRequestBody(req);
    const request = toWebRequest(req, body);
    const response = await handle(request);
    await writeNodeResponse(res, response);
  } catch (error) {
    console.error("Organizer auth API request failed", { route: req.url }, error);
    if (!res.headersSent) {
      res.statusCode = 500;
      res.end("Internal Server Error");
    }
  }
}

export function vercelAdminAuthHandler(
  handle: (request: Request) => Promise<Response>,
) {
  return async (req: IncomingMessage | Request, res?: ServerResponse) => {
    if (isWebRequest(req)) {
      return handle(req);
    }
    if (!res) {
      throw new Error("Missing Node response for organizer auth.");
    }
    await pipeNodeAdminAuth(req, res, handle);
  };
}

function isWebRequest(value: IncomingMessage | Request): value is Request {
  return typeof (value as Request).headers?.get === "function";
}

function headerValue(value: string | string[] | undefined) {
  if (Array.isArray(value)) {
    return value[0]?.split(",")[0]?.trim();
  }
  return value?.split(",")[0]?.trim();
}

function nodeHeadersToWeb(headers: IncomingMessage["headers"]): Headers {
  const webHeaders = new Headers();
  for (const [key, value] of Object.entries(headers)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) {
      for (const entry of value) {
        webHeaders.append(key, entry);
      }
      continue;
    }
    webHeaders.set(key, String(value));
  }
  return webHeaders;
}
