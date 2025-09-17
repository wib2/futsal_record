import { createClient, SupabaseClient } from '@supabase/supabase-js'
import { ensureSunday } from './helpers'

export type TeamId = "A" | "B" | "C";
export type Player = { id: string; name: string; active: boolean; pos: "필드" | "GK" };
export type Match = { id: string; home: TeamId; away: TeamId; hg: number; ag: number; gkHome?: string|null; gkAway?: string|null };
export type MatchStats = Record<string, { goals:number; assists:number; cleansheets:number }>;
export type Session = {
  rosters: Record<TeamId, string[]>;
  matches: Match[];
  matchStats: Record<string, MatchStats>;
  defAwards: Record<TeamId, string|null>;
  notes: string;
};
export type PersistShape = {
  players: Player[];
  teamNames: Record<TeamId, string>;
  sessionsByDate: Record<string, Session>;
  sessionDate: string;
};

/** ---------------- Local / Remote 기본 ---------------- */
const LS_KEY = "goldin_futsal_app_main_v7";
let supa: SupabaseClient | null = null;

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined; // ⚠️ 키 이름 주의!
const TABLE = "futsal_state";
const ROW_ID = 1;

export function supaEnabled(){ return !!(SUPA_URL && SUPA_KEY); }
export function supaInit(){
  if (!supaEnabled()) return null;
  if (!supa) supa = createClient(SUPA_URL!, SUPA_KEY!);
  return supa;
}

export function loadLocal(): PersistShape | null {
  try { const raw = localStorage.getItem(LS_KEY); return raw ? JSON.parse(raw) as PersistShape : null; }
  catch { return null; }
}
export function saveLocal(state: PersistShape){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}
export function migrateSessionKey(date: string){ return ensureSunday(date); }

/** ---------------- 에코 방지용 Envelope/ClientId ---------------- */
export type Envelope = PersistShape & { _clientId?: string; _rev?: number };

const CLIENT_ID_KEY = "goldin_futsal_client_id";
function getClientId(): string {
  let id = localStorage.getItem(CLIENT_ID_KEY);
  if (!id) {
    // @ts-ignore
    id = (crypto?.randomUUID?.() as string | undefined) ?? Math.random().toString(36).slice(2);
    localStorage.setItem(CLIENT_ID_KEY, id);
  }
  return id;
}
// App에서 미리 생성해 두고 싶을 때 사용
export function ensureClientId(): string { return getClientId(); }

/** ---------------- 원격 로드/저장/구독 ---------------- */
export async function remoteLoad(){
  if (!supaEnabled()) return null;
  supaInit();
  const { data, error } = await supa!.from(TABLE).select('payload').eq('id', ROW_ID).maybeSingle();
  if (error) return null;
  const env = (data?.payload as Envelope) ?? null;
  return env ? (env as PersistShape) : null;
}

export async function remoteSave(state: PersistShape, rev?: number){
  if (!supaEnabled()) return;
  supaInit();
  const env: Envelope = { ...state, _clientId: getClientId(), _rev: rev ?? Date.now() };
  await supa!.from(TABLE).upsert({ id: ROW_ID, payload: env });
}

export function remoteSubscribe(onChange:(p: PersistShape, meta?: {clientId?: string; rev?: number})=>void){
  if (!supaEnabled()) return () => {};
  supaInit();
  const ch = supa!.channel('state')
    .on('postgres_changes', { event:'*', schema:'public', table: TABLE, filter: `id=eq.${ROW_ID}` }, (p:any)=>{
      const env = (p?.new?.payload as Envelope) || (p?.new as Envelope) || null;
      if (env) onChange(env as PersistShape, { clientId: env._clientId, rev: env._rev });
    }).subscribe();
  return () => { try { ch.unsubscribe(); } catch {} };
}
