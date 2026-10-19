import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const site = loadEnv(mode, '.', 'VITE_').VITE_PUBLIC_SITE_URL;
  const origin = site ? new URL(site).origin : null;
  return {
    plugins: [react(), tailwindcss(), {
      name: 'bullvest-social-metadata',
      transformIndexHtml(html: string) {
        return origin ? html.replace('content="/og-bullvest.png"', `content="${origin}/og-bullvest.png"`)
          .replace('</head>', `<meta property="og:url" content="${origin}/" /></head>`) : html;
      },
    }],
  };
});
