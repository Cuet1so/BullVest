import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig(({ mode }) => {
  const site = loadEnv(mode, '.', 'VITE_').VITE_PUBLIC_SITE_URL;
  const origin = new URL(site || 'https://bull-vest.vercel.app').origin;
  return {
    plugins: [react(), tailwindcss(), {
      name: 'bullvest-social-metadata',
      transformIndexHtml(html: string) {
        // Keep canonical, social images and structured data on one origin,
        // without injecting a duplicate og:url tag.
        return html.replaceAll('https://bull-vest.vercel.app', origin);
      },
    }],
  };
});
