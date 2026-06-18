// ── Atoms ──────────────────────────────────────────────────────────────────
// Smallest building blocks of the OpenReturn design system (Brad-Frost-style
// atomic layering: atoms → molecules → organisms → templates). Atoms hold no
// app data and compose into molecules/organisms. Navy "Brand Navy" system.

import type { ComponentChildren, JSX } from "preact";
import { type Band, letterGrade, scoreBand } from "../lib/score.ts";

// ---- Buttons -----------------------------------------------------------
type BtnVariant = "primary" | "secondary" | "ghost" | "danger";

export function Button(
  props:
    & { variant?: BtnVariant; size?: "sm" }
    & JSX.ButtonHTMLAttributes<HTMLButtonElement>,
) {
  const { variant = "secondary", size, class: cls, ...rest } = props;
  return (
    <button
      {...rest}
      class={`btn btn-${variant} ${size === "sm" ? "btn-sm" : ""} ${cls ?? ""}`}
    />
  );
}

export function LinkButton(
  props: {
    href: string;
    children: ComponentChildren;
    variant?: BtnVariant;
    size?: "sm";
    class?: string;
    target?: string;
  },
) {
  return (
    <a
      href={props.href}
      target={props.target}
      class={`btn btn-${props.variant ?? "secondary"} ${
        props.size === "sm" ? "btn-sm" : ""
      } ${props.class ?? ""}`}
    >
      {props.children}
    </a>
  );
}

// ---- Badges / pills ----------------------------------------------------
export type BadgeVariant = "gray" | "blue" | "green" | "amber" | "red";

export function Badge(
  props: {
    children: ComponentChildren;
    variant?: BadgeVariant;
    class?: string;
  },
) {
  return (
    <span class={`badge badge-${props.variant ?? "gray"} ${props.class ?? ""}`}>
      {props.children}
    </span>
  );
}

/** A pill with explicit colours (e.g. a score-band tint). */
export function Pill(
  props: {
    children: ComponentChildren;
    bg: string;
    color: string;
    class?: string;
  },
) {
  return (
    <span
      class={`mono inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${
        props.class ?? ""
      }`}
      style={{ background: props.bg, color: props.color }}
    >
      {props.children}
    </span>
  );
}

/** Eyebrow / section label — mono, uppercase, tracked (the .section-title). */
export function Eyebrow(
  props: { children: ComponentChildren; class?: string },
) {
  return (
    <div class={`section-title ${props.class ?? ""}`}>{props.children}</div>
  );
}

export function Divider(props: { class?: string }) {
  return <div class={`border-t border-line-soft ${props.class ?? ""}`} />;
}

// ---- Avatar ------------------------------------------------------------
/** Initials avatar (navy by default). `shape` square=org, circle=person/user. */
export function Avatar(
  props: {
    label: string;
    size?: number;
    shape?: "circle" | "square";
    class?: string;
  },
) {
  const size = props.size ?? 40;
  const initials = props.label.trim().split(/\s+/).slice(0, 2).map((w) => w[0])
    .join("").toUpperCase() || props.label.slice(0, 2).toUpperCase();
  return (
    <span
      class={`grid shrink-0 place-items-center bg-navy font-bold text-[#eef1f7] ${
        props.shape === "circle" ? "rounded-full" : "rounded-xl"
      } ${props.class ?? ""}`}
      style={{
        width: `${size}px`,
        height: `${size}px`,
        fontSize: `${Math.round(size * 0.34)}px`,
      }}
    >
      {initials}
    </span>
  );
}

// ---- Score atoms -------------------------------------------------------
/**
 * Conic-gradient gauge ring. `value` is 0–100. `dark` = on-navy hero variant.
 */
