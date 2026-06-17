import { assertEquals } from "jsr:@std/assert@^1";
import {
  dateOnly,
  formatEin,
  money,
  normalizeEin,
  percent,
  scoreColor,
  scorePct,
  titleCase,
} from "../lib/format.ts";

Deno.test("money formats USD and handles nullish", () => {
  assertEquals(money(1234), "$1,234");
  assertEquals(money(0), "$0");
  assertEquals(money(null), "—");
  assertEquals(money(undefined), "—");
  assertEquals(money(NaN), "—");
});

Deno.test("scorePct renders a 0-1 score as a percent", () => {
  assertEquals(scorePct(0.689), "68.9%");
  assertEquals(scorePct(1), "100.0%");
  assertEquals(scorePct(null), "—");
});

Deno.test("percent formats a number", () => {
  assertEquals(percent(68.9), "68.9%");
  assertEquals(percent(null), "—");
});

Deno.test("formatEin renders 12-3456789 and pads", () => {
  assertEquals(formatEin("123456789"), "12-3456789");
  assertEquals(formatEin("00-0000001"), "00-0000001");
  assertEquals(formatEin(null), "—");
});

Deno.test("normalizeEin strips non-digits", () => {
  assertEquals(normalizeEin("12-3456789"), "123456789");
  assertEquals(normalizeEin(" 12 345 6789 "), "123456789");
});

Deno.test("dateOnly trims time", () => {
  assertEquals(dateOnly("2026-06-17 20:30:05"), "2026-06-17");
  assertEquals(dateOnly("2026-06-17T20:30:05Z"), "2026-06-17");
  assertEquals(dateOnly(null), "—");
});

Deno.test("titleCase humanizes codes", () => {
  assertEquals(titleCase("total_exp"), "Total Exp");
  assertEquals(titleCase("super_composite"), "Super Composite");
  assertEquals(titleCase(""), "");
});

Deno.test("scoreColor buckets by threshold", () => {
  assertEquals(scoreColor(0.8).badge, "badge-green");
  assertEquals(scoreColor(0.6).badge, "badge-amber");
  assertEquals(scoreColor(0.3).badge, "badge-red");
  assertEquals(scoreColor(null).badge, "badge-gray");
});
