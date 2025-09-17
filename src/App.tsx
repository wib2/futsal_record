/* App.tsx - condensed but functionally same */
import React, { useEffect, useMemo, useRef, useState } from "react";
import { asArray, asNumber, ensureSunday, getQueryFlag, sha256Hex, toISO, uid } from "./utils/helpers";
import { loadLocal, saveLocal, remoteLoad, remoteSave, remoteSubscribe, supaEnabled, ensureClientId } from "./utils/storage";
import type { PersistShape, Session, Player, Match, MatchStats, TeamId } from "./utils/storage";

const TEAM_IDS: TeamId[] = ["A","B","C"];
const DEFAULT_PLAYERS = [
  { name: "강민성", pos: "필드" }, { name: "이용범", pos: "GK" }, { name: "이호준", pos: "필드" }, { name: "최광민", pos: "필드" },
  { name: "성은호", pos: "필드" }, { name: "배호성", pos: "필드" }, { name: "강종혁", pos: "필드" }, { name: "이창주", pos: "필드" },
  { name: "주경범", pos: "필드" }, { name: "최우현", pos: "필드" }, { name: "최준형", pos: "GK" }, { name: "김한진", pos: "GK" },
  { name: "장지영", pos: "필드" }, { name: "최준혁", pos: "필드" }, { name: "정민창", pos: "필드" }, { name: "김규연", pos: "필드" },
  { name: "김병준", pos: "필드" }, { name: "윤호석", pos: "필드" }, { name: "이세형", pos: "필드" }, { name: "정제윈", pos: "필드" },
  { name: "한형진", pos: "필드" }
] as const;

const LS_PIN_HASH = "goldin_futsal_admin_pin_hash";
const SS_PIN_AUTHED = "goldin_futsal_admin_authed";

function emptySession(): Session { return { rosters:{A:[],B:[],C:[]}, matches:[], matchStats:{}, defAwards:{A:null,B:null,C:null}, notes:"" }; }
function ensureSession(map:Record<string,Session>, date:string):Session{ const k=ensureSunday(date); return map[k]||emptySession(); }

type StandingRow = { team: TeamId; pts:number; gf:number; ga:number; gd:number; w:number; d:number; l:number };
function computeStandings(matchesInput:Match[]|null|undefined):StandingRow[]{
  const matches = asArray<Match>(matchesInput,[]);
  const t:Record<TeamId,StandingRow>={A:{team:"A",pts:0,gf:0,ga:0,gd:0,w:0,d:0,l:0},B:{team:"B",pts:0,gf:0,ga:0,gd:0,w:0,d:0,l:0},C:{team:"C",pts:0,gf:0,ga:0,gd:0,w:0,d:0,l:0}};
  for(const m of matches){ const HG=asNumber(m.hg,0), AG=asNumber(m.ag,0); t[m.home].gf+=HG; t[m.home].ga+=AG; t[m.away].gf+=AG; t[m.away].ga+=HG;
    if(HG>AG){t[m.home].pts+=3;t[m.home].w++;t[m.away].l++;} else if(HG<AG){t[m.away].pts+=3;t[m.away].w++;t[m.home].l++;} else {t[m.home].pts++;t[m.away].pts++;t[m.home].d++;t[m.away].d++;}}
  for(const x of TEAM_IDS) t[x].gd=t[x].gf-t[x].ga;
  return Object.values(t).sort((a,b)=> b.pts-a.pts || b.gd-a.gd || b.gf-a.gf || a.team.localeCompare(b.team));
}
function computeTeamBonus(st:StandingRow[]):Record<TeamId,number>{const out:{[k in TeamId]:number}={A:0,B:0,C:0}; st.map(s=>s.team).forEach((tid,i)=>out[tid]=i===0?4:i===1?2:1); return out;}

const SAVE_DEBOUNCE_MS=200;

