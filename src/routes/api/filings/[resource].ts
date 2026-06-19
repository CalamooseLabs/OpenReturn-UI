// Scoped BFF proxy for the org-profile "Filings & data" links. The filing
// detail/data/lookup endpoints live on the API and require `filing:read`, which
// the browser can't present (auth is the server-side session token). This route
// forwards a GET to the API with the caller's token and streams the response, so
// a filing link works from the browser without exposing the token or a general
// proxy — only the three read-only filing resources are allowed.

import { define } from "../../../utils.ts";
import { apiBase } from "../../../lib/api/mod.ts";

const ALLOWED = new Set(["detail", "data", "lookup"]);

export const handler = define.handlers({
  async GET(ctx) {
    const resource = ctx.params.resource;
    if (!ALLOWED.has(resource)) {
      return new Response("Not found", { status: 404 });
    }
    const search = new URL(ctx.req.url).search;
    const target = `${apiBase()}/filings/${resource}${search}`;
    const headers: Record<string, string> = {};
    if (ctx.state.sessionKey) {
      headers["Authorization"] = `Bearer ${ctx.state.sessionKey}`;
    }
    const res = await fetch(target, { headers });
    const out = new Headers({
      "content-type": res.headers.get("content-type") ??
        "application/octet-stream",
    });
    const cd = res.headers.get("content-disposition");
    if (cd) out.set("content-disposition", cd);
    return new Response(res.body, { status: res.status, headers: out });
  },
});
