// Helper for discovering scoring models to populate model pickers.
//
// There is no public "list all registered models" endpoint for non-admins, so
// we prefer the authoritative /admin/models list when the caller is an admin
// and fall back to the score:read template catalog otherwise.

import { type Api, ApiError } from "./api/mod.ts";

/** Compare two dot-separated version strings numerically per segment (so
 * "1.10" > "1.2", and date-style "2026.06.14" orders correctly). Missing
 * trailing segments count as 0. */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/** The highest version string in a list (numeric per-segment), or undefined. */
export function maxVersion(versions: string[]): string | undefined {
  return versions.reduce<string | undefined>(
    (hi, v) => (hi === undefined || compareVersions(v, hi) > 0 ? v : hi),
    undefined,
  );
}

export interface ModelOption {
  version: string;
  label: string;
  kind?: string;
  type?: string;
}

/**
 * Pick the "overall" scoring model version for an org type from the admin
 * model list:
 *  - foundation → highest model with `applies_to === "foundation"`
 *  - nonprofit  → highest `model_kind === "super_composite"`
 * Falls back to the overall highest version, then to a sensible default
 * (40 for foundation, 30 for nonprofit) when the admin list is unavailable.
 */
export async function pickOverallModel(
  api: Api,
  orgType: string,
): Promise<string | undefined> {
  const foundation = orgType === "foundation";
  let models: { version: string; kind?: string; appliesTo?: string }[] = [];
  try {
    const r = await api.admin.listModels();
    models = (r.models ?? []).map((m) => ({
      version: m.version,
      kind: m.model_kind ?? undefined,
      appliesTo: m.applies_to ?? undefined,
    }));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    // No admin access (or the endpoint is down): fall back to a default.
    return foundation ? "40" : "30";
  }

  const matches = foundation
    ? models.filter((m) => m.appliesTo === "foundation")
    : models.filter((m) => m.kind === "super_composite");
  const pool = matches.length ? matches : models;
  if (!pool.length) return foundation ? "40" : "30";
  return pool.reduce<string | undefined>(
    (
      hi,
      m,
    ) => (hi === undefined || compareVersions(m.version, hi) > 0
      ? m.version
      : hi),
    undefined,
  );
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
        .sort((a, b) => compareVersions(a.version, b.version));
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
      .sort((a, b) => compareVersions(a.version, b.version));
  } catch (e) {
    if (e instanceof ApiError && e.status === 401) throw e;
    return [];
  }
}
