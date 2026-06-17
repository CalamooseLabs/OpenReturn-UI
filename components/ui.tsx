// Shared presentational components. These are plain server-rendered Preact
// components (no interactivity) — interactive bits live in islands/.

import type { ComponentChildren, JSX } from "preact";
import { scoreColor, scorePct } from "../lib/format.ts";

export function PageHeader(
  props: { title: string; subtitle?: string; actions?: ComponentChildren },
) {
  return (
    <div class="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 class="text-2xl font-bold text-slate-900">{props.title}</h1>
        {props.subtitle && (
          <p class="mt-1 text-sm text-slate-500">{props.subtitle}</p>
        )}
      </div>
      {props.actions && <div class="flex gap-2">{props.actions}</div>}
    </div>
  );
}

export function Card(
  props: { children: ComponentChildren; class?: string; pad?: boolean },
) {
  return (
    <div
      class={`card ${props.pad === false ? "" : "card-pad"} ${
        props.class ?? ""
      }`}
    >
      {props.children}
    </div>
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

type BadgeVariant = "gray" | "blue" | "green" | "amber" | "red";

export function Badge(
  props: { children: ComponentChildren; variant?: BadgeVariant },
) {
  return (
    <span class={`badge badge-${props.variant ?? "gray"}`}>
      {props.children}
    </span>
  );
}

export function Stat(
  props: { label: string; value: ComponentChildren; hint?: string },
) {
  return (
    <div class="card card-pad">
      <div class="text-xs font-medium uppercase tracking-wide text-slate-500">
        {props.label}
      </div>
      <div class="mt-1 text-2xl font-bold text-slate-900">{props.value}</div>
      {props.hint && <div class="mt-1 text-xs text-slate-400">{props.hint}
      </div>}
    </div>
  );
}

/** A 0–1 score rendered as a coloured progress bar with a percent label. */
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
        } overflow-hidden rounded-full bg-slate-200`}
      >
        <div class={`h-full ${c.bg}`} style={{ width: `${pct}%` }} />
      </div>
      <span class={`text-sm font-semibold tabular-nums ${c.text}`}>
        {scorePct(props.value)}
      </span>
    </div>
  );
}

export function EmptyState(
  props: { title: string; hint?: string; children?: ComponentChildren },
) {
  return (
    <div class="card card-pad text-center text-slate-500">
      <p class="font-medium text-slate-700">{props.title}</p>
      {props.hint && <p class="mt-1 text-sm">{props.hint}</p>}
      {props.children && <div class="mt-3">{props.children}</div>}
    </div>
  );
}

export function ErrorAlert(props: { message: string }) {
  return (
    <div class="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
      {props.message}
    </div>
  );
}

export function InfoAlert(props: { children: ComponentChildren }) {
  return (
    <div class="rounded-md border border-brand-200 bg-brand-50 px-4 py-3 text-sm text-brand-800">
      {props.children}
    </div>
  );
}

/** Anchor styled as a button (for GET navigations). */
export function LinkButton(
  props: {
    href: string;
    children: ComponentChildren;
    variant?: string;
    class?: string;
  },
) {
  return (
    <a
      class={`btn btn-${props.variant ?? "secondary"} ${props.class ?? ""}`}
      href={props.href}
    >
      {props.children}
    </a>
  );
}

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

export interface SelectOption {
  value: string;
  label: string;
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

/** Offset/limit pager. Renders prev/next links preserving the query string. */
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
    <div class="mt-4 flex items-center justify-between text-sm text-slate-500">
      <span>
        {from}–{to} of {total}
      </span>
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
