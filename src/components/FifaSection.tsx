
import React, { useMemo, useRef, useState } from "react";
import { FifaCard, FifaStats, downloadSvgAsPng } from "./FifaCard";

type Player = { id: string; name: string };
type Props = {
  players: Player[];
  readonly?: boolean;
};

// LocalStorage helpers (scoped key)
const KEY = "fifaStatsByPlayerId_v1";
function loadAll(): Record<string, FifaStats> {
  try { return JSON.parse(localStorage.getItem(KEY) || "{}") } catch { return {} }
}
function saveFor(pid: string, stats: FifaStats) {
  const all = loadAll();
  all[pid] = stats;
  localStorage.setItem(KEY, JSON.stringify(all));
}

export default function FifaSection({ players, readonly }: Props) {
  const [pid, setPid] = useState(players[0]?.id ?? "");
  const all = useMemo(loadAll, []);
  const current = all[pid] ?? {
    ovr: 80, pos: "LM", name: players.find(p=>p.id===pid)?.name || "",
    pac: 80, sho: 80, pas: 80, dri: 80, def: 80, phy: 80,
    photoUrl: "", nationFlag: "", clubCrest: ""
  };

  const [form, setForm] = useState<FifaStats>(current);
  const svgRef = useRef<SVGSVGElement>(null);

  const pOptions = players.map(p => <option key={p.id} value={p.id}>{p.name}</option>);

  function set<K extends keyof FifaStats>(key: K, val: FifaStats[K]) {
    setForm({ ...form, [key]: val } as FifaStats);
  }
  function save() {
    if (!pid) return;
    saveFor(pid, form);
    alert("피파 카드 능력치를 저장했습니다.");
  }
  async function download() {
    if (svgRef.current) await downloadSvgAsPng(svgRef.current, `${form.name || "player"}-fifa-card.png`);
  }

  return (
    <section className="box">
      <h3>피파 카드</h3>
      <div className="row" style={{ gap: 12, alignItems: "center", flexWrap: "wrap" }}>
        <label>선수 선택</label>
        <select value={pid} onChange={(e)=>setPid(e.target.value)} disabled={readonly}>
          {pOptions}
        </select>
        <button onClick={save} disabled={readonly}>저장</button>
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
        </div>
      </div>
    </section>
  );
}
