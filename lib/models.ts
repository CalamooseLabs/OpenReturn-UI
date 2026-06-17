// Helper for discovering scoring models to populate model pickers.
//
// There is no public "list all registered models" endpoint for non-admins, so
// we prefer the authoritative /admin/models list when the caller is an admin
// and fall back to the score:read template catalog otherwise.

import { type Api, ApiError } from "./api/mod.ts";

export interface ModelOption {
  version: number;
  label: string;
  kind?: string;
  type?: string;
}

export async function listModelOptions(
  api: Api,
  opts: { admin?: boolean } = {},
): Promise<ModelOption[]> {
  if (opts.admin) {
    try {
      const r = await api.admin.listModels();
      return (r.models ?? [])
        .map((m) => ({
          version: m.version,
          label: `v${m.version} — ${m.description ?? m.model_kind ?? "model"}`,
          kind: m.model_kind ?? undefined,
          type: m.model_type ?? undefined,
        }))
        .sort((a, b) => a.version - b.version);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) throw e;
      // fall through to templates
    }
  }
  try {
    const r = await api.templates.list();
    return (r.templates ?? [])
      .map((t) => ({
        version: t.version,
        label: `v${t.version} — ${t.name}`,
        kind: t.kind,
        type: t.type,
      }))
      .sort((a, b) => a.version - b.version);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    return [];
  }
}
