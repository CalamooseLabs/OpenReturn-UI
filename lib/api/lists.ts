import { ApiResource } from "./client.ts";
import type { ListDetail, ListSummary } from "../types.ts";

/** /lists* — saved organization lists and their members. */
export class ListsApi extends ApiResource {
  list() {
    return this.get<{ lists: ListSummary[] }>("/lists");
  }
  detail(listId: number | string) {
    return this.get<ListDetail>("/lists/detail", { list_id: listId });
  }
  create(body: Record<string, unknown>) {
    return this.post<ListSummary>("/lists", body);
  }
  edit(body: Record<string, unknown>) {
    return this.post<ListSummary>("/lists/edit", body);
  }
  remove(listId: number) {
    return this.post("/lists/delete", { list_id: listId });
  }
  addMember(listId: number, ein: string) {
    return this.post("/lists/members/add", { list_id: listId, ein });
  }
  removeMember(listId: number, ein: string) {
    return this.post("/lists/members/remove", { list_id: listId, ein });
  }
}
