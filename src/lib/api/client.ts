// Low-level HTTP client for the OpenReturn API.
//
// Domain modules (orgs, scores, people, …) build on `request()`; a route never
// calls this directly — it uses the per-request bound client `ctx.state.api`
// (see lib/api/mod.ts), mirroring the backend's `db.<concern>.<method>()` shape.

const RAW_BASE = Deno.env.get("OPENRETURN_API_URL") ?? "http://localhost:8080";
const API_BASE = RAW_BASE.replace(/\/+$/, "");

// Hard upper bound on a single API call. Every page is server-rendered by
// awaiting these calls, so without a timeout one hung/slow backend request would
// hang the whole SSR render (and tie up a BFF connection) indefinitely. Default
// 10s; set OPENRETURN_API_TIMEOUT_MS=0 to disable.
const TIMEOUT_MS = (() => {
  const raw = Number(Deno.env.get("OPENRETURN_API_TIMEOUT_MS") ?? "10000");
  return Number.isFinite(raw) && raw >= 0 ? raw : 10000;
})();

export function apiBase(): string {
  return API_BASE;
}

/** Thrown for any non-2xx API response. `status` is the HTTP status. */
export class ApiError extends Error {
  readonly status: number;
  readonly body: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.body = body;
  }
}

export type QueryValue = string | number | boolean | null | undefined;

export interface RequestOptions {
  token?: string | null;
  method?: string;
  query?: Record<string, QueryValue>;
  /** JSON request body (object is serialized; Content-Type set automatically). */
  body?: unknown;
  /** Raw body (FormData / URLSearchParams) — multipart uploads; no Content-Type. */
  raw?: BodyInit;
  headers?: Record<string, string>;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: Record<string, QueryValue>): string {
  const url = new URL(API_BASE + path);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === null || value === undefined || value === "") continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

function errorMessage(data: unknown): string | null {
  if (data && typeof data === "object" && "error" in data) {
    return String((data as Record<string, unknown>).error);
  }
  return null;
}

/** True when a 2xx body carries a soft `{error}` field. */
export function softError(data: unknown): string | null {
  return errorMessage(data);
}

/**
 * Call the API and return the parsed JSON body.
 *
 * Throws {@link ApiError} on any non-2xx status. A 2xx response may itself carry
 * an `error` key for soft validation — use {@link softError} to check it.
 */
export async function request<T = unknown>(
  path: string,
  opts: RequestOptions = {},
): Promise<T> {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set("Authorization", `Bearer ${opts.token}`);
  headers.set("Accept", "application/json");

  let body: BodyInit | undefined;
  if (opts.raw !== undefined) {
    body = opts.raw;
  } else if (opts.body !== undefined) {
    headers.set("Content-Type", "application/json");
    body = JSON.stringify(opts.body);
  }

  // Combine the (optional) caller signal with a default timeout so a hung
  // backend can't stall the SSR render forever.
  const signals: AbortSignal[] = [];
  if (opts.signal) signals.push(opts.signal);
  if (TIMEOUT_MS > 0) signals.push(AbortSignal.timeout(TIMEOUT_MS));
  const signal = signals.length === 0
    ? undefined
    : signals.length === 1
    ? signals[0]
    : AbortSignal.any(signals);

  // The timeout signal is live for the WHOLE request, including the body read
  // below — so map abort/connection errors from both fetch() and res.text()
  // through the same handler. AbortSignal.timeout() aborts with a TimeoutError;
  // surface that distinctly from a connection failure.
  const asApiError = (err: unknown): ApiError => {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      return new ApiError(
        0,
        `OpenReturn API request timed out after ${TIMEOUT_MS}ms (${path})`,
      );
    }
    return new ApiError(
      0,
      `Cannot reach the OpenReturn API at ${API_BASE} (${
        err instanceof Error ? err.message : String(err)
      })`,
    );
  };

  let res: Response;
  try {
    res = await fetch(buildUrl(path, opts.query), {
      method: opts.method ?? "GET",
      headers,
      body,
      signal,
    });
  } catch (err) {
    throw asApiError(err);
  }

  let text: string;
  try {
    text = await res.text();
  } catch (err) {
    throw asApiError(err);
  }
  let data: unknown = text;
  const ct = res.headers.get("content-type") ?? "";
  if (text && ct.includes("application/json")) {
    try {
      data = JSON.parse(text);
    } catch {
      // leave as text
    }
  }

  if (!res.ok) {
    throw new ApiError(
      res.status,
      errorMessage(data) ?? `HTTP ${res.status}`,
      data,
    );
  }
  return data as T;
}

/**
 * Base class for a domain API resource (orgs, scores, people, …).
 *
 * Mirrors the backend's pattern where each concern is a `Database` subclass
 * sharing one connection: here each resource is an `ApiResource` subclass
 * sharing one session token, and the `Api` coordinator (lib/api/mod.ts)
 * instantiates them all. Subclasses call `this.get/post/postRaw`.
 */
export abstract class ApiResource {
  constructor(protected readonly token: string | null) {}

  protected get<T = unknown>(
    path: string,
    query?: Record<string, QueryValue>,
  ): Promise<T> {
    return request<T>(path, { token: this.token, query });
  }

  protected post<T = unknown>(
    path: string,
    body?: unknown,
    query?: Record<string, QueryValue>,
  ): Promise<T> {
    return request<T>(path, { method: "POST", token: this.token, body, query });
  }

  protected postRaw<T = unknown>(
    path: string,
    raw: BodyInit,
    query?: Record<string, QueryValue>,
  ): Promise<T> {
    return request<T>(path, { method: "POST", token: this.token, raw, query });
  }
}
