import { ApiResource } from "./client.ts";
import type {
  ModelDataResponse,
  ModelYearField,
  ModelYearNote,
} from "../types.ts";

/** /model-data* — per-(org, model, year) notes + custom data fields. */
export class ModelDataApi extends ApiResource {
  load(ein: string, version: string, year: number) {
    return this.get<ModelDataResponse>("/model-data", { ein, version, year });
  }
  addNote(body: { ein: string; version: string; year: number; body: string }) {
    return this.post<ModelYearNote>("/model-data/note", body);
  }
  removeNote(noteId: number) {
    return this.post<{ note_id: number; removed: boolean }>(
      "/model-data/note/delete",
      { note_id: noteId },
    );
  }
  addField(
    body: {
      ein: string;
      version: string;
      year: number;
      label: string;
      value?: string;
    },
  ) {
    return this.post<ModelYearField>("/model-data/field", body);
  }
  removeField(fieldId: number) {
    return this.post<{ field_id: number; removed: boolean }>(
      "/model-data/field/delete",
      { field_id: fieldId },
    );
  }
}
