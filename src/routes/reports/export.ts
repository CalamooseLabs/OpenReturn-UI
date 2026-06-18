import { define } from "../../utils.ts";
import { ApiError } from "../../lib/api/mod.ts";
import { listModelOptions } from "../../lib/models.ts";
import { isAdmin } from "../../lib/auth.ts";
import { csvResponse, pdfResponse, tablePdf, toCsv } from "../../lib/export.ts";
import { formatEin, scorePct } from "../../lib/format.ts";
import type { LeaderboardRow } from "../../lib/types.ts";

const PAGE_SIZE = 500; // API max per call
const MAX_ROWS = 5000; // safety cap for a single export

export const handler = define.handlers({
  async GET(ctx) {
    const api = ctx.state.api;
    const sp = ctx.url.searchParams;
    const format = (sp.get("format") ?? "pdf").toLowerCase();

    // Resolve the model (default to the highest available, as on the page).
    let model: string | undefined;
    const modelParam = sp.get("model");
    if (modelParam) model = modelParam;
    let modelLabel = model !== undefined ? `v${model}` : "";
    try {
      const opts = await listModelOptions(api, {
        admin: isAdmin(ctx.state.principal),
      });
      if (model === undefined && opts.length) {
        model = opts[opts.length - 1].version;
      }
      const match = opts.find((o) => o.version === model);
      if (match) modelLabel = match.label;
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
    }
    if (model === undefined) {
      return new Response("No scoring model available to export.", {
        status: 400,
      });
    }

    const yearNum = sp.get("year") ? parseInt(sp.get("year")!, 10) : NaN;
    const subset = {
      model,
      year: !isNaN(yearNum) ? yearNum : undefined,
      sector: sp.get("sector") || undefined,
      state: sp.get("state") || undefined,
      type: sp.get("type") || undefined,
      grantmaker: sp.get("grantmaker") === "1" ? 1 : undefined,
    };

    // Fetch the full leaderboard (all pages, up to the safety cap).
    const rows: LeaderboardRow[] = [];
    let resolvedYear: number | null = null;
    let offset = 0;
    try {
      while (offset < MAX_ROWS) {
        const res = await api.scores.leaderboard({
          ...subset,
          limit: PAGE_SIZE,
          offset,
        });
        const batch = res.leaderboard ?? [];
        rows.push(...batch);
        resolvedYear = res.year ?? resolvedYear;
        if (
          batch.length < PAGE_SIZE || rows.length >= (res.total ?? rows.length)
        ) break;
        offset += PAGE_SIZE;
      }
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) throw err;
      return new Response(
        `Failed to build report: ${
          err instanceof Error ? err.message : "error"
        }`,
        { status: 502 },
      );
    }

    const yearLabel = resolvedYear !== null ? String(resolvedYear) : "latest";
    const stamp = new Date().toISOString().slice(0, 10);
    const base = `openreturn-leaderboard-v${model}-${yearLabel}`;

    const filterBits: string[] = [];
    if (subset.sector) filterBits.push(`sector ${subset.sector}`);
    if (subset.state) filterBits.push(`state ${subset.state}`);
    if (subset.type) filterBits.push(`type ${subset.type}`);
    if (subset.grantmaker) filterBits.push("grantmakers only");

    if (format === "csv") {
      const csv = toCsv(
        ["Rank", "EIN", "Organization", "Score", "Score %", "Year"],
        rows.map((r) => [
          r.rank,
          formatEin(r.ein),
          r.name,
          r.total_score?.toFixed(6) ?? "",
          scorePct(r.total_score),
          r.year,
        ]),
      );
      return csvResponse(`${base}.csv`, csv);
    }

    // Default: PDF.
    const meta = [
      `Model: ${modelLabel}`,
      `Scope: ${
        filterBits.length ? filterBits.join(" · ") : "global"
      } · year ${yearLabel}`,
      `Organizations: ${rows.length}${
        rows.length >= MAX_ROWS ? " (truncated)" : ""
      } · Generated ${stamp}`,
    ];
    const bytes = await tablePdf({
      title: "OpenReturn — Leaderboard",
      subtitle: "Ranked financial-health scores",
      meta,
      columns: [
        { header: "Rank", width: 1, align: "right" },
        { header: "Organization", width: 6 },
        { header: "EIN", width: 2 },
        { header: "Score", width: 1.5, align: "right" },
        { header: "Year", width: 1.2, align: "right" },
      ],
      rows: rows.map((r) => [
        `#${r.rank}`,
        r.name,
        formatEin(r.ein),
        scorePct(r.total_score),
        r.year,
      ]),
    });
    return pdfResponse(`${base}.pdf`, bytes);
  },
});
