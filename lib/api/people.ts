import { ApiResource } from "./client.ts";
import type { Person } from "../types.ts";

export interface PeopleListResponse {
  total: number;
  limit: number;
  offset: number;
  people: Person[];
}

/** /people* — directory + per-person detail and org memberships. */
export class PeopleApi extends ApiResource {
  list(
    params: { search?: string; ein?: string; limit?: number; offset?: number } =
      {},
  ) {
    return this.get<PeopleListResponse>("/people", { ...params });
  }
  detail(personId: number | string) {
    return this.get<Person>("/people/detail", { person_id: personId });
  }
  create(body: Record<string, unknown>) {
    return this.post<Person>("/people", body);
  }
  edit(body: Record<string, unknown>) {
    return this.post<Person>("/people/edit", body);
  }
  remove(personId: number) {
    return this.post("/people/delete", { person_id: personId });
  }
  addMembership(body: Record<string, unknown>) {
    return this.post("/people/membership", body);
  }
  removeMembership(personId: number, ein: string) {
    return this.post("/people/membership/remove", { person_id: personId, ein });
  }
}
