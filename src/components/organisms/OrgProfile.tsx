// ── Organisms: Org Profile ───────────────────────────────────────────────────
// The bespoke server-rendered sections of the org-profile screen
// (routes/orgs/[ein].tsx), each a self-contained organism taking plain data
// props (no fetching):
//   OrgHero        — navy hero: identity, mission, website, tags, provenance,
//                    OVERALL gauge, the follow/portfolio action + edit button
//   ScoreRingsRail — the four pillar gauge rings rail
//   WhyThisScore   — per-pillar factor breakdown (name / weight / grade) + percentile
//   UpdatesPanel   — shared team notes / updates (post + remove)
//
// The interactive sections live in islands (client tab/expand/modal state):
// FinancialTabs (overview + by-year table), GrantsPanel (made/received/giving),
// KeyPersonnel (recent-filing toggle), FilingsTable (detail modal). money/format
// + score-band logic come from lib/*.

import type { ComponentChildren } from "preact";
import { Fragment } from "preact";
import { GaugeRing } from "../atoms.tsx";
import { dateOnly, formatEin } from "../../lib/format.ts";
import { letterGrade, ordinal, scoreBand, to100 } from "../../lib/score.ts";
import type { OrgNote } from "../../lib/types.ts";

/** A pillar in the rings rail: its label + the (already 0–100) value. */
export interface PillarDatum {
  label: string;
  value: number | null;
}

/** One factor's contribution to a pillar model's score. `weighted_value` is its
 * share of the model total (normalized × weight); `weighted_value / weight` is
 * the factor's own normalized 0–1 score. */
export interface FactorBreakdown {
  name: string;
  weight: number;
  weighted_value: number | null;
}

/** A pillar model's score + its per-factor breakdown (how the grade is built). */
export interface PillarBreakdown {
  label: string;
  version?: string; // the pillar model's version (drives the "Manage data" panel)
  total: number | null; // the model's 0–1 total_score
  factors: FactorBreakdown[];
}

// ───────────────────────────── OrgHero ─────────────────────────────
const META_DIM = "rgba(238,241,247,.6)";
const ACCENT = "#9fb6e6";

/** A pill-shaped action button rendered inside a one-field POST form. */
function ActionForm(
  props: { action: string; active: boolean; label: string },
) {
  return (
    <form method="POST">
      <input type="hidden" name="action" value={props.action} />
      <button
        type="submit"
        class="mono inline-flex items-center rounded-full font-semibold"
        style={{
          border: "1px solid rgba(238,241,247,.4)",
          padding: "9px 18px",
          fontSize: "13px",
          color: "#eef1f7",
          background: props.active ? "rgba(238,241,247,.14)" : "transparent",
        }}
      >
        {props.label}
      </button>
    </form>
  );
}

