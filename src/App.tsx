import React, { useEffect, useMemo, useState } from "react";
import { useRealtimeJsonState } from "./lib/realtimeStore";

/**
 * 골딘 풋살 리그 · App (전체본)
 * - 날짜별 팀명 저장/적용(드롭다운 반영)
 * - 경기 추가: 1~3 패턴 반복(4=1, 5=2, 6=3 …)
 * - 팀 변경 시 GK 자동선택(그 팀 GK 1명뿐이면), 단 “선택 안 함” 유지 가능
 * - 경기 기록 선수 목록: 가나다 정렬 + GK 맨 아래
 * - 선수 관리: 이름 입력칸 절반 크기
 * - 오늘/누적 순위, 메모
 * - Supabase Realtime + localStorage 백업, 깜빡임 최소화
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

// ✅ 기존 전체 선수 명단 유지
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

function emptySession(): Session {
  return { rosters: { A: [], B: [], C: [] }, matches: [], matchStats: {}, defAwards: { A: null, B: null, C: null }, teamNames: undefined, notes: "" };
}

function computeStandings(matchesInput: Match[] | null | undefined) {
  const matches = asArray<Match>(matchesInput, []);
  const t: Record<TeamId, { team: TeamId; pts: number; gf: number; ga: number; gd: number; w: number; d: number; l: number }> = {
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
  return Object.values(t).sort((a, b) => b.pts - a.pts || b.gd - a.gd || b.gf - a.gf || a.team.localeCompare(b.team, "ko"));
}
function computeTeamBonus(st: ReturnType<typeof computeStandings>[number][]): Record<TeamId, number> {
  const map: Record<TeamId, number> = { A: 0, B: 0, C: 0 };
  st.map(s => s.team).forEach((tid, i) => map[tid] = i === 0 ? 4 : i === 1 ? 2 : 1);
  return map;
}

export default function App() {
  const today = ensureSunday(toISO(new Date()));
  const fallback: PersistShape = {
    players: (DEFAULT_PLAYERS as any).map((p: any) => ({ id: uid(), name: p.name, active: true, pos: p.pos })),
    teamNames: { A: "팀 A", B: "팀 B", C: "팀 C" },
    sessionsByDate: { [today]: emptySession() },
    sessionDate: today
  };

  const [players, setPlayers] = useState<Player[]>(fallback.players);
  const [globalTeamNames, setGlobalTeamNames] = useState<Record<TeamId, string>>(fallback.teamNames);
  const [sessionDate, setSessionDate] = useState<string>(fallback.sessionDate);
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session>>(fallback.sessionsByDate);

  // Supabase Realtime: cloud <-> local sync
  const { value: cloud, setValue: setCloud, ready } = useRealtimeJsonState<PersistShape>(fallback, { id: "main" });

  // 처음 로드
  useEffect(() => {
    if (!ready || !cloud) return;
    setPlayers(cloud.players);
    setGlobalTeamNames(cloud.teamNames);
    setSessionsByDate(cloud.sessionsByDate);
    setSessionDate(cloud.sessionDate);
  }, [cloud, ready]);

  // 변경 동기화
  useEffect(() => {
    const s = { players, teamNames: globalTeamNames, sessionsByDate, sessionDate: ensureSunday(sessionDate) };
    if (ready) setCloud(s);
  }, [players, globalTeamNames, sessionsByDate, sessionDate, ready, setCloud]);

  const cur: Session = useMemo(() => sessionsByDate[ensureSunday(sessionDate)] ?? emptySession(), [sessionsByDate, sessionDate]);
  const effectiveTeamNames: Record<TeamId, string> = cur.teamNames ?? globalTeamNames;

  // 가나다 정렬 + GK 맨 아래
  const collate = useMemo(() => new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true, ignorePunctuation: true }).compare, []);
  const playersSorted = useMemo(() => {
    const f = players.filter(p => p.pos !== "GK").sort((a, b) => collate(a.name, b.name));
    const g = players.filter(p => p.pos === "GK").sort((a, b) => collate(a.name, b.name));
    return [...f, ...g];
  }, [players, collate]);

  // 공통 헬퍼
  const patchSession = (patch: Partial<Session>) => {
    setSessionsByDate(prev => {
      const key = ensureSunday(sessionDate);
      const base = prev[key] ?? emptySession();
      return { ...prev, [key]: { ...base, ...patch } };
    });
  };

  // 날짜별 팀명 초기화(최초엔 글로벌/직전 날짜 복사)
  useEffect(() => {
    const key = ensureSunday(sessionDate);
    setSessionsByDate(prev => {
      const base = prev[key] ?? emptySession();
      if (base.teamNames?.A && base.teamNames?.B && base.teamNames?.C) return prev;
      // 직전 날짜에서 복사 or 글로벌
      let donor: Record<TeamId, string> | null = null;
      const keys = Object.keys(prev).sort();
      const tgt = new Date(key).getTime();
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i]; const t = new Date(k).getTime(); if (t === tgt) continue;
        const tn = prev[k]?.teamNames;
        if (tn?.A && tn?.B && tn?.C) { donor = tn as any; break; }
      }
      const useTN = donor || globalTeamNames;
      return { ...prev, [key]: { ...base, teamNames: { A: useTN.A, B: useTN.B, C: useTN.C } } };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionDate]);

  // 경기 추가: 1~3 패턴 반복 + GK 1명이면 초기 자동
  const addMatch = () => {
    let maxSeq = 0; asArray(cur.matches, []).forEach(m => { if (m.seq && m.seq > maxSeq) maxSeq = m.seq; });
    const nextSeq = maxSeq + 1;
    const baseMatches: [TeamId, TeamId][] = [["A","B"],["A","C"],["B","C"]];
    const [home, away] = baseMatches[(nextSeq - 1) % 3];

    const pickOneGKFromCur = (tid: TeamId): string | null => {
      const ids = asArray(cur.rosters[tid], []);
      const gkIds = ids.filter(pid => (players.find(p => p.id === pid)?.pos) === "GK");
      return gkIds.length === 1 ? gkIds[0] : null;
    };

    patchSession({
      matches: [
        ...asArray(cur.matches, []),
        { id: uid(), seq: nextSeq, home, away, hg: 0, ag: 0, gkHome: pickOneGKFromCur(home), gkAway: pickOneGKFromCur(away) },
      ],
    });
  };

  // 팀 변경 시 GK 자동선택(그 팀 GK 1명뿐이면), “선택 안 함” 유지
  const updateMatch = (id: string, patch: Partial<Match>) => {
    patchSession({
      matches: asArray(cur.matches, []).map(m => {
        if (m.id !== id) return m;
        const next = { ...m, ...patch };

        const pickOneGK = (tid: TeamId): string | null => {
          const ids = asArray(cur.rosters[tid], []);
          const gkIds = ids.filter(pid => (players.find(p => p.id === pid)?.pos) === "GK");
          return gkIds.length === 1 ? gkIds[0] : null;
        };

        if (patch.hasOwnProperty("gkHome") && next.gkHome === "") next.gkHome = null;
        if (patch.hasOwnProperty("gkAway") && next.gkAway === "") next.gkAway = null;

        if (patch.home !== undefined && !next.gkHome) next.gkHome = pickOneGK(next.home);
        if (patch.away !== undefined && !next.gkAway) next.gkAway = pickOneGK(next.away);

        return next;
      }),
    });
  };

  const deleteMatch = (id: string) => patchSession({ matches: asArray(cur.matches, []).filter(m => m.id !== id) });
  const setDef = (tid: TeamId, pid: string | null) => patchSession({ defAwards: { ...(cur.defAwards || { A: null, B: null, C: null }), [tid]: pid } });
  const setMatchStat = (mid: string, pid: string, field: "goals" | "assists", value: number) => {
    const row = { ...(cur.matchStats?.[mid] || {}) } as MatchStats;
    const curv = row[pid] || { goals: 0, assists: 0 };
    row[pid] = { ...curv, [field]: value } as any;
    patchSession({ matchStats: { ...cur.matchStats, [mid]: row } });
  };

  // 집계
  const standings = useMemo(() => computeStandings(cur.matches), [cur.matches]);
  const teamBonusMap = useMemo(() => computeTeamBonus(standings), [standings]);

  function calcScores(session: Session) {
    const out: Record<string, any> = {};
    const teamNamesUse = session.teamNames || globalTeamNames;
    const teamOf = (pid: string): TeamId | "-" =>
      (session.rosters.A || []).includes(pid) ? "A" :
      (session.rosters.B || []).includes(pid) ? "B" :
      (session.rosters.C || []).includes(pid) ? "C" : "-";

    asArray(session.matches, []).forEach(m => {
      const ms = session.matchStats?.[m.id] || {};
      Object.entries(ms).forEach(([pid, s]) => {
        const base = out[pid] || { goals: 0, assists: 0, cleansheets: 0 };
        out[pid] = { goals: base.goals + asNumber((s as any).goals, 0), assists: base.assists + asNumber((s as any).assists, 0), cleansheets: base.cleansheets };
      });
      if (asNumber(m.ag, 0) === 0 && m.gkHome) {
        const b = out[m.gkHome] || { goals: 0, assists: 0, cleansheets: 0 };
        out[m.gkHome] = { ...b, cleansheets: (b.cleansheets || 0) + 1 };
      }
      if (asNumber(m.hg, 0) === 0 && m.gkAway) {
        const b = out[m.gkAway] || { goals: 0, assists: 0, cleansheets: 0 };
        out[m.gkAway] = { ...b, cleansheets: (b.cleansheets || 0) + 1 };
      }
    });

    TEAM_IDS.forEach(tid => asArray(session.rosters[tid], []).forEach(pid => { if (!out[pid]) out[pid] = { goals: 0, assists: 0, cleansheets: 0 }; }));

    Object.keys(out).forEach(pid => {
      const team = teamOf(pid);
      const def = team !== "-" && (session.defAwards?.[team] || null) === pid ? 2 : 0;
      const tb = team !== "-" ? (teamBonusMap[team] || 0) : 0;
      const total = out[pid].goals + out[pid].assists + out[pid].cleansheets + def + tb;
      out[pid] = { ...out[pid], def, teamBonus: tb, total, name: players.find(p => p.id === pid)?.name || "?", teamName: team === "-" ? "-" : teamNamesUse[team] };
    });
    return out;
  }

  const dailyScores = useMemo(() => calcScores(cur), [cur, players, globalTeamNames, teamBonusMap]);
  const sortedDaily = useMemo(() => Object.entries(dailyScores).map(([pid, v]: any) => ({ id: pid, ...v })).sort((a, b) => b.total - a.total || collate(a.name, b.name)), [dailyScores, collate]);

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
      present.forEach(pid => { if (!agg[pid]) agg[pid] = { goals: 0, assists: 0, def: 0, teamBonus: 0, total: 0, days: 1, name: "?", teamName: "" }; });
    });
    return agg;
  }, [sessionsByDate, players, globalTeamNames, teamBonusMap]);
  const sortedCumulative = useMemo(() => Object.entries(cumulativeScores).map(([pid, v]: any) => ({ id: pid, ...v, average: v.days > 0 ? Math.round((v.total / v.days) * 100) / 100 : 0 })).sort((a, b) => b.total - a.total || collate(a.name, b.name)), [cumulativeScores, collate]);

  const matchesSorted = useMemo(() => [...asArray(cur.matches, [])].sort((a, b) => (b.seq || 0) - (a.seq || 0)), [cur.matches]);

  return (
    <div className="wrap">
      <h1 className="title">골딘 풋살 리그 · 기록/집계</h1>

      {/* 상단 패널 */}
      <div className="panel">
        <div className="row">
          <label className="label-strong">날짜(일요일만):</label>
          <input type="date" value={sessionDate} onChange={e => setSessionDate(ensureSunday(e.target.value))} />
          <span className="hint">일요일이 아니면 같은 주 일요일로 자동 보정</span>
        </div>
      </div>

      {/* 선수 관리 */}
      <section className="box">
        <h3>선수 관리</h3>
        <AddPlayer onAdd={(nm) => {
          const name = nm.trim(); if (!name) return;
          if (players.some(p => p.name === name)) return alert("이미 있는 이름입니다");
          setPlayers(prev => [...prev, { id: uid(), name, active: true, pos: "필드" }]);
        }} />
        <div className="hint">선수 명단은 모든 날짜에 공통 적용됩니다.</div>
        <div className="list-scroll">
          {playersSorted.map(p => (
            <div key={p.id} className="row">
              <input className="player-name-input" value={p.name} onChange={e => setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))} />
              <select value={p.pos} onChange={e => setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, pos: e.target.value as Player["pos"] } : x))}>
                <option value="필드">필드</option><option value="GK">GK</option>
              </select>
              <button onClick={() => setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))}>{p.active ? "활성" : "비활성"}</button>
            </div>
          ))}
        </div>
      </section>

      {/* 팀 구성 & 팀명 */}
      <section className="box">
        <h3>팀 구성 & 팀명 (이 날짜용)</h3>
        <div className="teams-grid">
          {TEAM_IDS.map(tid => (
            <div key={tid} className="team-card">
              <div className="row">
                <input
                  value={(cur.teamNames ?? globalTeamNames)[tid]}
                  onChange={e => patchSession({ teamNames: { ...(cur.teamNames ?? globalTeamNames), [tid]: e.target.value } })}
                />
                <span className="team-id">{tid}</span>
              </div>
              <div className="list-scroll small">
                {playersSorted.filter(p => p.active).map(p => (
                  <label key={p.id} className="checkline">
                    <input
                      type="checkbox"
                      checked={asArray(cur.rosters[tid], []).includes(p.id)}
                      onChange={() => {
                        const r = { ...(cur.rosters || { A: [], B: [], C: [] }) };
                        const list = asArray(r[tid], []);
                        r[tid] = list.includes(p.id) ? list.filter(id => id !== p.id) : [...list, p.id];
                        patchSession({ rosters: r });
                      }}
                    />
                    {p.name} {p.pos === "GK" && <span className="subtle">(GK)</span>}
                  </label>
                ))}
              </div>
              <div className="row">
                <label>수비상(+2): </label>
                <select
                  value={cur.defAwards?.[tid] || ""}
                  onChange={e => patchSession({ defAwards: { ...(cur.defAwards || { A: null, B: null, C: null }), [tid]: e.target.value || null } })}
                >
                  <option value="">선택 안 함</option>
                  {asArray(cur.rosters[tid], []).map(pid => (<option key={pid} value={pid}>{players.find(p => p.id === pid)?.name || "?"}</option>))}
                </select>
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* 경기 결과 */}
      <section className="box">
        <h3>경기 결과 (리그전)</h3>
        <div className="row spread">
          <div className="hint">승:3 / 무:1 / 패:0 · 각 경기의 <b>기록</b>에서 선수별 G/A 입력 (CS는 자동)</div>
          <button onClick={addMatch}>경기 추가</button>
        </div>

        {matchesSorted.length === 0 && <p className="muted">경기를 추가하세요.</p>}

        <div className="match-list">
          {matchesSorted.map(m => (
            <MatchRow
              key={m.id}
              m={m}
              readonly={false}
              updateMatch={updateMatch}
              deleteMatch={(id: string) => deleteMatch(id)}
              rosterA={asArray(cur.rosters[m.home], [])}
              rosterB={asArray(cur.rosters[m.away], [])}
              players={players}
              values={cur.matchStats?.[m.id] || {}}
              onChange={(pid, field, val) => setMatchStat(m.id, pid, field, val)}
              teamNames={effectiveTeamNames}
            />
          ))}
        </div>

        <div className="table-wrap">
          <h4>순위표 (팀 보너스: 1위 4 / 2위 2 / 3위 1)</h4>
          <table className="tbl"><thead><tr>
            <th>순위</th><th>팀</th><th>승점</th><th>승</th><th>무</th><th>패</th><th>득점</th><th>실점</th><th>득실</th><th>팀</th>
          </tr></thead><tbody>
            {computeStandings(cur.matches).map((t, idx) => (
              <tr key={t.team}><td>{idx + 1}</td>
                <td>{(cur.teamNames ?? globalTeamNames)[t.team]} <span className="subtle">({t.team})</span></td>
                <td>{t.pts}</td><td>{t.w}</td><td>{t.d}</td><td>{t.l}</td>
                <td>{t.gf}</td><td>{t.ga}</td><td>{t.gd}</td>
                <td className="bold">{computeTeamBonus(computeStandings(cur.matches))[t.team]}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>

      {/* 오늘의 개인 순위 */}
      <section className="box">
        <h3>오늘의 개인 순위</h3>
        <div className="table-wrap">
          <table className="tbl"><thead><tr>
            <th>순위</th><th>선수</th><th>팀</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th>
          </tr></thead><tbody>
            {sortedDaily.map((r: any, idx: number) => (
              <tr key={r.id}><td>{idx + 1}</td><td>{r.name}</td><td>{r.teamName || "-"}</td>
                <td>{r.goals || 0}</td><td>{r.assists || 0}</td><td>{r.cleansheets || 0}</td>
                <td>{r.def || 0}</td><td>{r.teamBonus || 0}</td><td className="bold">{r.total || 0}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>

      {/* 누적 순위 */}
      <section className="box">
        <h3>누적 순위 (모든 날짜)</h3>
        <div className="table-wrap">
          <table className="tbl"><thead><tr>
            <th>순위</th><th>선수</th><th>참여</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th><th>평균</th>
          </tr></thead><tbody>
            {Object.entries(sortedCumulative).map(([_, r]: any, idx: number) => (
              <tr key={r.id}><td>{idx + 1}</td><td>{r.name}</td><td>{r.days}</td>
                <td>{r.goals}</td><td>{r.assists}</td><td>{r.cleansheets}</td><td>{r.def}</td>
                <td>{r.teamBonus}</td><td className="bold">{r.total}</td><td>{r.average}</td>
              </tr>
            ))}
          </tbody></table>
        </div>
      </section>

      {/* 메모 */}
      <section className="box">
        <h3>비고 / 메모</h3>
        <textarea value={cur.notes} onChange={e => patchSession({ notes: e.target.value })} placeholder="예: 특이사항 등" />
      </section>

      <p className="footer">© 골딘 기록앱</p>

      <style>{`
        *, *::before, *::after { box-sizing: border-box; }
        .wrap { max-width: 1100px; margin: 0 auto; padding: 14px; font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", sans-serif; background:#fff; }
        .title { font-size: 22px; font-weight: 800; margin: 4px 0 10px; }
        .panel { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px; border:1px dashed #bbb; border-radius:10px; background:#fafafa; }
        .label-strong { font-weight:700; }
        .hint { color:#666; font-size:12px; }
        .muted { color:#777; }
        .subtle { color:#888; font-size:12px; }
        .bold { font-weight:700; }

        .box { border:1px solid #ddd; border-radius:12px; padding:12px; margin-top:12px; background:#fff; }
        .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
        .row.spread { justify-content: space-between; }

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

        .match-list .card { border:1px solid #eaeaea; border-radius:12px; padding:10px; background:#fff; overflow:hidden; margin:8px 0; }
        .match-head { display:grid; grid-template-columns: 72px 1fr auto; gap:10px; align-items:center; }
        .seq { font-weight:800; color:#111; }
        .scoreline { display:grid; grid-template-columns: 1fr 80px 24px 80px 1fr; gap:6px; align-items:center; }
        .scoreline input[type="number"] { text-align:center; }
        .colon { text-align:center; font-weight:700; }
        .gk-row { display:flex; gap:12px; align-items:center; margin-top:6px; flex-wrap: wrap; }

        .record-grid { display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-top:10px; }
        .team-col { border:1px solid #f0f0f0; border-radius:10px; padding:8px; background:#fcfcff; }
        .team-col-head { font-weight:700; margin-bottom:6px; }
        .players-grid { display:grid; grid-template-columns: 1fr; gap:8px; }
        .player-card { border:1px solid #eee; border-radius:10px; padding:8px; background:#fff; display:flex; align-items:center; gap:10px; flex-wrap: wrap; }
        .player-name { flex:1 1 220px; min-width: 160px; font-weight:600; }
        .pos { color:#999; font-size:12px; }

        /* 이름 입력칸 절반 크기 */
        .player-name-input { width: 160px; max-width: 45vw; }

        @media (max-width: 900px) { .scoreline { grid-template-columns: 1fr 68px 20px 68px 1fr; } }
        @media (max-width: 480px) {
          .match-head { grid-template-columns: 1fr; row-gap: 8px; }
          .scoreline { grid-template-columns: minmax(0,1fr) 56px 14px 56px minmax(0,1fr); }
          .gk-row { gap: 8px; }
          .player-name { flex-basis: 100%; }
        }
        @media (max-width: 360px) {
          .scoreline { grid-template-columns: minmax(0,1fr) 50px 12px 50px minmax(0,1fr); }
        }
      `}</style>
    </div>
  );
}

/* ---------------- MatchRow ---------------- */
function MatchRow({
  m, readonly, updateMatch, deleteMatch, rosterA, rosterB, players, values, onChange, teamNames
}: {
  m: Match; readonly: boolean; updateMatch: (id: string, patch: Partial<Match>) => void; deleteMatch: (id: string) => void;
  rosterA: string[]; rosterB: string[]; players: Player[]; values: MatchStats;
  onChange: (pid: string, field: "goals" | "assists", value: number) => void;
  teamNames: Record<TeamId, string>;
}) {
  const [open, setOpen] = useState(false);

  // 가나다 정렬 + GK 맨 아래
  const collate = useMemo(() => new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true, ignorePunctuation: true }).compare, []);
  const sortRoster = (ids: string[]) => {
    const list = ids.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    const field = list.filter(p => p.pos !== "GK").sort((a, b) => collate(a.name, b.name));
    const gks = list.filter(p => p.pos === "GK").sort((a, b) => collate(a.name, b.name));
    return [...field, ...gks].map(p => p.id);
  };
  const rosterA_sorted = sortRoster(asArray(rosterA, []));
  const rosterB_sorted = sortRoster(asArray(rosterB, []));

  const name = (pid: string) => players.find(p => p.id === pid)?.name || "?";
  const pos = (pid: string) => players.find(p => p.id === pid)?.pos || "필드";

  return (
    <div className="card">
      <div className="match-head">
        <div className="seq">{m.seq}경기</div>

        <div className="scoreline">
          <select value={m.home} onChange={e => updateMatch(m.id, { home: e.target.value as TeamId })} disabled={readonly}>
            <option value="A">{teamNames["A"]} (A)</option>
            <option value="B">{teamNames["B"]} (B)</option>
            <option value="C">{teamNames["C"]} (C)</option>
          </select>
          <input type="number" value={m.hg} onChange={e => updateMatch(m.id, { hg: +e.target.value || 0 })} disabled={readonly} />
          <div className="colon">:</div>
          <input type="number" value={m.ag} onChange={e => updateMatch(m.id, { ag: +e.target.value || 0 })} disabled={readonly} />
          <select value={m.away} onChange={e => updateMatch(m.id, { away: e.target.value as TeamId })} disabled={readonly}>
            <option value="A">{teamNames["A"]} (A)</option>
            <option value="B">{teamNames["B"]} (B)</option>
            <option value="C">{teamNames["C"]} (C)</option>
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
            {asArray(rosterA_sorted, []).filter(pid => (players.find(p => p.id === pid)?.pos || "필드") === "GK").map(pid => (
              <option key={pid} value={pid}>{name(pid)}</option>
            ))}
          </select>
        </div>
        <div><div className="subtle">원정 GK</div>
          <select value={m.gkAway || ""} onChange={e => updateMatch(m.id, { gkAway: e.target.value || null })} disabled={readonly}>
            <option value="">선택 안 함</option>
            {asArray(rosterB_sorted, []).filter(pid => (players.find(p => p.id === pid)?.pos || "필드") === "GK").map(pid => (
              <option key={pid} value={pid}>{name(pid)}</option>
            ))}
          </select>
        </div>
      </div>

      {open && (<div className="record-grid">
        <div className="team-col">
          <div className="team-col-head">{teamNames[m.home]} <span className="subtle">({m.home})</span></div>
          <div className="players-grid">
            {asArray(rosterA_sorted, []).map(pid => {
              const v = values[pid] || { goals: 0, assists: 0 };
              return (<div key={pid} className="player-card">
                <div className="player-name">{name(pid)} <span className="pos">({pos(pid)})</span></div>
                <label>G</label><input type="number" value={v.goals} onChange={e => onChange(pid, "goals", +e.target.value || 0)} disabled={readonly} />
                <label>A</label><input type="number" value={v.assists} onChange={e => onChange(pid, "assists", +e.target.value || 0)} disabled={readonly} />
              </div>);
            })}
          </div>
        </div>
        <div className="team-col">
          <div className="team-col-head">{teamNames[m.away]} <span className="subtle">({m.away})</span></div>
          <div className="players-grid">
            {asArray(rosterB_sorted, []).map(pid => {
              const v = values[pid] || { goals: 0, assists: 0 };
              return (<div key={pid} className="player-card">
                <div className="player-name">{name(pid)} <span className="pos">({pos(pid)})</span></div>
                <label>G</label><input type="number" value={v.goals} onChange={e => onChange(pid, "goals", +e.target.value || 0)} disabled={readonly} />
                <label>A</label><input type="number" value={v.assists} onChange={e => onChange(pid, "assists", +e.target.value || 0)} disabled={readonly} />
              </div>);
            })}
          </div>
        </div>
      </div>)}
    </div>
  );
}

/* ---------------- Sub: AddPlayer ---------------- */
function AddPlayer({ onAdd }: { onAdd: (name: string) => void }) {
  const [name, setName] = useState("");
  return (<div className="row">
    <input
      className="player-name-input"  // 입력칸 절반 크기
      placeholder="이름"
      value={name}
      onChange={e => setName(e.target.value)}
      onKeyDown={e => { if (e.key === "Enter") { onAdd(name); setName(""); } }}
    />
    <button onClick={() => { onAdd(name); setName(""); }}>추가</button>
  </div>);
}
