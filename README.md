# 골딘 풋살 리그 · 기록/집계 앱 (Vite + React + TS)

## 실행
```bash
npm i
npm run dev
```
- 로컬: http://localhost:5173
- 보기 전용: `/?viewer=1`
- 상단에서 관리자 PIN 설정

## 배포 (Vercel)
- Build Command: `npm run build`
- Output: `dist`
- Node 20.x

## (선택) 실시간 동기화: Supabase
환경변수 추가:
- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_ANON_KEY`

SQL:
```sql
create table if not exists public.futsal_state (
  id int primary key,
  payload jsonb
);
insert into public.futsal_state (id, payload) values (1, '{}'::jsonb)
on conflict (id) do nothing;
```
Realtime: `futsal_state` 구독 활성화
