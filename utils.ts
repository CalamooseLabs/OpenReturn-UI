import { createDefine } from "fresh";
import type { Principal } from "./lib/types.ts";
import type { Api } from "./lib/api/mod.ts";

/** Per-request state shared by middleware, layouts, and routes. */
export interface State {
  /** The API session key from the cookie (null when signed out). */
  sessionKey: string | null;
  /** The authenticated caller (null when signed out / anonymous). */
  principal: Principal | null;
  /** API client bound to this request's session token (mirrors the backend's `db`). */
  api: Api;
}

export const define = createDefine<State>();