export function GaugeRing(props: {
  value: number | null | undefined;
  size?: number;
  label?: string;
  sub?: string;
  dark?: boolean;
}) {
  const size = props.size ?? 78;
  const inner = Math.round(size * 0.77);
  const has = props.value !== null && props.value !== undefined &&
    !isNaN(props.value);
  const v = has ? Math.max(0, Math.min(100, props.value as number)) : 0;
  const band = scoreBand(v);
  const arc = props.dark ? "#7193d8" : band.hex;
  const track = props.dark ? "rgba(238,241,247,.16)" : "#dde2ec";
  const innerBg = props.dark ? "#192a54" : "#eceff5";
  const numColor = props.dark ? "#eef1f7" : "#192a54";
  const numSize = Math.round(size * 0.3);
  return (
    <div
      class="flex shrink-0 items-center justify-center rounded-full"
      style={{
        width: `${size}px`,
        height: `${size}px`,
        background: `conic-gradient(${arc} 0% ${v}%, ${track} ${v}% 100%)`,
      }}
    >
      <div
        class="flex flex-col items-center justify-center rounded-full"
        style={{
          width: `${inner}px`,
          height: `${inner}px`,
          background: innerBg,
        }}
      >
        {props.label && (
          <span
            class="mono uppercase"
            style={{
              fontSize: "10px",
              letterSpacing: ".18em",
              color: "#9fb6e6",
            }}
          >
            {props.label}
          </span>
        )}
        <span
          class="font-display font-bold leading-none"
          style={{
            fontSize: `${numSize}px`,
            color: numColor,
            letterSpacing: "-0.03em",
          }}
        >
          {has ? Math.round(v) : "—"}
        </span>
        {props.sub && (
          <span
            class="mono font-semibold"
            style={{ fontSize: "12px", color: "#9fb6e6" }}
          >
            {props.sub}
          </span>
        )}
      </div>
    </div>
  );
}

/** Grade pill (e.g. "B+") tinted by band. */
export function GradePill(props: { value: number; band?: Band }) {
  const band = props.band ?? scoreBand(props.value);
  return (
    <Pill bg={band.pillBg} color={band.pillText}>
      {letterGrade(props.value)}
    </Pill>
  );
}

/** Band-coloured horizontal progress bar (value 0–100). */
export function BandBar(
  props: { value: number; width?: string; height?: number },
) {
  const band = scoreBand(props.value);
  const pct = Math.max(0, Math.min(100, props.value));
  return (
    <div
      class={`overflow-hidden rounded-full bg-line ${props.width ?? "w-full"}`}
      style={{ height: `${props.height ?? 6}px` }}
    >
      <div
        class="h-full rounded-full"
        style={{ width: `${pct}%`, background: band.hex }}
      />
    </div>
  );
}

/** Big band-coloured score number with an optional "/100" + grade pill. */
export function ScoreNumber(
  props: {
    value: number | null | undefined;
    size?: number;
    showMax?: boolean;
    grade?: boolean;
  },
) {
  const has = props.value !== null && props.value !== undefined &&
    !isNaN(props.value);
  const v = has ? Math.round(props.value as number) : null;
  const band = has ? scoreBand(v as number) : null;
  return (
    <span class="inline-flex items-baseline gap-1.5">
      <span
        class="font-display font-bold leading-none"
        style={{
          fontSize: `${props.size ?? 40}px`,
          letterSpacing: "-0.02em",
          color: band ? band.hex : "#8893ab",
        }}
      >
        {v ?? "—"}
      </span>
      {props.showMax && <span class="text-sm text-faint">/100</span>}
      {props.grade && has && (
        <GradePill value={v as number} band={band ?? undefined} />
      )}
    </span>
  );
}

// ---- Form atoms --------------------------------------------------------
export function Label(props: { for?: string; children: ComponentChildren }) {
  return <label class="label" for={props.for}>{props.children}</label>;
}

export function TextInput(props: JSX.InputHTMLAttributes<HTMLInputElement>) {
  const { class: cls, ...rest } = props;
  return <input {...rest} class={`input ${cls ?? ""}`} />;
}

export function TextArea(
  props: JSX.TextareaHTMLAttributes<HTMLTextAreaElement>,
) {
  const { class: cls, ...rest } = props;
  return <textarea {...rest} class={`input ${cls ?? ""}`} />;
}

export interface SelectOption {
  value: string;
  label: string;
}

// ---- Icon --------------------------------------------------------------
const ICONS: Record<string, string> = {
  "chevron-down": "M5 7.5 10 12.5 15 7.5",
  "arrow-right": "M4 10h12M11 5l5 5-5 5",
  search: "M9 3a6 6 0 1 0 3.5 10.9l4.3 4.3 1.4-1.4-4.3-4.3A6 6 0 0 0 9 3Z",
  check: "M4 10.5 8 14.5 16 5.5",
  shield: "M10 2 4 4.5V10c0 4 2.6 6.4 6 8 3.4-1.6 6-4 6-8V4.5L10 2Z",
};

export function Icon(
  props: { name: keyof typeof ICONS | string; size?: number; class?: string },
) {
  const d = ICONS[props.name] ?? "";
  const s = props.size ?? 16;
  return (
    <svg
      class={props.class}
      width={s}
      height={s}
      viewBox="0 0 20 20"
      fill="none"
      aria-hidden="true"
    >
      <path
        d={d}
        stroke="currentColor"
        stroke-width="1.75"
        stroke-linecap="round"
        stroke-linejoin="round"
      />
    </svg>
  );
}
