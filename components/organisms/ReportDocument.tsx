// ── Organism: ReportDocument ─────────────────────────────────────────────────
// The NKC Family Foundation "Summary Report" — a printable, letterhead-style
// per-org document (design handoff "OpenReturn - Reports"). Composed from the
// atomic library (Eyebrow / ScoreNumber / GradePill / BandBar / Pill / Divider).
//
// Real API data drives the letterhead, score breakdown, and financial snapshot.
// The foundation-relationship sections (the Ask, recommendation, giving history,
// what-we-like, accountability) have no API source yet, so they render faithful
// SAMPLE content clearly marked {/* TODO: wire to API */} — never invented score
// numbers (those fall back to "Pending").

import type { ComponentChildren } from "preact";
import { Eyebrow, GradePill, Pill, ScoreNumber } from "../atoms.tsx";
import { scoreBand } from "../../lib/score.ts";
import { formatEin } from "../../lib/format.ts";

// ---- props ------------------------------------------------------------------
export interface ReportPillar {
  label: string;
  /** 0–100 score, or null when this pillar's model has not scored the org. */
  value: number | null;
  /** Short band-driven narrative; falls back to a generic line when scored. */
  note: string;
}

export interface ReportKpi {
  label: string;
  value: string;
  accent?: boolean;
}

export interface ReportUpdate {
  year: string;
  body: string;
  /** A real (derived-from-filing) update vs. a sample relationship note. */
  sample?: boolean;
}

export interface ReportDocumentProps {
  name: string;
  ein: string;
  city?: string | null;
  state?: string | null;
  sector?: string | null;
  sizeBand?: string | null;
  /** Overall 0–100 score (highest model), or null → "Pending". */
  overall: number | null;
  fiscalYear?: number;
  /** Latest filing/update date for the letterhead, if known. */
  lastUpdated?: string;
  pillars: ReportPillar[];
  kpis: ReportKpi[];
  /** Net (income − expenses) for the snapshot header tint, when computable. */
  net?: number | null;
  /** Concise NET label, e.g. "−$176,377" / "+$1.2M". */
  netLabel?: string | null;
  financialPeriod?: string;
  updates: ReportUpdate[];
}

// ---- sample (foundation-relationship) content -------------------------------
// None of this is in the 990 API. Marked sample + TODO so it's obvious.
const SAMPLE_PROGRAMS = [
  "Family law",
  "Housing",
  "Foreclosure",
  "Tax",
  "Consumer",
];
const SAMPLE_GIVING = [
  { year: "2025", amt: 100_000, label: "$100,000", big: true },
  { year: "2024", amt: 75_000, label: "$75,000" },
  { year: "2023", amt: 45_000, label: "$45,000" },
  { year: "2022", amt: 45_000, label: "$45,000" },
  { year: "2021", amt: 40_000, label: "$40,000" },
];
const SAMPLE_FIT = [
  { label: "Hands & Feet of Christ", on: true },
  { label: "Gospel Development & Great Commission", on: false },
  { label: "Christian Community", on: false },
  { label: "Healthcare & Disability Services", on: false },
];

const NAVY = "#192a54";

/** Small reusable section wrapper: mono eyebrow + divider rhythm. */
function DocSection(
  props: {
    eyebrow: string;
    action?: ComponentChildren;
    children: ComponentChildren;
    last?: boolean;
  },
) {
  return (
    <div
      style={{
        padding: props.last ? "28px 0 0" : "28px 0",
        borderBottom: props.last ? "none" : "1px solid #eef1f6",
      }}
    >
      <div
        class="flex items-center justify-between"
        style={{ marginBottom: "16px" }}
      >
        <Eyebrow>{props.eyebrow}</Eyebrow>
        {props.action}
      </div>
      {props.children}
    </div>
  );
}

