
import React from "react";

export type FifaStats = {
  ovr: number;
  pos: string;
  pac: number;
  sho: number;
  pas: number;
  dri: number;
  def: number;
  phy: number;
  nationFlag?: string; // URL
  clubCrest?: string;  // URL
  photoUrl?: string;   // URL (face)
  name: string;
};

/**
 * Lightweight FIFA-style card in pure SVG (no external deps)
 * - self-contained styles
 * - exposes a ref for PNG export via <svg> -> canvas
 */
export const FifaCard = React.forwardRef<SVGSVGElement, { stats: FifaStats }>(
  ({ stats }, ref) => {
    const s = stats;
    return (
      <svg
        ref={ref}
        xmlns="http://www.w3.org/2000/svg"
        width="296"
        height="386"
        viewBox="0 0 296 386"
        style={{ display: "block", background: "#111", borderRadius: 12 }}
      >
        <defs>
          <linearGradient id="goldGrad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="#f0d77b" />
            <stop offset="100%" stopColor="#c7a848" />
          </linearGradient>
          <clipPath id="rounded">
            <rect x="0" y="0" width="296" height="386" rx="18" ry="18" />
          </clipPath>
        </defs>

        <g clipPath="url(#rounded)">
          <rect x="0" y="0" width="296" height="386" fill="url(#goldGrad)" />
          <path d="M0,160 C120,140 176,110 296,130 L296,0 L0,0 Z" fill="rgba(255,255,255,0.25)"/>
          <path d="M0,190 C120,170 176,150 296,165 L296,386 L0,386 Z" fill="rgba(0,0,0,0.04)"/>
        </g>

        {/* OVR + POS + NATION + CLUB */}
        <text x="26" y="60" fontSize="48" fontFamily="Arial Black, Arial, sans-serif" fill="#1c1c1c">{s.ovr}</text>
        <text x="26" y="90" fontSize="18" fontFamily="Arial Black, Arial, sans-serif" fill="#1c1c1c">{s.pos.toUpperCase()}</text>
        {/* nation/club */}
        {s.nationFlag ? <image href={s.nationFlag} x="24" y="100" width="28" height="18" /> : null}
        {s.clubCrest ? <image href={s.clubCrest} x="24" y="124" width="26" height="26" /> : null}

        {/* PHOTO */}
        {s.photoUrl ? <image href={s.photoUrl} x="80" y="40" width="180" height="180" preserveAspectRatio="xMidYMid slice" /> : null}

        {/* NAME */}
        <text x="148" y="248" textAnchor="middle" fontSize="28" fontFamily="Arial Black, Arial, sans-serif" fill="#1c1c1c">
          {s.name.toUpperCase()}
        </text>

        {/* STATS */}
        <g transform="translate(36, 270)">
          <g fontFamily="Arial Black, Arial, sans-serif" fontSize="18" fill="#1c1c1c">
            <text x="0" y="0">PAC</text><text x="48" y="0">{s.pac}</text>
            <text x="0" y="26">SHO</text><text x="48" y="26">{s.sho}</text>
            <text x="0" y="52">PAS</text><text x="48" y="52">{s.pas}</text>
          </g>
          <g transform="translate(148,0)" fontFamily="Arial Black, Arial, sans-serif" fontSize="18" fill="#1c1c1c">
            <text x="0" y="0">DRI</text><text x="48" y="0">{s.dri}</text>
            <text x="0" y="26">DEF</text><text x="48" y="26">{s.def}</text>
            <text x="0" y="52">PHY</text><text x="48" y="52">{s.phy}</text>
          </g>
        </g>
      </svg>
    );
  }
);
FifaCard.displayName = "FifaCard";

/** Export an SVG node to PNG and trigger download */
export async function downloadSvgAsPng(svg: SVGSVGElement, filename: string = "fifa-card.png") {
  const xml = new XMLSerializer().serializeToString(svg);
  const svg64 = window.btoa(unescape(encodeURIComponent(xml)));
  const image64 = "data:image/svg+xml;base64," + svg64;

  const img = new Image();
  img.crossOrigin = "anonymous";
  const canvas = document.createElement("canvas");
  canvas.width = svg.viewBox.baseVal.width || svg.clientWidth || 296;
  canvas.height = svg.viewBox.baseVal.height || svg.clientHeight || 386;
  const ctx = canvas.getContext("2d")!;

  await new Promise<void>((resolve, reject) => {
    img.onload = () => {
      ctx.drawImage(img, 0, 0);
      resolve();
    };
    img.onerror = reject;
    img.src = image64;
  });

  const a = document.createElement("a");
  a.href = canvas.toDataURL("image/png");
  a.download = filename;
  a.click();
}
