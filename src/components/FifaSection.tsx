import React, { useMemo, useState } from "react";
import { FifaCard, FifaStats } from "./FifaCard";

// 최소 호환 Player 타입 (App의 Player에 병합해서 사용)
export type PlayerLite = { id: string; name: string; pos: string; fifa?: { rating: number; stats: FifaStats; nationFlagUrl?: string; clubLogoUrl?: string; faceUrl?: string; } };

type Props = {
  players: PlayerLite[];
  onChange(players: PlayerLite[]): void;  // players 배열을 통째로 갱신 (App의 setPlayers와 연결)
};

export default function FifaSection({ players, onChange }: Props) {
  const [selId, setSelId] = useState<string>(players[0]?.id || "");
  const sel = useMemo(() => players.find(p => p.id === selId), [players, selId]);

  const setSel = (patch: Partial<NonNullable<PlayerLite["fifa"]>>) => {
    if (!sel) return;
    onChange(players.map(p => {
      if (p.id !== sel.id) return p;
      const next = { ...(p.fifa || { rating: 50, stats: { PAC:50, SHO:50, PAS:50, DRI:50, DEF:50, PHY:50 } }), ...patch };
      return { ...p, fifa: next };
    }));
  };

  return (
    <div className="fifa-section">
      <div className="fs-left">
        <label>선수 선택</label>
        <select value={selId} onChange={e=>setSelId(e.target.value)}>
          {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.pos})</option>)}
        </select>

        {sel?.fifa && (
          <FifaCard
            name={sel.name}
            pos={sel.pos?.toUpperCase() || "MF"}
            rating={sel.fifa.rating}
            stats={sel.fifa.stats}
            nationFlagUrl={sel.fifa.nationFlagUrl}
            clubLogoUrl={sel.fifa.clubLogoUrl}
            faceUrl={sel.fifa.faceUrl}
            size={260}
          />
        )}
      </div>

      {sel && (
        <div className="fs-form">
          <div className="row">
            <label>평점</label>
            <input type="number" min={0} max={99}
              value={sel.fifa?.rating ?? 50}
              onChange={e=>setSel({ rating: parseInt(e.target.value || "0") })} />
          </div>

          <div className="grid">
            {(["PAC","SHO","PAS","DRI","DEF","PHY"] as (keyof FifaStats)[]).map(k => (
              <div className="col" key={k}>
                <label>{k}</label>
                <input type="number" min={0} max={99}
                  value={sel.fifa?.stats?.[k] ?? 50}
                  onChange={e=>setSel({ stats: { ...(sel.fifa?.stats || { PAC:50, SHO:50, PAS:50, DRI:50, DEF:50, PHY:50 }), [k]: parseInt(e.target.value || "0") } })} />
              </div>
            ))}
          </div>

          <div className="row">
            <label>국기 URL</label>
            <input value={sel.fifa?.nationFlagUrl || ""} onChange={e=>setSel({ nationFlagUrl: e.target.value })} />
          </div>
          <div className="row">
            <label>클럽 로고 URL</label>
            <input value={sel.fifa?.clubLogoUrl || ""} onChange={e=>setSel({ clubLogoUrl: e.target.value })} />
          </div>
          <div className="row">
            <label>얼굴 URL</label>
            <input value={sel.fifa?.faceUrl || ""} onChange={e=>setSel({ faceUrl: e.target.value })} />
          </div>
        </div>
      )}

      <style>{`
        .fifa-section { display: grid; grid-template-columns: 320px 1fr; gap: 16px; align-items: start; }
        .fs-left { display: grid; gap: 12px; }
        .fs-form { display: grid; gap: 10px; }
        .row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; }
        .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .col label { display:block; font-size: 12px; color: #555; margin-bottom: 4px; }
        select, input { width: 100%; padding: 6px 8px; border: 1px solid #d0d0d0; border-radius: 8px; }
        label { font-size: 12px; color: #555; }
      `}</style>
    </div>
  );
}