export function ReportDocument(props: ReportDocumentProps) {
  const overall = props.overall;
  const hasOverall = overall !== null;
  const overallBand = hasOverall ? scoreBand(overall) : null;

  return (
    <article
      class="or-doc mx-auto overflow-hidden bg-white"
      style={{
        maxWidth: "960px",
        border: "1px solid #dde2ec",
        borderRadius: "16px",
        boxShadow:
          "0 1px 2px rgba(25,42,84,.05),0 30px 60px -34px rgba(25,42,84,.28)",
      }}
    >
      {/* ───────────────────────── LETTERHEAD ───────────────────────── */}
      <div class="bg-navy text-[#eef1f7]" style={{ padding: "30px 44px 28px" }}>
        <div
          class="flex items-center justify-between gap-4"
          style={{ marginBottom: "22px" }}
        >
          <div
            class="mono uppercase"
            style={{
              fontSize: "11px",
              letterSpacing: ".16em",
              color: "#9fb6e6",
            }}
          >
            NKC Family Foundation · Summary Report · v3.0
          </div>
          <div
            class="mono"
            style={{ fontSize: "11px", color: "rgba(238,241,247,.55)" }}
          >
            {props.lastUpdated
              ? `Last updated ${props.lastUpdated}`
              : "Draft report"}
          </div>
        </div>
        <div class="flex flex-wrap items-end justify-between gap-6">
          <div class="min-w-0">
            <h1
              class="font-display font-bold"
              style={{
                fontSize: "40px",
                lineHeight: "1.0",
                letterSpacing: "-0.03em",
                margin: "0 0 14px",
              }}
            >
              {props.name}
            </h1>
            <div class="flex flex-wrap gap-2">
              <LetterPill>
                <span class="mono">EIN {formatEin(props.ein)}</span>
              </LetterPill>
              {props.city && (
                <LetterPill>
                  {[props.city, props.state].filter(Boolean).join(", ")}
                </LetterPill>
              )}
              {props.sizeBand && <LetterPill>{props.sizeBand}</LetterPill>}
              {props.sector && <LetterPill>{props.sector}</LetterPill>}
            </div>
          </div>
          {/* overall score block */}
          <div
            class="flex shrink-0 items-center gap-4"
            style={{
              background: "rgba(159,182,230,.12)",
              border: "1px solid rgba(159,182,230,.25)",
              borderRadius: "16px",
              padding: "16px 22px",
            }}
          >
            <div class="text-center">
              <div
                class="mono"
                style={{
                  fontSize: "10px",
                  letterSpacing: ".16em",
                  color: "#9fb6e6",
                  marginBottom: "4px",
                }}
              >
                OVERALL
              </div>
              <div class="flex items-end justify-center gap-1">
                <span
                  class="font-display font-bold"
                  style={{
                    fontSize: "46px",
                    lineHeight: "0.85",
                    letterSpacing: "-0.03em",
                    color: "#fff",
                  }}
                >
                  {hasOverall ? overall : "—"}
                </span>
                <span
                  style={{
                    fontSize: "15px",
                    color: "#9fb6e6",
                    marginBottom: "5px",
                  }}
                >
                  /100
                </span>
              </div>
            </div>
            <div
              style={{
                width: "1px",
                height: "54px",
                background: "rgba(159,182,230,.3)",
              }}
            />
            <div class="text-center">
              <div
                class="mono"
                style={{
                  fontSize: "10px",
                  letterSpacing: ".12em",
                  color: "#9fb6e6",
                  marginBottom: "6px",
                }}
              >
                GRADE
              </div>
              {hasOverall
                ? <GradePill value={overall} band={overallBand ?? undefined} />
                : (
                  <span
                    class="mono font-semibold"
                    style={{ fontSize: "13px", color: "#9fb6e6" }}
                  >
                    Pending
                  </span>
                )}
            </div>
          </div>
        </div>
      </div>

      {/* ───────────────────────────── BODY ─────────────────────────── */}
      <div style={{ padding: "34px 44px 44px" }}>
        {/* identity: mission + programs + contact */}
        <div
          class="grid"
          style={{
            gridTemplateColumns: "1.6fr 1fr",
            gap: "30px",
            paddingBottom: "30px",
            borderBottom: "1px solid #eef1f6",
          }}
        >
          <div>
            <div style={{ marginBottom: "22px" }}>
              <Eyebrow class="mb-2.5">Mission</Eyebrow>
              {/* TODO: wire to API — no mission text in /organizations/full */}
              <p
                class="font-display font-medium text-navy"
                style={{
                  fontSize: "19px",
                  lineHeight: "1.4",
                  letterSpacing: "-0.01em",
                  margin: "0",
                  textWrap: "pretty",
                }}
              >
                Advancing its charitable mission and serving its community
                through the programs reported on its annual Form&nbsp;990
                filings.
              </p>
            </div>
            <div>
              <Eyebrow class="mb-2.5">Main Programs</Eyebrow>
              {/* TODO: wire to API — program areas not in the 990 dataset */}
              <p
                style={{
                  fontSize: "14px",
                  lineHeight: "1.6",
                  color: "#454b58",
                  margin: "0 0 12px",
                  textWrap: "pretty",
                }}
              >
                Primary focus areas (sample — pending program data):
              </p>
              <div class="flex flex-wrap gap-2">
                {SAMPLE_PROGRAMS.map((p) => (
                  <span
                    style={{
                      fontSize: "12.5px",
                      color: "#2f4a85",
                      background: "#eef2fa",
                      border: "1px solid #dde6f5",
                      borderRadius: "7px",
                      padding: "5px 11px",
                    }}
                  >
                    {p}
                  </span>
                ))}
              </div>
            </div>
          </div>
          {/* contact card */}
          <div
            style={{
              background: "#f7f9fc",
              border: "1px solid #e7ebf2",
              borderRadius: "14px",
              padding: "20px",
            }}
          >
            <Eyebrow class="mb-3.5">Contact</Eyebrow>
            {/* TODO: wire to API — officer contact info not exposed */}
            <div style={{ marginBottom: "14px" }}>
              <div
                class="font-semibold text-navy"
                style={{ fontSize: "13.5px" }}
              >
                Executive Director
              </div>
              <div
                style={{
                  fontSize: "12px",
                  color: "#8893ab",
                  marginBottom: "2px",
                }}
              >
                Primary contact (sample)
              </div>
              <div
                class="mono"
                style={{ fontSize: "11.5px", color: "#3a5da8" }}
              >
                contact@organization.org
              </div>
            </div>
            <div
              style={{
                borderTop: "1px solid #e7ebf2",
                paddingTop: "13px",
                fontSize: "12.5px",
                color: "#5a6172",
                lineHeight: "1.7",
              }}
            >
              {[props.city, props.state].filter(Boolean).join(", ") ||
                "Address on file"}
              <br />
              <span class="mono" style={{ fontSize: "11.5px" }}>
                EIN {formatEin(props.ein)}
              </span>
            </div>
          </div>
        </div>

        {/* giving-area fit (sample) */}
        <DocSection eyebrow="Giving Area Fit">
          {/* TODO: wire to API — foundation giving categories are NKC-internal */}
          <div class="flex flex-wrap gap-2" style={{ marginBottom: "14px" }}>
            {SAMPLE_FIT.map((f) =>
              f.on
                ? (
                  <span
                    style={{
                      fontSize: "12.5px",
                      fontWeight: 600,
                      color: "#245f45",
                      background: "#e3efe7",
                      borderRadius: "7px",
                      padding: "5px 11px",
                    }}
                  >
                    ✓ {f.label}
                  </span>
                )
                : (
                  <span
                    style={{
                      fontSize: "12.5px",
                      color: "#9aa3b5",
                      background: "#f3f5f9",
                      borderRadius: "7px",
                      padding: "5px 11px",
                    }}
                  >
                    {f.label}
                  </span>
                )
            )}
          </div>
          <p
            style={{
              fontSize: "14px",
              lineHeight: "1.6",
              color: "#454b58",
              margin: "0",
              textWrap: "pretty",
            }}
          >
            Sample fit assessment — pending the foundation's giving-category
            review.
          </p>
        </DocSection>

        {/* SCORE BREAKDOWN — real model-type scores where available */}
        <DocSection eyebrow="Score Breakdown">
          <div class="flex flex-col">
            {props.pillars.map((p, i) => (
              <div
                class="grid"
                style={{
                  gridTemplateColumns: "210px 1fr",
                  gap: "26px",
                  paddingBottom: i < props.pillars.length - 1 ? "22px" : "0",
                  marginBottom: i < props.pillars.length - 1 ? "22px" : "0",
                  borderBottom: i < props.pillars.length - 1
                    ? "1px solid #f0f2f7"
                    : "none",
                }}
              >
                <ScoreRow label={p.label} value={p.value} />
                <p
                  style={{
                    fontSize: "14px",
                    lineHeight: "1.62",
                    color: "#454b58",
                    margin: "0",
                    textWrap: "pretty",
                  }}
                >
                  {p.note}
                </p>
              </div>
            ))}
          </div>
        </DocSection>

        {/* FINANCIAL SNAPSHOT — real canonical financials */}
        <DocSection
          eyebrow={`Financial Snapshot${
            props.financialPeriod ? ` · ${props.financialPeriod}` : ""
          }`}
          action={props.netLabel
            ? (
              <span
                class="mono font-semibold"
                style={{
                  fontSize: "12px",
                  color: (props.net ?? 0) < 0 ? "#bf6a3e" : "#2f7d5b",
                }}
              >
                NET {props.netLabel}
              </span>
            )
            : undefined}
        >
          <div
            class="grid"
            style={{ gridTemplateColumns: "repeat(4,1fr)", gap: "14px" }}
          >
            {props.kpis.map((k) => (
              <div
                style={{
                  background: "#f7f9fc",
                  border: "1px solid #e7ebf2",
                  borderRadius: "12px",
                  padding: "16px",
                }}
              >
                <div
                  style={{
                    fontSize: "11.5px",
                    color: "#8893ab",
                    marginBottom: "6px",
                  }}
                >
                  {k.label}
                </div>
                <div
                  class="font-display font-bold"
                  style={{
                    fontSize: "21px",
                    letterSpacing: "-0.01em",
                    color: k.accent ? "#2f4a85" : NAVY,
                  }}
                >
                  {k.value}
                </div>
              </div>
            ))}
          </div>
        </DocSection>

        {/* THE ASK + GIVING HISTORY (sample) */}
        <div
          class="grid"
          style={{
            gridTemplateColumns: "1fr 1fr",
            gap: "30px",
            padding: "28px 0",
            borderBottom: "1px solid #eef1f6",
          }}
        >
          {/* the ask + recommendation */}
          <div>
            <Eyebrow class="mb-3.5">The Ask</Eyebrow>
            {/* TODO: wire to API — grant requests are NKC-internal */}
            <div
              class="flex items-baseline gap-2.5"
              style={{ marginBottom: "8px" }}
            >
              <span style={{ fontSize: "13px", color: "#8893ab" }}>
                Requested
              </span>
              <span
                class="font-display font-bold text-navy"
                style={{ fontSize: "30px", letterSpacing: "-0.02em" }}
              >
                $150,000
              </span>
            </div>
            <div
              style={{
                fontSize: "13.5px",
                color: "#454b58",
                marginBottom: "18px",
              }}
            >
              For <strong class="text-navy">General Operations</strong>{" "}
              <span class="text-faint">(sample)</span>
            </div>
            <div
              style={{
                background: "#eef6f1",
                border: "1px solid #cfe6da",
                borderRadius: "12px",
                padding: "16px 18px",
              }}
            >
              <div
                class="mono uppercase"
                style={{
                  fontSize: "10px",
                  letterSpacing: ".12em",
                  color: "#2f7d5b",
                  marginBottom: "7px",
                }}
              >
                Foundation Recommendation
              </div>
              <div
                class="flex items-baseline gap-2.5"
                style={{ marginBottom: "8px" }}
              >
                <span
                  class="font-display font-bold"
                  style={{
                    fontSize: "26px",
                    letterSpacing: "-0.02em",
                    color: "#245f45",
                  }}
                >
                  $75,000
                </span>
                <span style={{ fontSize: "12.5px", color: "#5a8a72" }}>
                  general operations
                </span>
              </div>
              <p
                style={{
                  fontSize: "13px",
                  lineHeight: "1.55",
                  color: "#3f6b56",
                  margin: "0",
                  textWrap: "pretty",
                }}
              >
                Sample recommendation narrative — to be drafted during the
                foundation's review of this organization.
              </p>
            </div>
          </div>
          {/* giving history (sample bars) */}
          <div>
            <Eyebrow class="mb-3.5">Giving History</Eyebrow>
            {/* TODO: wire to API — historical grants from this foundation */}
            <div class="flex flex-col" style={{ gap: "2px" }}>
              {SAMPLE_GIVING.map((g, i) => (
                <div
                  class="flex items-center gap-3"
                  style={{
                    padding: "9px 0",
                    borderBottom: i < SAMPLE_GIVING.length - 1
                      ? "1px solid #f3f5f9"
                      : "none",
                  }}
                >
                  <span
                    class="mono shrink-0"
                    style={{
                      fontSize: "12.5px",
                      color: "#8893ab",
                      width: "38px",
                    }}
                  >
                    {g.year}
                  </span>
                  <div
                    class="flex-1 overflow-hidden rounded-full"
                    style={{ height: "8px", background: "#eef1f6" }}
                  >
                    <div
                      class="h-full rounded-full"
                      style={{
                        width: `${Math.min(100, g.amt / 1000)}%`,
                        background: g.big ? NAVY : "#9fb0d4",
                      }}
                    />
                  </div>
                  <span
                    class="mono shrink-0 text-right font-semibold"
                    style={{
                      fontSize: "13px",
                      color: g.big ? NAVY : "#3a4150",
                      width: "78px",
                    }}
                  >
                    {g.label}
                  </span>
                </div>
              ))}
            </div>
            <div
              style={{ fontSize: "11px", color: "#9aa3b5", marginTop: "8px" }}
            >
              Sample giving history — pending foundation grant records.
            </div>
          </div>
        </div>

        {/* WHAT WE LIKE (sample) */}
        <DocSection eyebrow={`What We Like About ${props.name}`}>
          {/* TODO: wire to API — qualitative review notes are NKC-internal */}
          <p
            style={{
              fontSize: "14.5px",
              lineHeight: "1.68",
              color: "#3f4654",
              margin: "0",
              textWrap: "pretty",
            }}
          >
            Sample qualitative summary. This section captures the foundation
            team's notes on the organization's strengths, partnerships, and
            community understanding — to be written during the relationship
            review.
          </p>
        </DocSection>

        {/* POINTS OF ACCOUNTABILITY (sample) */}
        <DocSection eyebrow="Points of Accountability">
          {/* TODO: wire to API — accountability notes are NKC-internal */}
          <div
            class="flex gap-3.5"
            style={{
              background: "#fdf6ea",
              border: "1px solid #f0e0c4",
              borderRadius: "12px",
              padding: "18px 20px",
            }}
          >
            <div
              class="flex shrink-0 items-center justify-center font-bold"
              style={{
                width: "30px",
                height: "30px",
                borderRadius: "8px",
                background: "#f6ecd8",
                color: "#b5762a",
              }}
            >
              !
            </div>
            <div>
              <div
                class="font-bold"
                style={{
                  fontSize: "13px",
                  color: "#92611c",
                  marginBottom: "5px",
                }}
              >
                Metrics
              </div>
              <p
                style={{
                  fontSize: "13.5px",
                  lineHeight: "1.6",
                  color: "#6d5a38",
                  margin: "0",
                  textWrap: "pretty",
                }}
              >
                Sample accountability note — open questions and follow-ups the
                foundation is tracking with this organization.
              </p>
            </div>
          </div>
        </DocSection>

        {/* RECENT UPDATES — derived from filings, else sample */}
        <DocSection eyebrow="Recent Updates" last>
          <div style={{ position: "relative", paddingLeft: "24px" }}>
            <div
              style={{
                position: "absolute",
                left: "5px",
                top: "6px",
                bottom: "6px",
                width: "2px",
                background: "#e3e8f1",
              }}
            />
            {props.updates.map((u, i) => (
              <div
                style={{
                  position: "relative",
                  paddingBottom: i < props.updates.length - 1 ? "22px" : "0",
                }}
              >
                <div
                  style={{
                    position: "absolute",
                    left: "-24px",
                    top: "3px",
                    width: "12px",
                    height: "12px",
                    borderRadius: "50%",
                    background: i === 0 ? NAVY : "#fff",
                    border: `2px solid ${i === 0 ? NAVY : "#c3ccdd"}`,
                  }}
                />
                <div
                  class="font-display font-bold text-navy"
                  style={{
                    fontSize: "17px",
                    marginBottom: "6px",
                    letterSpacing: "-0.01em",
                  }}
                >
                  {u.year}
                  {u.sample && (
                    <span
                      class="mono text-faint"
                      style={{
                        fontSize: "10px",
                        fontWeight: 400,
                        marginLeft: "8px",
                        letterSpacing: ".06em",
                      }}
                    >
                      SAMPLE
                    </span>
                  )}
                </div>
                <p
                  style={{
                    fontSize: "13.5px",
                    lineHeight: "1.6",
                    color: "#454b58",
                    margin: "0",
                    textWrap: "pretty",
                  }}
                >
                  {u.body}
                </p>
              </div>
            ))}
          </div>
        </DocSection>
      </div>
    </article>
  );
}

