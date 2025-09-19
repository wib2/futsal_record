import React, { useEffect, useMemo, useState } from "react";
import { useRealtimeJsonState } from "./lib/realtimeStore";

/**
 * 골딘 풋살 리그 (완성본)
 * - PIN=8347 (sha256 해시 비교만, 평문 노출 없음)
 * - 날짜별 팀명 세션 저장
 * - 경기별 G/A만 입력, CS는 GK 무실점 자동
 * - 최신 경기(큰 seq) 위로 정렬
 * - Supabase Realtime 동기화(무한루프/깜빡임 방지)
 * - 가나다 정렬, GK 하단 정렬
 * - 모바일 UI 보강(입력칸 겹침/깨짐 방지)
 */

const TEAM_IDS = ["A", "B", "C"] as const;
type TeamId = typeof TEAM_IDS[number];
type Player = { id: string; name: string; active: boolean; pos: "필드" | "GK" };
type Match = { id: string; seq: number; home: TeamId; away: TeamId; hg: number; ag: number; gkHome?: string | null; gkAway?: string | null };
type MatchStats = Record<string, { goals: number; assists: number; cleansheets?: number }>;
type Session = {
  rosters: Record<TeamId, string[]>;
  matches: Match[];
  matchStats: Record<string, MatchStats>;
  defAwards: Record<TeamId, string | null>;
  teamNames?: Record<TeamId, string>;
  notes: string;
};
type PersistShape = {
  players: Player[];
  teamNames: Record<TeamId, string>;
  sessionsByDate: Record<string, Session>;
  sessionDate: string;
};

const DEFAULT_PLAYERS = [
  { name: "강민성", pos: "필드" },
  { name: "이용범", pos: "GK" },
  { name: "이호준", pos: "필드" },
  { name: "최광민", pos: "필드" },
  { name: "성은호", pos: "필드" },
  { name: "배호성", pos: "필드" },
  { name: "강종혁", pos: "필드" },
  { name: "이창주", pos: "필드" },
  { name: "주경범", pos: "필드" },
  { name: "최우현", pos: "필드" },
  { name: "최준형", pos: "GK" },
  { name: "김한진", pos: "GK" },
  { name: "장지영", pos: "필드" },
  { name: "최준혁", pos: "필드" },
  { name: "정민창", pos: "필드" },
  { name: "김규연", pos: "필드" },
  { name: "김병준", pos: "필드" },
  { name: "윤호석", pos: "필드" },
  { name: "이세형", pos: "필드" },
  { name: "정제윈", pos: "필드" },
  { name: "한형진", pos: "필드" },
] as const;

