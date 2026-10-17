import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Rehang",
    short_name: "Rehang",
    description: "Buy and sell second-hand clothes in Namibia. Meet in safe public spots and pay on handover.",
    start_url: "/",
    display: "standalone",
    background_color: "#fbf8f3",
    theme_color: "#e4572e",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
