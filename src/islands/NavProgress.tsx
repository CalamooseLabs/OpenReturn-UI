// ── Island: NavProgress ──────────────────────────────────────────────────────
// A top-of-viewport progress bar shown while a navigation is in flight. The app
// uses full-page navigation (no client-side router), so clicking a link or
// submitting a form blocks on the server render with no feedback; this bar fills
// that gap. Fresh 2.3 fires no navigation event, so we hook raw DOM events:
//
//   • document click / submit (capture) → a navigation is *starting*
//   • window pagehide / beforeunload     → the navigation *committed* (page about
//                                           to unload) → jump near-complete
//   • window pageshow (persisted)        → a bfcache back/forward restore → reset
//
// Anti-flash: we wait ~200ms before painting. A fast navigation unloads the page
// (destroying this island) before the timer fires, so quick loads never flash a
// bar. A new page mounts a fresh, hidden island — there's nothing to "finish".

import { useEffect, useRef } from "preact/hooks";

/** ~ms to wait before showing the bar, so fast loads don't flash it. */
const FLASH_DELAY = 200;

/** Hard ceiling: if no navigation actually commits within this window (e.g. a
 * download, or a click some other handler turned into a no-op), auto-clear so
 * the bar can never get stuck on screen. Longer than the API timeout (10s) so it
 * won't pre-empt a genuinely slow page render. */
const SAFETY_TIMEOUT = 20000;

export default function NavProgress() {
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const bar = barRef.current;
    if (!bar) return;

    let delayTimer: number | undefined;
    let trickle: number | undefined;
    let safety: number | undefined;
    let progress = 0;
    let active = false;

    const paint = (scale: number, opacity: number) => {
      bar.style.transform = `scaleX(${scale})`;
      bar.style.opacity = String(opacity);
    };

    const clearTimers = () => {
      if (delayTimer !== undefined) clearTimeout(delayTimer);
      if (trickle !== undefined) clearInterval(trickle);
      if (safety !== undefined) clearTimeout(safety);
      delayTimer = trickle = safety = undefined;
    };

    const reset = () => {
      clearTimers();
      active = false;
      progress = 0;
      bar.style.transition = "none";
      paint(0, 0);
    };

    const start = (e: Event) => {
      if (active || delayTimer !== undefined) return;
      delayTimer = setTimeout(() => {
        delayTimer = undefined;
        // Re-check AFTER the event has fully dispatched: a later (bubble-phase)
        // handler may have called preventDefault (turning the click/submit into a
        // no-op), in which case no navigation will happen and we must not show
        // the bar. The capture-phase guard at dispatch time can't see those.
        if (e.defaultPrevented) return;
        active = true;
        progress = 0.08;
        bar.style.transition = "transform 200ms ease, opacity 150ms ease";
        paint(progress, 1);
        // Asymptotically creep toward 90% while we wait for the server.
        trickle = setInterval(() => {
          progress += (0.9 - progress) * 0.12;
          paint(progress, 1);
        }, 300);
        safety = setTimeout(reset, SAFETY_TIMEOUT);
      }, FLASH_DELAY);
    };

    // Navigation committed: the page is unloading. Jump near-complete; the page
    // then unloads and this island is destroyed (the next page starts fresh).
    const commit = () => {
      clearTimers();
      if (active) {
        bar.style.transition = "transform 120ms ease";
        paint(0.95, 1);
      }
    };

    const onClick = (e: MouseEvent) => {
      if (
        e.defaultPrevented || e.button !== 0 ||
        e.metaKey || e.ctrlKey || e.shiftKey || e.altKey
      ) return;
      const target = e.target as Element | null;
      const a = target?.closest?.("a");
      if (!a) return;
      const href = a.getAttribute("href");
      if (!href || href.startsWith("#")) return;
      const anchorTarget = a.getAttribute("target");
      if (anchorTarget && anchorTarget !== "_self") return;
      if (a.hasAttribute("download")) return;
      let url: URL;
      try {
        url = new URL((a as HTMLAnchorElement).href, location.href);
      } catch {
        return;
      }
      if (url.origin !== location.origin) return;
      // A pure in-page hash change isn't a navigation.
      if (
        url.pathname === location.pathname && url.search === location.search &&
        url.hash
      ) return;
      start(e);
    };

    const onSubmit = (e: Event) => {
      if (e.defaultPrevented) return;
      const form = e.target as HTMLFormElement | null;
      if (!form || form.tagName !== "FORM") return;
      // A form (or its submitter) targeting a new tab / download doesn't navigate
      // the current page — mirror the anchor guards above so the bar isn't armed.
      const submitter = (e as SubmitEvent).submitter as HTMLElement | null;
      const formTarget = (submitter?.getAttribute("formtarget")) ||
        form.getAttribute("target");
      if (formTarget && formTarget !== "_self") return;
      const action = (submitter?.getAttribute("formaction")) ||
        form.getAttribute("action") || location.href;
      try {
        if (new URL(action, location.href).origin !== location.origin) return;
      } catch {
        return;
      }
      start(e);
    };

    const onPageShow = (e: PageTransitionEvent) => {
      // Restored from bfcache (Back/Forward): the prior in-flight bar is stale.
      if (e.persisted) reset();
    };

    // pagehide fires on both real unload and bfcache suspend, so it's all we
    // need to detect a committed navigation — and unlike beforeunload it doesn't
    // make the page ineligible for the bfcache.
    document.addEventListener("click", onClick, true);
    document.addEventListener("submit", onSubmit, true);
    globalThis.addEventListener("pagehide", commit);
    globalThis.addEventListener("pageshow", onPageShow);

    return () => {
      document.removeEventListener("click", onClick, true);
      document.removeEventListener("submit", onSubmit, true);
      globalThis.removeEventListener("pagehide", commit);
      globalThis.removeEventListener("pageshow", onPageShow);
      clearTimers();
    };
  }, []);

  return (
    <div
      ref={barRef}
      aria-hidden="true"
      style={{
        position: "fixed",
        top: "0",
        left: "0",
        width: "100%",
        height: "3px",
        background: "var(--color-accent, #3a5da8)",
        transformOrigin: "0 50%",
        transform: "scaleX(0)",
        opacity: "0",
        zIndex: "9999",
        pointerEvents: "none",
        boxShadow: "0 0 8px rgba(58, 93, 168, 0.6)",
      }}
    />
  );
}
