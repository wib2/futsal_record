import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      devOptions: {
        // 로컬 개발 중에도 PWA를 강제로 켜려면 true로 바꾸세요.
        enabled: false,
      },
      includeAssets: [
        "favicon.ico",
        "apple-touch-icon.png"
      ],
      manifest: {
        name: "골딘 풋살",
        short_name: "골딘",
        description: "골딘 풋살 리그 기록/집계 웹앱",
        start_url: "/",
        scope: "/",
        display: "standalone",
        background_color: "#000000",
        theme_color: "#000000",
        lang: "ko-KR",
        icons: [
          {
            src: "/pwa-192.png",
            sizes: "192x192",
            type: "image/png"
          },
          {
            src: "/pwa-512.png",
            sizes: "512x512",
            type: "image/png"
          },
          {
            src: "/maskable-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable any"
          }
        ]
      },
      workbox: {
        // 기본 정적 파일 캐싱 패턴
        globPatterns: ["**/*.{js,css,html,ico,png,svg}"],
        navigateFallback: "index.html"
      }
    })
  ]
});
