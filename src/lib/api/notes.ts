import { ApiResource } from "./client.ts";
import type { OrgNote } from "../types.ts";

/** /notes* — shared, team-wide organization notes / updates. */
export class NotesApi extends ApiResource {
  list(ein: string) {
    return this.get<{ ein: string; notes: OrgNote[] }>("/notes", { ein });
  }
  add(ein: string, body: string) {
    return this.post<OrgNote>("/notes", { ein, body });
  }
  remove(noteId: number) {
    return this.post<{ note_id: number; removed: boolean }>("/notes/delete", {
      note_id: noteId,
    });
  }
}
