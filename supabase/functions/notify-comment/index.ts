// 새 댓글 알림 — 텔레그램 + 디스코드로 동시 발송.
//
// comments 테이블의 INSERT 트리거(Database Webhook)가 호출한다.
// 댓글 경로가 둘(로그인=PostgREST 직접 insert, 익명=post-comment 함수)이라
// 애플리케이션이 아니라 DB 트리거에 걸어야 양쪽을 모두 잡는다.
//
// 배포: supabase functions deploy notify-comment --no-verify-jwt
//   (JWT 대신 x-notify-secret 헤더로 직접 인증한다. 트리거가 anon 키를 들고 오지 않기 때문.)
//
// 필요 시크릿 — supabase secrets set KEY=VALUE
//   NOTIFY_SECRET          필수. 트리거가 보내는 값과 일치해야 함.
//   TELEGRAM_BOT_TOKEN     @BotFather 발급 토큰
//   TELEGRAM_CHAT_ID       봇과의 대화 chat id
//   DISCORD_WEBHOOK_URL    채널 > 연동 > 웹후크 URL
//   SITE_URL               선택. 기본 https://blog.onetwohour.com
//   NOTIFY_SKIP_USER_ID    선택. 본인 댓글은 알림 제외할 때 본인 user_id

const SITE_URL = (Deno.env.get("SITE_URL") ?? "https://blog.onetwohour.com").replace(/\/+$/, "");
const NOTIFY_SECRET = Deno.env.get("NOTIFY_SECRET") ?? "";
const TG_TOKEN = Deno.env.get("TELEGRAM_BOT_TOKEN") ?? "";
const TG_CHAT = Deno.env.get("TELEGRAM_CHAT_ID") ?? "";
const DISCORD_URL = Deno.env.get("DISCORD_WEBHOOK_URL") ?? "";
const SKIP_USER_ID = Deno.env.get("NOTIFY_SKIP_USER_ID") ?? "";

const MAX_BODY = 500;

interface CommentRecord {
  id?: string;
  slug?: string;
  author_name?: string;
  body?: string;
  parent_id?: string | null;
  user_id?: string | null;
  ip?: string | null;
  created_at?: string;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

// 본문의 콘 단축코드(:code:)는 알림에선 이미지로 못 보여주니 표식으로 치환
function plainBody(raw: string): string {
  const t = (raw ?? "").replace(/:[a-z0-9_]{2,24}:/g, "[콘]").trim();
  if (!t) return "(내용 없음)";
  return t.length > MAX_BODY ? t.slice(0, MAX_BODY) + "…" : t;
}

function postUrl(slug: string): string {
  if (!slug) return SITE_URL;
  return SITE_URL + (slug.startsWith("/") ? slug : "/" + slug);
}

async function sendTelegram(rec: CommentRecord, anon: boolean): Promise<string> {
  if (!TG_TOKEN || !TG_CHAT) return "skipped(미설정)";
  const link = postUrl(rec.slug ?? "");
  const who = escapeHtml(rec.author_name ?? "익명") + (anon ? ` <i>(${escapeHtml(rec.ip ?? "")})</i>` : "");
  const text =
    `💬 <b>새 ${rec.parent_id ? "답글" : "댓글"}</b>\n\n` +
    `<b>${who}</b>\n` +
    `${escapeHtml(plainBody(rec.body ?? ""))}\n\n` +
    `<a href="${escapeHtml(link)}">${escapeHtml(decodeURIComponent(rec.slug ?? "/"))}</a>`;

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: false,
    }),
  });
  if (!res.ok) return `fail ${res.status}: ${(await res.text()).slice(0, 200)}`;
  return "ok";
}

async function sendDiscord(rec: CommentRecord, anon: boolean): Promise<string> {
  if (!DISCORD_URL) return "skipped(미설정)";
  const link = postUrl(rec.slug ?? "");
  const res = await fetch(DISCORD_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      embeds: [{
        title: `💬 새 ${rec.parent_id ? "답글" : "댓글"}`,
        description: plainBody(rec.body ?? ""),
        url: link,
        color: 0x4f8cff,
        author: { name: (rec.author_name ?? "익명") + (anon ? ` (${rec.ip ?? ""})` : "") },
        footer: { text: decodeURIComponent(rec.slug ?? "/") },
        timestamp: rec.created_at ?? new Date().toISOString(),
      }],
    }),
  });
  // 디스코드는 성공 시 204 No Content
  if (!res.ok) return `fail ${res.status}: ${(await res.text()).slice(0, 200)}`;
  return "ok";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  // 공개 엔드포인트라 공유 시크릿으로 직접 인증한다.
  if (!NOTIFY_SECRET || req.headers.get("x-notify-secret") !== NOTIFY_SECRET) {
    return new Response(JSON.stringify({ error: "unauthorized" }), {
      status: 401,
      headers: { "Content-Type": "application/json" },
    });
  }

  let payload: { type?: string; record?: CommentRecord };
  try {
    payload = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "bad json" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const rec = payload.record;
  if (payload.type !== "INSERT" || !rec) {
    return new Response(JSON.stringify({ ok: true, skipped: "not an insert" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  if (SKIP_USER_ID && rec.user_id === SKIP_USER_ID) {
    return new Response(JSON.stringify({ ok: true, skipped: "own comment" }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  const anon = !rec.user_id;
  // 한쪽이 실패해도 다른 쪽은 나가야 하므로 개별로 잡는다.
  const [tg, dc] = await Promise.all([
    sendTelegram(rec, anon).catch((e) => `error: ${e?.message ?? e}`),
    sendDiscord(rec, anon).catch((e) => `error: ${e?.message ?? e}`),
  ]);

  if (tg !== "ok" && !tg.startsWith("skipped")) console.error("telegram:", tg);
  if (dc !== "ok" && !dc.startsWith("skipped")) console.error("discord:", dc);

  // 트리거 쪽에서 재시도 폭주가 나지 않도록 결과와 무관하게 200으로 응답한다.
  return new Response(JSON.stringify({ ok: true, telegram: tg, discord: dc }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});
