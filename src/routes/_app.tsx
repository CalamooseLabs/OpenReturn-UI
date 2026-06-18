import { define } from "../utils.ts";
import NavProgress from "../islands/NavProgress.tsx";

const FONTS_HREF =
  "https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap";

export default define.page(function App({ Component }) {
  return (
    <html lang="en">
      <head>
        <meta charset="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1.0" />
        <title>OpenReturn</title>
        <meta
          name="description"
          content="Explore IRS Form 990 organizations, financial-health scores, and rankings."
        />
        {/* Reuse the brand SVG as the icon (it already ships in static/). */}
        <link rel="icon" type="image/svg+xml" href="/logo.svg" />
        {
          /* Design system fonts: Bricolage Grotesque (display), Hanken Grotesk (UI),
            JetBrains Mono (figures). preconnect warms the connection; display=swap
            keeps text visible (no invisible-text flash) while they load. */
        }
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link rel="stylesheet" href={FONTS_HREF} />
      </head>
      <body>
        <NavProgress />
        <Component />
      </body>
    </html>
  );
});
