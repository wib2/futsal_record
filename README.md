# 골딘 풋살 리그 · 기록/집계 (Supabase 실시간 버전)

- React + Vite + TypeScript
- 실시간 공유: Supabase (Postgres + Realtime)
- 관리자 PIN / 보기 전용 링크
- 경기별 G/A/CS 입력, GK 자동 CS, 수비상(+2), 팀 보너스(4/2/1)
- 오늘의 개인 순위 + 누적 순위(평균)

## 로컬 실행
```bash
npm i
npm run dev
```

## Vercel 배포 설정
- Build Command: `npm run build`
- Output Directory: `dist`
- Node: 20.x

### 환경 변수
- `VITE_SUPABASE_URL` = Supabase Project URL
- `VITE_SUPABASE_ANON_KEY` = Supabase anon public key

## Supabase 초기 SQL
```sql
create table if not exists public.futsal_state (
  id int primary key,
  payload jsonb
);
insert into public.futsal_state (id, payload) values (1, '{}'::jsonb)
on conflict (id) do nothing;

alter table public.futsal_state enable row level security;
create policy if not exists "allow anon read" on public.futsal_state for select to anon using (true);
create policy if not exists "allow anon insert" on public.futsal_state for insert to anon with check (id = 1);
create policy if not exists "allow anon update" on public.futsal_state for update to anon using (id = 1);

alter publication supabase_realtime add table public.futsal_state;
```
