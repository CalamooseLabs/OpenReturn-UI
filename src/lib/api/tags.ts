import { ApiResource } from "./client.ts";
import type { TagInfo } from "../types.ts";

/** /tags* — tag catalog, the orgs carrying a tag, and apply/remove. */
export class TagsApi extends ApiResource {
  list() {
    return this.get<{ tags: TagInfo[] }>("/tags");
  }
  forOrg(ein: string) {
    return this.get<{ ein: string; tags: string[] }>("/tags", { ein });
  }
  organizations(tag: string) {
    return this.get<{ tag: string; eins: string[] }>("/tags/organizations", {
      tag,
    });
  }
  apply(ein: string, tag: string) {
    return this.post<{ ein: string; tags: string[] }>("/tags", { ein, tag });
  }
  remove(ein: string, tag: string) {
    return this.post("/tags/remove", { ein, tag });
  }
}
