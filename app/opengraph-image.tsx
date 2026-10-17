import { ImageResponse } from "next/og";

export const alt = "Rehang: good clothes, second rounds";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// A plain text card used when a page has no photo of its own. It does not load listing photos
// because the image renderer cannot read WebP files.
export default function Image() {
  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", padding: 80, background: "#fbf8f3", color: "#1f2a44" }}>
        <div style={{ fontSize: 40, color: "#e4572e", letterSpacing: 6 }}>REHANG</div>
        <div style={{ fontSize: 96, fontWeight: 700, marginTop: 24, lineHeight: 1.05 }}>Good clothes, second rounds.</div>
        <div style={{ fontSize: 36, marginTop: 32, color: "#77736d" }}>Second-hand fashion from Windhoek and across Namibia</div>
      </div>
    ),
    { ...size },
  );
}
