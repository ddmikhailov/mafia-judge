import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Судья миникапа РФМ",
    short_name: "Судья",
    description: "Проведение миникапа по спортивной Мафии",
    start_url: "/",
    display: "standalone",
    background_color: "#f4f4f0",
    theme_color: "#991b1b",
    lang: "ru",
    icons: [
      { src: "/icons/icon.svg", sizes: "any", type: "image/svg+xml" },
      { src: "/icons/icon-maskable.svg", sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