// ---- internal bits ----------------------------------------------------------
/** A frosted pill on the navy letterhead. */
function LetterPill(props: { children: ComponentChildren }) {
  return (
    <span
      style={{
        fontSize: "12.5px",
        color: "#cdd9f0",
        background: "rgba(159,182,230,.16)",
        borderRadius: "6px",
        padding: "4px 10px",
      }}
    >
      {props.children}
    </span>
  );
}

/** Left score column of a breakdown row: number + grade + band bar (or Pending). */
function ScoreRow(props: { label: string; value: number | null }) {
  const has = props.value !== null;
  const band = has ? scoreBand(props.value as number) : null;
  return (
    <div>
      <div
        class="font-semibold text-navy"
        style={{ fontSize: "13px", marginBottom: "10px", lineHeight: "1.3" }}
      >
        {props.label}
      </div>
      <div
        class="flex items-end gap-1.5"
        style={{ marginBottom: "10px" }}
      >
        {has ? <ScoreNumber value={props.value} size={38} showMax /> : (
          <span
            class="font-display font-bold"
            style={{
              fontSize: "38px",
              lineHeight: "0.85",
              letterSpacing: "-0.02em",
              color: "#b3bcce",
            }}
          >
            —
          </span>
        )}
        <span style={{ marginLeft: "auto" }}>
          {has
            ? (
              <GradePill
                value={props.value as number}
                band={band ?? undefined}
              />
            )
            : (
              <Pill bg="#f1f3f8" color="#9aa3b5">
                Pending
              </Pill>
            )}
        </span>
      </div>
      {/* band bar */}
      <div
        class="overflow-hidden rounded-full"
        style={{ height: "7px", background: "#e7ebf2" }}
      >
        {has && (
          <div
            class="h-full rounded-full"
            style={{
              width: `${Math.max(0, Math.min(100, props.value as number))}%`,
              background: (band as ReturnType<typeof scoreBand>).hex,
            }}
          />
        )}
      </div>
    </div>
  );
}
