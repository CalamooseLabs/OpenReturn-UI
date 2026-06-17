// Test helpers: hermetic fetch stubbing + small response builders.
// Lets unit tests exercise the API client and (with the built app) routes
// without a real backend.

export interface CapturedRequest {
  method: string;
  url: string;
  pathname: string;
  query: URLSearchParams;
  headers: Headers;
  bodyText: string;
}

/** Replace globalThis.fetch with `handler`; returns a restore function. */
export function stubFetch(
  handler: (req: Request) => Response | Promise<Response>,
): () => void {
  const original = globalThis.fetch;
  globalThis.fetch = ((input: string | URL | Request, init?: RequestInit) => {
    const req = input instanceof Request ? input : new Request(input, init);
    return Promise.resolve(handler(req));
  }) as typeof fetch;
  return () => {
    globalThis.fetch = original;
  };
}

/** A JSON Response with the right content-type. */
export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

/**
 * Stub fetch and capture every request. Pass a responder keyed by
 * "METHOD /pathname" (or just "/pathname"); falls back to 200 {} so callers
 * that only care about the captured request don't need to map every route.
 */
export function captureFetch(
  responder: Record<string, (req: Request) => Response> = {},
): { calls: CapturedRequest[]; restore: () => void } {
  const calls: CapturedRequest[] = [];
  const restore = stubFetch(async (req) => {
    const u = new URL(req.url);
    const bodyText = req.body ? await req.clone().text() : "";
    calls.push({
      method: req.method,
      url: req.url,
      pathname: u.pathname,
      query: u.searchParams,
      headers: req.headers,
      bodyText,
    });
    const r = responder[`${req.method} ${u.pathname}`] ?? responder[u.pathname];
    return r ? r(req) : jsonResponse({});
  });
  return { calls, restore };
}
