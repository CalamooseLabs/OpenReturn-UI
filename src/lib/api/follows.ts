import { ApiResource } from "./client.ts";
import type { OrgSummary } from "../types.ts";

/** /follows* — the caller's organization watchlist. */
export class FollowsApi extends ApiResource {
  list(type?: string) {
    return this.get<{ organizations: OrgSummary[] }>("/follows", { type });
  }
  follow(ein: string) {
    return this.post("/follows/follow", { ein });
  }
  unfollow(ein: string) {
    return this.post("/follows/unfollow", { ein });
  }
}