const uid = () => Math.random().toString(36).slice(2, 9);
const DAY_MS = 24 * 60 * 60 * 1000;
const toISO = (d: Date) => {
  const y = d.getFullYear(), m = String(d.getMonth() + 1).padStart(2, "0"), da = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${da}`;
};
const ensureSunday = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) {
    const t = new Date();
    const add = (7 - t.getDay()) % 7;
    return toISO(new Date(t.getTime() + add * DAY_MS));
  }
  const add = (7 - d.getDay()) % 7;
  return toISO(new Date(d.getTime() + add * DAY_MS));
};
const asArray = <T = any,>(v: any, def: T[] = []) => (Array.isArray(v) ? (v as T[]) : def);
const asNumber = (v: any, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const isTeamId = (v: any): v is TeamId => v === "A" || v === "B" || v === "C";

type StandingRow = { team: TeamId; pts: number; gf: number; ga: number; gd: number; w: number; d: number; l: number };
function computeStandings(matchesInput: Match[] | null | undefined): StandingRow[] {
  const matches = asArray<Match>(matchesInput, []);
  const t: Record<TeamId, StandingRow> = {
    A: { team: "A", pts: 0, gf: 0, ga: 0, gd: 0, w: 0, d: 0, l: 0 },
    B: { team: "B", pts: 0, gf: 0, ga: 0, gd: 0, w: 0, d: 0, l: 0 },
    C: { team: "C", pts: 0, gf: 0, ga: 0, gd: 0, w: 0, d: 0, l: 0 },
  };
  for (const m of matches) {
    const HG = asNumber(m.hg, 0), AG = asNumber(m.ag, 0);
    t[m.home].gf += HG; t[m.home].ga += AG; t[m.away].gf += AG; t[m.away].ga += HG;
    if (HG > AG) { t[m.home].pts += 3; t[m.home].w++; t[m.away].l++; }
    else if (HG < AG) { t[m.away].pts += 3; t[m.away].w++; t[m.home].l++; }
    else { t[m.home].pts++; t[m.away].pts++; t[m.home].d++; t[m.away].d++; }
  }
  for (const k of TEAM_IDS) t[k].gd = t[k].gf - t[k].ga;
  return Object.values(t).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team));
}
function computeTeamBonus(st: StandingRow[]): Record<TeamId, number> { const map: { [k in TeamId]: number } = { A: 0, B: 0, C: 0 }; st.map(s => s.team).forEach((tid, i) => map[tid] = i === 0 ? 4 : i === 1 ? 2 : 1); return map; }

const LS_KEY = "goldin_futsal_app_main_v10";
const SS_PIN_AUTHED = "goldin_futsal_admin_authed";
const FIXED_PIN_HASH = "350c94d619f6aba3379500ff11bfcca6e58b0afe5b3624d0ad56fa607845e38c"; // sha256("8347")

function emptySession(): Session { return { rosters: { A: [], B: [], C: [] }, matches: [], matchStats: {}, defAwards: { A: null, B: null, C: null }, teamNames: undefined, notes: "" }; }
function normalizeLoaded(data: any): PersistShape {
  const today = ensureSunday(toISO(new Date()));
  let players = asArray<any>(data?.players, []).map((p: any) => ({ id: p?.id || uid(), name: String(p?.name || "?"), active: p?.active !== false, pos: p?.pos === "GK" ? "GK" : "필드" })) as Player[];
  if (players.length === 0) { players = DEFAULT_PLAYERS.map(p => ({ id: uid(), name: p.name, active: true, pos: p.pos as any })); }
  const globalTeamNames: Record<TeamId, string> = { A: String(data?.teamNames?.A || "팀 A"), B: String(data?.teamNames?.B || "팀 B"), C: String(data?.teamNames?.C || "팀 C") };
  let sessionsByDate: Record<string, Session> = {};
  if (data?.sessionsByDate && typeof data.sessionsByDate === "object") {
    for (const [k, v] of Object.entries<any>(data.sessionsByDate)) {
      const s = v || {};
      const rosters = { A: asArray<string>(s?.rosters?.A, []), B: asArray<string>(s?.rosters?.B, []), C: asArray<string>(s?.rosters?.C, []) };
      const matches = asArray<any>(s?.matches, []).map((m: any) => ({ id: String(m?.id || uid()), seq: asNumber(m?.seq, 0), home: isTeamId(m?.home) ? m.home : "A", away: isTeamId(m?.away) ? m.away : "B", hg: asNumber(m?.hg, 0), ag: asNumber(m?.ag, 0), gkHome: (m?.gkHome || "") || null, gkAway: (m?.gkAway || "") || null })) as Match[];
      const rawMS = typeof s?.matchStats === "object" && s?.matchStats ? s.matchStats : {};
      const matchStats: Record<string, MatchStats> = {};
      Object.keys(rawMS).forEach(mid => {
        const row = rawMS[mid] || {};
        const safe: MatchStats = {} as any;
        Object.keys(row).forEach(pid => { const v = row[pid] || {}; safe[pid] = { goals: asNumber(v.goals, 0), assists: asNumber(v.assists, 0), cleansheets: asNumber(v.cleansheets, 0) }; });
        matchStats[mid] = safe;
      });
      const defAwards: Record<TeamId, string | null> = { A: typeof s?.defAwards?.A === "string" ? s.defAwards.A : null, B: typeof s?.defAwards?.B === "string" ? s.defAwards.B : null, C: typeof s?.defAwards?.C === "string" ? s.defAwards.C : null };
      const notes = String(s?.notes || "");
      const teamNames = (s?.teamNames && typeof s.teamNames === "object") ? ({ A: String(s.teamNames.A || globalTeamNames.A), B: String(s.teamNames.B || globalTeamNames.B), C: String(s.teamNames.C || globalTeamNames.C) }) : undefined;
      sessionsByDate[ensureSunday(k)] = { rosters, matches, matchStats, defAwards, teamNames, notes };
    }
  } else {
    sessionsByDate[today] = emptySession();
  }
  const sessionDate = ensureSunday(String(data?.sessionDate || today));
  if (!sessionsByDate[sessionDate]) sessionsByDate[sessionDate] = emptySession();

  Object.values(sessionsByDate).forEach(sess => { const list = asArray(sess.matches, []); let seq = 1; for (const m of list) { if (!m.seq || m.seq <= 0) m.seq = seq; seq++; } });

  return { players, teamNames: globalTeamNames, sessionsByDate, sessionDate };
}
function loadLocal(): PersistShape | null { try { const raw = localStorage.getItem(LS_KEY); return raw ? normalizeLoaded(JSON.parse(raw)) : null; } catch { return null; } }
function saveLocal(s: PersistShape) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch { } }

function getQueryFlag(...keys: string[]) {
  const q = new URLSearchParams(window.location.search);
  return keys.some(k => q.get(k) === "1" || q.get(k) === "true" || q.has(k));
}

async function sha256Hex(input: string): Promise<string> {
  const enc = new TextEncoder();
  // @ts-ignore
  if (!(window as any).crypto?.subtle) return `plain:${input}`;
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(input));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
}

function isEmptyRosters(r: Record<TeamId, string[]>) { return TEAM_IDS.every(t => asArray(r?.[t], []).length === 0); }
function findDonorRosters(map: Record<string, Session>, target: string): Record<TeamId, string[]> | null {
  const keys = Object.keys(map).sort();
  const tgt = new Date(target).getTime();
  for (let i = keys.length - 1; i >= 0; i--) {
    const k = keys[i]; const t = new Date(k).getTime();
    if (t === tgt) continue;
    const r = map[k]?.rosters;
    if (r && !isEmptyRosters(r)) return { A: [...asArray(r.A, [])], B: [...asArray(r.B, [])], C: [...asArray(r.C, [])] };
  }
  return null;
}

/* ---------- 경기 행 ---------- */
function MatchRow({
  m, readonly, updateMatch, deleteMatch, rosterA, rosterB, players, values, onChange, teamNames
}: {
  m: Match; readonly: boolean; updateMatch: (id: string, patch: Partial<Match>) => void; deleteMatch: (id: string) => void;
  rosterA: string[]; rosterB: string[]; players: Player[]; values: MatchStats;
  onChange: (pid: string, field: "goals" | "assists", value: number) => void;
  teamNames: Record<TeamId, string>;
}) {
  const [open, setOpen] = useState(false);
  const name = (pid: string) => players.find(p => p.id === pid)?.name || "?";
  const pos = (pid: string) => players.find(p => p.id === pid)?.pos || "필드";
  return (<div className="card">
    <div className="match-head">
      <div className="seq">{m.seq}경기</div>

      <div className="scoreline">
        <select value={m.home} onChange={e => updateMatch(m.id, { home: e.target.value as TeamId })} disabled={readonly}>
          <option value="A">팀 A</option><option value="B">팀 B</option><option value="C">팀 C</option>
        </select>
        <input type="number" value={m.hg} onChange={e => updateMatch(m.id, { hg: +e.target.value || 0 })} disabled={readonly} />
        <div className="colon">:</div>
        <input type="number" value={m.ag} onChange={e => updateMatch(m.id, { ag: +e.target.value || 0 })} disabled={readonly} />
        <select value={m.away} onChange={e => updateMatch(m.id, { away: e.target.value as TeamId })} disabled={readonly}>
          <option value="A">팀 A</option><option value="B">팀 B</option><option value="C">팀 C</option>
        </select>
      </div>

      <div className="head-actions">
        <button onClick={() => setOpen(v => !v)}>{open ? "기록 닫기" : "기록"}</button>
        <button onClick={() => deleteMatch(m.id)} className="danger" disabled={readonly}>삭제</button>
      </div>
    </div>

    <div className="gk-row">
      <div><div className="subtle">홈 GK</div>
        <select value={m.gkHome || ""} onChange={e => updateMatch(m.id, { gkHome: e.target.value || null })} disabled={readonly}>
          <option value="">선택 안 함</option>
          {asArray(rosterA, []).filter(pid => (players.find(p => p.id === pid)?.pos || "필드") === "GK").map(pid => (
            <option key={pid} value={pid}>{name(pid)}</option>
          ))}
        </select>
      </div>
      <div><div className="subtle">원정 GK</div>
        <select value={m.gkAway || ""} onChange={e => updateMatch(m.id, { gkAway: e.target.value || null })} disabled={readonly}>
          <option value="">선택 안 함</option>
          {asArray(rosterB, []).filter(pid => (players.find(p => p.id === pid)?.pos || "필드") === "GK").map(pid => (
            <option key={pid} value={pid}>{name(pid)}</option>
          ))}
        </select>
      </div>
    </div>

    {open && (<div className="record-grid">
      <div className="team-col">
        <div className="team-col-head">{teamNames[m.home]} <span className="subtle">({m.home})</span></div>
        <div className="players-grid">
          {asArray(rosterA, []).map(pid => {
            const v = values[pid] || { goals: 0, assists: 0 };
            return (
              <div key={pid} className="player-card">
                <div className="player-name">{name(pid)} <span className="pos">({pos(pid)})</span></div>
                <div className="stat">
                  <label className="stat-label">G</label>
                  <input type="number" inputMode="numeric" className="stat-input"
                         value={v.goals} onChange={e => onChange(pid, "goals", +e.target.value || 0)} disabled={readonly}/>
                </div>
                <div className="stat">
                  <label className="stat-label">A</label>
                  <input type="number" inputMode="numeric" className="stat-input"
                         value={v.assists} onChange={e => onChange(pid, "assists", +e.target.value || 0)} disabled={readonly}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
      <div className="team-col">
        <div className="team-col-head">{teamNames[m.away]} <span className="subtle">({m.away})</span></div>
        <div className="players-grid">
          {asArray(rosterB, []).map(pid => {
            const v = values[pid] || { goals: 0, assists: 0 };
            return (
              <div key={pid} className="player-card">
                <div className="player-name">{name(pid)} <span className="pos">({pos(pid)})</span></div>
                <div className="stat">
                  <label className="stat-label">G</label>
                  <input type="number" inputMode="numeric" className="stat-input"
                         value={v.goals} onChange={e => onChange(pid, "goals", +e.target.value || 0)} disabled={readonly}/>
                </div>
                <div className="stat">
                  <label className="stat-label">A</label>
                  <input type="number" inputMode="numeric" className="stat-input"
                         value={v.assists} onChange={e => onChange(pid, "assists", +e.target.value || 0)} disabled={readonly}/>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>)}
  </div>);
}

/* ---------------- 메타필드 제외 비교 ---------------- */
const pickState = (x: any) => ({
  players: x?.players,
  teamNames: x?.teamNames,
  sessionsByDate: x?.sessionsByDate,
  sessionDate: x?.sessionDate,
});
const deepEqualState = (a: any, b: any) =>
  JSON.stringify(pickState(a)) === JSON.stringify(pickState(b));

export default function App() {
  const today = ensureSunday(toISO(new Date()));
  const fallback: PersistShape = {
    players: DEFAULT_PLAYERS.map(p => ({ id: uid(), name: p.name, active: true, pos: p.pos as any })),
    teamNames: { A: "팀 A", B: "팀 B", C: "팀 C" },
    sessionsByDate: { [today]: emptySession() },
    sessionDate: today
  };
  const local0 = loadLocal() ?? fallback;

  const [players, setPlayers] = useState<Player[]>(local0.players);
  const [globalTeamNames, setGlobalTeamNames] = useState<Record<TeamId, string>>(local0.teamNames);
  const [sessionDate, setSessionDate] = useState<string>(local0.sessionDate);
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session>>(local0.sessionsByDate);

  // 초기 하이드레이션 여부
  const [hydrated, setHydrated] = useState(false);

  // 가나다 정렬 + GK 하단
  const compareKo = useMemo(
    () => new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true, ignorePunctuation: true }).compare,
    []
  );
  const playersSorted = useMemo(() => {
    const field = [...players].filter(p => p.pos !== "GK").sort((a, b) => compareKo(a.name, b.name));
    const gks = [...players].filter(p => p.pos === "GK").sort((a, b) => compareKo(a.name, b.name));
    return [...field, ...gks];
  }, [players, compareKo]);
  const activePlayersSorted = useMemo(() => playersSorted.filter(p => p.active), [playersSorted]);

  // Realtime
  const initialCloud = useMemo(() => ({ players, teamNames: globalTeamNames, sessionsByDate, sessionDate }), []);
  const { value: cloud, setValue: setCloud, ready } =
    useRealtimeJsonState<typeof initialCloud>(initialCloud, { id: 1 as any });

  useEffect(() => {
    if (!ready || !cloud) return;
    setPlayers(cloud.players);
    setGlobalTeamNames(cloud.teamNames);
    setSessionsByDate(cloud.sessionsByDate);
    setSessionDate(cloud.sessionDate);
    setHydrated(true);
  }, [cloud, ready]);

  useEffect(() => {
    const s = { players, teamNames: globalTeamNames, sessionsByDate, sessionDate };
    saveLocal(s);
    if (ready && hydrated) {
      if (!deepEqualState(cloud, s)) setCloud(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, globalTeamNames, sessionsByDate, sessionDate, ready, hydrated]);

  // 뷰/권한
  const viewerFlag = getQueryFlag("viewer", "view", "readonly");
  const [authed, setAuthed] = useState<boolean>(() => sessionStorage.getItem(SS_PIN_AUTHED) === "1");
  const readonly = viewerFlag || !authed;
  const [pinInput, setPinInput] = useState("");
  async function unlock() {
    if (!pinInput) return alert("PIN을 입력하세요");
    const h = await sha256Hex(pinInput);
    if (h === FIXED_PIN_HASH) { sessionStorage.setItem(SS_PIN_AUTHED, "1"); setAuthed(true); setPinInput(""); }
    else alert("PIN 불일치");
  }
  function lock() { sessionStorage.removeItem(SS_PIN_AUTHED); setAuthed(false); }
  function copyViewerLink() { const url = new URL(window.location.href); url.searchParams.set("viewer", "1"); navigator.clipboard?.writeText(url.toString()); alert("보기 전용 링크가 복사되었습니다"); }

  // 렌더용 보정 날짜
  const uiDate = useMemo(() => ensureSunday(sessionDate), [sessionDate]);
  const cur: Session = useMemo(
    () => sessionsByDate[ensureSunday(sessionDate)] ?? emptySession(),
    [sessionsByDate, sessionDate]
  );

  // 날짜별 팀명 보정(강한 가드)
  useEffect(() => {
    const key = ensureSunday(sessionDate);
    setSessionsByDate(prev => {
      const base = prev[key] ?? emptySession();
      if (base.teamNames && base.teamNames.A && base.teamNames.B && base.teamNames.C) return prev;
      // donor
      let donor: Record<TeamId, string> | null = null;
      const keys = Object.keys(prev).sort();
      const tgt = new Date(key).getTime();
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i]; const t = new Date(k).getTime(); if (t === tgt) continue;
        const tn = prev[k]?.teamNames;
        if (tn && tn.A && tn.B && tn.C) { donor = tn as any; break; }
      }
      const useTN = donor || globalTeamNames;
      if (base.teamNames &&
          base.teamNames.A === useTN.A &&
          base.teamNames.B === useTN.B &&
          base.teamNames.C === useTN.C) return prev;
      return { ...prev, [key]: { ...base, teamNames: { A: useTN.A, B: useTN.B, C: useTN.C } } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate, globalTeamNames]);

  // helpers
  const patchSession = (patch: Partial<Session>) => {
    if (readonly) return;
    setSessionsByDate(prev => {
      const key = ensureSunday(sessionDate);
      const base = prev[key] ?? emptySession();
      const next: Session = { ...base, ...patch };
      if (JSON.stringify(base) === JSON.stringify(next)) return prev;
      return { ...prev, [key]: next };
    });
  };
  const addPlayer = (name: string) => {
    if (readonly) return;
    const nm = name.trim(); if (!nm) return;
    if (players.some(p => p.name === nm)) return alert("이미 있는 이름입니다");
    setPlayers(prev => [...prev, { id: uid(), name: nm, active: true, pos: "필드" }]);
  };
  const updateTeamName = (tid: TeamId, nm: string) => patchSession({ teamNames: { ...(cur.teamNames || (globalTeamNames as any)), [tid]: nm } as any });
  const toggleRoster = (tid: TeamId, pid: string) => patchSession({
    rosters: (() => {
      const r = { ...(cur.rosters || { A: [], B: [], C: [] }) };
      const list = asArray(r[tid], []);
      r[tid] = list.includes(pid) ? list.filter(id => id !== pid) : [...list, pid];
      return r;
    })()
  });
  const addMatch = () => {
    let maxSeq = 0; asArray(cur.matches, []).forEach(m => { if (m.seq && m.seq > maxSeq) maxSeq = m.seq; });
    const nextSeq = maxSeq + 1;
    patchSession({ matches: [...asArray(cur.matches, []), { id: uid(), seq: nextSeq, home: "A", away: "B", hg: 0, ag: 0, gkHome: null, gkAway: null }] });
  };
  const updateMatch = (id: string, patch: Partial<Match>) => patchSession({ matches: asArray(cur.matches, []).map(m => m.id === id ? { ...m, ...patch } : m) });
  const deleteMatch = (id: string) => patchSession({ matches: asArray(cur.matches, []).filter(m => m.id !== id) });
  const setDef = (tid: TeamId, pid: string | null) => patchSession({ defAwards: { ...(cur.defAwards || { A: null, B: null, C: null }), [tid]: pid } });
  const setMatchStat = (mid: string, pid: string, field: "goals" | "assists", value: number) => {
    if (readonly) return;
    const row = { ...(cur.matchStats?.[mid] || {}) } as MatchStats;
    const curv = row[pid] || { goals: 0, assists: 0 };
    row[pid] = { ...curv, [field]: value } as any;
    patchSession({ matchStats: { ...cur.matchStats, [mid]: row } });
  };
  const setNotes = (txt: string) => patchSession({ notes: txt });

  function calcScores(session: Session) {
    const out: Record<string, any> = {};
    const teamNamesUse = session.teamNames || globalTeamNames;
    const teamOf = (pid: string): TeamId | "-" => (session.rosters.A || []).includes(pid) ? "A" : (session.rosters.B || []).includes(pid) ? "B" : (session.rosters.C || []).includes(pid) ? "C" : "-";
    const standings = computeStandings(session.matches);
    const teamBonus = computeTeamBonus(standings);

    asArray(session.matches, []).forEach(m => {
      const ms = session.matchStats?.[m.id] || {};
      Object.entries(ms).forEach(([pid, s]) => {
        const team = teamOf(pid);
        const base = out[pid] || { goals: 0, assists: 0, cleansheets: 0 };
        const gg = asNumber((s as any).goals, 0);
        const aa = asNumber((s as any).assists, 0);
        out[pid] = { goals: base.goals + gg, assists: base.assists + aa, cleansheets: base.cleansheets, team };
      });

      const gkPick = (tid: TeamId) => {
        if (tid === m.home && m.gkHome) return [m.gkHome];
        if (tid === m.away && m.gkAway) return [m.gkAway];
        const ids = asArray(session.rosters[tid], []);
        const one = ids.find(pid => (players.find(p => p.id === pid)?.pos || "필드") === "GK");
        return one ? [one] : [];
      };
      if (asNumber(m.ag, 0) === 0) {
        gkPick(m.home).forEach(pid => {
          const b = out[pid] || { goals: 0, assists: 0, cleansheets: 0, team: m.home };
          out[pid] = { ...b, cleansheets: (b.cleansheets || 0) + 1, team: m.home };
        });
      }
      if (asNumber(m.hg, 0) === 0) {
        gkPick(m.away).forEach(pid => {
          const b = out[pid] || { goals: 0, assists: 0, cleansheets: 0, team: m.away };
          out[pid] = { ...b, cleansheets: (b.cleansheets || 0) + 1, team: m.away };
        });
      }
    });

    TEAM_IDS.forEach(tid => asArray(session.rosters[tid], []).forEach(pid => { if (!out[pid]) out[pid] = { goals: 0, assists: 0, cleansheets: 0, team: tid }; }));

    Object.keys(out).forEach(pid => {
      const team = out[pid].team as TeamId | "-";
      const def = team !== "-" && (session.defAwards?.[team] || null) === pid ? 2 : 0;
      const tb = team !== "-" ? (teamBonus[team] || 0) : 0;
      const total = out[pid].goals + out[pid].assists + out[pid].cleansheets + def + tb;
      out[pid] = { ...out[pid], def, teamBonus: tb, total, name: players.find(p => p.id === pid)?.name || "?", teamName: team === "-" ? "-" : (teamNamesUse as any)[team] };
    });
    return out;
  }

  const dailyScores = useMemo(() => calcScores(cur), [cur, players, globalTeamNames]);
  const sortedDaily = useMemo(
    () => Object.entries(dailyScores).map(([pid, v]: any) => ({ id: pid, ...v })).sort((a, b) => b.total - a.total || compareKo(a.name, b.name)),
    [dailyScores, compareKo]
  );

  const cumulativeScores = useMemo(() => {
    const agg: Record<string, any> = {};
    Object.values(sessionsByDate).forEach(s => {
      const sc = calcScores(s);
      const present = new Set<string>();
      TEAM_IDS.forEach(t => asArray(s.rosters[t], []).forEach(pid => present.add(pid)));
      Object.entries(sc).forEach(([pid, v]: any) => {
        const b = agg[pid] || { goals: 0, assists: 0, cleansheets: 0, def: 0, teamBonus: 0, total: 0, days: 0, name: v.name, teamName: v.teamName };
        agg[pid] = { ...b, goals: b.goals + v.goals, assists: b.assists + v.assists, cleansheets: b.cleansheets + v.cleansheets, def: b.def + v.def, teamBonus: b.teamBonus + v.teamBonus, total: b.total + v.total, days: b.days + (present.has(pid) ? 1 : 0) };
      });
      present.forEach(pid => { if (!agg[pid]) agg[pid] = { goals: 0, assists: 0, cleansheets: 0, def: 0, teamBonus: 0, total: 0, days: 1, name: "?", teamName: "" }; });
    });
    return agg;
  }, [sessionsByDate, players, globalTeamNames]);
  const sortedCumulative = useMemo(
    () => Object.entries(cumulativeScores).map(([pid, v]: any) => ({ id: pid, ...v, average: v.days > 0 ? Math.round((v.total / v.days) * 100) / 100 : 0 })).sort((a, b) => b.total - a.total || compareKo(a.name, b.name)),
    [cumulativeScores, compareKo]
  );

  const matchesSorted = useMemo(() => [...asArray(cur.matches, [])].sort((a, b) => (b.seq || 0) - (a.seq || 0)), [cur.matches]);

  return (<div className="wrap">
    <h1 className="title">골딘 풋살 리그 · 기록/집계</h1>

    <div className="panel">
      {viewerFlag && <span className="badge-view">보기 전용 링크</span>}
      {authed ? <>
        <span className="ok">관리자 모드</span>
        <button onClick={lock}>잠금</button>
        <button onClick={copyViewerLink}>보기 전용 링크 복사</button>
      </> : <>
        <span className="label-strong">관리자 PIN:</span>
        <input type="password" value={pinInput} onChange={e => setPinInput(e.target.value)} placeholder="PIN 입력" />
        <button onClick={unlock}>잠금 해제</button>
        <button onClick={copyViewerLink}>보기 전용 링크 복사</button>
      </>}
    </div>

    <div className="row">
      <label className="label-strong">날짜(일요일만):</label>
      <input type="date" value={uiDate} onChange={e => setSessionDate(ensureSunday(e.target.value))} />
      <span className="hint">일요일이 아니면 같은 주 일요일로 자동 보정</span>
    </div>

    <section className="box">
      <h3>선수 관리</h3>
      <AddPlayer onAdd={(nm) => addPlayer(nm)} disabled={readonly} />
      <div className="hint">선수 명단은 모든 날짜에 공통 적용됩니다.</div>
      <div className="list-scroll">
        {playersSorted.map(p => (
          <div key={p.id} className="row">
            <input value={p.name} onChange={e => readonly ? null : setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))} disabled={readonly} />
            <select value={p.pos} onChange={e => readonly ? null : setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, pos: e.target.value as Player['pos'] } : x))} disabled={readonly}>
              <option value="필드">필드</option><option value="GK">GK</option>
            </select>
            <button onClick={() => readonly ? null : setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))} disabled={readonly}>{p.active ? "활성" : "비활성"}</button>
          </div>
        ))}
      </div>
    </section>

    <section className="box">
      <h3>팀 구성 & 팀명 (이 날짜용)</h3>
      <div className="teams-grid">
        {TEAM_IDS.map(tid => (<div key={tid} className="team-card">
          <div className="row">
            <input value={(cur.teamNames ?? globalTeamNames)[tid]} onChange={e => updateTeamName(tid, e.target.value)} disabled={readonly} />
            <span className="team-id">{tid}</span>
          </div>
          <div className="list-scroll small">
            {activePlayersSorted.map(p => (
              <label key={p.id} className="checkline">
                <input
                  type="checkbox"
                  checked={asArray(cur.rosters[tid], []).includes(p.id)}
                  onChange={() => toggleRoster(tid, p.id)}
                  disabled={readonly}
                />
                {p.name} {p.pos === "GK" && <span className="subtle">(GK)</span>}
              </label>
            ))}
          </div>
          <div className="row">
            <label>수비상(+2): </label>
            <select value={cur.defAwards?.[tid] || ""} onChange={e => setDef(tid, e.target.value || null)} disabled={readonly}>
              <option value="">선택 안 함</option>
              {asArray(cur.rosters[tid], []).map(pid => (<option key={pid} value={pid}>{players.find(p => p.id === pid)?.name || "?"}</option>))}
            </select>
          </div>
        </div>))}
      </div>
    </section>

    <section className="box">
      <h3>경기 결과 (리그전)</h3>
      <div className="row spread">
        <div className="hint">승:3 / 무:1 / 패:0 · 각 경기의 <b>기록</b>에서 선수별 G/A 입력 (CS는 자동)</div>
        <button onClick={addMatch} disabled={readonly}>경기 추가</button>
      </div>
      {matchesSorted.length === 0 && <p className="muted">경기를 추가하세요.</p>}
      <div className="match-list">
        {matchesSorted.map(m => (
          <MatchRow key={m.id} m={m} readonly={readonly} updateMatch={updateMatch} deleteMatch={deleteMatch}
            rosterA={asArray(cur.rosters[m.home], [])} rosterB={asArray(cur.rosters[m.away], [])} players={players}
            values={cur.matchStats?.[m.id] || {}} onChange={(pid, field, val) => setMatchStat(m.id, pid, field, val)} teamNames={(cur.teamNames ?? globalTeamNames)} />
        ))}
      </div>

      <div className="table-wrap">
        <h4>순위표 (팀 보너스: 1위 4 / 2위 2 / 3위 1)</h4>
        <table className="tbl"><thead><tr>
          <th>순위</th><th>팀</th><th>승점</th><th>승</th><th>무</th><th>패</th><th>득점</th><th>실점</th><th>득실</th><th>팀</th>
        </tr></thead><tbody>
          {computeStandings(cur.matches).map((t, idx) => (
            <tr key={t.team}><td>{idx + 1}</td><td>{(cur.teamNames ?? globalTeamNames)[t.team]} <span className="subtle">({t.team})</span></td><td>{t.pts}</td><td>{t.w}</td><td>{t.d}</td><td>{t.l}</td><td>{t.gf}</td><td>{t.ga}</td><td>{t.gd}</td><td className="bold">{computeTeamBonus(computeStandings(cur.matches))[t.team]}</td></tr>
          ))}
        </tbody></table>
      </div>
    </section>

    <section className="box">
      <h3>오늘의 개인 순위</h3>
      <div className="table-wrap">
        <table className="tbl"><thead><tr>
          <th>순위</th><th>선수</th><th>팀</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th>
        </tr></thead><tbody>
          {sortedDaily.map((r: any, idx: number) => (
            <tr key={r.id}><td>{idx + 1}</td><td>{r.name}</td><td>{r.teamName || "-"}</td><td>{r.goals || 0}</td><td>{r.assists || 0}</td><td>{r.cleansheets || 0}</td><td>{r.def || 0}</td><td>{r.teamBonus || 0}</td><td className="bold">{r.total || 0}</td></tr>
          ))}
        </tbody></table>
      </div>
    </section>

    <section className="box">
      <h3>누적 순위 (모든 날짜)</h3>
      <div className="table-wrap">
        <table className="tbl"><thead><tr>
          <th>순위</th><th>선수</th><th>참여</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th><th>평균</th>
        </tr></thead><tbody>
          {sortedCumulative.map((r: any, idx: number) => (
            <tr key={r.id}><td>{idx + 1}</td><td>{r.name}</td><td>{r.days}</td><td>{r.goals}</td><td>{r.assists}</td><td>{r.cleansheets}</td><td>{r.def}</td><td>{r.teamBonus}</td><td className="bold">{r.total}</td><td>{r.average}</td></tr>
          ))}
        </tbody></table>
      </div>
    </section>

    <section className="box">
      <h3>비고 / 메모</h3>
      <textarea value={cur.notes} onChange={e => setNotes(e.target.value)} placeholder="예: 특이사항 등" disabled={readonly} />
    </section>

    <p className="footer">© 골딘 기록앱</p>

    <style>{`
      *, *::before, *::after { box-sizing: border-box; }

      .wrap { max-width: 1100px; margin: 0 auto; padding: 14px; font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", sans-serif; background:#fff; }
      .title { font-size: 22px; font-weight: 800; margin: 4px 0 10px; }
      .panel { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px; border:1px dashed #bbb; border-radius:10px; background:#fafafa; }
      .badge-view { font-size:12px; color:#a00; font-weight:700; }
      .label-strong { font-weight:700; }
      .ok { color:#0a0; font-weight:700; }
      .hint { color:#666; font-size:12px; }
      .muted { color:#777; }
      .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
      .row.spread { justify-content: space-between; }
      .box { border:1px solid #ddd; border-radius:12px; padding:12px; margin-top:12px; background:#fff; }
      .teams-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
      .team-card { border:1px solid #e5e5e5; border-radius:10px; padding:8px; background:#fcfcfc; }
      .team-id { margin-left:auto; font-size:12px; color:#555; }
      .checkline { display:flex; gap:6px; align-items:center; padding:2px 0; }
      .list-scroll { max-height: 280px; overflow:auto; border:1px solid #eee; border-radius:8px; padding:6px; background:#fff; }
      .list-scroll.small { max-height: 200px; }

      .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border:1px solid #eee; border-radius:10px; padding:6px; background:#fff; }
      .tbl { width: 100%; border-collapse: separate; border-spacing: 0; }
      .tbl th, .tbl td { border-bottom:1px solid #eee; padding:8px 10px; text-align:center; }
      .tbl th { background:#f7f7f7; position: sticky; top: 0; z-index: 1; }
      .bold { font-weight:700; }
      .subtle { color:#888; font-size:12px; }
      .card { border:1px solid #eaeaea; border-radius:12px; padding:10px; background:#fff; }
      .match-head { display:grid; grid-template-columns: 72px 1fr auto; gap:10px; align-items:center; }
      .seq { font-weight:800; color:#111; }
      .scoreline { display:grid; grid-template-columns: 1fr 80px 24px 80px 1fr; gap:6px; align-items:center; }
      .scoreline input[type="number"] { text-align:center; }
      .colon { text-align:center; font-weight:700; }
      .head-actions { display:flex; gap:6px; justify-content:flex-end; }
      .danger { color:#a00; }

      .gk-row { display:flex; gap:12px; align-items:center; margin-top:6px; flex-wrap: wrap; }

      .record-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:10px; }
      .team-col { border:1px solid #f0f0f0; border-radius:10px; padding:8px; background:#fcfcff; }
      .team-col-head { font-weight:700; margin-bottom:6px; }

      /* 선수 리스트: 한 줄씩 배치 (모바일도 안정) */
      .players-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }

      /* 카드: 플렉스 + 랩으로 넘침/겹침 방지 */
      .player-card {
        border:1px solid #eee; border-radius:10px; padding:8px; background:#fff;
        display:flex; align-items:center; gap:10px; flex-wrap: wrap;
      }
      .player-name { flex:1 1 220px; min-width: 160px; font-weight:600; }
      .pos { color:#999; font-size:12px; }

      /* G/A 묶음 */
      .stat { display:inline-flex; align-items:center; gap:6px; }
      .stat-label { font-weight:600; color:#666; }
      .stat-input {
        width: 72px; height: 40px; padding: 6px 8px;
        border: 1px solid #ccc; border-radius: 8px; text-align:center;
        font-size:16px; /* iOS 줌 방지 */
      }

      input, select, textarea, button {
        padding: 8px 10px; border: 1px solid #ccc; border-radius: 8px; background:#fff;
        font-size:16px; /* iOS 자동줌 방지 */
      }
      button { background:#f1f1f1; cursor:pointer; }
      button:hover { filter: brightness(0.97); }
      textarea { width:100%; min-height: 80px; }

      /* 모바일 UI 개선 */
      @media (max-width: 900px) {
        .scoreline { grid-template-columns: 1fr 68px 20px 68px 1fr; }
      }
      @media (max-width: 720px) {
        .teams-grid { grid-template-columns: 1fr; }
        .record-grid { grid-template-columns: 1fr; }
        .table-wrap { border: none; padding: 0; }
        .tbl th, .tbl td { border-bottom: 1px solid #eee; }
        .tbl tr:last-child td { border-bottom: none; }
        .card { box-shadow: 0 1px 4px rgba(0,0,0,0.06); border: 1px solid #eee; }
        .box { border: 1px solid #eee; }
        .match-head { grid-template-columns: 64px 1fr auto; }
        .player-name { flex-basis: 100%; } /* 이름은 위 줄로 */
      }
      @media (max-width: 380px) {
        .stat-input { width: 64px; }        /* 극소폭 보정 */
        .player-card { gap:8px; }
      }
    `}</style>
  </div>);
}

function AddPlayer({ onAdd, disabled }: { onAdd: (name: string) => void; disabled?: boolean }) {
  const [name, setName] = useState("");
  return (<div className="row">
    <input placeholder="이름" value={name} onChange={e => setName(e.target.value)}
           onKeyDown={e => { if (e.key === "Enter" && !disabled) { onAdd(name); setName(""); } }}
           disabled={disabled} />
    <button onClick={() => { if (!disabled) { onAdd(name); setName(""); } }} disabled={disabled}>추가</button>
  </div>);
}
