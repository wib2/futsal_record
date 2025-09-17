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

const LS_KEY = "goldin_futsal_app_main_v7";
let supa: SupabaseClient | null = null;

const SUPA_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const SUPA_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;
const TABLE = "futsal_state";
const ROW_ID = 1;

export function supaEnabled(){ return !!(SUPA_URL && SUPA_KEY); }
export function supaInit(){
  if (!supaEnabled()) return null;
  if (!supa) supa = createClient(SUPA_URL!, SUPA_KEY!);
  return supa;
}
export async function remoteLoad(){
  if (!supaEnabled()) return null;
  supaInit();
  const { data, error } = await supa!.from(TABLE).select('payload').eq('id', ROW_ID).maybeSingle();
  if (error) return null;
  return (data?.payload as PersistShape) ?? null;
}
export async function remoteSave(state: PersistShape){
  if (!supaEnabled()) return;
  supaInit();
  await supa!.from(TABLE).upsert({ id: ROW_ID, payload: state });
}
export function remoteSubscribe(onChange:(p: PersistShape)=>void){
  if (!supaEnabled()) return () => {};
  supaInit();
  const ch = supa!.channel('state')
    .on('postgres_changes', { event:'UPDATE', schema:'public', table: TABLE, filter: `id=eq.${ROW_ID}` }, (p:any)=>{
      const payload = p?.new?.payload as PersistShape | undefined;
      if (payload) onChange(payload);
    }).subscribe();
  return () => { try { ch.unsubscribe(); } catch {} };
}
export function loadLocal(): PersistShape | null {
  try {
    const raw = localStorage.getItem(LS_KEY);
    return raw ? JSON.parse(raw) as PersistShape : null;
  } catch { return null; }
}
export function saveLocal(state: PersistShape){
  try { localStorage.setItem(LS_KEY, JSON.stringify(state)); } catch {}
}
export function migrateSessionKey(date: string){ return ensureSunday(date); }