export default function App(){
  const today=ensureSunday(toISO(new Date()));
  const fallback:PersistShape={players:DEFAULT_PLAYERS.map(p=>({id:uid(),name:p.name,active:true,pos:p.pos as any})),teamNames:{A:"팀 A",B:"팀 B",C:"팀 C"},sessionsByDate:{[today]:emptySession()},sessionDate:today};
  const initial=loadLocal()??fallback;

  const [players,setPlayers]=useState<Player[]>(initial.players);
  const [teamNames,setTeamNames]=useState<Record<TeamId,string>>(initial.teamNames);
  const [sessionDate,setSessionDate]=useState<string>(initial.sessionDate);
  const [sessionsByDate,setSessionsByDate]=useState<Record<string,Session>>(initial.sessionsByDate);

  const viewerFlag=getQueryFlag('viewer','view','readonly');
  const [pinHash,setPinHash]=useState<string|null>(()=>localStorage.getItem(LS_PIN_HASH));
  const [authed,setAuthed]=useState<boolean>(()=>sessionStorage.getItem(SS_PIN_AUTHED)==='1');
  const [pinInput,setPinInput]=useState('');
  const readonly=viewerFlag||!authed;

  const lastRevRef=useRef<number>(0); const saveTimerRef=useRef<number|undefined>(); const myClientIdRef=useRef<string|null>(null);
  useEffect(()=>{ myClientIdRef.current = ensureClientId(); },[]);

  useEffect(()=>{ const state:PersistShape={players,teamNames,sessionsByDate,sessionDate:ensureSunday(sessionDate)}; saveLocal(state);
    if(readonly) return;
    if(supaEnabled()){ if(saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current=window.setTimeout(async()=>{ const nextRev=Date.now(); lastRevRef.current=nextRev; try{await remoteSave(state,nextRev);}catch{} }, SAVE_DEBOUNCE_MS) as unknown as number; }
  },[players,teamNames,sessionsByDate,sessionDate,readonly]);

  useEffect(()=>{ if(!supaEnabled()) return; (async()=>{ const remote=await remoteLoad(); if(remote){ setPlayers(remote.players); setTeamNames(remote.teamNames); setSessionDate(remote.sessionDate); setSessionsByDate(remote.sessionsByDate);} })();
    const unsub=remoteSubscribe((p,meta)=>{ const mine=meta?.clientId && myClientIdRef.current && meta.clientId===myClientIdRef.current; const stale=typeof meta?.rev==='number' && meta.rev<=lastRevRef.current; if(mine&&stale) return;
      setPlayers(p.players); setTeamNames(p.teamNames); setSessionDate(p.sessionDate); setSessionsByDate(p.sessionsByDate); if(typeof meta?.rev==='number' && meta.rev>lastRevRef.current) lastRevRef.current=meta.rev; });
    return ()=>unsub();
  },[]);

  const cur=useMemo(()=>ensureSession(sessionsByDate,sessionDate),[sessionsByDate,sessionDate]);

  const patchSession=(patch:Partial<Session>)=>{ if(readonly) return; setSessionsByDate(prev=>{ const k=ensureSunday(sessionDate); const base=ensureSession(prev,k); return {...prev,[k]:{...base,...patch} as Session}; }); };
  const addPlayer=(name:string)=>{ if(readonly) return; const nm=name.trim(); if(!nm) return; if(players.some(p=>p.name===nm)) return alert("이미 있는 이름입니다"); setPlayers(prev=>[...prev,{id:uid(),name:nm,active:true,pos:"필드"}].sort((a,b)=>a.name.localeCompare(b.name,'ko'))); };
  const updateTeamName=(tid:TeamId,nm:string)=>{ if(readonly) return; setTeamNames(prev=>({...prev,[tid]:nm})); };
  const toggleRoster=(tid:TeamId,pid:string)=>patchSession({ rosters:(()=>{ const r={...cur.rosters}; const list=asArray(r[tid],[]); r[tid]=list.includes(pid)? list.filter(id=>id!==pid):[...list,pid]; return r; })() });
  const addMatch=()=>patchSession({ matches:[...asArray(cur.matches,[]),{id:uid(),home:"A",away:"B",hg:0,ag:0,gkHome:null,gkAway:null}] });
  const updateMatch=(id:string,patch:Partial<Match>)=>patchSession({ matches:asArray(cur.matches,[]).map(m=>m.id===id?{...m,...patch}:m) });
  const deleteMatch=(id:string)=>patchSession({ matches:asArray(cur.matches,[]).filter(m=>m.id!==id) });
  const setDef=(tid:TeamId,pid:string|null)=>patchSession({ defAwards:{...(cur.defAwards||{A:null,B:null,C:null}),[tid]:pid} });
  const setMatchStat=(mid:string,pid:string,field:"goals"|"assists"|"cleansheets",value:number)=>{ if(readonly) return; const row={...(cur.matchStats?.[mid]||{})} as MatchStats; const curv=row[pid]||{goals:0,assists:0,cleansheets:0}; row[pid]={...curv,[field]:value} as any; patchSession({ matchStats:{...cur.matchStats,[mid]:row} }); };
  const setNotes=(txt:string)=>patchSession({ notes:txt });
  const changeDate=(v:string)=>{ const sunday=ensureSunday(v); setSessionDate(sunday); if(readonly) return; setSessionsByDate(prev=>({...prev,[sunday]:ensureSession(prev,sunday)})); };

  function calcScores(session:Session){
    const out:Record<string,any>={};
    const teamOf=(pid:string):TeamId|"-"=>(session.rosters.A||[]).includes(pid)?"A":(session.rosters.B||[]).includes(pid)?"B":(session.rosters.C||[]).includes(pid)?"C":"-";
    const standings=computeStandings(session.matches); const teamBonus=computeTeamBonus(standings);
    asArray(session.matches,[]).forEach(m=>{
      const ms=session.matchStats?.[m.id]||{};
      Object.entries(ms).forEach(([pid,s])=>{ const team=teamOf(pid); const b=out[pid]||{goals:0,assists:0,cleansheets:0}; const gg=asNumber((s as any).goals,0), aa=asNumber((s as any).assists,0), cc=asNumber((s as any).cleansheets,0); out[pid]={goals:b.goals+gg,assists:b.assists+aa,cleansheets:b.cleansheets+cc,team}; });
      const gkPick=(tid:TeamId)=>{ if(tid===m.home && m.gkHome) return [m.gkHome]; if(tid===m.away && m.gkAway) return [m.gkAway]; const ids=asArray(session.rosters[tid],[]); const one=ids.find(pid=>(players.find(p=>p.id===pid)?.pos||"필드")==="GK"); return one?[one]:[]; };
      if(asNumber(m.ag,0)===0){ gkPick(m.home).forEach(pid=>{ const b=out[pid]||{goals:0,assists:0,cleansheets:0,team:m.home}; out[pid]={...b,cleansheets:(b.cleansheets||0)+1,team:m.home}; }); }
      if(asNumber(m.hg,0)===0){ gkPick(m.away).forEach(pid=>{ const b=out[pid]||{goals:0,assists:0,cleansheets:0,team:m.away}; out[pid]={...b,cleansheets:(b.cleansheets||0)+1,team:m.away}; }); }
    });
    TEAM_IDS.forEach(tid=>asArray(session.rosters[tid],[]).forEach(pid=>{ if(!out[pid]) out[pid]={goals:0,assists:0,cleansheets:0,team:tid}; }));
    Object.keys(out).forEach(pid=>{ const team=out[pid].team as TeamId|"-"; const def=team!=="-" && (cur.defAwards?.[team]||null)===pid?2:0; const tb=team!=="-"?(teamBonus[team]||0):0; const total=out[pid].goals+out[pid].assists+out[pid].cleansheets+def+tb;
      out[pid]={...out[pid],def,teamBonus:tb,total,name:players.find(p=>p.id===pid)?.name||"?",teamName:team==="-"?"-":teamNames[team]}; });
    return out;
  }

  const dailyScores=useMemo(()=>calcScores(cur),[cur,players,teamNames]);
  const sortedDaily=useMemo(()=>Object.entries(dailyScores).map(([pid,v]:any)=>({id:pid,...v})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'ko')),[dailyScores]);
  const cumulativeScores=useMemo(()=>{ const agg:Record<string,any>={}; Object.values(sessionsByDate).forEach(s=>{ const sc=calcScores(s); const present=new Set<string>(); TEAM_IDS.forEach(t=>asArray(s.rosters[t],[]).forEach(pid=>present.add(pid)));
    Object.entries(sc).forEach(([pid,v]:any)=>{ const b=agg[pid]||{goals:0,assists:0,cleansheets:0,def:0,teamBonus:0,total:0,days:0,name:v.name,teamName:v.teamName};
      agg[pid]={...b,goals:b.goals+v.goals,assists:b.assists+v.assists,cleansheets:b.cleansheets+v.cleansheets,def:b.def+v.def,teamBonus:b.teamBonus+v.teamBonus,total:b.total+v.total,days:b.days+(present.has(pid)?1:0)}; });
    present.forEach(pid=>{ if(!agg[pid]) agg[pid]={goals:0,assists:0,cleansheets:0,def:0,teamBonus:0,total:0,days:1,name:"?",teamName:""}; }); }); return agg; },[sessionsByDate,players,teamNames]);
  const sortedCumulative=useMemo(()=>Object.entries(cumulativeScores).map(([pid,v]:any)=>({id:pid,...v,average:v.days>0?Math.round((v.total/v.days)*100)/100:0})).sort((a,b)=>b.total-a.total||a.name.localeCompare(b.name,'ko')),[cumulativeScores]);

  async function setPin(){ if(!pinInput) return alert("PIN을 입력하세요"); const h=await sha256Hex(pinInput); localStorage.setItem(LS_PIN_HASH,h); setPinHash(h); sessionStorage.setItem(SS_PIN_AUTHED,'1'); setAuthed(true); setPinInput(''); }
  async function unlock(){ if(!pinInput) return alert("PIN을 입력하세요"); const h=await sha256Hex(pinInput); if(h===pinHash){ sessionStorage.setItem(SS_PIN_AUTHED,'1'); setAuthed(true); setPinInput(''); } else alert("PIN 불일치"); }
  function lock(){ sessionStorage.removeItem(SS_PIN_AUTHED); setAuthed(false); }
  function copyViewerLink(){ const url=new URL(window.location.href); url.searchParams.set('viewer','1'); navigator.clipboard?.writeText(url.toString()); alert("보기 전용 링크가 복사되었습니다"); }

  return (<div style={{maxWidth:1200,margin:"0 auto",padding:16,fontFamily:'system-ui, -apple-system, Segoe UI, Roboto, "Noto Sans KR", sans-serif'}}>
    <h1 style={{fontSize:22,fontWeight:800}}>골딘 풋살 리그 · 기록/집계</h1>
    <div style={{display:'flex',gap:8,alignItems:'center',flexWrap:'wrap',marginBottom:12,padding:10,border:'1px dashed #bbb',borderRadius:8,background:'#fafafa'}}>
      {getQueryFlag('viewer')&&<span style={{fontSize:12,color:'#a00',fontWeight:700}}>보기 전용 링크 모드</span>}
      {!pinHash? <><span style={{fontWeight:700}}>관리자 PIN 설정:</span><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} placeholder="새 PIN"/><button onClick={setPin}>설정</button><span style={{fontSize:12,color:'#666'}}>※ 최초 1회만 설정하면 됩니다.</span></>
      : authed? <><span style={{color:'#0a0',fontWeight:700}}>관리자 모드</span><button onClick={lock}>잠금</button><button onClick={copyViewerLink}>보기 전용 링크 복사</button><span style={{marginLeft:8,fontSize:12,color:supaEnabled()?'#0a0':'#a00'}}>실시간: {supaEnabled()?'켜짐(환경변수 설정됨)':'꺼짐(환경변수 없음)'}</span></>
      : <><span style={{fontWeight:700}}>관리자 PIN:</span><input type="password" value={pinInput} onChange={e=>setPinInput(e.target.value)} placeholder="PIN 입력"/><button onClick={unlock}>잠금 해제</button><button onClick={copyViewerLink}>보기 전용 링크 복사</button></>}
    </div>

    <div style={{display:'flex',gap:8,alignItems:'center',margin:'8px 0 12px'}}>
      <label style={{fontWeight:600}}>날짜(일요일만):</label>
      <input 
        type="date"
        value={sessionDate}
        onChange={(e) => changeDate(e.target.value)}
        // viewer 모드에서는 날짜 선택 허용
        disabled={!authed && !viewerFlag ? true : false}
        />
      <span style={{color:'#888',fontSize:12}}>일요일이 아니면 자동 보정</span>
    </div>

    <section style={box}><h3>선수 관리</h3><AddPlayer onAdd={addPlayer} disabled={readonly}/>
      <div style={{fontSize:12,color:'#666',marginBottom:6}}>선수 명단은 모든 날짜에 공통 적용됩니다.</div>
      <div style={{maxHeight:280,overflow:"auto"}}>{players.map(p=>(
        <div key={p.id} style={{display:'flex',gap:8,alignItems:'center',padding:'4px 0'}}>
          <input value={p.name} onChange={e=>readonly?null:setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,name:e.target.value}:x))} disabled={readonly}/>
          <select value={p.pos} onChange={e=>readonly?null:setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,pos:e.target.value as Player['pos']}:x))} disabled={readonly}>
            <option value="필드">필드</option><option value="GK">GK</option>
          </select>
          <button onClick={()=>readonly?null:setPlayers(prev=>prev.map(x=>x.id===p.id?{...x,active:!x.active}:x))} disabled={readonly}>{p.active?"활성":"비활성"}</button>
        </div>))}
      </div>
    </section>

    <section style={box}><h3>팀 구성 & 팀명</h3>
      <div style={{display:'grid',gridTemplateColumns:'repeat(3, 1fr)',gap:8}}>
        {TEAM_IDS.map(tid=>(<div key={tid} style={{border:'1px solid #ddd',borderRadius:8,padding:8}}>
          <div style={{display:'flex',gap:8,alignItems:'center',marginBottom:6}}>
            <input value={teamNames[tid]} onChange={e=>updateTeamName(tid,e.target.value)} disabled={readonly}/>
            <span style={{marginLeft:'auto',fontSize:12,color:'#555'}}>{tid}</span>
          </div>
          <div style={{maxHeight:200,overflow:"auto"}}>
            {players.filter(p=>p.active).map(p=>(<label key={p.id} style={{display:'flex',gap:6,alignItems:'center',fontSize:14}}>
              <input type="checkbox" checked={asArray(cur.rosters[tid],[]).includes(p.id)} onChange={()=>toggleRoster(tid,p.id)} disabled={readonly}/>
              {p.name} {p.pos==="GK"&&<span style={{fontSize:12,color:'#888'}}>(GK)</span>}
            </label>))}
          </div>
          <div style={{marginTop:8}}>
            <label>수비상(+2): </label>
            <select value={cur.defAwards?.[tid]||""} onChange={e=>setDef(tid,e.target.value||null)} disabled={readonly}>
              <option value="">선택 안 함</option>
              {asArray(cur.rosters[tid],[]).map(pid=><option key={pid} value={pid}>{players.find(p=>p.id===pid)?.name||"?"}</option>)}
            </select>
          </div>
        </div>))}
      </div>
    </section>

    <section style={box}><h3>경기 결과 (리그전)</h3>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:6}}>
        <div style={{color:'#666',fontSize:14}}>승:3 / 무:1 / 패:0 · 각 경기의 <b>기록</b>에서 선수별 G/A/CS 입력</div>
        <button onClick={addMatch} disabled={readonly}>경기 추가</button>
      </div>
      {asArray(cur.matches,[]).length===0 && <p style={{color:'#777'}}>경기를 추가하세요.</p>}
      <div style={{display:'grid',gap:6}}>{asArray(cur.matches,[]).map(m=>(
        <MatchRow key={m.id} m={m} readonly={readonly} updateMatch={updateMatch} deleteMatch={deleteMatch}
          rosterA={asArray(cur.rosters[m.home],[])} rosterB={asArray(cur.rosters[m.away],[])} players={players}
          values={cur.matchStats?.[m.id]||{}} onChange={(pid,field,val)=>setMatchStat(m.id,pid,field,val)} />))}
      </div>
      <div style={{marginTop:12,overflowX:'auto'}}>
        <h4>순위표 (팀 보너스: 1위 4 / 2위 2 / 3위 1)</h4>
        <table style={table}><thead><tr><th>순위</th><th>팀</th><th>승점</th><th>승</th><th>무</th><th>패</th><th>득점</th><th>실점</th><th>득실</th><th>팀</th></tr></thead>
        <tbody>{computeStandings(cur.matches).map((t,idx)=>(
          <tr key={t.team}><td>{idx+1}</td><td>{teamNames[t.team]} <span style={{color:"#888"}}>({t.team})</span></td><td>{t.pts}</td><td>{t.w}</td><td>{t.d}</td><td>{t.l}</td><td>{t.gf}</td><td>{t.ga}</td><td>{t.gd}</td><td style={{fontWeight:700}}>{computeTeamBonus(computeStandings(cur.matches))[t.team]}</td></tr>
        ))}</tbody></table>
      </div>
    </section>

    <section style={box}><h3>오늘의 개인 순위</h3>
      <div style={{overflowX:'auto'}}><table style={table}>
        <thead><tr><th>순위</th><th>선수</th><th>팀</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th></tr></thead>
        <tbody>{sortedDaily.map((r:any,idx:number)=>(<tr key={r.id}><td>{idx+1}</td><td>{r.name}</td><td>{r.teamName||"-"}</td><td>{r.goals||0}</td><td>{r.assists||0}</td><td>{r.cleansheets||0}</td><td>{r.def||0}</td><td>{r.teamBonus||0}</td><td style={{fontWeight:700}}>{r.total||0}</td></tr>))}</tbody>
      </table></div>
    </section>

    <section style={box}><h3>누적 순위 (모든 날짜)</h3>
      <div style={{overflowX:'auto'}}><table style={table}>
        <thead><tr><th>순위</th><th>선수</th><th>참여</th><th>G</th><th>A</th><th>CS</th><th>수비</th><th>팀</th><th>총점</th><th>평균</th></tr></thead>
        <tbody>{Object.entries(cumulativeScores).map(([pid,v]:any,idx:number)=>{ const row:any={id:pid,...v,average:v.days>0?Math.round((v.total/v.days)*100)/100:0};
          return (<tr key={row.id}><td>{idx+1}</td><td>{row.name}</td><td>{row.days}</td><td>{row.goals}</td><td>{row.assists}</td><td>{row.cleansheets}</td><td>{row.def}</td><td>{row.teamBonus}</td><td style={{fontWeight:700}}>{row.total}</td><td>{row.average}</td></tr>); })}</tbody>
      </table></div>
    </section>

    <section style={box}><h3>비고 / 메모</h3><textarea value={cur.notes} onChange={e=>setNotes(e.target.value)} placeholder="예: 특이사항 등" style={{width:"100%",minHeight:80}} disabled={readonly}/></section>
    <p style={{textAlign:"center",color:"#777",fontSize:12,marginTop:16}}>© 골딘 기록앱</p>
  </div>);
}

