// ── Molecules ────────────────────────────────────────────────────────────────
// Small compositions of atoms (cards, fields, stats, score cells, alerts…).
// These + atoms are the reusable vocabulary every screen draws from.

import type { ComponentChildren, JSX } from "preact";
import { Avatar, GaugeRing, GradePill, type SelectOption } from "./atoms.tsx";
import { scoreColor, scorePct } from "../lib/format.ts";
import { letterGrade, scoreBand, to100 } from "../lib/score.ts";

// ---- Page header / sections -------------------------------------------
export function PageHeader(
  props: {
    title: string;
    subtitle?: string;
    eyebrow?: string;
    actions?: ComponentChildren;
  },
) {
  return (
    <div class="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        {props.eyebrow && <div class="section-title mb-2">{props.eyebrow}</div>}
        <h1 class="font-display text-[34px] font-bold tracking-[-0.025em] text-navy">
          {props.title}
        </h1>
        {props.subtitle && <p class="mt-1.5 text-muted">{props.subtitle}</p>}
      </div>
      {props.actions && <div class="flex gap-2">{props.actions}</div>}
    </div>
  );
}

export function Card(
  props: {
    children: ComponentChildren;
    class?: string;
    pad?: boolean;
    hover?: boolean;
  },
) {
  return (
    <div
      class={`card ${props.pad === false ? "" : "card-pad"} ${
        props.hover ? "card-hover" : ""
      } ${props.class ?? ""}`}
    >
      {props.children}
    </div>
  );
}

/** Card with a display title + optional action link / legend (the dashboard panels). */
export function Panel(
  props: {
    title: string;
    children: ComponentChildren;
    action?: { href: string; label: string };
    legend?: ComponentChildren;
    class?: string;
  },
) {
  return (
    <Card class={props.class}>
      <div class="mb-5 flex items-center justify-between gap-3">
        <h2 class="font-display text-[17px] font-bold tracking-[-0.01em] text-navy">
          {props.title}
        </h2>
        {props.action && (
          <a href={props.action.href} class="link text-sm">
            {props.action.label}
          </a>
        )}
        {props.legend}
      </div>
      {props.children}
    </Card>
  );
}

export function Section(
  props: {
    title: string;
    children: ComponentChildren;
    actions?: ComponentChildren;
  },
) {
  return (
    <section class="mb-6">
      <div class="mb-2 flex items-center justify-between">
        <h2 class="section-title">{props.title}</h2>
        {props.actions}
      </div>
      {props.children}
    </section>
  );
}

// ---- Stats / KPIs ------------------------------------------------------
export function Stat(
  props: { label: string; value: ComponentChildren; hint?: string },
) {
  return (
    <Card>
      <div class="text-xs font-medium uppercase tracking-wide text-faint">
        {props.label}
      </div>
      <div class="mt-1 font-display text-2xl font-bold text-navy">
        {props.value}
      </div>
      {props.hint && <div class="mt-1 text-xs text-faint">{props.hint}</div>}
    </Card>
  );
}

/** Dashboard KPI tile: big Bricolage number + optional delta + sub-line. */
export function KpiCard(
  props: {
    label: string;
    value: ComponentChildren;
    valueColor?: string;
    delta?: string;
    deltaColor?: string;
    sub?: string;
  },
) {
  return (
    <Card>
      <div class="text-[12.5px] text-faint">{props.label}</div>
      <div class="mt-3 flex items-end gap-2">
        <span
          class="font-display font-bold leading-none"
          style={{
            fontSize: "36px",
            letterSpacing: "-0.02em",
            color: props.valueColor ?? "#192A54",
          }}
        >
          {props.value}
        </span>
        {props.delta && (
          <span
            class="mb-1 text-[13px] font-semibold"
            style={{ color: props.deltaColor ?? "#2f7d5b" }}
          >
            {props.delta}
          </span>
        )}
      </div>
      {props.sub && <div class="mt-2 text-xs text-faint">{props.sub}</div>}
    </Card>
  );
}

