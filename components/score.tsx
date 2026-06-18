// Score-display components for the navy design: conic-gradient gauge rings and
// grade pills. Band colour + letter grade come from lib/score.ts.

import { type Band, letterGrade, scoreBand } from "../lib/score.ts";

/**
 * Conic-gradient gauge ring (per the design comps). `value` is 0–100.
 * `dark` renders the on-navy hero variant (blue arc, navy inner, light text).
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

/** A grade pill (e.g. "B+") tinted by band; pass an explicit band to override. */
export function GradePill(props: { value: number; band?: Band }) {
  const band = props.band ?? scoreBand(props.value);
  return (
    <span
      class="mono inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold"
      style={{ background: band.pillBg, color: band.pillText }}
    >
      {letterGrade(props.value)}
    </span>
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
