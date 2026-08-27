-- 새 댓글 알림 트리거 — notify-comment Edge Function 호출.
--
-- 댓글 등록 경로가 둘이라(로그인=PostgREST 직접 insert, 익명=post-comment 함수)
-- 애플리케이션 코드가 아니라 테이블 트리거에 걸어야 양쪽을 모두 잡는다.
--
-- 대시보드 Integrations > Webhooks 로 만드는 것과 동작은 같지만,
-- pg_net을 직접 쓰므로 UI 위치나 supabase_functions 스키마 존재 여부에 의존하지 않는다.
--
-- 실행 전:
--   1) Edge Function 배포 (대시보드 > Edge Functions > Deploy a new function > Via Editor)
--      이름은 notify-comment, Verify JWT 는 끈다.
--   2) 시크릿 등록 (대시보드 > Project Settings > Edge Functions > Secrets)
--      NOTIFY_SECRET / TELEGRAM_BOT_TOKEN / TELEGRAM_CHAT_ID / DISCORD_WEBHOOK_URL
--
-- 실행:
--   아래 __NOTIFY_SECRET__ 를 2)에서 정한 NOTIFY_SECRET 값으로 바꿔 SQL Editor에 붙여넣는다.
--   !! 치환한 실제 값은 커밋하지 말 것 — 이 파일은 플레이스홀더 상태로 유지한다.

create extension if not exists pg_net;

create or replace function public.notify_new_comment()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public
as $$
begin
  -- 알림이 실패해도 댓글 저장 자체는 절대 막지 않는다.
  begin
    perform net.http_post(
      url := 'https://cdpxmvjsgfpfkivyjvtv.supabase.co/functions/v1/notify-comment',
      body := jsonb_build_object(
        'type', 'INSERT',
        'table', tg_table_name,
        'schema', tg_table_schema,
        'record', to_jsonb(new),
        'old_record', null
      ),
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'x-notify-secret', '__NOTIFY_SECRET__'
      ),
      timeout_milliseconds := 5000
    );
  exception when others then
    raise warning 'notify_new_comment failed: %', sqlerrm;
  end;
  return new;
end;
$$;

drop trigger if exists comments_notify_insert on public.comments;

create trigger comments_notify_insert
  after insert on public.comments
  for each row
  execute function public.notify_new_comment();

-- 확인 --------------------------------------------------------------------
-- 트리거가 붙었는지:
--   select tgname from pg_trigger
--   where tgrelid = 'public.comments'::regclass and not tgisinternal;
--
-- 발송 결과 확인은 대시보드 > Edge Functions > notify-comment > Logs 가 가장 확실하다.
-- (요청이 함수까지 갔는지, 어떤 응답을 냈는지 그대로 보인다)
--
-- DB 쪽에서 보고 싶으면 pg_net의 내부 응답 테이블을 조회한다.
-- 공개 API가 아니라 버전에 따라 없을 수 있으니 없으면 위 Logs를 쓸 것:
--   select id, status_code, content, created
--   from net._http_response order by created desc limit 10;
--
-- 401 이 찍히면 이 파일의 __NOTIFY_SECRET__ 와
-- Edge Function 시크릿 NOTIFY_SECRET 값이 서로 다른 것이다.
