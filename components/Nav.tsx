import type { Principal } from "../lib/types.ts";
import { can, displayName, isAdmin, isLoggedIn } from "../lib/auth.ts";

// Primary nav per the design handoff (Dashboard · Organizations · Compare ·
// Reports · Models). Our routes keep their paths; labels follow the reference.
const LINKS = [
  { href: "/", label: "Dashboard", exact: true },
  { href: "/search", label: "Organizations" },
  { href: "/compare", label: "Compare" },
  { href: "/reports", label: "Reports" },
  { href: "/models", label: "Models" },
];

const DATA_LINKS = [
  { href: "/lists", label: "Lists" },
  { href: "/people", label: "People" },
  { href: "/tags", label: "Tags" },
  { href: "/financials", label: "Financials" },
];

function active(path: string, href: string, exact?: boolean): boolean {
  if (exact) return path === href;
  return path === href || path.startsWith(href + "/");
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function Nav(props: { principal: Principal | null; path: string }) {
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
          {LINKS.map((l) => {
            const on = active(props.path, l.href, l.exact);
            return (
              <a
                href={l.href}
                class={`nav-link ${
                  on ? "nav-link-active border-b-2 border-navy pb-0.5" : ""
                }`}
              >
                {l.label}
              </a>
            );
          })}
          {isLoggedIn(props.principal) && (
            <details class="group relative">
              <summary
                class={`nav-link inline-flex cursor-pointer items-center gap-1 ${
                  dataActive ? "nav-link-active" : ""
                }`}
              >
                Data
                <svg
                  class="h-3.5 w-3.5 opacity-60 transition-transform group-open:rotate-180"
                  viewBox="0 0 20 20"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M5 7.5 10 12.5 15 7.5"
                    stroke="currentColor"
                    stroke-width="1.75"
                    stroke-linecap="round"
                    stroke-linejoin="round"
                  />
                </svg>
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
                <span
                  class="grid h-[34px] w-[34px] place-items-center rounded-full bg-navy text-[12px] font-bold text-[#eef1f7]"
                  title={displayName(props.principal)}
                >
                  {initials(displayName(props.principal))}
                </span>
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
