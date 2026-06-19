// ── Island: GrantsPanel ──────────────────────────────────────────────────────
// The org-profile "Grants & giving" section. Three client-switchable tabs:
//   • Grants made     — outbound 990 grant-graph edges (foundation → recipients)
//   • Grants received — inbound edges (who funds this org)
//   • Our giving      — hand-entered gifts the team gave to this org (a record
//                       distinct from the 990 graph), with an add/remove form.
// Each tab groups rows by year and caps the initial list with a "show all" toggle.
// Mutations (add/remove a gift) are plain forms that POST to the route handler.

import { useState } from "preact/hooks";
import SubmitButton from "./SubmitButton.tsx";
import { moneyCompact, number } from "../lib/format.ts";

interface GrantRow {
  year: number;
  amount: number;
  recipient?: string | null;
  grantor?: string | null;
  purpose?: string | null;
}
interface Flow {
  summary: {
    grant_count: number;
    total_amount: number;
    counterparties: number;
  };
  grants: GrantRow[];
}
interface Gift {
  gift_id: number;
  amount: number;
  fiscal_year?: number | null;
  gift_date?: string | null;
  purpose?: string | null;
  created_by_label?: string | null;
  created_at: string;
}
interface Giving {
  gifts: Gift[];
  summary: { gift_count: number; total_amount: number };
}

const INITIAL = 6;

function TabButton(
  props: { active: boolean; onClick: () => void; children: string },
) {
  return (
    <button
      type="button"
      onClick={props.onClick}
      class="mono rounded-full font-semibold transition-colors"
      style={{
        border: "1px solid",
        borderColor: props.active ? "#2f4a85" : "var(--color-line)",
        background: props.active ? "#2f4a85" : "transparent",
        color: props.active ? "#fff" : "#6b7488",
        padding: "6px 15px",
        fontSize: "12.5px",
      }}
    >
      {props.children}
    </button>
  );
}

function Figure(props: { label: string; value: string }) {
  return (
    <div>
      <div
        class="mono font-semibold text-navy"
        style={{ fontSize: "17px", lineHeight: "1.1" }}
      >
        {props.value}
      </div>
      <div class="text-faint" style={{ fontSize: "11px", marginTop: "3px" }}>
        {props.label}
      </div>
    </div>
  );
}

/** Group grant rows by year (desc), each with a year total. */
function groupByYear<T extends { year?: number | null; amount: number }>(
  rows: T[],
) {
  const map = new Map<number, T[]>();
  for (const r of rows) {
    const y = (r.year ?? 0) as number;
    const list = map.get(y) ?? [];
    list.push(r);
    map.set(y, list);
  }
  return [...map.entries()]
    .sort((a, b) => b[0] - a[0])
    .map(([year, rs]) => ({
      year,
      rows: rs.sort((a, b) => (b.amount ?? 0) - (a.amount ?? 0)),
      total: rs.reduce((s, r) => s + (r.amount ?? 0), 0),
    }));
}

function YearHeader(props: { year: number; total: number; count: number }) {
  return (
    <div
      class="flex items-baseline justify-between"
      style={{
        margin: "14px 0 6px",
        borderBottom: "1px solid var(--color-line-soft)",
        paddingBottom: "5px",
      }}
    >
      <span class="font-semibold text-navy" style={{ fontSize: "13px" }}>
        {props.year || "Year unknown"}
      </span>
      <span class="mono text-faint" style={{ fontSize: "11.5px" }}>
        {moneyCompact(props.total)} · {number(props.count)}
      </span>
    </div>
  );
}

function Row(props: { name: string; amount: number; purpose?: string | null }) {
  return (
    <div
      class="flex items-baseline justify-between gap-3"
      style={{ padding: "5px 0" }}
    >
      <span
        class="min-w-0 truncate text-navy"
        style={{ fontSize: "13px" }}
        title={props.name}
      >
        {props.name}
        {props.purpose && (
          <span class="text-faint" style={{ fontSize: "12px" }}>
            {` — ${props.purpose}`}
          </span>
        )}
      </span>
      <span class="mono shrink-0 text-muted" style={{ fontSize: "12px" }}>
        {moneyCompact(props.amount)}
      </span>
    </div>
  );
}

