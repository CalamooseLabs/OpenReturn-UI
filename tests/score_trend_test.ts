import { assertEquals } from "jsr:@std/assert@^1";
import {
  seriesFromHistory,
} from "../src/components/organisms/ScoreTrendChart.tsx";
import type { ScoreHistoryRow } from "../src/lib/types.ts";

Deno.test("seriesFromHistory sorts by year and converts 0–1 → 0–100", () => {
  const rows: ScoreHistoryRow[] = [
    { year: 2023, total_score: 0.712, imputed: false, score_id: 3 },
    { year: 2021, total_score: 0.6, imputed: false, score_id: 1 },
    {
      year: 2022,
      total_score: 0.66,
      imputed: true,
      score_id: 2,
      source_year: 2021,
    },
  ];
  const s = seriesFromHistory("Overall", "#3a5da8", rows);
  assertEquals(s.label, "Overall");
  assertEquals(s.color, "#3a5da8");
  // Sorted ascending by year, scores rounded to 0–100.
  assertEquals(s.points.map((p) => p.year), [2021, 2022, 2023]);
  assertEquals(s.points.map((p) => p.value), [60, 66, 71]);
  // Imputed flag + donor year propagate; non-imputed gets null sourceYear.
  assertEquals(s.points[1].imputed, true);
  assertEquals(s.points[1].sourceYear, 2021);
  assertEquals(s.points[0].sourceYear, null);
});

Deno.test("seriesFromHistory tolerates an empty history", () => {
  const s = seriesFromHistory("Empty", "#000", []);
  assertEquals(s.points, []);
});
