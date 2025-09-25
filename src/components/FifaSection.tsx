import React, { useEffect, useMemo, useState } from "react";
import { FifaCard, FifaStats } from "./FifaCard";

// ===== Admin 설정 =====
const ADMIN_EMAILS = ["admin@example.com"]; // ← 운영 이메일로 바꾸세요

export type PlayerLite = {
  id: string; name: string; pos: string;
  fifa?: { rating: number; stats: FifaStats; nationFlagUrl?: string; clubLogoUrl?: string; faceUrl?: string; };
};

type Props = {
  players: PlayerLite[];
  onChange(players: PlayerLite[]): void;
  isAdmin?: boolean;
};

// 안전한 Supabase client 로더 (경로/별칭이 없을 때도 런타임에서만 탐색)
async function loadSupabaseClient(): Promise<any | null> {
  const w: any = globalThis as any;
  if (w?.supabase) return w.supabase; // 전역 주입되어 있으면 사용

  // 가장 흔한 상대경로 후보들을 런타임에만 시도
  const candidates = [
    "./supabaseClient",
    "../supabaseClient",
    "../../supabaseClient",
    "../../../supabaseClient",
    "./lib/supabaseClient",
    "../lib/supabaseClient",
    "../../lib/supabaseClient",
  ];
  for (const c of candidates) {
    try {
      const mod: any = await import(/* @vite-ignore */ c);
      const sb = mod?.supabase || mod?.default || mod;
      if (sb) return sb;
    } catch (_) {}
  }
  return null;
}

