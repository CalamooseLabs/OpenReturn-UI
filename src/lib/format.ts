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

/** Compact "$18.4M" / "$920K" money for big KPI figures and tight tables. */
export function moneyCompact(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return "—";
  const abs = Math.abs(value);
  const sign = value < 0 ? "-" : "";
  if (abs >= 1_000_000_000) {
    return `${sign}$${(abs / 1_000_000_000).toFixed(1)}B`;
  }
  if (abs >= 1_000_000) return `${sign}$${(abs / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${sign}$${Math.round(abs / 1_000)}K`;
  return money(value);
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
  // Navy design score bands (90/80/70 on a 0–100 scale → 0.9/0.8/0.7 on 0–1).
  if (value === null || value === undefined || isNaN(value)) {
    return { text: "text-faint", bg: "bg-line", badge: "badge-gray" };
  }
  if (value >= 0.9) {
    return {
      text: "text-band-strong",
      bg: "bg-band-strong",
      badge: "badge-green",
    };
  }
  if (value >= 0.8) {
    return {
      text: "text-band-solid",
      bg: "bg-band-solid",
      badge: "badge-blue",
    };
  }
  if (value >= 0.7) {
    return {
      text: "text-band-watch",
      bg: "bg-band-watch",
      badge: "badge-amber",
    };
  }
  return { text: "text-band-low", bg: "bg-band-low", badge: "badge-red" };
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
