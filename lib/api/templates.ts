import { ApiResource } from "./client.ts";
import type { TemplateSummary } from "../types.ts";

export interface TemplateDetail {
  code: string;
  definition: {
    model: Record<string, unknown>;
    factor: Record<string, unknown>[];
  };
}

/** /templates* — the read-only model-template catalog. */
export class TemplatesApi extends ApiResource {
  list() {
    return this.get<{ templates: TemplateSummary[] }>("/templates");
  }
  detail(code: string) {
    return this.get<TemplateDetail>("/templates/detail", { code });
  }
}
