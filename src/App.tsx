/* App.tsx — 유니폼 포메이션, GK 규칙, 조끼색 선택 반영 완성본
   - 요구사항(1~5) 전부 반영
   - 기존 구조: 플레이어/세션/매치/통계/랭킹 유지
*/

import React, { useEffect, useMemo, useRef, useState } from "react";
import { useRealtimeJsonState } from "./lib/realtimeStore";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
  LineChart, Line, CartesianGrid
} from "recharts";

/* ====== 공통 타입/유틸 ====== */
const TEAM_IDS = ["A", "B", "C"] as const;
type TeamId = typeof TEAM_IDS[number];
type FormationKey = "1-2-1" | "2-2" | "3-1" | "1-2" | "2-2-1";

type Player = { id: string; name: string; active: boolean; pos: "필드" | "GK" };
type Match = {
  id: string;
  seq: number;
  home: TeamId;
  away: TeamId;
  hg: number;
  ag: number;
  gkHome?: string | null;
  gkAway?: string | null;
};
type MatchStats = Record<string, { goals: number; assists: number; cleansheets?: number }>;
type Session = {
  rosters: Record<TeamId, string[]>;
  matches: Match[];
  matchStats: Record<string, MatchStats>;
  defAwards: Record<TeamId, string | null>;
  teamNames?: Record<TeamId, string>;
  notes: string;
  rosterViewConfirmed?: Record<TeamId, boolean>;
  formations?: Record<TeamId, FormationKey>;
  teamColors?: Record<TeamId, JerseyColor>; // ✅ 팀별 조끼색 선택 저장
};
type PersistShape = {
  players: Player[];
  teamNames: Record<TeamId, string>;
  sessionsByDate: Record<string, Session>;
  sessionDate: string;
};

type JerseyColor = "red" | "yellow" | "white";

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
    const t = new Date(); const add = (7 - t.getDay()) % 7;
    return toISO(new Date(t.getTime() + add * DAY_MS));
  }
  const add = (7 - d.getDay()) % 7;
  return toISO(new Date(d.getTime() + add * DAY_MS));
};
const asArray = <T = any,>(v: any, def: T[] = []) => (Array.isArray(v) ? (v as T[]) : def);
const asNumber = (v: any, def = 0) => { const n = Number(v); return Number.isFinite(n) ? n : def; };
const isTeamId = (v: any): v is TeamId => v === "A" || v === "B" || v === "C";

const LS_KEY = "goldin_futsal_app_main_v16"; // 버전 업
const SS_PIN_AUTHED = "goldin_futsal_admin_authed";
const FIXED_PIN_HASH = "350c94d619f6aba3379500ff11bfcca6e58b0afe5b3624d0ad56fa607845e38c"; // sha256("8347")

/* 조끼 색 기본값 (요청 #5) */
const DEFAULT_TEAM_COLORS: Record<TeamId, JerseyColor> = { A: "red", B: "yellow", C: "white" };

/* ====== 세션 초기화/로드 ====== */
function emptySession(): Session {
  return {
    rosters: { A: [], B: [], C: [] },
    matches: [],
    matchStats: {},
    defAwards: { A: null, B: null, C: null },
    teamNames: undefined,
    notes: "",
    rosterViewConfirmed: { A: false, B: false, C: false },
    formations: { A: "1-2-1", B: "1-2-1", C: "1-2-1" },
    teamColors: { ...DEFAULT_TEAM_COLORS },
  };
}

function normalizeLoaded(data: any): PersistShape {
  const today = ensureSunday(toISO(new Date()));
  let players = asArray<any>(data?.players, []).map((p: any) => ({
    id: p?.id || uid(), name: String(p?.name || "?"), active: p?.active !== false, pos: p?.pos === "GK" ? "GK" : "필드"
  })) as Player[];
  if (players.length === 0) players = DEFAULT_PLAYERS.map(p => ({ id: uid(), name: p.name, active: true, pos: p.pos as any }));

  const globalTeamNames: Record<TeamId, string> = {
    A: String(data?.teamNames?.A || "팀 A"),
    B: String(data?.teamNames?.B || "팀 B"),
    C: String(data?.teamNames?.C || "팀 C")
  };

  let sessionsByDate: Record<string, Session> = {};
  if (data?.sessionsByDate && typeof data.sessionsByDate === "object") {
    for (const [k, v] of Object.entries<any>(data.sessionsByDate)) {
      const s = v || {};
      const rosters = { A: asArray<string>(s?.rosters?.A, []), B: asArray<string>(s?.rosters?.B, []), C: asArray<string>(s?.rosters?.C, []) };
      const matches = asArray<any>(s?.matches, []).map((m: any) => ({
        id: String(m?.id || uid()), seq: asNumber(m?.seq, 0),
        home: isTeamId(m?.home) ? m.home : "A", away: isTeamId(m?.away) ? m.away : "B",
        hg: asNumber(m?.hg, 0), ag: asNumber(m?.ag, 0),
        gkHome: (m?.gkHome || "") || null, gkAway: (m?.gkAway || "") || null
      })) as Match[];

      const rawMS = typeof s?.matchStats === "object" && s?.matchStats ? s.matchStats : {};
      const matchStats: Record<string, MatchStats> = {};
      Object.keys(rawMS).forEach(mid => {
        const row = rawMS[mid] || {};
        const safe: MatchStats = {} as any;
        Object.keys(row).forEach(pid => {
          const v = row[pid] || {};
          safe[pid] = { goals: asNumber(v.goals, 0), assists: asNumber(v.assists, 0), cleansheets: asNumber(v.cleansheets, 0) };
        });
        matchStats[mid] = safe;
      });

      const defAwards: Record<TeamId, string | null> = {
        A: typeof s?.defAwards?.A === "string" ? s.defAwards.A : null,
        B: typeof s?.defAwards?.B === "string" ? s.defAwards.B : null,
        C: typeof s?.defAwards?.C === "string" ? s.defAwards.C : null
      };

      const notes = String(s?.notes || "");
      const teamNames = (s?.teamNames && typeof s.teamNames === "object")
        ? ({ A: String(s.teamNames.A || globalTeamNames.A), B: String(s.teamNames.B || globalTeamNames.B), C: String(s.teamNames.C || globalTeamNames.C) })
        : undefined;

      const rosterViewConfirmed: Record<TeamId, boolean> = {
        A: Boolean(s?.rosterViewConfirmed?.A),
        B: Boolean(s?.rosterViewConfirmed?.B),
        C: Boolean(s?.rosterViewConfirmed?.C),
      };

      const formations: Record<TeamId, FormationKey> = {
        A: (s?.formations?.A as FormationKey) || "1-2-1",
        B: (s?.formations?.B as FormationKey) || "1-2-1",
        C: (s?.formations?.C as FormationKey) || "1-2-1",
      };

      const teamColors: Record<TeamId, JerseyColor> = {
        A: (s?.teamColors?.A as JerseyColor) || DEFAULT_TEAM_COLORS.A,
        B: (s?.teamColors?.B as JerseyColor) || DEFAULT_TEAM_COLORS.B,
        C: (s?.teamColors?.C as JerseyColor) || DEFAULT_TEAM_COLORS.C,
      };

      sessionsByDate[ensureSunday(k)] = { rosters, matches, matchStats, defAwards, teamNames, notes, rosterViewConfirmed, formations, teamColors };
    }
  } else {
    sessionsByDate[today] = emptySession();
  }

  const sessionDate = ensureSunday(String(data?.sessionDate || today));
  if (!sessionsByDate[sessionDate]) sessionsByDate[sessionDate] = emptySession();

  Object.values(sessionsByDate).forEach(sess => {
    const list = asArray(sess.matches, []);
    let seq = 1; for (const m of list) { if (!m.seq || m.seq <= 0) m.seq = seq; seq++; }
    if (!sess.rosterViewConfirmed) sess.rosterViewConfirmed = { A: false, B: false, C: false };
    if (!sess.formations) sess.formations = { A: "1-2-1", B: "1-2-1", C: "1-2-1" };
    if (!sess.teamColors) sess.teamColors = { ...DEFAULT_TEAM_COLORS };
  });

  return { players, teamNames: globalTeamNames, sessionsByDate, sessionDate };
}

