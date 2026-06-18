// ── Templates ────────────────────────────────────────────────────────────────
// Page-level shells that arrange organisms around route content. Pages (routes/)
// fill these with server-fetched data.

import type { ComponentChildren } from "preact";
import type { Principal } from "../lib/types.ts";
import { TopNav } from "./organisms/TopNav.tsx";

/**
 * Standard page shell: navy top nav + centered content container.
 * `bleed` renders children full-width (the org-profile navy hero manages its
 * own width); `wide` widens the default container.
 */
export function Layout(
  props: {
    principal: Principal | null;
    path: string;
    children: ComponentChildren;
    wide?: boolean;
    bleed?: boolean;
  },
) {
  return (
    <div class="min-h-screen">
      <TopNav principal={props.principal} path={props.path} />
      {props.bleed ? props.children : (
        <main
          class={`mx-auto px-9 py-9 ${
            props.wide ? "max-w-[1340px]" : "max-w-[1180px]"
          }`}
        >
          {props.children}
        </main>
      )}
    </div>
  );
}