/** A grants tab (made or received): summary figures + year-grouped rows. */
function GrantFlowView(
  props: { flow: Flow; party: string; nameOf: (g: GrantRow) => string },
) {
  const [showAll, setShowAll] = useState(false);
  const groups = groupByYear(props.flow.grants);
  let shown = 0;
  const total = props.flow.grants.length;
  return (
    <div>
      <div
        class="grid"
        style={{ gridTemplateColumns: "1fr 1fr 1fr", gap: "12px" }}
      >
        <Figure
          label="Total"
          value={moneyCompact(props.flow.summary?.total_amount ?? 0)}
        />
        <Figure
          label="Grants"
          value={number(props.flow.summary?.grant_count ?? 0)}
        />
        <Figure
          label={props.party}
          value={number(props.flow.summary?.counterparties ?? 0)}
        />
      </div>
      {groups.map((g) => {
        if (!showAll && shown >= INITIAL) return null;
        const rows = showAll
          ? g.rows
          : g.rows.slice(0, Math.max(0, INITIAL - shown));
        shown += rows.length;
        if (rows.length === 0) return null;
        return (
          <div key={g.year}>
            <YearHeader year={g.year} total={g.total} count={g.rows.length} />
            {rows.map((grant, i) => (
              <Row
                key={i}
                name={props.nameOf(grant)}
                amount={grant.amount}
                purpose={grant.purpose}
              />
            ))}
          </div>
        );
      })}
      {!showAll && total > INITIAL && (
        <button
          type="button"
          class="link"
          style={{ fontSize: "12.5px", marginTop: "12px" }}
          onClick={() => setShowAll(true)}
        >
          Show all {number(total)} grants
        </button>
      )}
    </div>
  );
}

/** The "Our giving" tab: add form (if permitted), year-grouped gifts, delete. */
function GivingView(props: { ein: string; giving: Giving; canGive: boolean }) {
  const [showAll, setShowAll] = useState(false);
  const gifts = props.giving.gifts.map((g) => ({
    ...g,
    year: g.fiscal_year ?? 0,
  }));
  const groups = groupByYear(gifts);
  let shown = 0;
  const total = gifts.length;
  return (
    <div>
      {props.canGive && (
        <form
          method="POST"
          class="flex flex-wrap items-end gap-2"
          style={{
            marginBottom: "16px",
            padding: "14px",
            borderRadius: "12px",
            background: "var(--color-page)",
          }}
        >
          <input type="hidden" name="action" value="gift_add" />
          <div class="field" style={{ margin: 0 }}>
            <label class="label" for="gift_amount">Amount ($)</label>
            <input
              class="input"
              id="gift_amount"
              name="amount"
              type="number"
              step="0.01"
              min="0"
              required
              style={{ width: "120px" }}
            />
          </div>
          <div class="field" style={{ margin: 0 }}>
            <label class="label" for="gift_year">Year</label>
            <input
              class="input"
              id="gift_year"
              name="fiscal_year"
              type="number"
              style={{ width: "90px" }}
            />
          </div>
          <div class="field" style={{ margin: 0, flex: 1, minWidth: "140px" }}>
            <label class="label" for="gift_purpose">Purpose</label>
            <input
              class="input"
              id="gift_purpose"
              name="purpose"
              type="text"
              placeholder="optional"
            />
          </div>
          <SubmitButton variant="primary" size="sm" pendingLabel="Adding…">
            Add gift
          </SubmitButton>
        </form>
      )}

      {total === 0
        ? (
          <p class="text-faint" style={{ fontSize: "12.5px", margin: 0 }}>
            No giving recorded for this organization yet.
          </p>
        )
        : (
          <>
            <div
              class="grid"
              style={{ gridTemplateColumns: "1fr 1fr", gap: "12px" }}
            >
              <Figure
                label="Total given"
                value={moneyCompact(props.giving.summary?.total_amount ?? 0)}
              />
              <Figure
                label="Gifts"
                value={number(props.giving.summary?.gift_count ?? 0)}
              />
            </div>
            {groups.map((g) => {
              if (!showAll && shown >= INITIAL) return null;
              const rows = showAll
                ? g.rows
                : g.rows.slice(0, Math.max(0, INITIAL - shown));
              shown += rows.length;
              if (rows.length === 0) return null;
              return (
                <div key={g.year}>
                  <YearHeader
                    year={g.year}
                    total={g.total}
                    count={g.rows.length}
                  />
                  {rows.map((gift) => (
                    <div
                      key={gift.gift_id}
                      class="flex items-baseline justify-between gap-3"
                      style={{ padding: "5px 0" }}
                    >
                      <span
                        class="min-w-0 truncate text-navy"
                        style={{ fontSize: "13px" }}
                      >
                        {gift.purpose || "Gift"}
                        {gift.created_by_label && (
                          <span class="text-faint" style={{ fontSize: "12px" }}>
                            {` — ${gift.created_by_label}`}
                          </span>
                        )}
                      </span>
                      <span class="flex shrink-0 items-baseline gap-2">
                        <span
                          class="mono text-muted"
                          style={{ fontSize: "12px" }}
                        >
                          {moneyCompact(gift.amount)}
                        </span>
                        {props.canGive && (
                          <form method="POST" style={{ display: "inline" }}>
                            <input
                              type="hidden"
                              name="action"
                              value="gift_delete"
                            />
                            <input
                              type="hidden"
                              name="gift_id"
                              value={String(gift.gift_id)}
                            />
                            <button
                              type="submit"
                              class="text-faint hover:text-band-low"
                              title="Remove gift"
                              style={{ fontSize: "13px", lineHeight: 1 }}
                            >
                              ✕
                            </button>
                          </form>
                        )}
                      </span>
                    </div>
                  ))}
                </div>
              );
            })}
            {!showAll && total > INITIAL && (
              <button
                type="button"
                class="link"
                style={{ fontSize: "12.5px", marginTop: "12px" }}
                onClick={() => setShowAll(true)}
              >
                Show all {number(total)} gifts
              </button>
            )}
          </>
        )}
    </div>
  );
}

