// The Api coordinator: a single class that owns the session token and exposes
// each domain resource as a namespace — mirroring the backend's OpenReturnDB
// coordinator with its db.orgs / db.scores / … concern subclasses.
//
// Usage: a per-request instance lives on ctx.state.api (set in main.ts), so a
// route calls e.g. `ctx.state.api.orgs.full(ein)` — never a raw fetch.

import { AdminApi } from "./admin.ts";
import { AuthApi } from "./auth.ts";
import { FinancialsApi } from "./financials.ts";
import { FollowsApi } from "./follows.ts";
import { ListsApi } from "./lists.ts";
import { OrgsApi } from "./orgs.ts";
import { PeopleApi } from "./people.ts";
import { ScoresApi } from "./scores.ts";
import { TagsApi } from "./tags.ts";
import { TemplatesApi } from "./templates.ts";
import { UploadApi } from "./upload.ts";

export class Api {
  readonly auth: AuthApi;
  readonly orgs: OrgsApi;
  readonly scores: ScoresApi;
  readonly people: PeopleApi;
  readonly tags: TagsApi;
  readonly lists: ListsApi;
  readonly financials: FinancialsApi;
  readonly follows: FollowsApi;
  readonly templates: TemplatesApi;
  readonly admin: AdminApi;
  readonly upload: UploadApi;

  constructor(token: string | null) {
    this.auth = new AuthApi(token);
    this.orgs = new OrgsApi(token);
    this.scores = new ScoresApi(token);
    this.people = new PeopleApi(token);
    this.tags = new TagsApi(token);
    this.lists = new ListsApi(token);
    this.financials = new FinancialsApi(token);
    this.follows = new FollowsApi(token);
    this.templates = new TemplatesApi(token);
    this.admin = new AdminApi(token);
    this.upload = new UploadApi(token);
  }
}

/** Build a per-request client bound to a session token (null = anonymous). */
export function createApi(token: string | null): Api {
  return new Api(token);
}

export { apiBase, ApiError, softError } from "./client.ts";
export type { QueryValue, RequestOptions } from "./client.ts";
