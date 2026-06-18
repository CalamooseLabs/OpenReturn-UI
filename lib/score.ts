// Score-band + letter-grade logic, centralized per the design handoff so the
// thresholds/colors are trivial to retune (pending final NKC confirmation).
//
// Our API returns total_score in 0..1; the design surfaces 0..100 + a letter
// grade + a semantic band colour. `to100()` bridges the two.

export interface Band {
  name: "Strong" | "Solid" | "Watch" | "Low";
  /** Band colour for score numbers, rings, bars. */
  hex: string;
  /** Light chip background behind a band-coloured value. */
  pillBg: string;
  /** Text colour on the chip. */
  pillText: string;
}

/** Map a 0–100 score to its semantic band (90/80/70 thresholds). */
export function scoreBand(score: number): Band {
  if (score >= 90) {
    return {
      name: "Strong",
      hex: "#2f7d5b",
      pillBg: "#e3efe7",
      pillText: "#245f45",
    };
  }
  if (score >= 80) {
    return {
      name: "Solid",
      hex: "#3a5da8",
      pillBg: "#eef2fa",
      pillText: "#2f4a85",
    };
  }
  if (score >= 70) {
    return {
      name: "Watch",
      hex: "#c98a2b",
      pillBg: "#f6ecd8",
      pillText: "#9a6a1c",
    };
  }
  return {
    name: "Low",
    hex: "#bf6a3e",
    pillBg: "#bf6a3e",
    pillText: "#ffffff",
  };
}

/** Letter grade for a 0–100 score (working cutoffs, pending NKC confirmation). */
export function letterGrade(score: number): string {
  if (score >= 93) return "A";
  if (score >= 90) return "A−";
  if (score >= 87) return "B+";
  if (score >= 83) return "B";
  if (score >= 80) return "B−";
  if (score >= 77) return "C+";
  if (score >= 73) return "C";
  if (score >= 70) return "C−";
  if (score >= 67) return "D+";
  if (score >= 60) return "D";
  return "F";
}

/** Convert an API 0–1 total_score to a rounded 0–100 (null-safe). */
export function to100(total: number | null | undefined): number | null {
  if (total === null || total === undefined || isNaN(total)) return null;
  // Tolerate values already on a 0–100 scale.
  const v = total <= 1.0001 ? total * 100 : total;
  return Math.round(v);
}

/** "92nd", "1st", "23rd" … from a percentile/rank ordinal. */
export function ordinal(n: number): string {
  const v = Math.round(n);
  const s = ["th", "st", "nd", "rd"];
  const m = v % 100;
  return v + (s[(m - 20) % 10] ?? s[m] ?? s[0]);
}
