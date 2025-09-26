
import React, { useEffect, useRef, useState } from "react";
import { FifaCard, FifaStats, downloadSvgAsPng } from "./FifaCard";
import { createClient } from "@supabase/supabase-js";

type Player = { id: string; name: string };
type Props = {
  players: Player[];
  readonly?: boolean;
};

// --- Supabase client dynamic loader (module/global/env fallback) ---
async function loadSupabaseClient(): Promise<any | null> {
  const w = (typeof window !== "undefined" ? (window as any) : null);
  if (w?.supabase) return w.supabase;
  const candidates = [
    "./supabaseClient", "../supabaseClient", "../../supabaseClient", "../../../supabaseClient",
    "./lib/supabaseClient", "../lib/supabaseClient", "../../lib/supabaseClient",
    "./lib/supabase", "../lib/supabase", "../../lib/supabase",
  ];
  for (const p of candidates) {
    try {
      const mod = await import(/* @vite-ignore */ p);
      const sb = (mod as any)?.supabase || (mod as any)?.default || mod;
      if (sb) { try { (globalThis as any).supabase = sb; } catch {} return sb; }
    } catch {}
  }
  // Fallback: create a client directly from env (Vite)
  try {
    const url = (import.meta.env.VITE_SUPABASE_URL || "").replace(/\/+$/,"");
    const key = import.meta.env.VITE_SUPABASE_ANON_KEY || "";
    if (url && key) {
      const sb = createClient(url, key, { auth: { persistSession: true }});
      try { (globalThis as any).supabase = sb; } catch {}
      return sb;
    }
  } catch {}
  console.warn("[FifaSection] supabase client not found and env fallback unavailable.");
  return null;
}

// --- DB row type & mappers (snake_case <-> camelCase) ---
type DBRow = {
  id?: string;
  player_id: string;
  name: string | null;
  pos: string | null;
  ovr: number | null;
  pac: number | null;
  sho: number | null;
  pas: number | null;
  dri: number | null;
  def: number | null;
  phy: number | null;
  photo_url: string | null;
  nation_flag: string | null;
  club_crest: string | null;
};

function toDbRow(pid: string, f: FifaStats): DBRow {
  return {
    player_id: pid,
    name: f.name ?? null,
    pos: f.pos ?? null,
    ovr: f.ovr ?? null,
    pac: f.pac ?? null,
    sho: f.sho ?? null,
    pas: f.pas ?? null,
    dri: f.dri ?? null,
    def: f.def ?? null,
    phy: f.phy ?? null,
    photo_url: f.photoUrl ?? null,
    nation_flag: f.nationFlag ?? null,
    club_crest: f.clubCrest ?? null,
  };
}

function fromDbRow(row: DBRow): FifaStats {
  return {
    name: row.name ?? "",
    pos: row.pos ?? "",
    ovr: row.ovr ?? 0,
    pac: row.pac ?? 0,
    sho: row.sho ?? 0,
    pas: row.pas ?? 0,
    dri: row.dri ?? 0,
    def: row.def ?? 0,
    phy: row.phy ?? 0,
    photoUrl: row.photo_url ?? "",
    nationFlag: row.nation_flag ?? "",
    clubCrest: row.club_crest ?? "",
  };
}

// --- CRUD ---
async function loadFifaByPlayer(player_id: string): Promise<DBRow | null> {
  const sb = await loadSupabaseClient(); if (!sb) return null;
  const { data, error } = await sb.from("fifa_cards").select("*").eq("player_id", player_id).maybeSingle();
  if (error) { console.warn("[FifaSection] load error", error); return null; }
  return data;
}

async function upsertFifa(row: DBRow): Promise<boolean> {
  const sb = await loadSupabaseClient(); 
  if (!sb) { alert("Supabase 클라이언트를 찾지 못했습니다."); return false; }
  const { error } = await sb.from("fifa_cards").upsert(row, { onConflict: "player_id" });
  if (error) {
    console.error("[FifaSection] upsert error", error);
    alert("저장 실패: " + (error.message || "unknown"));
    return false;
  }
  return true;
}

// --- Project images discovery (src/assets only) ---
let discoveredImages: string[] = [];
try {
  const a: Record<string,string> = import.meta.glob("/src/assets/**/*.{png,jpg,jpeg,svg}", { as: "url", eager: true });
  discoveredImages = Object.values(a);
} catch {}

