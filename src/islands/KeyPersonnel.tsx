// ── Island: KeyPersonnel ─────────────────────────────────────────────────────
// The org-profile "Key personnel" section: 990-filed officers/directors/trustees
// (across all filings, each tagged with its year) merged with the manually-curated
// People-directory contacts. A default-on "Most recent filing only" checkbox
// narrows the 990 rows to the latest filing year; unchecking it reveals historical
// officers (deduped by name, keeping their most-recent appearance). Directory
// contacts always show. All data is passed in as props.

import { useState } from "preact/hooks";
import { titleCase } from "../lib/format.ts";
import type { Person, Personnel } from "../lib/types.ts";

interface PersonCard {
  name: string;
  title?: string | null;
  comp?: number | null;
  year?: number | null;
  source: "990" | "directory";
}

function compactComp(value: number | null | undefined): string | null {
  if (value === null || value === undefined || isNaN(value) || value === 0) {
    return null;
  }
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `$${Math.round(value / 1_000)}K`;
  return `$${Math.round(value)}`;
}

export default function KeyPersonnel(props: {
  personnel: Personnel[];
  contacts: Person[];
  recentYear?: number | null;
  multiYear: boolean;
}) {
  const [onlyRecent, setOnlyRecent] = useState(true);

  const cards: PersonCard[] = [];
  const seen = new Set<string>();

  // personnel arrive newest-first; in "all" mode keep the first (most recent)
  // appearance per name, in "recent" mode keep only the latest filing year.
  const source = onlyRecent
    ? props.personnel.filter((p) => p.filing_year === props.recentYear)
    : props.personnel;
  for (const p of source) {
    const name = (p.name || "").trim();
    if (!name) continue;
    const k = name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    cards.push({
      name,
      title: p.title,
      comp: (p.reportable_comp_org ?? 0) + (p.other_comp ?? 0),
      year: p.filing_year,
      source: "990",
    });
  }
  for (const c of props.contacts) {
    const name = (c.full_name || "").trim();
    if (!name || seen.has(name.toLowerCase())) continue;
    cards.push({ name, title: c.title, source: "directory" });
  }

  return (
    <div>
      <div
        class="flex items-baseline justify-between"
        style={{ margin: "0 0 16px" }}
      >
        <h2
          class="font-display font-bold text-navy"
          style={{ fontSize: "18px", letterSpacing: "-0.01em", margin: 0 }}
        >
          Key personnel
        </h2>
        {props.multiYear && (
          <label
            class="mono flex cursor-pointer items-center text-faint"
            style={{ fontSize: "11.5px", gap: "6px" }}
          >
            <input
              type="checkbox"
              checked={onlyRecent}
              onChange={(e) =>
                setOnlyRecent((e.target as HTMLInputElement).checked)}
            />
            Most recent filing only
          </label>
        )}
      </div>
      {cards.length === 0
        ? (
          <div
            class="card text-muted"
            style={{ borderRadius: "14px", padding: "15px", fontSize: "13px" }}
          >
            No personnel on record for this organization.
          </div>
        )
        : (
          <div
            class="grid"
            style={{ gridTemplateColumns: "1fr 1fr", gap: "12px" }}
          >
            {cards.map((p) => {
              const comp = compactComp(p.comp);
              const meta = p.source === "directory"
                ? "contact"
                : (comp
                  ? `${comp} comp`
                  : (!onlyRecent && p.year
                    ? `officer · FY${p.year}`
                    : "officer"));
              return (
                <div
                  key={`${p.source}:${p.name}:${p.year ?? ""}`}
                  class="card"
                  style={{ borderRadius: "14px", padding: "15px" }}
                >
                  <div
                    class="font-semibold text-navy"
                    style={{ fontSize: "13.5px" }}
                  >
                    {p.name}
                  </div>
                  <div
                    class="text-faint"
                    style={{ fontSize: "12px", margin: "2px 0 0" }}
                  >
                    {p.title ? titleCase(p.title) : "—"}
                  </div>
                  <div
                    class="mono"
                    style={{
                      fontSize: "11px",
                      marginTop: "6px",
                      color: "#8893ab",
                    }}
                  >
                    {meta}
                  </div>
                </div>
              );
            })}
          </div>
        )}
    </div>
  );
}
