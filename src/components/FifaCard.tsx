import React, { useMemo } from "react";

export type FifaStats = {
  PAC: number; SHO: number; PAS: number; DRI: number; DEF: number; PHY: number;
};

export type FifaCardProps = {
  name: string;
  pos: string;            // e.g., "LM", "ST", "GK"
  rating: number;         // 0-99
  nationFlagUrl?: string; // 24x16-ish
  clubLogoUrl?: string;   // small square
  faceUrl?: string;       // player head image
  size?: number;          // width in px (height auto)
  stats: FifaStats;
};

export function FifaCard({
  name,
  pos,
  rating,
  nationFlagUrl,
  clubLogoUrl,
  faceUrl,
  size = 260,
  stats,
}: FifaCardProps) {
  const clamp = (n: number) => Math.max(0, Math.min(99, Math.round(n || 0)));
  const R = clamp(rating);
  const S = {
    PAC: clamp(stats.PAC), SHO: clamp(stats.SHO), PAS: clamp(stats.PAS),
    DRI: clamp(stats.DRI), DEF: clamp(stats.DEF), PHY: clamp(stats.PHY),
  };

  const displayName = (name || "").trim();
  const nameLen = displayName.length;
  const nameFont = nameLen <= 5 ? Math.round(size * 0.11)
                  : nameLen <= 8 ? Math.round(size * 0.10)
                  : Math.round(size * 0.085);

  const h = Math.round(size * (386 / 296));
  const faceSize = Math.round(size * 0.74);

  return (
    <div className="fifa-card" style={{ width: size, height: h }}>
      <div className="fc-bg">
        <svg viewBox="0 0 296 386" width={size} height={h} className="fc-svg">
          <defs>
            <linearGradient id="gold" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fff4c3" />
              <stop offset="60%" stopColor="#e6c66e" />
              <stop offset="100%" stopColor="#cfb05b" />
            </linearGradient>
            <linearGradient id="edge" x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="#fffffb" />
              <stop offset="100%" stopColor="#e9dca0" />
            </linearGradient>
            <clipPath id="shield">
              <path d="M16,0 H280 q16,0 16,16 V302 q0,30 -34,46 l-110,38 -110,-38 q-34,-16 -34,-46 V16 Q8,0 24,0 Z" />
            </clipPath>
          </defs>
          <path d="M16,0 H280 q16,0 16,16 V302 q0,30 -34,46 l-110,38 -110,-38 q-34,-16 -34,-46 V16 Q8,0 24,0 Z" fill="url(#edge)" />
          <g clipPath="url(#shield)">
            <rect x="0" y="0" width="296" height="386" fill="url(#gold)" />
            <circle cx="148" cy="200" r="220" fill="rgba(255,255,255,0.08)" />
          </g>
        </svg>
      </div>

      <div className="fc-col-left">
        <div className="fc-rating">{R}</div>
        <div className="fc-pos">{pos}</div>
        <div className="fc-logos">
          {nationFlagUrl && <img src={nationFlagUrl} alt="flag" />}
          {clubLogoUrl && <img src={clubLogoUrl} alt="club" />}
        </div>
      </div>

      {faceUrl && (
        <img className="fc-face" alt="face" src={faceUrl} style={{ width: faceSize, height: faceSize }} />
      )}

      <div className="fc-name" style={{ fontSize: nameFont }}>{displayName || "\u00A0"}</div>

      <div className="fc-stats">
        <div className="fc-col">
          <div><b>{S.PAC}</b> PAC</div>
          <div><b>{S.SHO}</b> SHO</div>
          <div><b>{S.PAS}</b> PAS</div>
        </div>
        <div className="fc-col">
          <div><b>{S.DRI}</b> DRI</div>
          <div><b>{S.DEF}</b> DEF</div>
          <div><b>{S.PHY}</b> PHY</div>
        </div>
      </div>

      <style>{`
        .fifa-card { position: relative; font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif; user-select: none; }
        .fc-bg, .fc-svg { position: absolute; inset: 0; }
        .fc-col-left { position: absolute; top: 14px; left: 16px; display: flex; flex-direction: column; align-items: center; gap: 4px; color: #111; text-shadow: 0 1px 0 rgba(255,255,255,0.6); }
        .fc-rating { font-weight: 900; font-size: 40px; line-height: 1; letter-spacing: -0.5px; }
        .fc-pos { margin-top: 2px; font-weight: 800; font-size: 18px; }
        .fc-logos img { display: block; width: 26px; height: 18px; object-fit: contain; margin: 4px 0; filter: drop-shadow(0 1px 0 rgba(255,255,255,0.4)); }
        .fc-face { position: absolute; left: 50%; transform: translateX(-50%); top: 58px; object-fit: cover; object-position: center top; border-radius: 12px; filter: drop-shadow(0 6px 16px rgba(0,0,0,0.25)); }
        .fc-name { position: absolute; left: 0; right: 0; bottom: 92px; text-align: center; font-weight: 900; letter-spacing: .5px; color: #1b1b1b; text-shadow: 0 1px 0 rgba(255,255,255,0.6); line-height: 1.1; padding: 0 10px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
        .fc-stats { position: absolute; left: 50%; transform: translateX(-50%); bottom: 22px; display: flex; gap: 44px; font-weight: 700; color: #1b1b1b; text-shadow: 0 1px 0 rgba(255,255,255,0.6); }
        .fc-stats .fc-col { display: grid; gap: 8px; font-size: 16px; }
        .fc-stats b { font-size: 20px; width: 36px; display: inline-block; text-align: right; margin-right: 6px; }
      `}</style>
    </div>
  );
}
