// ── Organism: TopNav ─────────────────────────────────────────────────────────
// The sticky navy top navigation bar (handoff "Global Chrome"). Composes the
// Avatar + Icon atoms; permission-aware (Data menu, Admin, sign-out).

import type { Principal } from "../../lib/types.ts";
import { can, displayName, isAdmin, isLoggedIn } from "../../lib/auth.ts";
import { Avatar, Icon } from "../atoms.tsx";

interface NavLink {
  href: string;
  label: string;
  exact?: boolean;
  /** For an org-directory link, the `?type=` value it filters by. */
  orgType?: string;
}

// Top-level links after the Organizations menu. Dashboard is rendered first,
// then the Organizations hover-menu, then these.
const LINKS: NavLink[] = [
  { href: "/compare", label: "Compare" },
  { href: "/reports", label: "Reports" },
  { href: "/models", label: "Models" },
];

// Organizations: a single link to the full directory, with a hover submenu that
// splits Non-Profits vs Foundations (each a ?type= filter on /search).
const ORG_SUBLINKS: NavLink[] = [
  {
    href: "/search?type=nonprofit",
    label: "Non-Profits",
    orgType: "nonprofit",
  },
  {
    href: "/search?type=foundation",
    label: "Foundations",
    orgType: "foundation",
  },
];

const DATA_LINKS = [
  { href: "/lists", label: "Lists" },
  { href: "/people", label: "People" },
  { href: "/tags", label: "Tags" },
  { href: "/financials", label: "Financials" },
  { href: "/conflicts", label: "Conflicts" },
];

function active(path: string, href: string, exact?: boolean): boolean {
  if (exact) return path === href;
  return path === href || path.startsWith(href + "/");
}

/** Active state for a top link, accounting for the org-type query split. */
function linkActive(path: string, search: string, l: NavLink): boolean {
  if (l.orgType !== undefined) {
    const type = new URLSearchParams(search).get("type") ?? "";
    return path === "/search" && type === l.orgType;
  }
  return active(path, l.href, l.exact);
}

/** Organizations top-level link (→ full directory) + hover submenu (Non-Profits /
 * Foundations). The `pt-3` on the panel wrapper bridges the gap so the hover
 * survives the cursor moving from the link down into the menu. */
function OrgMenu(props: { path: string; search: string }) {
  const onSearch = props.path === "/search" ||
    props.path.startsWith("/search/");
  return (
    <div class="group relative">
      <a
        href="/search"
        class={`nav-link inline-flex items-center gap-1 ${
          onSearch ? "nav-link-active border-b-2 border-navy pb-0.5" : ""
        }`}
      >
        Organizations
        <Icon
          name="chevron-down"
          size={14}
          class="opacity-60 transition-transform group-hover:rotate-180"
        />
      </a>
      <div class="invisible absolute left-0 top-full z-30 pt-3 opacity-0 transition-opacity duration-150 group-hover:visible group-hover:opacity-100">
        <div class="w-44 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
          {ORG_SUBLINKS.map((l) => (
            <a
              href={l.href}
              class={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-fill ${
                linkActive(props.path, props.search, l)
                  ? "font-semibold text-navy"
                  : "text-muted hover:text-navy"
              }`}
            >
              {l.label}
            </a>
          ))}
        </div>
      </div>
    </div>
  );
}

export function TopNav(
  props: { principal: Principal | null; path: string; search?: string },
) {
  const search = props.search ?? "";
  const dataLinks = [...DATA_LINKS];
  if (can(props.principal, "upload:write")) {
    dataLinks.push({ href: "/upload", label: "Upload" });
  }
  const dataActive = dataLinks.some((l) => active(props.path, l.href));

  return (
    <header class="sticky top-0 z-20 h-[58px] border-b border-line bg-white">
      <nav class="mx-auto flex h-full max-w-[1340px] items-center gap-7 px-9">
        <a
          href="/"
          class="font-display text-[18px] font-bold tracking-[-0.01em] text-navy"
        >
          OpenReturn
        </a>
        <div class="flex items-center gap-[22px]">
          <a
            href="/"
            class={`nav-link ${
              active(props.path, "/", true)
                ? "nav-link-active border-b-2 border-navy pb-0.5"
                : ""
            }`}
          >
            Dashboard
          </a>
          <OrgMenu path={props.path} search={search} />
          {LINKS.map((l) => (
            <a
              href={l.href}
              class={`nav-link ${
                linkActive(props.path, search, l)
                  ? "nav-link-active border-b-2 border-navy pb-0.5"
                  : ""
              }`}
            >
              {l.label}
            </a>
          ))}
          {isLoggedIn(props.principal) && (
            <details class="group relative">
              <summary
                class={`nav-link inline-flex cursor-pointer items-center gap-1 ${
                  dataActive ? "nav-link-active" : ""
                }`}
              >
                Data
                <Icon
                  name="chevron-down"
                  size={14}
                  class="opacity-60 transition-transform group-open:rotate-180"
                />
              </summary>
              <div class="absolute left-0 z-30 mt-3 w-44 overflow-hidden rounded-xl border border-line bg-white p-1.5 shadow-[var(--shadow-lift)]">
                {dataLinks.map((l) => (
                  <a
                    href={l.href}
                    class={`block rounded-lg px-3 py-2 text-sm transition-colors hover:bg-fill ${
                      active(props.path, l.href)
                        ? "font-semibold text-navy"
                        : "text-muted hover:text-navy"
                    }`}
                  >
                    {l.label}
                  </a>
                ))}
              </div>
            </details>
          )}
          {isAdmin(props.principal) && (
            <a
              href="/admin"
              class={`nav-link ${
                active(props.path, "/admin")
                  ? "nav-link-active border-b-2 border-navy pb-0.5"
                  : ""
              }`}
            >
              Admin
            </a>
          )}
        </div>

        <div class="ml-auto flex items-center gap-3">
          {isLoggedIn(props.principal)
            ? (
              <>
                <Avatar
                  label={displayName(props.principal)}
                  size={34}
                  shape="circle"
                />
                <form method="POST" action="/logout">
                  <button type="submit" class="btn btn-sm btn-secondary">
                    Sign out
                  </button>
                </form>
              </>
            )
            : <a href="/login" class="btn btn-sm btn-primary">Sign in</a>}
        </div>
      </nav>
    </header>
  );
}
