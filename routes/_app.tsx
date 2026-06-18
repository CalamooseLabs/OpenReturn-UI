import { define } from "../utils.ts";

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
        {
          /* Design system fonts: Bricolage Grotesque (display), Hanken Grotesk (UI),
            JetBrains Mono (figures). Loaded from Google Fonts per the handoff. */
        }
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link
          rel="preconnect"
          href="https://fonts.gstatic.com"
          crossorigin="anonymous"
        />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Bricolage+Grotesque:opsz,wght@12..96,400..800&family=Hanken+Grotesk:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;500;600&display=swap"
        />
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