/** A score number + grade pill, inline (table cells, rows). value is 0–100. */
export function ScoreCell(
  props: { value: number | null | undefined; size?: number },
) {
  const v = to100(props.value);
  if (v === null) return <span class="text-faint">—</span>;
  const band = scoreBand(v);
  return (
    <span class="inline-flex items-center gap-2">
      <span
        class="font-display font-bold"
        style={{ fontSize: `${props.size ?? 18}px`, color: band.hex }}
      >
        {v}
      </span>
      <GradePill value={v} band={band} />
    </span>
  );
}

/** A pillar cell: gauge ring + label + grade (with a muted "Pending" fallback). */
export function PillarRing(
  props: { label: string; value: number | null | undefined; size?: number },
) {
  const v = to100(props.value);
  const has = v !== null;
  const band = has ? scoreBand(v as number) : null;
  return (
    <div class="flex items-center gap-4">
      <GaugeRing value={has ? v : undefined} size={props.size ?? 78} />
      <div class={has ? "" : "opacity-60"}>
        <div class="text-[13.5px] font-semibold text-navy">{props.label}</div>
        {has
          ? (
            <div
              class="mono text-xs font-semibold"
              style={{ color: band!.pillText }}
            >
              Grade {letterGrade(v as number)}
            </div>
          )
          : <div class="mono text-xs text-faint">Pending</div>}
      </div>
    </div>
  );
}

/** Org identity: avatar + name (link) + location line. */
export function OrgIdentity(
  props: {
    ein: string;
    name: string;
    location?: string;
    size?: number;
    link?: boolean;
  },
) {
  const inner = (
    <div class="flex items-center gap-3">
      <Avatar label={props.name} size={props.size ?? 40} />
      <div class="min-w-0">
        <div class="truncate font-bold text-navy">{props.name}</div>
        {props.location && (
          <div class="text-xs text-faint">{props.location}</div>
        )}
      </div>
    </div>
  );
  return props.link === false
    ? inner
    : <a href={`/orgs/${props.ein}`} class="block">{inner}</a>;
}

/** Mono meta row (EIN · city · founded …) separated by gaps. */
export function MetaRow(props: { items: ComponentChildren[]; class?: string }) {
  return (
    <div
      class={`mono flex flex-wrap gap-x-5 gap-y-1 text-xs ${props.class ?? ""}`}
    >
      {props.items.filter(Boolean).map((it, i) => <span key={i}>{it}</span>)}
    </div>
  );
}

/** A pill-shaped filter chip (active = navy). Renders as a link. */
export function FilterChip(
  props: { href: string; label: string; active?: boolean },
) {
  return (
    <a
      href={props.href}
      class={`inline-flex items-center rounded-full border px-3.5 py-1.5 text-sm transition-colors ${
        props.active
          ? "border-navy bg-navy text-white"
          : "border-line bg-white text-muted hover:border-navy/40 hover:text-navy"
      }`}
    >
      {props.label}
    </a>
  );
}

// ---- Forms -------------------------------------------------------------
export function Field(
  props: {
    label: string;
    name: string;
    value?: string | number;
    placeholder?: string;
    type?: string;
    required?: boolean;
  },
) {
  return (
    <div class="field">
      <label class="label" for={props.name}>{props.label}</label>
      <input
        class="input"
        id={props.name}
        name={props.name}
        type={props.type ?? "text"}
        value={props.value as string | undefined}
        placeholder={props.placeholder}
        required={props.required}
      />
    </div>
  );
}