function loadLocal(): PersistShape | null {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? normalizeLoaded(JSON.parse(raw)) : null; } catch { return null; }
}
function saveLocal(s: PersistShape) { try { localStorage.setItem(LS_KEY, JSON.stringify(s)); } catch {} }

function getQueryFlag(...keys: string[]) {
  const q = new URLSearchParams(window.location.search);
  return keys.some(k => q.get(k) === "1" || q.get(k) === "true" || q.has(k));
}

const pickState = (x: any) => ({
  players: x?.players, teamNames: x?.teamNames, sessionsByDate: x?.sessionsByDate, sessionDate: x?.sessionDate,
});

/* ====== 순위 계산 유틸 ====== */
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
function computeTeamBonus(st: StandingRow[]): Record<TeamId, number> {
  const map: { [k in TeamId]: number } = { A: 0, B: 0, C: 0 };
  st.map(s => s.team).forEach((tid, i) => map[tid] = i === 0 ? 4 : i === 1 ? 2 : 1);
  return map;
}

/* ====== 포메이션 좌표 (GK는 항상 마지막 원소가 골대쪽) ====== */
const FORMATION_POINTS: Record<Exclude<FormationKey, "1-2"> | "1-2", { x: number; y: number; label: string }[]> = {
  "1-2-1": [
    { x: 50, y: 92, label: "GK" },
    { x: 30, y: 58, label: "MF" }, { x: 70, y: 58, label: "MF" },
    { x: 50, y: 26, label: "FW" },
  ],
  "2-2": [
    { x: 50, y: 92, label: "GK" },
    { x: 30, y: 70, label: "DF" }, { x: 70, y: 70, label: "DF" },
    { x: 30, y: 32, label: "FW" }, { x: 70, y: 32, label: "FW" },
  ],
  "3-1": [
    { x: 50, y: 92, label: "GK" },
    { x: 20, y: 64, label: "DF" }, { x: 50, y: 64, label: "DF" }, { x: 80, y: 64, label: "DF" },
    { x: 50, y: 28, label: "FW" },
  ],
  "1-2": [
    { x: 50, y: 92, label: "GK" },
    { x: 30, y: 58, label: "MF" }, { x: 70, y: 58, label: "MF" },
  ],
   "2-2-1": [
    { x: 50, y: 92, label: "GK" },
    { x: 30, y: 72, label: "DF" }, { x: 70, y: 72, label: "DF" },
    { x: 30, y: 50, label: "MF" }, { x: 70, y: 50, label: "MF" },
    { x: 50, y: 26, label: "FW" },
  ]
};

/* ====== 문자열 유틸 ====== */
function lastTwoChars(name: string) {
  const t = name.trim();
  if (!t) return "?";
  // 한글 포함: 뒤에서 2자
  const arr = Array.from(t);
  return arr.slice(-2).join("");
}

/* ====== 유니폼(상의) SVG ======
   - 크기: 기존 원형 대비 약 2배
   - fill: 조끼색
   - 중앙: 뒤 두 글자
   - 하단: 이름(유니폼 너비에 맞춰 textLength로 자동 확대)
*/
function Jersey({
  label, name, color
}: { label: string; name: string; color: JerseyColor }) {
  const fill =
    color === "red" ? "var(--jersey-red)" :
    color === "yellow" ? "var(--jersey-yellow)" : "var(--jersey-white)";
  const stroke = "var(--jersey-stroke)";

  return (
    <g>
      {/* 상의 모양 (간단한 티셔츠 실루엣) */}
      <path
        d="M -9 -6 L -4 -10 L 4 -10 L 9 -6 L 6 -3 L 3 -6 L 3 8 L -3 8 L -3 -6 L -6 -3 Z"
        fill={fill}
        stroke={stroke}
        strokeWidth={0.8}
        opacity={1}
      />
      {/* 중앙 이니셜(뒤 두 글자) */}
      <text
        textAnchor="middle"
        dominantBaseline="central"
        y={-0.5}
        style={{ fontWeight: 800, fontSize: "4.2px", fill: "#0B0C0F" }}
      >
        {lastTwoChars(name)}
      </text>
      {/* 하단 풀네임: 유니폼 가로폭(약 18px)에 맞춰 자동 확장 */}
      <text
        y={10}
        textAnchor="middle"
        className="player-label"
        lengthAdjust="spacingAndGlyphs"
        textLength={18}        /* ✅ 가로폭에 맞춰 늘어남 */
      >
        {name}
      </text>
    </g>
  );
}

/* ====== FormationPreview ======
   - GK가 정확히 1명일 때만 GK 좌표에 배치
   - 필드 인원수(3/4/5)에 따라 포메이션 자동 선택
   - 유니폼 크기 2배
*/
function FormationPreview({
  team, roster, players, teamName, userFormation, color
}: {
  team: TeamId;
  roster: string[];
  players: Player[];
  teamName: string;
  userFormation: FormationKey;    // 사용자가 선택한 포메이션 (표시는 실인원 기준으로 자동)
  color: JerseyColor;
}) {
  // 로스터 분해
  const gkIds = roster.filter(id => players.find(p => p.id === id)?.pos === "GK");
  const fieldIds = roster.filter(id => players.find(p => p.id === id)?.pos !== "GK");

  // GK 규칙: 정확히 1명일 때만 사용
  const gkToUse = gkIds.length === 1 ? gkIds[0] : null;

  // 필드 인원에 따른 자동 포메이션 (요청 #4)
  const fieldCnt = fieldIds.length;
  const autoFormation: FormationKey =
    fieldCnt === 5 ? "2-2-1" :
    fieldCnt === 4 ? "1-2-1" :
    fieldCnt === 3 ? "1-2"   :
    // 기본 fallback: user 선택 (없으면 1-2-1)
    (userFormation || "1-2-1");

  const pts = FORMATION_POINTS[autoFormation];

  // 실제 배치 목록(순서대로 좌표에 매핑)
  // 0번 좌표는 GK, 나머지는 필드
  const slots = pts.map((pt, i) => {
    if (i === 0 && pt.label === "GK") {
      // GK 좌표
      return gkToUse ? { type: "GK", pid: gkToUse } : { type: "GK", pid: null };
    }
    // 필드 좌표
    return { type: "FIELD", pid: null as string | null };
  });

  // 필드 좌표에 필드 선수 채움
  const filled = [...slots];
  let fi = 0;
  for (let i = 0; i < filled.length; i++) {
    if (filled[i].type === "FIELD") {
      filled[i] = { ...filled[i], pid: fieldIds[fi] || null };
      fi++;
    }
  }

  return (
    <div className="formation-card">
      <div className="formation-title">
        {teamName} <span className="subtle">({team}) · {autoFormation}</span>
      </div>

      <svg viewBox="0 0 100 140" className="pitch">
        {/* pitch bg + lines */}
        <rect x="1" y="1" width="98" height="138" rx="4" className="pitch-bg" />
        <rect x="1" y="1" width="98" height="138" rx="4" className="pitch-line" fill="none" />
        <line x1="1" y1="70" x2="99" y2="70" className="pitch-line" />
        <circle cx="50" cy="70" r="9" className="pitch-circle" />
        {/* penalty areas */}
        <rect x="18" y="1" width="64" height="20" className="pitch-line" fill="none" />
        <rect x="18" y="119" width="64" height="20" className="pitch-line" fill="none" />

        {/* players */}
        {pts.map((pt, i) => {
          const slot = filled[i];
          const pid = slot?.pid || null;
          const name = pid ? (players.find(p => p.id === pid)?.name || "?") : "";
          const translate = `translate(${pt.x}, ${pt.y})`;

          // GK가 없으면 GK 좌표도 비움
          if (i === 0 && pt.label === "GK" && !gkToUse) {
            return (
              <g key={i} transform={translate}>
                <circle r="4.6" className="player-shadow" />
                <text y="8.5" textAnchor="middle" className="player-label">—</text>
              </g>
            );
          }

          return (
            <g key={i} transform={translate}>
              <circle r="7.5" className="player-shadow" />
              {pid ? (
                <Jersey label={pt.label} name={name} color={color} />
              ) : (
                <>
                  <circle r="6.8" fill="transparent" stroke="var(--line)" strokeWidth="0.6" />
                  <text textAnchor="middle" dominantBaseline="central" className="player-initials">?</text>
                  <text y="10" textAnchor="middle" className="player-label">빈 자리</text>
                </>
              )}
            </g>
          );
        })}
      </svg>

      {/* 벤치 목록 */}
      {roster.length > 0 && (
        <div className="bench">
          벤치:{" "}
          {roster
            .filter(id => !filled.some(f => f.pid === id))
            .map(id => (players.find(p => p.id === id)?.name || "?"))
            .join(", ") || "—"}
        </div>
      )}
    </div>
  );
}