export default function FifaSection({ players, onChange, isAdmin: isAdminProp }: Props) {
  const [selId, setSelId] = useState<string>(players[0]?.id || "");
  const sel = useMemo(() => players.find(p => p.id === selId), [players, selId]);

  const [isAdmin, setIsAdmin] = useState(!!isAdminProp);
  useEffect(() => { setIsAdmin(!!isAdminProp); }, [isAdminProp]);

  // Supabase 세션 기반 자동 판별 (선택)
  useEffect(() => {
    if (typeof isAdminProp === "boolean") return;
    (async () => {
      try {
        const supabase = await loadSupabaseClient();
        if (!supabase) return;
        const { data } = await supabase.auth.getUser();
        const email: string | undefined = data?.user?.email;
        if (email && ADMIN_EMAILS.includes(email)) setIsAdmin(true);
      } catch (_) { /* ignore */ }
    })();
  }, [isAdminProp]);

  const setSel = (patch: Partial<NonNullable<PlayerLite["fifa"]>>) => {
    if (!sel || !isAdmin) return;
    onChange(players.map(p => {
      if (p.id !== sel.id) return p;
      const next = { ...(p.fifa || { rating: 50, stats: { PAC:50, SHO:50, PAS:50, DRI:50, DEF:50, PHY:50 } }), ...patch };
      return { ...p, fifa: next };
    }));
  };

  // === 이미지 업로드 ===
  async function uploadToStorage(kind: "face" | "flag" | "club", file: File) {
    if (!file || !sel || !isAdmin) return;
    try {
      const supabase = await loadSupabaseClient();
      if (!supabase) throw new Error("supabase client not found");

      const ext = (file.name.split(".").pop() || "png").toLowerCase();
      const path = `${kind}s/${sel.id}-${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("fifa").upload(path, file, {
        upsert: true, cacheControl: "3600",
      });
      if (upErr) throw upErr;
      const { data: pub } = await supabase.storage.from("fifa").getPublicUrl(path);
      const url = pub?.publicUrl as string;
      if (!url) throw new Error("public url not returned");

      if (kind === "face") setSel({ faceUrl: url });
      if (kind === "flag") setSel({ nationFlagUrl: url });
      if (kind === "club") setSel({ clubLogoUrl: url });
    } catch (e) {
      const url = URL.createObjectURL(file);
      if (kind === "face") setSel({ faceUrl: url });
      if (kind === "flag") setSel({ nationFlagUrl: url });
      if (kind === "club") setSel({ clubLogoUrl: url });
      alert("Supabase Storage 업로드가 설정되지 않아 로컬 미리보기로 표시합니다. 영구 저장하려면 Storage 버킷(fifa)을 공개로 생성하고 supabaseClient를 연결하세요.");
    }
  }

  const disabled = !isAdmin;

  return (
    <div className="fifa-section">
      <div className="fs-left">
        <label className="fs-label">선수 선택</label>
        <select value={selId} onChange={e=>setSelId(e.target.value)} disabled={players.length === 0}>
          {players.map(p => <option key={p.id} value={p.id}>{p.name} ({p.pos})</option>)}
        </select>

        <div className="fs-card">
          {sel?.fifa ? (
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
          ) : (
            <div className="fs-card-placeholder">좌측에서 선수를 선택하고 능력치를 입력하세요.</div>
          )}
        </div>
      </div>

      {sel && (
        <div className="fs-form">
          {!isAdmin && <div className="fs-lock">관리자만 수정할 수 있습니다</div>}

          <div className="row">
            <label>평점</label>
            <input type="number" min={0} max={99}
              value={sel.fifa?.rating ?? 50}
              onChange={e=>setSel({ rating: parseInt(e.target.value || "0") })}
              disabled={disabled} />
          </div>

          <div className="grid">
            {(["PAC","SHO","PAS","DRI","DEF","PHY"] as (keyof FifaStats)[]).map(k => (
              <div className="col" key={k}>
                <label>{k}</label>
                <input type="number" min={0} max={99}
                  value={sel.fifa?.stats?.[k] ?? 50}
                  onChange={e=>setSel({ stats: { ...(sel.fifa?.stats || { PAC:50, SHO:50, PAS:50, DRI:50, DEF:50, PHY:50 }), [k]: parseInt(e.target.value || "0") } })}
                  disabled={disabled} />
              </div>
            ))}
          </div>

          {/* 이미지 입력들 */}
          <div className="row">
            <label>국기</label>
            <div className="row2">
              <input value={sel.fifa?.nationFlagUrl || ""} placeholder="이미지 URL"
                     onChange={e=>setSel({ nationFlagUrl: e.target.value })} disabled={disabled} />
              <input type="file" accept="image/*"
                     onChange={e => e.target.files?.[0] && uploadToStorage("flag", e.target.files[0])}
                     disabled={disabled} />
            </div>
          </div>
          <div className="row">
            <label>클럽 로고</label>
            <div className="row2">
              <input value={sel.fifa?.clubLogoUrl || ""} placeholder="이미지 URL"
                     onChange={e=>setSel({ clubLogoUrl: e.target.value })} disabled={disabled} />
              <input type="file" accept="image/*"
                     onChange={e => e.target.files?.[0] && uploadToStorage("club", e.target.files[0])}
                     disabled={disabled} />
            </div>
          </div>
          <div className="row">
            <label>얼굴</label>
            <div className="row2">
              <input value={sel.fifa?.faceUrl || ""} placeholder="이미지 URL"
                     onChange={e=>setSel({ faceUrl: e.target.value })} disabled={disabled} />
              <input type="file" accept="image/*"
                     onChange={e => e.target.files?.[0] && uploadToStorage("face", e.target.files[0])}
                     disabled={disabled} />
            </div>
          </div>
        </div>
      )}

      <style>{`
        /* ▼ 모든 스타일을 .fifa-section 범위로 한정 (전역 오염 방지) */
        .fifa-section { display: grid; grid-template-columns: 320px 1fr; gap: 20px; align-items: start; }
        .fifa-section .fs-left { display: grid; gap: 12px; }
        .fifa-section .fs-card { background: transparent; padding: 0; display:flex; align-items:center; justify-content:center; min-height: 340px; }
        .fifa-section .fs-card-placeholder { opacity: .6; font-size: 13px; }
        .fifa-section .fs-form { position: relative; display: grid; gap: 12px; }
        .fifa-section .fs-lock {
          position: absolute; top: -6px; right: 0;
          font-size: 12px; padding: 2px 8px; border-radius: 999px;
          background: #2a2a2a; color: #bbb; border: 1px solid #3a3a3a;
        }
        .fifa-section .row { display: grid; grid-template-columns: 100px 1fr; gap: 8px; align-items: center; }
        .fifa-section .row2 { display: grid; grid-template-columns: 1fr auto; gap: 8px; align-items: center; }
        .fifa-section .grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
        .fifa-section .col label, .fifa-section .row label { display:block; font-size: 12px; color: #999; margin-bottom: 4px; }
        .fifa-section select,
        .fifa-section input[type="text"],
        .fifa-section input[type="number"],
        .fifa-section input[type="file"],
        .fifa-section input:not([type]) {
          width: 100%; padding: 8px 10px; border: 1px solid #3a3a3a; border-radius: 10px;
          background: #121212; color: #eaeaea;
        }
        .fifa-section input[disabled], .fifa-section select[disabled] { opacity: .6; cursor: not-allowed; }
      `}</style>
    </div>
  );
}
