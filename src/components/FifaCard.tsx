import React, { useMemo, useState } from "react";

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
  // Clamp helpers
  const clamp = (n: number) => Math.max(0, Math.min(99, Math.round(n || 0)));
  const R = clamp(rating);
  const S = {
    PAC: clamp(stats.PAC),
    SHO: clamp(stats.SHO),
    PAS: clamp(stats.PAS),
    DRI: clamp(stats.DRI),
    DEF: clamp(stats.DEF),
    PHY: clamp(stats.PHY),
  };
  const initials = useMemo(() => (name || "").trim().toUpperCase(), [name]);

  const h = Math.round(size * (386 / 296)); // preserve card aspect ratio (approx)
  const faceSize = Math.round(size * 0.72);

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

      {/* Left column: rating + pos + flags/logos */}
      <div className="fc-col-left">
        <div className="fc-rating">{R}</div>
        <div className="fc-pos">{pos}</div>
        <div className="fc-logos">
          {nationFlagUrl && <img src={nationFlagUrl} alt="flag" />}
          {clubLogoUrl && <img src={clubLogoUrl} alt="club" />}
        </div>
      </div>

      {/* Face */}
      {faceUrl && (
        <img className="fc-face" alt="face" src={faceUrl} style={{ width: faceSize, height: faceSize }} />
      )}

      {/* Name */}
      <div className="fc-name">{initials}</div>

      {/* Stats */}
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
        .fifa-card {
          position: relative;
          font-family: 'Inter', system-ui, -apple-system, Segoe UI, Roboto, 'Apple SD Gothic Neo', 'Noto Sans KR', sans-serif;
          user-select: none;
        }
        .fc-bg, .fc-svg { position: absolute; inset: 0; }
        .fc-col-left {
          position: absolute;
          top: 16px; left: 18px;
          display: flex; flex-direction: column; align-items: center; gap: 4px;
          color: #111;
          text-shadow: 0 1px 0 rgba(255,255,255,0.6);
        }
        .fc-rating { font-weight: 900; font-size: 40px; line-height: 1; letter-spacing: -1px; }
        .fc-pos { margin-top: 2px; font-weight: 800; font-size: 18px; }
        .fc-logos img {
          display: block; width: 26px; height: 18px; object-fit: contain; margin: 4px 0;
          filter: drop-shadow(0 1px 0 rgba(255,255,255,0.4));
        }
        .fc-face {
          position: absolute; left: 50%; transform: translateX(-50%); top: 68px;
          object-fit: cover; object-position: center top;
          border-radius: 12px;
          filter: drop-shadow(0 6px 16px rgba(0,0,0,0.25));
        }
        .fc-name {
          position: absolute; left: 0; right: 0; bottom: 108px; text-align: center;
          font-weight: 900; font-size: 28px; letter-spacing: 1px; color: #1b1b1b;
          text-shadow: 0 1px 0 rgba(255,255,255,0.6);
        }
        .fc-stats {
          position: absolute; left: 50%; transform: translateX(-50%); bottom: 24px;
          display: flex; gap: 40px; font-weight: 700; color: #1b1b1b;
          text-shadow: 0 1px 0 rgba(255,255,255,0.6);
        }
        .fc-stats .fc-col { display: grid; gap: 8px; font-size: 16px; }
        .fc-stats b { font-size: 20px; width: 36px; display: inline-block; text-align: right; margin-right: 6px; }
      `}</style>
    </div>
  );
}

// --- Optional: small editor/preview ---
export function FifaCardEditor() {
  const [name, setName] = useState("SON");
  const [pos, setPos] = useState("LM");
  const [rating, setRating] = useState(87);
  const [nationFlagUrl, setNationFlagUrl] = useState("https://flagcdn.com/w40/kr.png");
  const [clubLogoUrl, setClubLogoUrl] = useState("https://upload.wikimedia.org/wikipedia/en/thumb/b/b4/Tottenham_Hotspur.svg/64px-Tottenham_Hotspur.svg.png");
  const [faceUrl, setFaceUrl] = useState("https://i.imgur.com/3T6r0JP.png");

  const [PAC, setPAC] = useState(88);
  const [SHO, setSHO] = useState(86);
  const [PAS, setPAS] = useState(80);
  const [DRI, setDRI] = useState(87);
  const [DEF, setDEF] = useState(43);
  const [PHY, setPHY] = useState(69);

  return (
    <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 24, alignItems: "start" }}>
      <FifaCard
        name={name}
        pos={pos}
        rating={rating}
        nationFlagUrl={nationFlagUrl}
        clubLogoUrl={clubLogoUrl}
        faceUrl={faceUrl}
        stats={{ PAC, SHO, PAS, DRI, DEF, PHY }}
      />

      <div style={{ display: "grid", gap: 12 }}>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr 100px", gap: 8, alignItems: "center" }}>
          <label>이름</label>
          <input value={name} onChange={e=>setName(e.target.value)} />
          <input value={pos} onChange={e=>setPos(e.target.value.toUpperCase())} style={{ width: 72 }} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8, alignItems: "center" }}>
          <label>평점</label>
          <input type="number" min={0} max={99} value={rating} onChange={e=>setRating(parseInt(e.target.value||"0"))} />
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "100px 1fr", gap: 8 }}>
          <label>국기 URL</label>
          <input value={nationFlagUrl} onChange={e=>setNationFlagUrl(e.target.value)} />
          <label>클럽 로고 URL</label>
          <input value={clubLogoUrl} onChange={e=>setClubLogoUrl(e.target.value)} />
          <label>얼굴 URL</label>
          <input value={faceUrl} onChange={e=>setFaceUrl(e.target.value)} />
        </div>

        <div style={{ marginTop: 8, display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 8 }}>
          <div><label>PAC</label><input type="number" min={0} max={99} value={PAC} onChange={e=>setPAC(parseInt(e.target.value||"0"))} /></div>
          <div><label>SHO</label><input type="number" min={0} max={99} value={SHO} onChange={e=>setSHO(parseInt(e.target.value||"0"))} /></div>
          <div><label>PAS</label><input type="number" min={0} max={99} value={PAS} onChange={e=>setPAS(parseInt(e.target.value||"0"))} /></div>
          <div><label>DRI</label><input type="number" min={0} max={99} value={DRI} onChange={e=>setDRI(parseInt(e.target.value||"0"))} /></div>
          <div><label>DEF</label><input type="number" min={0} max={99} value={DEF} onChange={e=>setDEF(parseInt(e.target.value||"0"))} /></div>
          <div><label>PHY</label><input type="number" min={0} max={99} value={PHY} onChange={e=>setPHY(parseInt(e.target.value||"0"))} /></div>
        </div>
      </div>

      <style>{`
        input { padding: 6px 8px; border: 1px solid #d0d0d0; border-radius: 8px; }
        label { font-size: 12px; color: #555; display:block; margin-bottom:4px; }
      `}</style>
    </div>
  );
}

// Example usage:
// <FifaCardEditor />
// or
// <FifaCard name="SON" pos="LM" rating={87} stats={{ PAC:88, SHO:86, PAS:80, DRI:87, DEF:43, PHY:69 }} />
