-- 새 댓글 알림 트리거 — notify-comment Edge Function 호출.
--
-- 댓글 등록 경로가 둘이라(로그인=PostgREST 직접 insert, 익명=post-comment 함수)
-- 애플리케이션 코드가 아니라 테이블 트리거에 걸어야 양쪽을 모두 잡는다.
--
-- 실행 전:
--   1) Supabase 대시보드 > Database > Webhooks 를 한 번 열어 활성화한다.
--      (supabase_functions 스키마와 pg_net 확장이 이때 생성된다)
--   2) supabase functions deploy notify-comment --no-verify-jwt
--   3) supabase secrets set NOTIFY_SECRET=<임의의 긴 문자열>
--
-- 실행:
--   아래 __NOTIFY_SECRET__ 를 위 2)에서 정한 값으로 바꿔서 SQL Editor에 붙여넣는다.
--   !! 치환한 실제 값은 커밋하지 말 것 — 이 파일은 플레이스홀더 상태로 유지한다.

drop trigger if exists comments_notify_insert on public.comments;

create trigger comments_notify_insert
  after insert on public.comments
  for each row
  execute function supabase_functions.http_request(
    'https://cdpxmvjsgfpfkivyjvtv.supabase.co/functions/v1/notify-comment',
    'POST',
    '{"Content-Type":"application/json","x-notify-secret":"__NOTIFY_SECRET__"}',
    '{}',
    '5000'
  );

-- 확인: 트리거가 붙었는지
--   select tgname from pg_trigger where tgrelid = 'public.comments'::regclass and not tgisinternal;
--
-- 발송 로그(실패 진단):
--   select * from net._http_response order by created desc limit 10;
