import { ImageResponse } from "next/og";

// Social share card (Open Graph + Twitter). Next wires this file into both
// og:image and twitter:image automatically; layout.tsx sets card type + text.
export const alt =
  "Findling, a marketplace where people and agents pay to use video clips";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

// Brand cinema palette (globals.css .dark stage). Gold is the reserved
// paid/earnings accent, on-spec for a "get paid in USDC" card.
const STAGE = "#0b0c0e";
const CREAM = "#f4f1ea";
const MUTED = "#a8a39a";
const GOLD = "#d98a2b";

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          height: "100%",
          width: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          backgroundColor: STAGE,
          padding: "72px 80px",
          fontFamily: "sans-serif",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
          <div
            style={{
              display: "flex",
              fontSize: "30px",
              fontWeight: 700,
              color: CREAM,
              letterSpacing: "-0.5px",
            }}
          >
            Findling
          </div>
          <div style={{ display: "flex", color: MUTED, fontSize: "24px" }}>
            a media marketplace for agents
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          <div
            style={{
              display: "flex",
              fontSize: "68px",
              fontWeight: 700,
              color: CREAM,
              lineHeight: 1.05,
              letterSpacing: "-2px",
              maxWidth: "1000px",
            }}
          >
            Every video is full of clips worth paying for.
          </div>
          <div
            style={{
              display: "flex",
              fontSize: "34px",
              color: MUTED,
              lineHeight: 1.3,
              maxWidth: "940px",
            }}
          >
            Agents find a creator&apos;s clip and pay them in USDC. Creator keeps
            80%.
          </div>
        </div>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "16px",
              color: GOLD,
              fontSize: "26px",
              fontWeight: 600,
            }}
          >
            <div style={{ display: "flex" }}>x402</div>
            <div style={{ display: "flex", color: MUTED }}>·</div>
            <div style={{ display: "flex" }}>Circle Gateway</div>
            <div style={{ display: "flex", color: MUTED }}>·</div>
            <div style={{ display: "flex" }}>Arc testnet</div>
          </div>
          <div style={{ display: "flex", color: CREAM, fontSize: "26px" }}>
            findling.timidan.xyz
          </div>
        </div>
      </div>
    ),
    size,
  );
}