export function OrgHero(props: {
  name: string;
  ein: string;
  category: string;
  city?: string | null;
  state?: string | null;
  website?: string | null;
  mission?: string | null;
  latestForm?: string | null;
  latestYear?: number;
  provenance?: string;
  overall: number | null;
  overallSub?: string;
  orgType?: string | null;
  following?: boolean;
  inPortfolio?: boolean;
  showActions?: boolean;
  canPortfolio?: boolean;
  canEdit?: boolean;
  /** When set, a prominent "Update Data" button opens the model-data panel. */
  updateDataHref?: string;
  tags: string[];
  canTag?: boolean;
}) {
  const isFoundation = props.orgType === "foundation";
  // Only render an http(s) website as a link (a free-text field could hold a
  // javascript:/data: URI); anything else shows as plain text.
  const safeWebsite = props.website && /^https?:\/\//i.test(props.website)
    ? props.website
    : null;
  const verified = props.latestYear
    ? `${
      (props.latestForm || "990").replace(/^IRS/, "")
    } · FY${props.latestYear}${
      props.provenance ? ` · ${props.provenance}` : ""
    }`
    : "No filings on record";
  return (
    <div class="bg-navy text-white" style={{ padding: "42px 44px" }}>
      <div
        class="mx-auto flex flex-wrap items-start gap-11"
        style={{ maxWidth: "1340px" }}
      >
        <div class="min-w-0 flex-1">
          <div
            class="mono mb-5 inline-flex items-center gap-2 rounded-full uppercase"
            style={{
              border: "1px solid rgba(238,241,247,.3)",
              padding: "5px 13px",
              fontSize: "12px",
              letterSpacing: ".04em",
              color: ACCENT,
            }}
          >
            {props.category}
          </div>
          <h1
            class="font-display font-bold"
            style={{
              fontSize: "50px",
              lineHeight: "1.0",
              letterSpacing: "-0.03em",
              margin: "0 0 16px",
              color: "#ffffff",
            }}
          >
            {props.name}
          </h1>
          <p
            style={{
              fontSize: "17px",
              lineHeight: "1.55",
              color: props.mission
                ? "rgba(238,241,247,.82)"
                : "rgba(238,241,247,.5)",
              maxWidth: "560px",
              margin: "0 0 22px",
              textWrap: "pretty",
            }}
          >
            {props.mission ??
              "No mission statement on file from recent filings."}
          </p>
          <div
            class="mono flex flex-wrap"
            style={{ gap: "18px", fontSize: "12px", color: META_DIM }}
          >
            <span>EIN {formatEin(props.ein)}</span>
            {props.city && (
              <span>
                {[props.city, props.state].filter(Boolean).join(", ")}
              </span>
            )}
            {safeWebsite
              ? (
                <a
                  href={safeWebsite}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ color: ACCENT, textDecoration: "underline" }}
                >
                  {safeWebsite.replace(/^https?:\/\//, "").replace(/\/$/, "")}
                </a>
              )
              : props.website
              ? <span>{props.website}</span>
              : null}
            <span style={{ color: ACCENT }}>{verified}</span>
          </div>

          {/* tags */}
          <div class="mt-5 flex flex-wrap items-center" style={{ gap: "8px" }}>
            {props.tags.map((t) => (
              <span
                key={t}
                class="mono inline-flex items-center rounded-full"
                style={{
                  gap: "6px",
                  background: "rgba(238,241,247,.12)",
                  border: "1px solid rgba(238,241,247,.22)",
                  padding: "3px 10px",
                  fontSize: "11.5px",
                  color: "#eef1f7",
                }}
              >
                {t}
                {props.canTag && (
                  <form method="POST" style={{ display: "inline" }}>
                    <input type="hidden" name="action" value="tag_remove" />
                    <input type="hidden" name="tag" value={t} />
                    <button
                      type="submit"
                      title={`Remove tag ${t}`}
                      style={{ color: ACCENT, fontSize: "11px", lineHeight: 1 }}
                    >
                      ✕
                    </button>
                  </form>
                )}
              </span>
            ))}
            {props.canTag && (
              <form
                method="POST"
                class="inline-flex items-center"
                style={{ gap: "6px" }}
              >
                <input type="hidden" name="action" value="tag_add" />
                <input
                  name="tag"
                  placeholder="+ tag"
                  required
                  class="mono"
                  style={{
                    background: "rgba(238,241,247,.1)",
                    border: "1px solid rgba(238,241,247,.22)",
                    borderRadius: "999px",
                    padding: "3px 11px",
                    fontSize: "11.5px",
                    color: "#fff",
                    width: "92px",
                  }}
                />
              </form>
            )}
          </div>

          {
            /* actions: edit + follow (foundations) / portfolio (nonprofits).
              Follow needs only a logged-in user (follow:write is broadly granted);
              the shared portfolio flag needs org:write, so gate it on canPortfolio. */
          }
          {(() => {
            const showAction = isFoundation
              ? props.showActions
              : props.canPortfolio;
            if (
              !showAction && !props.canEdit && !props.updateDataHref
            ) return null;
            return (
              <div
                class="mt-6 flex flex-wrap items-center"
                style={{ gap: "10px" }}
              >
                {props.updateDataHref && (
                  <a
                    href={props.updateDataHref}
                    class="mono inline-flex items-center rounded-full font-semibold"
                    style={{
                      border: "1px solid #9fb6e6",
                      background: "rgba(159,182,230,.16)",
                      padding: "9px 18px",
                      fontSize: "13px",
                      color: "#eef1f7",
                    }}
                  >
                    ⬍ Update data
                  </a>
                )}
                {props.canEdit && (
                  <a
                    href={`/orgs/${props.ein}/edit`}
                    class="mono inline-flex items-center rounded-full font-semibold"
                    style={{
                      border: "1px solid rgba(238,241,247,.4)",
                      padding: "9px 18px",
                      fontSize: "13px",
                      color: "#eef1f7",
                    }}
                  >
                    ✎ Edit
                  </a>
                )}
                {showAction && (
                  isFoundation
                    ? (
                      <ActionForm
                        action={props.following ? "unfollow" : "follow"}
                        active={!!props.following}
                        label={props.following ? "✓ Following" : "+ Follow"}
                      />
                    )
                    : (
                      <ActionForm
                        action={props.inPortfolio
                          ? "portfolio_remove"
                          : "portfolio_add"}
                        active={!!props.inPortfolio}
                        label={props.inPortfolio
                          ? "✓ In portfolio"
                          : "+ Add to portfolio"}
                      />
                    )
                )}
              </div>
            );
          })()}
        </div>

        {/* overall gauge ring */}
        <div class="flex shrink-0 flex-col items-center gap-3.5">
          <GaugeRing
            dark
            value={props.overall}
            size={186}
            label="OVERALL"
            sub={props.overallSub}
          />
          {props.overall === null && (
            <span class="mono text-xs" style={{ color: ACCENT }}>Pending</span>
          )}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────── ScoreRingsRail ───────────────────────────
export function ScoreRingsRail(props: { pillars: PillarDatum[] }) {
  return (
    <div class="border-b border-line bg-page">
      <div
        class="mx-auto flex flex-wrap items-stretch"
        style={{ maxWidth: "1340px", padding: "30px 44px", gap: "18px" }}
      >
        {props.pillars.map((p, i) => {
          const v = p.value;
          const has = v !== null;
          return (
            <Fragment key={p.label}>
              {i > 0 && (
                <div class="self-stretch bg-line" style={{ width: "1px" }} />
              )}
              <div class="flex flex-1 items-center" style={{ gap: "16px" }}>
                <GaugeRing value={v} size={78} />
                <div>
                  <div
                    class="font-semibold text-navy"
                    style={{ fontSize: "13.5px", marginBottom: "3px" }}
                  >
                    {p.label}
                  </div>
                  {has
                    ? (
                      <div
                        class="mono font-semibold"
                        style={{
                          fontSize: "12px",
                          color: scoreBand(v).pillText,
                        }}
                      >
                        Grade {letterGrade(v)}
                      </div>
                    )
                    : (
                      <div
                        class="mono font-semibold text-faint"
                        style={{ fontSize: "12px" }}
                      >
                        Pending
                      </div>
                    )}
                </div>
              </div>
            </Fragment>
          );
        })}
      </div>
    </div>
  );
}

// ─────────────────────────── WhyThisScore ───────────────────────────
/** Render one factor row: its name, a normalized 0–100 grade bar, and weight. */
function FactorRow(props: { factor: FactorBreakdown }) {
  const { name, weight, weighted_value } = props.factor;
  // weighted_value = normalized(0–1) × weight, so normalized = weighted/weight.
  const normalized =
    weight && weighted_value !== null && weighted_value !== undefined
      ? weighted_value / weight
      : null;
  const grade = to100(normalized);
  const band = grade !== null ? scoreBand(grade) : null;
  return (
    <div class="flex items-center justify-between" style={{ gap: "12px" }}>
      <div class="min-w-0 flex-1">
        <div
          class="truncate text-navy"
          style={{ fontSize: "13px" }}
          title={name}
        >
          {name}
        </div>
        <div
          class="overflow-hidden rounded-full bg-line"
          style={{ height: "5px", marginTop: "5px" }}
        >
          <div
            style={{
              height: "100%",
              width: `${grade ?? 0}%`,
              background: band ? band.hex : "#cbd2df",
              borderRadius: "999px",
            }}
          />
        </div>
      </div>
      <div class="shrink-0 text-right" style={{ minWidth: "78px" }}>
        <span
          class="mono font-semibold"
          style={{ fontSize: "12.5px", color: band ? band.hex : "#8893ab" }}
        >
          {grade ?? "—"}
        </span>
        <div class="mono text-faint" style={{ fontSize: "10.5px" }}>
          weight {weight}
        </div>
      </div>
    </div>
  );
}

export function WhyThisScore(props: {
  breakdown: PillarBreakdown[];
  percentile?: number;
  hasGlobalRank: boolean;
  /** When set (with manageYear + canManage), each pillar gets a "Manage data"
   * link that opens the model-data panel for that model + year. */
  ein?: string;
  manageYear?: number;
  canManage?: boolean;
}) {
  const scored = props.breakdown.filter((p) => p.factors.length > 0);
  const canManage = props.canManage && props.ein &&
    props.manageYear !== undefined;
  return (
    <div class="card" style={{ borderRadius: "20px", padding: "26px" }}>
      <h2
        class="font-display font-bold text-navy"
        style={{
          fontSize: "18px",
          margin: "0 0 18px",
          letterSpacing: "-0.01em",
        }}
      >
        Why this score
      </h2>
      {scored.length === 0
        ? (
          <p class="text-muted" style={{ fontSize: "13.5px" }}>
            This organization has not been scored yet.
          </p>
        )
        : (
          <div class="flex flex-col" style={{ gap: "22px" }}>
            {scored.map((p) => {
              const grade = to100(p.total);
              const band = grade !== null ? scoreBand(grade) : null;
              return (
                <div key={p.label}>
                  <div
                    class="flex items-baseline justify-between"
                    style={{ marginBottom: "10px" }}
                  >
                    <span
                      class="font-semibold text-navy"
                      style={{ fontSize: "13.5px" }}
                    >
                      {p.label}
                    </span>
                    <span class="flex items-baseline" style={{ gap: "10px" }}>
                      <span
                        class="mono font-semibold"
                        style={{
                          fontSize: "12.5px",
                          color: band ? band.pillText : "#8893ab",
                        }}
                      >
                        {grade !== null
                          ? `Grade ${letterGrade(grade)} · ${grade}`
                          : "Pending"}
                      </span>
                      {canManage && p.version && (
                        <a
                          class="link"
                          style={{ fontSize: "11.5px" }}
                          href={`/orgs/${props.ein}?panel=${
                            encodeURIComponent(p.version)
                          }&panelYear=${props.manageYear}`}
                        >
                          Manage data
                        </a>
                      )}
                    </span>
                  </div>
                  <div class="flex flex-col" style={{ gap: "9px" }}>
                    {p.factors.map((f) => (
                      <FactorRow key={f.name} factor={f} />
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      {props.hasGlobalRank && (
        <div
          class="flex items-center justify-between"
          style={{
            marginTop: "20px",
            borderTop: "1px solid #e6eaf1",
            paddingTop: "16px",
          }}
        >
          <span class="text-muted" style={{ fontSize: "13px" }}>
            Percentile in category
          </span>
          <span
            class="font-display font-bold text-navy"
            style={{ fontSize: "22px" }}
          >
            {props.percentile}
            <span
              class="text-faint"
              style={{ fontSize: "13px", fontWeight: "500" }}
            >
              {props.percentile !== undefined
                ? ordinal(props.percentile).slice(
                  String(props.percentile).length,
                )
                : ""}
            </span>
          </span>
        </div>
      )}
    </div>
  );
}

// ─────────────────────────── UpdatesPanel (notes) ───────────────────────────
export function UpdatesPanel(
  props: { notes: OrgNote[]; canPost?: boolean },
) {
  return (
    <div>
      <h2
        class="font-display font-bold text-navy"
        style={{
          fontSize: "18px",
          letterSpacing: "-0.01em",
          margin: "0 0 16px",
        }}
      >
        Updates
      </h2>
      {props.canPost && (
        <form method="POST" style={{ marginBottom: "16px" }}>
          <input type="hidden" name="action" value="note_add" />
          <textarea
            name="body"
            class="input"
            required
            rows={2}
            placeholder="Post an update about this organization…"
            style={{ resize: "vertical", marginBottom: "8px" }}
          />
          <button type="submit" class="btn btn-primary btn-sm">
            Post update
          </button>
        </form>
      )}
      {props.notes.length === 0
        ? (
          <div
            class="card text-muted"
            style={{ borderRadius: "14px", padding: "15px", fontSize: "13px" }}
          >
            No updates yet.
          </div>
        )
        : (
          <div class="flex flex-col" style={{ gap: "10px" }}>
            {props.notes.map((n) => (
              <div
                key={n.note_id}
                class="card"
                style={{ borderRadius: "14px", padding: "14px 16px" }}
              >
                <p
                  style={{
                    margin: 0,
                    fontSize: "13.5px",
                    lineHeight: "1.5",
                    color: "#2b3242",
                    whiteSpace: "pre-wrap",
                  }}
                >
                  {n.body}
                </p>
                <div
                  class="flex items-center justify-between"
                  style={{ marginTop: "8px" }}
                >
                  <span class="mono text-faint" style={{ fontSize: "11px" }}>
                    {n.author_label ?? "unknown"} · {dateOnly(n.created_at)}
                  </span>
                  {props.canPost && (
                    <form method="POST" style={{ display: "inline" }}>
                      <input type="hidden" name="action" value="note_delete" />
                      <input
                        type="hidden"
                        name="note_id"
                        value={String(n.note_id)}
                      />
                      <button
                        type="submit"
                        class="text-faint hover:text-band-low"
                        title="Delete update"
                        style={{ fontSize: "12px", lineHeight: 1 }}
                      >
                        ✕
                      </button>
                    </form>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
    </div>
  );
}

/** Two-column wrapper for the financial + narrative rows. */
export function NarrativeRow(props: { children: ComponentChildren }) {
  return (
    <div
      class="grid"
      style={{
        padding: "34px 44px",
        gridTemplateColumns: "1fr 1fr",
        gap: "28px",
      }}
    >
      {props.children}
    </div>
  );
}
