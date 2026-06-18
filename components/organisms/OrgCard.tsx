// ── Organism: OrgCard ────────────────────────────────────────────────────────
// A single organization result card for the search results grid: navy avatar +
// identity, an overall score (or an "Unscored" placeholder), and a footer strip
// of mini-stats (type / sector / tracking). Takes plain data props (no fetch).

import { Avatar, BandBar, GradePill, ScoreNumber } from "../atoms.tsx";
import { scoreBand, to100 } from "../../lib/score.ts";
import { titleCase } from "../../lib/format.ts";
import type { Address, OrgSummary } from "../../lib/types.ts";

/** A search hit enriched with its overall score, where one is readily known. */
export interface ScoredOrg extends OrgSummary {
  score100?: number | null;
}

/** "City, ST" location line from a filer address (em-dash when absent). */
function locationLine(addr?: Address | null): string {
  return addr?.city
    ? `${addr.city}${addr.state ? `, ${addr.state}` : ""}`
    : "—";
}

export function OrgCard(props: { org: ScoredOrg }) {
  const o = props.org;
  const loc = locationLine(o.address);
  const score = to100(o.score100);
  const hasScore = score !== null;
  const band = hasScore ? scoreBand(score) : null;

  return (
    <a
      href={`/orgs/${o.ein}`}
      class="card card-hover flex flex-col"
      style={{ borderRadius: "16px", padding: "20px" }}
    >
      {/* Identity */}
      <div class="mb-4 flex items-start gap-3">
        <Avatar label={o.name} size={40} />
        <div class="min-w-0 flex-1">
          <div
            class="truncate font-bold leading-tight text-navy"
            style={{ fontSize: "14.5px", letterSpacing: "-0.01em" }}
          >
            {o.name}
          </div>
          <div class="mt-0.5 text-faint" style={{ fontSize: "11.5px" }}>
            {loc}
          </div>
        </div>
      </div>

      {/* Score */}
      {hasScore
        ? (
          <>
            <div class="mb-3.5 flex items-end gap-2">
              <ScoreNumber value={score} size={40} />
              <span class="text-faint" style={{ fontSize: "13px" }}>/100</span>
              <span class="ml-auto">
                <GradePill value={score} band={band ?? undefined} />
              </span>
            </div>
            <div class="mb-4">
              <BandBar value={score} height={7} />
            </div>
          </>
        )
        : (
          <div class="mb-4">
            <div class="flex items-end gap-2">
              <span
                class="font-display font-bold text-faint"
                style={{
                  fontSize: "40px",
                  lineHeight: "0.85",
                  letterSpacing: "-0.03em",
                }}
              >
                —
              </span>
              <span
                class="ml-auto mono uppercase text-faint"
                style={{ fontSize: "10.5px", letterSpacing: ".12em" }}
              >
                Unscored
              </span>
            </div>
            <div
              class="mt-3.5 overflow-hidden rounded-full bg-line"
              style={{ height: "7px" }}
            />
          </div>
        )}

      {/* Footer mini-stats */}
      <div class="mt-auto flex items-center justify-between border-t border-line-soft pt-3">
        <div>
          <div class="text-faint" style={{ fontSize: "10.5px" }}>Type</div>
          <div
            class="mt-0.5 font-semibold text-ink"
            style={{ fontSize: "12.5px" }}
          >
            {o.org_type ? titleCase(o.org_type) : "—"}
            {o.is_grantmaker && (
              <span class="ml-1 text-faint" style={{ fontSize: "11px" }}>
                · Grantmaker
              </span>
            )}
          </div>
        </div>
        <div style={{ textAlign: "center" }}>
          <div class="text-faint" style={{ fontSize: "10.5px" }}>Sector</div>
          <div
            class="mt-0.5 max-w-[120px] truncate font-semibold text-ink"
            style={{ fontSize: "12.5px" }}
          >
            {o.sector_name ?? o.sector_code ?? "—"}
          </div>
        </div>
        <div style={{ textAlign: "right" }}>
          <div class="text-faint" style={{ fontSize: "10.5px" }}>Tracking</div>
          <div
            class="mt-0.5 font-semibold"
            style={{
              fontSize: "12.5px",
              color: o.following ? "#2f7d5b" : "#9aa3b5",
            }}
          >
            {o.following ? "Following" : "—"}
          </div>
        </div>
      </div>
    </a>
  );
}