/* ====== AddPlayer 컴포넌트 (간단) ====== */
function AddPlayer({ onAdd, disabled }: { onAdd: (name: string) => void; disabled: boolean }) {
  const [txt, setTxt] = useState("");
  return (
    <div className="row">
      <input
        placeholder="선수명 추가"
        value={txt}
        onChange={e => setTxt(e.target.value)}
        disabled={disabled}
      />
      <button
        onClick={() => { const t = txt.trim(); if (t) { onAdd(t); setTxt(""); } }}
        disabled={disabled}
      >
        추가
      </button>
    </div>
  );
}

/* ====== MatchRow (기록 입력) ====== */
function MatchRow({
  m, readonly, updateMatch, deleteMatch, rosterA, rosterB, players, values, onChange, teamNames
}: {
  m: Match; readonly: boolean; updateMatch: (id: string, patch: Partial<Match>, opts?: { reevalGK?: boolean }) => void; deleteMatch: (id: string) => void;
  rosterA: string[]; rosterB: string[]; players: Player[]; values: MatchStats;
  onChange: (pid: string, field: "goals" | "assists", value: number) => void;
  teamNames: Record<TeamId, string>;
}) {
  const [open, setOpen] = useState(false);
  const collate = useMemo(() => new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true, ignorePunctuation: true }).compare, []);
  const name = (pid: string) => players.find(p => p.id === pid)?.name || "?";
  const pos = (pid: string) => players.find(p => p.id === pid)?.pos || "필드";

  const sortRoster = (ids: string[]) => {
    const list = ids.map(id => players.find(p => p.id === id)).filter(Boolean) as Player[];
    const field = list.filter(p => p.pos !== "GK").sort((a, b) => collate(a.name, b.name));
    const gks = list.filter(p => p.pos === "GK").sort((a, b) => collate(a.name, b.name));
    return [...field, ...gks].map(p => p.id);
  };
  const rosterA_sorted = sortRoster(asArray(rosterA, []));
  const rosterB_sorted = sortRoster(asArray(rosterB, []));

  const render09 = () => Array.from({ length: 10 }).map((_, i) => <option key={i} value={i}>{i}</option>);

  return (
    <div className="card">
      <div className="match-head">
        <div className="seq">{m.seq}경기</div>

        <div className="scoreline">
          <select
            value={m.home}
            onChange={e => updateMatch(m.id, { home: e.target.value as TeamId }, { reevalGK: true })}
            disabled={readonly}
          >
            <option value="A">{teamNames.A}</option>
            <option value="B">{teamNames.B}</option>
            <option value="C">{teamNames.C}</option>
          </select>

          <select
            className="score-input"
            value={m.hg}
            onChange={e => updateMatch(m.id, { hg: +e.target.value })}
            disabled={readonly}
          >
            {render09()}
          </select>

          <div className="colon">:</div>

          <select
            className="score-input"
            value={m.ag}
            onChange={e => updateMatch(m.id, { ag: +e.target.value })}
            disabled={readonly}
          >
            {render09()}
          </select>

          <select
            value={m.away}
            onChange={e => updateMatch(m.id, { away: e.target.value as TeamId }, { reevalGK: true })}
            disabled={readonly}
          >
            <option value="A">{teamNames.A}</option>
            <option value="B">{teamNames.B}</option>
            <option value="C">{teamNames.C}</option>
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

      {open && (
        <div className="record-grid">
          <div className="team-col">
            <div className="team-col-head">{teamNames[m.home]} <span className="subtle">({m.home})</span></div>
            <div className="players-grid">
              {asArray(rosterA_sorted, []).map(pid => {
                const v = values[pid] || { goals: 0, assists: 0 };
                return (
                  <div key={pid} className="player-card">
                    <div className="player-name">{name(pid)} <span className="pos">({pos(pid)})</span></div>
                    <div className="stat">
                      <label className="stat-label">G</label>
                      <select
                        className="stat-input select"
                        value={v.goals}
                        onChange={e => onChange(pid, "goals", +e.target.value)}
                        disabled={readonly}
                      >
                        {render09()}
                      </select>
                    </div>
                    <div className="stat">
                      <label className="stat-label">A</label>
                      <select
                        className="stat-input select"
                        value={v.assists}
                        onChange={e => onChange(pid, "assists", +e.target.value)}
                        disabled={readonly}
                      >
                        {render09()}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="team-col">
            <div className="team-col-head">{teamNames[m.away]} <span className="subtle">({m.away})</span></div>
            <div className="players-grid">
              {asArray(rosterB_sorted, []).map(pid => {
                const v = values[pid] || { goals: 0, assists: 0 };
                return (
                  <div key={pid} className="player-card">
                    <div className="player-name">{name(pid)} <span className="pos">({pos(pid)})</span></div>
                    <div className="stat">
                      <label className="stat-label">G</label>
                      <select
                        className="stat-input select"
                        value={v.goals}
                        onChange={e => onChange(pid, "goals", +e.target.value)}
                        disabled={readonly}
                      >
                        {render09()}
                      </select>
                    </div>
                    <div className="stat">
                      <label className="stat-label">A</label>
                      <select
                        className="stat-input select"
                        value={v.assists}
                        onChange={e => onChange(pid, "assists", +e.target.value)}
                        disabled={readonly}
                      >
                        {render09()}
                      </select>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ====== 메인 App ====== */
export default function App() {
  const today = ensureSunday(toISO(new Date()));
  const local0 = loadLocal() ?? {
    players: DEFAULT_PLAYERS.map(p => ({ id: uid(), name: p.name, active: true, pos: p.pos as any })),
    teamNames: { A: "팀 A", B: "팀 B", C: "팀 C" },
    sessionsByDate: { [today]: emptySession() },
    sessionDate: today
  };

  const [players, setPlayers] = useState<Player[]>(local0.players);
  const [globalTeamNames, setGlobalTeamNames] = useState<Record<TeamId, string>>(local0.teamNames);
  const [sessionDate, setSessionDate] = useState<string>(local0.sessionDate);
  const [sessionsByDate, setSessionsByDate] = useState<Record<string, Session>>(local0.sessionsByDate);
  const [page, setPage] = useState<1 | 2 | 3 | 4 | 5>(5);

  const syncLockRef = useRef(false);
  const debTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hydratedRef = useRef(false);

  const collate = useMemo(() => new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true, ignorePunctuation: true }).compare, []);
  const playersSorted = useMemo(() => {
    const field = [...players].filter(p => p.pos !== "GK").sort((a, b) => collate(a.name, b.name));
    const gks = [...players].filter(p => p.pos === "GK").sort((a, b) => collate(a.name, b.name));
    return [...field, ...gks];
  }, [players, collate]);
  const activePlayersSorted = useMemo(() => playersSorted.filter(p => p.active), [playersSorted]);

  const initialCloud = useMemo(() => ({ players, teamNames: globalTeamNames, sessionsByDate, sessionDate }), []);
  const { value: cloud, setValue: setCloud, ready } =
    useRealtimeJsonState<typeof initialCloud>(initialCloud, { id: 1 } as any);

  useEffect(() => {
    if (!ready || !cloud) return;
    const next = cloud;
    if (JSON.stringify(pickState(next)) !== JSON.stringify(pickState({ players, teamNames: globalTeamNames, sessionsByDate, sessionDate }))) {
      syncLockRef.current = true;
      setPlayers(next.players);
      setGlobalTeamNames(next.teamNames);
      setSessionsByDate(next.sessionsByDate);
      setSessionDate(ensureSunday(next.sessionDate));
      setTimeout(() => { syncLockRef.current = false; hydratedRef.current = true; }, 50);
    } else {
      hydratedRef.current = true;
    }
  }, [cloud, ready]); // eslint-disable-line

  useEffect(() => {
    const s = { players, teamNames: globalTeamNames, sessionsByDate, sessionDate: ensureSunday(sessionDate) };
    saveLocal(s);
    if (!ready || !hydratedRef.current || syncLockRef.current) return;
    if (debTimerRef.current) clearTimeout(debTimerRef.current);
    debTimerRef.current = setTimeout(() => {
      if (JSON.stringify(pickState(cloud)) !== JSON.stringify(pickState(s))) setCloud(s);
    }, 150);
  }, [players, globalTeamNames, sessionsByDate, sessionDate, ready]); // eslint-disable-line

  useEffect(() => {
    const key = ensureSunday(sessionDate);
    setSessionsByDate(prev => {
      const base = prev[key] ?? emptySession();
      if (base.teamNames && base.teamNames.A && base.teamNames.B && base.teamNames.C) return prev;
      let donor: Record<TeamId, string> | null = null;
      const keys = Object.keys(prev).sort();
      const tgt = new Date(key).getTime();
      for (let i = keys.length - 1; i >= 0; i--) {
        const k = keys[i]; const t = new Date(k).getTime(); if (t === tgt) continue;
        const tn = prev[k]?.teamNames;
        if (tn && tn.A && tn.B && tn.C) { donor = tn as any; break; }
      }
      const useTN = donor || globalTeamNames;
      return { ...prev, [key]: { ...base, teamNames: { A: useTN.A, B: useTN.B, C: useTN.C }, teamColors: base.teamColors || { ...DEFAULT_TEAM_COLORS } } };
    });
  }, [sessionDate]); // eslint-disable-line

  // 팀 변경 시 GK 자동 재평가
  useEffect(() => {
    const key = ensureSunday(sessionDate);
    setSessionsByDate(prev => {
      const base = prev[key] ?? emptySession();
      const matches = asArray(base.matches, []);
      let changed = false;

      const pickOneGK = (tid: TeamId): string | null => {
        const ids = asArray(base.rosters[tid], []);
        const gkIds = ids.filter(pid => (players.find(p => p.id === pid)?.pos) === "GK");
        return gkIds.length === 1 ? gkIds[0] : null;
      };

      const nextMatches = matches.map(m => {
        let gkH = m.gkHome ?? null;
        let gkA = m.gkAway ?? null;
        const oneHome = pickOneGK(m.home);
        const oneAway = pickOneGK(m.away);

        if (!gkH && oneHome) { gkH = oneHome; changed = true; }
        if (!gkA && oneAway) { gkA = oneAway; changed = true; }

        if (gkH === m.gkHome && gkA === m.gkAway) return m;
        return { ...m, gkHome: gkH, gkAway: gkA };
      });

      if (!changed) return prev;
      return { ...prev, [key]: { ...base, matches: nextMatches } };
    });
  }, [players, sessionsByDate, sessionDate]);

  const viewerFlag = getQueryFlag("viewer", "view", "readonly");
  const [authed, setAuthed] = useState<boolean>(() => sessionStorage.getItem(SS_PIN_AUTHED) === "1");
  const readonly = viewerFlag || !authed;
  const [pinInput, setPinInput] = useState("");

  async function sha256Hex(input: string): Promise<string> {
    const enc = new TextEncoder();
    const w: any = globalThis as any;
    if (!w.crypto?.subtle) return `plain:${input}`;
    const buf = await w.crypto.subtle.digest("SHA-256", enc.encode(input));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  async function unlock() {
    if (!pinInput) return alert("PIN을 입력하세요");
    const h = await sha256Hex(pinInput);
    if (h === FIXED_PIN_HASH) { sessionStorage.setItem(SS_PIN_AUTHED, "1"); setAuthed(true); setPinInput(""); }
    else alert("PIN 불일치");
  }
  function lock() { sessionStorage.removeItem(SS_PIN_AUTHED); setAuthed(false); }
  function copyViewerLink() { const url = new URL(window.location.href); url.searchParams.set("viewer", "1"); navigator.clipboard?.writeText(url.toString()); alert("보기 전용 링크가 복사되었습니다"); }

  const cur: Session = useMemo(() => sessionsByDate[ensureSunday(sessionDate)] ?? emptySession(), [sessionsByDate, sessionDate]);
  const effectiveTeamNames: Record<TeamId, string> = cur.teamNames ?? globalTeamNames;
  const effectiveColors: Record<TeamId, JerseyColor> = cur.teamColors ?? { ...DEFAULT_TEAM_COLORS };

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
    setPlayers(prev => [...prev, { id: uid(), name: nm, active: true, pos: "필드" }].sort((a, b) => collate(a.name, b.name)));
  };
  const updateTeamName = (tid: TeamId, nm: string) => patchSession({ teamNames: { ...(cur.teamNames || effectiveTeamNames), [tid]: nm } as any });
  const toggleRoster = (tid: TeamId, pid: string) => patchSession({
    rosters: (() => {
      const r = { ...(cur.rosters || { A: [], B: [], C: [] }) };
      const list = asArray(r[tid], []);
      r[tid] = list.includes(pid) ? list.filter(id => id !== pid) : [...list, pid];
      return r;
    })()
  });
  const setFormation = (tid: TeamId, f: FormationKey) =>
    patchSession({ formations: { ...(cur.formations || { A: "1-2-1", B: "1-2-1", C: "1-2-1" }), [tid]: f } });

  const setTeamColor = (tid: TeamId, color: JerseyColor) =>
    patchSession({ teamColors: { ...(cur.teamColors || { ...DEFAULT_TEAM_COLORS }), [tid]: color } });

  const toggleConfirmTeamView = (tid: TeamId) => {
    if (readonly) return;
    const curr = cur.rosterViewConfirmed?.[tid] ?? false;
    patchSession({ rosterViewConfirmed: { ...(cur.rosterViewConfirmed || { A: false, B: false, C: false }), [tid]: !curr } });
  };

  const updateMatch = (id: string, patch: Partial<Match>, opts?: { reevalGK?: boolean }) => {
    if (readonly) return;
    patchSession({
      matches: asArray(cur.matches, []).map(m => {
        if (m.id !== id) return m;

        const teamChangedHome = Object.prototype.hasOwnProperty.call(patch, "home");
        const teamChangedAway = Object.prototype.hasOwnProperty.call(patch, "away");

        const nextHome = (teamChangedHome ? (patch.home as TeamId) : m.home);
        const nextAway = (teamChangedAway ? (patch.away as TeamId) : m.away);

        let nextGKHome = (Object.prototype.hasOwnProperty.call(patch, "gkHome") ? (patch.gkHome ?? null) : m.gkHome ?? null);
        let nextGKAway = (Object.prototype.hasOwnProperty.call(patch, "gkAway") ? (patch.gkAway ?? null) : m.gkAway ?? null);

        const pickOneGK = (tid: TeamId): string | null => {
          const ids = asArray(cur.rosters[tid], []);
          const gkIds = ids.filter(pid => (players.find(p => p.id === pid)?.pos) === "GK");
          return gkIds.length === 1 ? gkIds[0] : null;
        };

        if (opts?.reevalGK && teamChangedHome) {
          const auto = pickOneGK(nextHome);
          const rosterHome = asArray(cur.rosters[nextHome], []);
          const isCurrentValid = nextGKHome ? rosterHome.includes(nextGKHome) && (players.find(p => p.id === nextGKHome)?.pos === "GK") : false;
          if (auto) nextGKHome = auto;
          else if (!isCurrentValid) nextGKHome = null;
        }

        if (opts?.reevalGK && teamChangedAway) {
          const auto = pickOneGK(nextAway);
          const rosterAway = asArray(cur.rosters[nextAway], []);
          const isCurrentValid = nextGKAway ? rosterAway.includes(nextGKAway) && (players.find(p => p.id === nextGKAway)?.pos === "GK") : false;
          if (auto) nextGKAway = auto;
          else if (!isCurrentValid) nextGKAway = null;
        }

        return { ...m, ...patch, home: nextHome, away: nextAway, gkHome: nextGKHome, gkAway: nextGKAway };
      })
    });
  };

  const addMatch = () => {
    let maxSeq = 0; asArray(cur.matches, []).forEach(m => { if (m.seq && m.seq > maxSeq) maxSeq = m.seq; });
    const nextSeq = maxSeq + 1;

    let home: TeamId = "A";
    let away: TeamId = "B";

    if (nextSeq >= 4 && nextSeq <= 9) {
      const baseSeq: number = ((nextSeq - 1) % 3) + 1;
      const baseMatch = asArray(cur.matches, []).find(m => m.seq === baseSeq);
      if (baseMatch) {
        home = baseMatch.home;
        away = baseMatch.away;
      }
    }

    patchSession({ matches: [...asArray(cur.matches, []), { id: uid(), seq: nextSeq, home, away, hg: 0, ag: 0, gkHome: null, gkAway: null }] });
  };

  const deleteMatch = (id: string) => patchSession({ matches: asArray(cur.matches, []).filter(m => m.id !== id) });
  const setDef = (tid: TeamId, pid: string | null) => patchSession({ defAwards: { ...(cur.defAwards || { A: null, B: null, C: null }), [tid]: pid } });
  const setMatchStat = (mid: string, pid: string, field: "goals" | "assists", value: number) => {
    if (readonly) return;
    const row = { ...(cur.matchStats?.[mid] || {}) } as MatchStats;
    const curv = row[pid] || { goals: 0, assists: 0 };
    row[pid] = { ...curv, [field]: value } as any;
    patchSession({ matchStats: { ...cur.matchStats, [mid]: row } });
  };

  // 점수/랭킹 계산 로직 (기존 유지)
  function calcScores(session: Session) {
    const out: Record<string, any> = {};
    const teamNamesUse = session.teamNames || globalTeamNames;

    const teamOf = (pid: string): TeamId | "-" =>
      (session.rosters.A || []).includes(pid) ? "A" :
      (session.rosters.B || []).includes(pid) ? "B" :
      (session.rosters.C || []).includes(pid) ? "C" : "-";

    const standings = computeStandings(session.matches);
    const teamBonusByTeam = computeTeamBonus(standings);

    const gkWins: Record<string, number> = {};
    asArray(session.matches, []).forEach(m => {
      const hg = asNumber(m.hg, 0), ag = asNumber(m.ag, 0);
      if (hg > ag && m.gkHome) gkWins[m.gkHome] = (gkWins[m.gkHome] || 0) + 1;
      if (ag > hg && m.gkAway) gkWins[m.gkAway] = (gkWins[m.gkAway] || 0) + 1;
    });

    const teamGKs: Record<TeamId, string[]> = { A: [], B: [], C: [] };
    TEAM_IDS.forEach(tid => {
      teamGKs[tid] = asArray(session.rosters[tid], []).filter(pid => (players.find(p => p.id === pid)?.pos) === "GK");
    });

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

    const collator = new Intl.Collator("ko-KR", { sensitivity: "base", numeric: true });
    Object.keys(out).forEach(pid => {
      const team = teamOf(pid);
      const isGK = players.find(p => p.id === pid)?.pos === "GK";
      const def = team !== "-" && (session.defAwards?.[team] || null) === pid ? 2 : 0;

      let teamBonus = 0;
      if (team !== "-") {
        if (isGK) {
          const gks = teamGKs[team];
          if (gks.length <= 1) {
            teamBonus = teamBonusByTeam[team] || 0;
          } else {
            const gkWinsCount = Object.fromEntries(gks.map((id: string) => [id, gkWins[id] || 0])) as Record<string, number>;
            const sortedByWins = [...gks].sort((a, b) => (gkWinsCount[b] - gkWinsCount[a]) || collator.compare(
              players.find(p => p.id === a)?.name || "", players.find(p => p.id === b)?.name || ""
            ));
            teamBonus = sortedByWins[0] === pid ? 4 : sortedByWins[1] === pid ? 2 : 0;
          }
        } else {
          teamBonus = teamBonusByTeam[team] || 0;
        }
      }

      const total = out[pid].goals + out[pid].assists + out[pid].cleansheets + def + teamBonus;
      out[pid] = {
        ...out[pid],
        def, teamBonus, total,
        name: players.find(p => p.id === pid)?.name || "?",
        team,
        teamName: team === "-" ? "-" : (teamNamesUse as any)[team]
      };
    });
    return out;
  }

  const dailyScores = useMemo(() => calcScores(cur), [cur, players, globalTeamNames]);
  const sortedDaily = useMemo(
    () => Object.entries(dailyScores).map(([pid, v]: any) => ({ id: pid, ...v })).sort((a, b) => b.total - a.total || collate(a.name, b.name)),
    [dailyScores, collate]
  );

  const cumulativeScores = useMemo(() => {
    const agg: Record<string, any> = {};
    Object.entries(sessionsByDate).forEach(([dateKey, s]) => {
      const sc = calcScores(s);
      const present = new Set<string>();
      TEAM_IDS.forEach(t => asArray(s.rosters[t], []).forEach(pid => present.add(pid)));
      Object.entries(sc).forEach(([pid, v]: any) => {
        const b = agg[pid] || { goals: 0, assists: 0, cleansheets: 0, def: 0, teamBonus: 0, total: 0, days: 0, name: v.name, teamName: v.teamName, _dates: [] as string[] };
        agg[pid] = {
          ...b,
          goals: b.goals + v.goals, assists: b.assists + v.assists, cleansheets: b.cleansheets + v.cleansheets,
          def: b.def + v.def, teamBonus: b.teamBonus + v.teamBonus, total: b.total + v.total,
          days: b.days + (present.has(pid) ? 1 : 0),
          _dates: [...b._dates, dateKey]
        };
      });
      present.forEach(pid => { if (!agg[pid]) agg[pid] = { goals: 0, assists: 0, def: 0, teamBonus: 0, total: 0, days: 1, name: "?", teamName: "", _dates: [dateKey] }; });
    });
    return agg;
  }, [sessionsByDate, players, globalTeamNames]);

  const sortedCumulative = useMemo(
    () => Object.entries(cumulativeScores).map(([pid, v]: any) => ({
        id: pid, ...v, average: v.days > 0 ? Math.round((v.total / v.days) * 100) / 100 : 0
      }))
      .sort((a, b) => b.total - a.total || collate(a.name, b.name)),
    [cumulativeScores, collate]
  );

  const matchesSorted = useMemo(() => [...asArray(cur.matches, [])].sort((a, b) => (b.seq || 0) - (a.seq || 0)), [cur.matches]);

  function top5Ranking(type: "goals" | "assists" | "def" | "cleansheets" | "teamBonus" | "total") {
    let sorted = [...sortedCumulative];
    if (type === "cleansheets") sorted = sorted.filter(p => players.find(pl => pl.id === p.id)?.pos === "GK");
    sorted.sort((a, b) => (b[type] || 0) - (a[type] || 0));
    if (sorted.length === 0) return [];
    const ranked: any[] = [];
    let currentRank = 1;
    let prevScore: number | null = null;
    let count = 0;
    for (let i = 0; i < sorted.length; i++) {
      const score = sorted[i][type] || 0;
      count++;
      if (prevScore === null) currentRank = 1;
      else if (score < prevScore) currentRank = count;
      ranked.push({ ...sorted[i], rank: currentRank });
      prevScore = score;
    }
    return ranked.filter(r => r.rank <= 5);
  }

  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  return (
    <div className="wrap">
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

      <div className="tabs">
        <button className={page === 1 ? "tab active" : "tab"} onClick={() => setPage(1)}>선수 관리</button>
        <button className={page === 2 ? "tab active" : "tab"} onClick={() => setPage(2)}>일자별 경기 기록</button>
        <button className={page === 3 ? "tab active" : "tab"} onClick={() => setPage(3)}>전체 순위</button>
        <button className={page === 4 ? "tab active" : "tab"} onClick={() => setPage(4)}>선수 분석</button>
        <button className={page === 5 ? "tab active" : "tab"} onClick={() => setPage(5)}>랭킹 보드</button>
      </div>

      {page === 2 && (
        <div className="row">
          <label className="label-strong">날짜:</label>
          <input type="date" value={ensureSunday(sessionDate)} onChange={e => setSessionDate(ensureSunday(e.target.value))} />
          <span className="hint">일요일로 자동 보정</span>
        </div>
      )}

      {page === 1 && (
        <section className="box">
          <h3>선수 관리</h3>
          <AddPlayer onAdd={(nm) => addPlayer(nm)} disabled={readonly} />
          <div className="hint">선수 명단은 모든 날짜에 공통 적용됩니다.</div>
          <div className="list-scroll players-admin-grid">
            {activePlayersSorted.map(p => (
              <div key={p.id} className="player-admin-item">
                <input
                  className="player-name-input"
                  value={p.name}
                  onChange={e => readonly ? null : setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, name: e.target.value } : x))}
                  disabled={readonly}
                />
                <select
                  value={p.pos}
                  onChange={e => readonly ? null : setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, pos: (e.target.value as Player['pos']) } : x))}
                  disabled={readonly}
                >
                  <option value="필드">필드</option><option value="GK">GK</option>
                </select>
                <button
                  onClick={() => readonly ? null : setPlayers(prev => prev.map(x => x.id === p.id ? { ...x, active: !x.active } : x))}
                  disabled={readonly}
                >
                  {p.active ? "활성" : "비활성"}
                </button>
              </div>
            ))}
          </div>
        </section>
      )}

      {page === 2 && (
        <>
          <section className="box">
            <h3>팀 구성</h3>
            <div className="teams-grid">
              {TEAM_IDS.map(tid => {
                const isConfirmed = Boolean(cur.rosterViewConfirmed?.[tid]);
                const sourceList = isConfirmed
                  ? activePlayersSorted.filter(p => asArray(cur.rosters[tid], []).includes(p.id))
                  : activePlayersSorted;
                const formation = (cur.formations?.[tid] || "1-2-1") as FormationKey;
                const color = (effectiveColors[tid] || DEFAULT_TEAM_COLORS[tid]) as JerseyColor;

                return (
                  <div key={tid} className="team-card">
                    <div className="row">
                      <input value={effectiveTeamNames[tid]} onChange={e => updateTeamName(tid, e.target.value)} disabled={readonly} />
                      <span className="team-id">{tid}</span>
                    </div>

                    <div className="row">
                      <label>포메이션(표시엔 실인원 적용):</label>
                      <select
                        value={formation}
                        onChange={e => setFormation(tid, e.target.value as FormationKey)}
                        disabled={readonly}
                      >
                        <option value="1-2-1">1-2-1</option>
                        <option value="2-2">2-2</option>
                        <option value="3-1">3-1</option>
                        <option value="1-2">1-2</option>
                      </select>

                      <label style={{ marginLeft: 8 }}>조끼색:</label>
                      <select
                        value={color}
                        onChange={e => setTeamColor(tid, e.target.value as JerseyColor)}
                        disabled={readonly}
                      >
                        <option value="red">빨강</option>
                        <option value="yellow">노랑</option>
                        <option value="white">하양</option>
                      </select>
                    </div>

                    <div className="list-scroll small">
                      {sourceList.map(p => (
                        <label key={p.id} className="checkline">
                          <input
                            type="checkbox"
                            checked={asArray(cur.rosters[tid], []).includes(p.id)}
                            onChange={() => toggleRoster(tid, p.id)}
                            disabled={readonly}
                          />
                          {p.name} {p.pos === "GK" && <span className="badge-gk">GK</span>}
                        </label>
                      ))}
                      {isConfirmed && sourceList.length === 0 && (
                        <div className="muted">선택된 선수가 없습니다. ‘수정’을 눌러 전체 명단에서 선택하세요.</div>
                      )}
                    </div>

                    {/* ✅ 포메이션 미리보기 (표시는 실인원 기준 자동) */}
                    <FormationPreview
                      team={tid}
                      roster={asArray(cur.rosters[tid], [])}
                      players={players}
                      teamName={effectiveTeamNames[tid]}
                      userFormation={formation}
                      color={color}
                    />

                    <div className="row">
                      <button onClick={() => toggleConfirmTeamView(tid)} disabled={readonly}>
                        {isConfirmed ? "수정" : "확정"}
                      </button>
                      {isConfirmed && <span className="hint">확정된 팀원만 표시</span>}
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          <section className="box">
            <h3>경기 결과</h3>
            <div className="row spread">
              <div className="hint">각 경기의 <b>기록</b>에서 선수별 G/A 입력 (CS는 자동)</div>
              <button onClick={addMatch} disabled={readonly}>경기 추가</button>
            </div>
            {matchesSorted.length === 0 && <p className="muted">경기를 추가하세요.</p>}
            <div className="match-list">
              {matchesSorted.map(m => (
                <MatchRow key={m.id} m={m} readonly={readonly} updateMatch={updateMatch} deleteMatch={deleteMatch}
                  rosterA={asArray(cur.rosters[m.home], [])} rosterB={asArray(cur.rosters[m.away], [])} players={players}
                  values={cur.matchStats?.[m.id] || {}} onChange={(pid, field, val) => setMatchStat(m.id, pid, field, val)} teamNames={effectiveTeamNames} />
              ))}
            </div>

            <div className="table-wrap">
              <h4>순위표 (팀 보너스: 1위 4 / 2위 2 / 3위 1)</h4>
              <table className="tbl"><thead><tr>
                <th>순위</th><th>팀명</th><th>승점</th><th>승</th><th>무</th><th>패</th><th>득점</th><th>실점</th><th>득실</th><th>팀</th>
              </tr></thead><tbody>
                {computeStandings(cur.matches).map((t, idx) => (
                  <tr key={t.team}><td>{idx + 1}</td><td>{effectiveTeamNames[t.team]} <span className="subtle">({t.team})</span></td><td>{t.pts}</td><td>{t.w}</td><td>{t.d}</td><td>{t.l}</td><td>{t.gf}</td><td>{t.ga}</td><td>{t.gd}</td><td className="bold">{computeTeamBonus(computeStandings(cur.matches))[t.team]}</td></tr>
                ))}
              </tbody></table>
            </div>
          </section>

          <section className="box">
            <h3>오늘의 개인 순위</h3>
            <div className="table-wrap">
              <table className="tbl"><thead><tr>
                <th>순위</th><th>선수</th><th>팀명</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th>
              </tr></thead><tbody>
                {sortedDaily.map((r: any, idx: number) => (
                  <tr key={r.id}><td>{idx + 1}</td><td>{r.name}</td><td>{r.teamName || "-"}</td><td>{r.goals || 0}</td><td>{r.assists || 0}</td><td>{r.cleansheets || 0}</td><td>{r.def || 0}</td><td>{r.teamBonus || 0}</td><td className="bold">{r.total || 0}</td></tr>
                ))}
              </tbody></table>
            </div>
          </section>
        </>
      )}

      <section className={`box ${page === 3 ? "" : "hidden"}`}>
        <h3>전체 순위</h3>
        <div className="table-wrap">
          <table className="tbl"><thead><tr>
            <th>순위</th><th>선수</th><th>참여</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th><th>평균</th>
          </tr></thead><tbody>
            {Object.entries(sortedCumulative).map(([_, r]: any, idx: number) => (
              <tr key={r.id}><td>{idx + 1}</td><td>{r.name}</td><td>{r.days}</td><td>{r.goals}</td><td>{r.assists}</td><td>{r.cleansheets}</td><td>{r.def}</td><td>{r.teamBonus}</td><td className="bold">{r.total}</td><td>{r.average}</td></tr>
            ))}
          </tbody></table>
        </div>
      </section>

      <section className={`box ${page === 4 ? "" : "hidden"}`}>
        <h3>선수별 분석</h3>
        <div className="row">
          <label>선수 선택:</label>
          <select
            value={selectedPlayerId || ""}
            onChange={e => setSelectedPlayerId(e.target.value || null)}
          >
            <option value="">-- 선택 --</option>
            {sortedCumulative.map(p => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>

        {selectedPlayerId && (
          <div className="analysis">
            <h4>
              {sortedCumulative.find(p => p.id === selectedPlayerId)?.name} (
              {sortedCumulative.find(p => p.id === selectedPlayerId)?.teamName})
            </h4>

            <div className="charts" style={{ display: "flex", gap: 16, flexWrap: "wrap" }}>
              <div style={{ flex: "1 1 360px", minWidth: 320 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <RadarChart data={[
                    { stat: "Goals", value: sortedCumulative.find(p => p.id === selectedPlayerId)?.goals || 0 },
                    { stat: "Assists", value: sortedCumulative.find(p => p.id === selectedPlayerId)?.assists || 0 },
                    { stat: "Defense", value: sortedCumulative.find(p => p.id === selectedPlayerId)?.def || 0 },
                    { stat: "CS", value: sortedCumulative.find(p => p.id === selectedPlayerId)?.cleansheets || 0 },
                    { stat: "Team", value: sortedCumulative.find(p => p.id === selectedPlayerId)?.teamBonus || 0 },
                  ]}>
                    <PolarGrid />
                    <PolarAngleAxis dataKey="stat" stroke="#EAEAEA" />
                    <PolarRadiusAxis stroke="#A9A9A9" />
                    <Radar dataKey="value" stroke="#D4AF37" fill="#D4AF37" fillOpacity={0.6} />
                  </RadarChart>
                </ResponsiveContainer>
              </div>

              <div style={{ flex: "1 1 360px", minWidth: 320 }}>
                <ResponsiveContainer width="100%" height={300}>
                  <LineChart data={Object.entries(sessionsByDate).sort(([a],[b])=>a.localeCompare(b)).map(([dateKey, s])=>{
                    const sc = (function calc(session: Session) {
                      const out: any = {};
                      const _teamNamesUse = session.teamNames || globalTeamNames;
                      const standings = computeStandings(session.matches);
                      const teamBonusByTeam = computeTeamBonus(standings);
                      const add = (pid: string, k: string, v: number) => {
                        const b = out[pid] || { goals: 0, assists: 0, cleansheets: 0, def: 0, teamBonus: 0, total: 0, teamName: "" };
                        out[pid] = { ...b, [k]: (b[k] || 0) + v, teamName: _teamNamesUse };
                      };
                      // 간소화: 여기선 total만 필요하므로 원본 calcScores와 동일 결과가 나오도록 재사용
                      return calcScores(session);
                    })(s);
                    const row = sc[selectedPlayerId!] || { total: 0 };
                    return { date: dateKey.slice(5), total: row.total };
                  })}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#23252B" />
                    <XAxis dataKey="date" stroke="#EAEAEA" />
                    <YAxis stroke="#EAEAEA" />
                    <Tooltip />
                    <Line type="monotone" dataKey="total" stroke="#D4AF37" />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>

      <section className={`box ${page === 5 ? "" : "hidden"}`}>
        <h3>🏆 선수 랭킹 보드</h3>

        <div className="ranking-section">
          <h4>총점</h4>
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={top5Ranking("total")}>
              <XAxis dataKey="name" stroke="#EAEAEA" />
              <YAxis stroke="#EAEAEA" />
              <Tooltip />
              <Bar dataKey="total" fill="#D4AF37" />
            </BarChart>
          </ResponsiveContainer>
        </div>

        <div className="ranking-grid">
          {[
            { key: "goals", title: "⚽ 득점왕" },
            { key: "assists", title: "🎯 도움왕" },
            { key: "def", title: "🛡 수비 기여도" },
            { key: "teamBonus", title: "🤝 팀 기여도" },
            { key: "cleansheets", title: "🧤 클린시트" }
          ].map(cat => (
            <div className="ranking-section" key={cat.key}>
              <h4>{cat.title}</h4>
              <div className="rank-cards">
                {top5Ranking(cat.key as any).map((p) => (
                  <div key={p.id} className={`rank-card rank-${p.rank}`}>
                    <span className="rank-badge">{p.rank}</span>
                    <span className="player-name">{p.name}</span>
                    <span className="player-score">{(p as any)[cat.key]}</span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <p className="footer">© 골딘 기록앱</p>

      <style>{`
        :root{
          --gold:#D4AF37; --gold-2:#C89B3C; --emblem-word:#EAEAEA;
          --bg:#0B0C0F; --card:#15161A; --line:#23252B; --text:#EAEAEA; --muted:#A9A9A9;

          /* 조끼 색상 */
          --jersey-red:#E74C3C;
          --jersey-yellow:#F1C40F;
          --jersey-white:#EAEAEA;
          --jersey-stroke:#0a0b0f;
        }
        *, *::before, *::after { box-sizing: border-box; }
        body { background: var(--bg); }

        .wrap { max-width: 1100px; margin: 0 auto; padding: 14px; font-family: system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", sans-serif; color: var(--text); background: var(--bg); }
        .title { font-size: 22px; font-weight: 800; margin: 4px 0 10px; letter-spacing: .2px; }

        .panel { display:flex; gap:8px; align-items:center; flex-wrap:wrap; padding:10px; border:1px solid var(--line); border-radius:12px; background: linear-gradient(180deg, #121318, #0E0F13); }
        .badge-view { font-size:12px; color:#ff7a7a; font-weight:700; }
        .label-strong { font-weight:700; color: var(--text); }
        .ok { color: var(--gold); font-weight:700; }
        .hint { color: var(--muted); font-size:12px; }
        .muted { color: var(--muted); }

        .tabs { display:flex; gap:8px; margin:12px 0; flex-wrap: wrap; }
        .tab { padding:8px 12px; border:1px solid var(--line); border-radius:999px; background:#15161A; color:var(--text); cursor:pointer; transition:all .15s; }
        .tab:hover { border-color: var(--gold-2); }
        .tab.active { background: var(--gold); color:#1A1A1A; border-color: var(--gold); }

        .row { display:flex; gap:8px; align-items:center; margin:6px 0; }
        .row.spread { justify-content: space-between; }
        .box { border:1px solid var(--line); border-radius:12px; padding:12px; margin-top:12px; background: var(--card); box-shadow: 0 1px 8px rgba(0,0,0,.35); }
        .hidden { display:none; }

        .teams-grid { display:grid; grid-template-columns: repeat(3, 1fr); gap:10px; }
        .team-card { border:1px solid var(--line); border-radius:12px; padding:8px; background:#111318; }
        .team-id { margin-left:auto; font-size:12px; color: var(--muted); }
        .checkline { display:flex; gap:6px; align-items:center; padding:4px 0; }
        .badge-gk { margin-left:6px; font-size:11px; padding:2px 6px; border:1px solid var(--gold-2); border-radius:999px; color:var(--gold); }

        .list-scroll { max-height: 280px; overflow:auto; border:1px solid var(--line); border-radius:8px; padding:6px; background:#0E1015; }
        .list-scroll.small { max-height: 200px; }

        /* 선수관리 */
        .players-admin-grid { display: grid; grid-template-columns: 1fr; gap: 8px; }
        @media (min-width: 1024px) { .players-admin-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); } }
        .player-admin-item { display:grid; grid-template-columns: 1fr 84px 78px; gap:6px; border:1px solid var(--line); border-radius:10px; padding:6px; background:#0B0C10; }
        .player-name-input { min-width: 0; width:100%; padding:6px 8px; font-size:14px; }
        .player-admin-item select { padding:6px 8px; font-size:14px; }
        .player-admin-item button { padding:6px 8px; font-size:13px; }

        .table-wrap { overflow-x: auto; -webkit-overflow-scrolling: touch; border:1px solid var(--line); border-radius:10px; padding:6px; background:#0F1116; }
        .tbl { width: 100%; border-collapse: separate; border-spacing: 0; color: var(--text); }
        .tbl th, .tbl td { border-bottom:1px solid #1f2127; padding:8px 10px; text-align:center; }
        .tbl th { background:#141721; position: sticky; top: 0; z-index: 1; color:#dcdcdc; }
        .bold { font-weight:700; color: var(--gold); }
        .subtle { color:#b0b0b0; font-size:12px; }

        .card { border:1px solid var(--line); border-radius:12px; padding:10px; background:#111318; overflow: hidden; }

        .match-head { display: grid; grid-template-columns: 72px 1fr auto; grid-template-areas: "seq score actions"; gap: 10px; align-items: center; }
        .seq { grid-area: seq; font-weight: 800; color: var(--gold); }
        .scoreline { grid-area: score; display: grid; grid-template-columns: 1fr 72px 22px 72px 1fr; gap: 6px; align-items: center; }
        .colon { text-align:center; font-weight:700; color: var(--muted); }
        .head-actions { grid-area: actions; display:flex; gap:6px; justify-content:flex-end; flex-wrap: nowrap; }
        .danger { color:#ff7a7a; }

        /* 포메이션 */
        .formation-card { border:1px solid var(--line); border-radius:10px; background:#0E1116; margin-top:8px; }
        .formation-title { font-weight:700; padding:8px 10px; border-bottom:1px solid var(--line); background:#0F131A; }
        .pitch { width:100%; height:260px; display:block; }
        .pitch-bg { fill:#0A0C10; }
        .pitch-line { stroke:#31343C; }
        .pitch-circle { fill:none; stroke:#31343C; }

        .player-shadow { fill:#000; opacity:.25; }

        .player-initials { font-size: 4.4px; font-weight:800; fill:#EAEAEA; }
        .player-label { font-size: 3.2px; fill:#EAEAEA; }

        .bench { padding:8px 10px; font-size:12px; color:#cfcfcf; border-top:1px solid var(--line); }

        /* 랭킹 보드 */
        .ranking-grid { display:grid; grid-template-columns: repeat(5, 1fr); gap:10px; }
        @media (max-width: 1000px) { .ranking-grid { grid-template-columns: 1fr 1fr; } }
        .ranking-section { border:1px solid var(--line); border-radius:10px; padding:8px; background:#0F1116; }
        .rank-cards { display:flex; flex-direction:column; gap:6px; }
        .rank-card { display:flex; align-items:center; gap:8px; padding:6px; border:1px solid #20232b; border-radius:8px; background:#0c0e12; }
        .rank-badge { width:20px; height:20px; display:inline-grid; place-items:center; border-radius:999px; background:#22252c; color:#EAEAEA; font-size:12px; font-weight:700; }
        .player-name { flex:1; }
        .player-score { font-weight:700; color: var(--gold); }

        .footer { margin:14px 0 30px; text-align:center; color:#8c8f97; }
      `}</style>
    </div>
  );
}