export default function GrantsPanel(props: {
  ein: string;
  made?: Flow;
  received?: Flow;
  giving: Giving;
  canGive: boolean;
}) {
  const hasMade = (props.made?.summary?.grant_count ?? 0) > 0;
  const hasReceived = (props.received?.summary?.grant_count ?? 0) > 0;
  const tabs: { key: "made" | "received" | "giving"; label: string }[] = [];
  if (hasMade) tabs.push({ key: "made", label: "Grants made" });
  if (hasReceived) tabs.push({ key: "received", label: "Grants received" });
  tabs.push({ key: "giving", label: "Our giving" });

  const [tab, setTab] = useState<"made" | "received" | "giving">(tabs[0].key);

  return (
    <div style={{ padding: "0 44px 40px" }}>
      <div
        class="flex flex-wrap items-center justify-between gap-3"
        style={{ marginBottom: "16px" }}
      >
        <h2
          class="font-display font-bold text-navy"
          style={{ fontSize: "18px", letterSpacing: "-0.01em", margin: 0 }}
        >
          Grants &amp; giving
        </h2>
        <div class="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <TabButton
              key={t.key}
              active={tab === t.key}
              onClick={() => setTab(t.key)}
            >
              {t.label}
            </TabButton>
          ))}
        </div>
      </div>

      <div class="card" style={{ borderRadius: "14px", padding: "20px 22px" }}>
        {tab === "made" && props.made && (
          <GrantFlowView
            flow={props.made}
            party="Recipients"
            nameOf={(g) => g.recipient || "Unnamed recipient"}
          />
        )}
        {tab === "received" && props.received && (
          <GrantFlowView
            flow={props.received}
            party="Funders"
            nameOf={(g) => g.grantor || "Unnamed funder"}
          />
        )}
        {tab === "giving" && (
          <GivingView
            ein={props.ein}
            giving={props.giving}
            canGive={props.canGive}
          />
        )}
      </div>
    </div>
  );
}