function MatchRow({ m, readonly, updateMatch, deleteMatch, rosterA, rosterB, players, values, onChange }:{ m:Match; readonly:boolean; updateMatch:(id:string,patch:Partial<Match>)=>void; deleteMatch:(id:string)=>void; rosterA:string[]; rosterB:string[]; players:Player[]; values:MatchStats; onChange:(pid:string,field:"goals"|"assists"|"cleansheets",value:number)=>void; }){
  const [open,setOpen]=useState(false); const name=(pid:string)=>players.find(p=>p.id===pid)?.name||"?"; const pos=(pid:string)=>players.find(p=>p.id===pid)?.pos||"필드";
  return (<div style={{border:"1px solid #eee",borderRadius:8,padding:8}}>
    <div style={{display:"grid",gridTemplateColumns:"1fr 60px 20px 60px 1fr auto",gap:6,alignItems:"center"}}>
      <select value={m.home} onChange={e=>updateMatch(m.id,{home:e.target.value as TeamId})} disabled={readonly}><option value="A">팀 A</option><option value="B">팀 B</option><option value="C">팀 C</option></select>
      <input type="number" value={m.hg} onChange={e=>updateMatch(m.id,{hg:+e.target.value||0})} disabled={readonly}/>
      <div style={{textAlign:"center",fontWeight:700}}>:</div>
      <input type="number" value={m.ag} onChange={e=>updateMatch(m.id,{ag:+e.target.value||0})} disabled={readonly}/>
      <select value={m.away} onChange={e=>updateMatch(m.id,{away:e.target.value as TeamId})} disabled={readonly}><option value="A">팀 A</option><option value="B">팀 B</option><option value="C">팀 C</option></select>
      <div style={{display:"flex",gap:6}}><button onClick={()=>setOpen(v=>!v)}>{open?"기록 닫기":"기록"}</button><button onClick={()=>deleteMatch(m.id)} style={{color:"#a00"}} disabled={readonly}>삭제</button></div>
    </div>
    <div style={{display:"flex",gap:10,alignItems:"center",marginTop:6}}>
      <div><div style={{fontSize:12,color:"#666"}}>홈 GK</div>
        <select value={m.gkHome||""} onChange={e=>updateMatch(m.id,{gkHome:e.target.value||null})} disabled={readonly}><option value="">선택 안 함</option>
          {asArray(rosterA,[]).filter(pid=>(players.find(p=>p.id===pid)?.pos||"필드")==="GK").map(pid=><option key={pid} value={pid}>{name(pid)}</option>)}
        </select>
      </div>
      <div><div style={{fontSize:12,color:"#666"}}>원정 GK</div>
        <select value={m.gkAway||""} onChange={e=>updateMatch(m.id,{gkAway:e.target.value||null})} disabled={readonly}><option value="">선택 안 함</option>
          {asArray(rosterB,[]).filter(pid=>(players.find(p=>p.id===pid)?.pos||"필드")==="GK").map(pid=><option key={pid} value={pid}>{name(pid)}</option>)}
        </select>
      </div>
    </div>
    {open&&(<div style={{marginTop:8}}><div style={{display:"grid",gridTemplateColumns:"repeat(3, 1fr)",gap:8}}>
      {[...(rosterA||[]),...(rosterB||[])].map(pid=>{ const v=values[pid]||{goals:0,assists:0,cleansheets:0}; return (
        <div key={pid} style={{border:"1px solid #f0f0f0",borderRadius:8,padding:8}}>
          <div style={{fontWeight:600,marginBottom:6}}>{name(pid)} ({pos(pid)})</div>
          <div style={{display:"flex",gap:6,alignItems:"center",flexWrap:"wrap"}}>
            <label>G</label><input type="number" value={v.goals} onChange={e=>onChange(pid,"goals",+e.target.value||0)} style={{width:60}} disabled={readonly}/>
            <label>A</label><input type="number" value={v.assists} onChange={e=>onChange(pid,"assists",+e.target.value||0)} style={{width:60}} disabled={readonly}/>
            <label>CS</label><input type="number" value={v.cleansheets} onChange={e=>onChange(pid,"cleansheets",+e.target.value||0)} style={{width:60}} disabled={readonly}/>
          </div>
        </div> ); })}
    </div></div>)}
  </div>);
}

