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
      </head>
      <body>
        <Component />
      </body>
    </html>
  );
});
