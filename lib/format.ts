// Display formatting helpers.

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

export function money(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return USD.format(value);
}

export function number(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return new Intl.NumberFormat("en-US").format(value);
}

/** A 0–1 score as a percent string, e.g. 0.689 -> "68.9%". */
export function scorePct(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return (value * 100).toFixed(1) + "%";
}

export function percent(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  return value.toFixed(1) + "%";
}

/** Tailwind text/bg colour bucket for a 0–1 score. */
export function scoreColor(value: number | null | undefined): {
  text: string;
  bg: string;
  badge: string;
} {
  if (value === null || value === undefined || isNaN(value)) {
    return { text: "text-slate-400", bg: "bg-slate-300", badge: "badge-gray" };
  }
  if (value >= 0.75) {
    return {
      text: "text-emerald-700",
      bg: "bg-emerald-500",
      badge: "badge-green",
    };
  }
  if (value >= 0.5) {
    return { text: "text-amber-700", bg: "bg-amber-500", badge: "badge-amber" };
  }
  return { text: "text-red-700", bg: "bg-red-500", badge: "badge-red" };
}

/** Format an EIN as 12-3456789. */
export function formatEin(ein: string | null | undefined): string {
  if (!ein) return "—";
  const digits = ein.replace(/\D/g, "").padStart(9, "0");
  return digits.slice(0, 2) + "-" + digits.slice(2);
}

/** Normalize an EIN to 9 digits (no hyphen) for API calls. */
export function normalizeEin(ein: string): string {
  return ein.replace(/\D/g, "");
}

export function dateOnly(value: string | null | undefined): string {
  if (!value) return "—";
  return value.split(" ")[0].split("T")[0];
}

export function titleCase(code: string | null | undefined): string {
  if (!code) return "";
  return code
    .replace(/[_-]/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}