function AddPlayer({ onAdd, disabled }:{ onAdd:(name:string)=>void; disabled?:boolean }){
  const [name,setName]=useState("");
  return (<div style={{display:"flex",gap:8,marginBottom:8}}>
    <input placeholder="이름" value={name} onChange={e=>setName(e.target.value)} onKeyDown={e=>{ if(e.key==="Enter"&&!disabled){ onAdd(name); setName(""); } }} disabled={disabled}/>
    <button onClick={()=>{ if(!disabled){ onAdd(name); setName(""); } }} disabled={disabled}>추가</button>
  </div>);
}

const box:React.CSSProperties={border:"1px solid #ddd",borderRadius:10,padding:12,marginTop:12,background:"#fff"};
const table={width:"100%",borderCollapse:"collapse"} as React.CSSProperties;

const style=document.createElement("style"); style.id="goldin-style"; style.innerHTML=`
  table th, table td { border-bottom: 1px solid #eee; padding: 6px 8px; text-align: center; }
  table th { background: #f7f7f7; }
  input, select, textarea, button { padding: 6px 8px; border: 1px solid #ccc; border-radius: 6px; }
  button { background: #f1f1f1; cursor: pointer; }
  button:hover { filter: brightness(0.97); }
  @media (max-width: 600px) { table { display: block; overflow-x: auto; white-space: nowrap; } table th, table td { font-size: 12px; padding: 4px; } input, select, button { font-size: 14px; width: auto; } }
`; if(typeof document!=="undefined" && !document.getElementById("goldin-style")) document.head.appendChild(style);
