// Integration-test harness: drive the BUILT Fresh server (_fresh/server.js)
// with a stubbed backend, hermetically (no real OpenReturn API).
//
// Requires `deno task build` first — the `test` task builds, and CI should too.
// We import the production fetch handler and replace globalThis.fetch with a
// canned backend for the duration of each request.

import server from "../_fresh/server.js";
import { jsonResponse, stubFetch } from "./helpers.ts";
import type { Principal } from "../lib/types.ts";

const fetcher = (server as { fetch: (r: Request) => Promise<Response> }).fetch;

export type BackendResponder = (req: Request) => Response;

export interface AppRequestOpts {
  method?: string;
  cookie?: string;
  /** urlencoded form fields for a POST (sets method=POST + content-type). */
  form?: Record<string, string>;
  /** multipart body for a POST (file uploads); takes precedence over `form`. */
  formData?: FormData;
  /** Stubbed backend keyed by "METHOD /path" or "/path"; default 200 {}. */
  backend?: Record<string, BackendResponder>;
}

export interface AppResponse {
  status: number;
  headers: Headers;
  body: string;
  location: string | null;
  setCookies: string[];
}

/** Issue one request to the built app with a stubbed backend. */
export async function appRequest(
  path: string,
  opts: AppRequestOpts = {},
): Promise<AppResponse> {
  const restore = stubFetch((req) => {
    const u = new URL(req.url);
    const r = opts.backend?.[`${req.method} ${u.pathname}`] ??
      opts.backend?.[u.pathname];
    return r ? r(req) : jsonResponse({});
  });
  try {
    const headers = new Headers();
    if (opts.cookie) headers.set("cookie", opts.cookie);
    let body: BodyInit | undefined;
    let method = opts.method ?? "GET";
    if (opts.formData) {
      method = opts.method ?? "POST";
      body = opts.formData; // Request sets the multipart content-type + boundary
    } else if (opts.form) {
      method = opts.method ?? "POST";
      headers.set("content-type", "application/x-www-form-urlencoded");
      body = new URLSearchParams(opts.form).toString();
    }
    const res = await fetcher(
      new Request("http://localhost" + path, { method, headers, body }),
    );
    const text = await res.text();
    return {
      status: res.status,
      headers: res.headers,
      body: text,
      location: res.headers.get("location"),
      setCookies: res.headers.getSetCookie(),
    };
  } finally {
    restore();
  }
}

// ---- principals / cookies for authed requests --------------------------

export const ADMIN: Principal = {
  kind: "user",
  label: "admin",
  permissions: [
    "org:read",
    "org:write",
    "score:read",
    "data:read",
    "data:write",
    "person:write",
    "tag:write",
    "list:write",
    "follow:read",
    "follow:write",
    "upload:write",
    "user:admin",
  ],
  user: { user_id: 1, username: "admin", is_active: true, roles: ["admin"] },
};

export const VIEWER: Principal = {
  kind: "user",
  label: "viewer",
  permissions: ["org:read", "score:read", "follow:read", "follow:write"],
  user: { user_id: 2, username: "viewer", is_active: true, roles: ["viewer"] },
};

/** Build a Cookie header for a logged-in principal (token value is arbitrary). */
export function sessionCookie(principal: Principal = ADMIN): string {
  return `or_session=test-token; or_principal=${
    encodeURIComponent(JSON.stringify(principal))
  }`;
}