export function Select(
  props: {
    label?: string;
    name: string;
    value?: string;
    options: SelectOption[];
    placeholder?: string;
    onChange?: JSX.GenericEventHandler<HTMLSelectElement>;
  },
) {
  return (
    <div class={props.label ? "field" : ""}>
      {props.label && (
        <label class="label" for={props.name}>{props.label}</label>
      )}
      <select
        class="select"
        id={props.name}
        name={props.name}
        value={props.value ?? ""}
        onChange={props.onChange}
      >
        {props.placeholder !== undefined && (
          <option value="">{props.placeholder}</option>
        )}
        {props.options.map((o) => (
          <option value={o.value} selected={o.value === props.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ---- Feedback ----------------------------------------------------------
export function EmptyState(
  props: { title: string; hint?: string; children?: ComponentChildren },
) {
  return (
    <div class="card card-pad text-center text-muted">
      <p class="font-semibold text-navy">{props.title}</p>
      {props.hint && <p class="mt-1 text-sm">{props.hint}</p>}
      {props.children && <div class="mt-3">{props.children}</div>}
    </div>
  );
}

export function Alert(
  props: { children: ComponentChildren; variant?: "error" | "info" },
) {
  const error = props.variant === "error";
  return (
    <div
      class={`rounded-md border px-4 py-3 text-sm ${
        error
          ? "border-band-low/40 bg-[#f7ece6] text-band-low"
          : "border-brand-200 bg-brand-50 text-[#2f4a85]"
      }`}
    >
      {props.children}
    </div>
  );
}

export function ErrorAlert(props: { message: string }) {
  return <Alert variant="error">{props.message}</Alert>;
}

export function InfoAlert(props: { children: ComponentChildren }) {
  return <Alert variant="info">{props.children}</Alert>;
}

/** PRG flash from ?msg / ?err query params. */
export function Flash(props: { msg?: string | null; err?: string | null }) {
  return (
    <>
      {props.err && (
        <div class="mb-4">
          <Alert variant="error">{props.err}</Alert>
        </div>
      )}
      {props.msg && (
        <div class="mb-4">
          <Alert variant="info">{props.msg}</Alert>
        </div>
      )}
    </>
  );
}

// ---- Pagination + Table -----------------------------------------------
export function Pagination(
  props: {
    total: number;
    limit: number;
    offset: number;
    makeHref: (offset: number) => string;
  },
) {
  const { total, limit, offset } = props;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);
  const hasPrev = offset > 0;
  const hasNext = offset + limit < total;
  return (
    <div class="mt-4 flex items-center justify-between text-sm text-muted">
      <span>{from}–{to} of {total}</span>
      <div class="flex gap-2">
        <a
          class={`btn btn-sm btn-secondary ${
            hasPrev ? "" : "pointer-events-none opacity-40"
          }`}
          href={props.makeHref(Math.max(0, offset - limit))}
        >
          ← Prev
        </a>
        <a
          class={`btn btn-sm btn-secondary ${
            hasNext ? "" : "pointer-events-none opacity-40"
          }`}
          href={props.makeHref(offset + limit)}
        >
          Next →
        </a>
      </div>
    </div>
  );
}

export function Table(
  props: {
    head: ComponentChildren;
    children: ComponentChildren;
    class?: string;
  },
) {
  return (
    <div class={`card overflow-x-auto ${props.class ?? ""}`}>
      <table class="table">
        <thead>
          <tr>{props.head}</tr>
        </thead>
        <tbody>{props.children}</tbody>
      </table>
    </div>
  );
}

/** Compact 0–1 score bar (legacy API; band-coloured). value is 0–1. */
export function ScoreBar(
  props: { value: number | null | undefined; width?: string },
) {
  const c = scoreColor(props.value);
  const pct = props.value === null || props.value === undefined
    ? 0
    : Math.max(0, Math.min(1, props.value)) * 100;
  return (
    <div class="flex items-center gap-2">
      <div
        class={`h-2 ${
          props.width ?? "w-28"
        } overflow-hidden rounded-full bg-line`}
      >
        <div class={`h-full ${c.bg}`} style={{ width: `${pct}%` }} />
      </div>
      <span class={`text-sm font-semibold tabular-nums ${c.text}`}>
        {scorePct(props.value)}
      </span>
    </div>
  );
}