export default function FifaSection({ players, readonly }: Props) {
  const firstId = players[0]?.id ?? "";
  const [pid, setPid] = useState(firstId);
  const [loading, setLoading] = useState(false);
  const [foundImages] = useState<string[]>(discoveredImages);

  const [form, setForm] = useState<FifaStats>({
    ovr: 80, pos: "LM", name: players.find(p=>p.id===firstId)?.name || "",
    pac: 80, sho: 80, pas: 80, dri: 80, def: 80, phy: 80,
    photoUrl: "", nationFlag: "", clubCrest: ""
  });
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!pid) return;
      setLoading(true);
      const row = await loadFifaByPlayer(pid);
      if (alive) {
        if (row) {
          setForm(fromDbRow(row));
        } else {
          const nm = players.find(p=>p.id===pid)?.name || "";
          setForm(f => ({ ...f, name: nm }));
        }
        setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [pid, players]);

  const pOptions = players.map(p => <option key={p.id} value={p.id}>{p.name}</option>);

  function set<K extends keyof FifaStats>(key: K, val: FifaStats[K]) {
    setForm({ ...form, [key]: val } as FifaStats);
  }
  async function save() {
    if (!pid) return;
    const ok = await upsertFifa(toDbRow(pid, form));
    if (ok) alert("피파 카드 능력치를 Supabase에 저장했습니다."); else alert("저장 실패(콘솔 확인)");
  }
  async function download() {
    if (svgRef.current) await downloadSvgAsPng(svgRef.current, `${form.name || "player"}-fifa-card.png`);
  }

  return (
    <section className="box">
      <h3>피파 카드</h3>
      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>선수 선택</label>
        <select value={pid} onChange={(e)=>setPid(e.target.value)} disabled={readonly || loading}>
          {pOptions}
        </select>
        <button onClick={save} disabled={readonly || loading}>저장(Supabase)</button>
        <button onClick={download}>PNG로 저장</button>
      </div>

      <div className="row" style={{ gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
        <div style={{ flex: "0 0 320px" }}>
          <FifaCard ref={svgRef} stats={form} />
        </div>

        <div className="grid" style={{ display: "grid", gridTemplateColumns: "120px 1fr", gap: "8px 12px", minWidth: 260 }}>
          <label>이름</label><input value={form.name} onChange={e=>set("name", e.target.value)} disabled={readonly}/>
          <label>포지션</label><input value={form.pos} onChange={e=>set("pos", e.target.value)} disabled={readonly}/>
          <label>OVR</label><input type="number" value={form.ovr} onChange={e=>set("ovr", parseInt(e.target.value||"0"))} disabled={readonly}/>

          <label>PAC</label><input type="number" value={form.pac} onChange={e=>set("pac", parseInt(e.target.value||"0"))} disabled={readonly}/>
          <label>SHO</label><input type="number" value={form.sho} onChange={e=>set("sho", parseInt(e.target.value||"0"))} disabled={readonly}/>
          <label>PAS</label><input type="number" value={form.pas} onChange={e=>set("pas", parseInt(e.target.value||"0"))} disabled={readonly}/>
          <label>DRI</label><input type="number" value={form.dri} onChange={e=>set("dri", parseInt(e.target.value||"0"))} disabled={readonly}/>
          <label>DEF</label><input type="number" value={form.def} onChange={e=>set("def", parseInt(e.target.value||"0"))} disabled={readonly}/>
          <label>PHY</label><input type="number" value={form.phy} onChange={e=>set("phy", parseInt(e.target.value||"0"))} disabled={readonly}/>

          <label>국기 URL</label><input value={form.nationFlag||""} onChange={e=>set("nationFlag", e.target.value)} disabled={readonly}/>
          <label>클럽 엠블럼 URL</label><input value={form.clubCrest||""} onChange={e=>set("clubCrest", e.target.value)} disabled={readonly}/>
          <label>사진 URL</label><input value={form.photoUrl||""} onChange={e=>set("photoUrl", e.target.value)} disabled={readonly}/>

          {/* 프로젝트 이미지 선택(자동 탐색): 선수 사진/엠블럼/국기 */}
          {foundImages.length > 0 && <>
            <label>선수 사진 선택</label>
            <select onChange={(e)=>{ const url = e.target.value; if (url) set("photoUrl", url); }} defaultValue="">
              <option value="" disabled>— 파일 선택 —</option>
              {foundImages.map(u=> <option key={u} value={u}>{u.split("/").slice(-1)[0]}</option>)}
            </select>

            <label>엠블럼 선택</label>
            <select onChange={(e)=>{ const url = e.target.value; if (url) set("clubCrest", url); }} defaultValue="">
              <option value="" disabled>— 파일 선택 —</option>
              {foundImages.map(u=> <option key={u} value={u}>{u.split("/").slice(-1)[0]}</option>)}
            </select>

            <label>국기 선택</label>
            <select onChange={(e)=>{ const url = e.target.value; if (url) set("nationFlag", url); }} defaultValue="">
              <option value="" disabled>— 파일 선택 —</option>
              {foundImages.map(u=> <option key={u} value={u}>{u.split("/").slice(-1)[0]}</option>)}
            </select>
          </>}
        </div>
      </div>
    </section>
  );
}
