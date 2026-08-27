#!/usr/bin/env node
/**
 * 댓글 알림 채널 설정 확인용. Supabase에 붙이기 "전에" 토큰이 맞는지 여기서 먼저 검증한다.
 *
 * 하는 일:
 *   1) TELEGRAM_CHAT_ID 를 안 넣으면 봇의 최근 대화에서 자동으로 찾아준다.
 *   2) 설정된 채널로 테스트 메시지를 실제 발송한다.
 *
 *   node scripts/notify-test.mjs
 *
 * 환경변수 (있는 것만 검사한다):
 *   TELEGRAM_BOT_TOKEN    @BotFather 발급 토큰
 *   TELEGRAM_CHAT_ID      선택 — 없으면 자동 탐색
 *   DISCORD_WEBHOOK_URL   디스코드 채널 웹후크 URL
 */

const TG_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
let TG_CHAT = process.env.TELEGRAM_CHAT_ID || '';
const DISCORD_URL = process.env.DISCORD_WEBHOOK_URL || '';

if (!TG_TOKEN && !DISCORD_URL) {
  console.error('TELEGRAM_BOT_TOKEN 또는 DISCORD_WEBHOOK_URL 중 최소 하나는 필요합니다.');
  process.exit(2);
}

let failed = 0;

async function telegram() {
  if (!TG_TOKEN) { console.log('\n[텔레그램] 건너뜀 (TELEGRAM_BOT_TOKEN 없음)'); return; }
  console.log('\n[텔레그램]');

  // 토큰 유효성 먼저 확인 — 잘못된 토큰의 증상을 chat_id 문제로 오해하지 않도록.
  const me = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getMe`).then((r) => r.json()).catch(() => null);
  if (!me || !me.ok) {
    console.log('  ✗ 토큰이 유효하지 않습니다. @BotFather가 준 값을 그대로 넣었는지 확인하세요.');
    console.log(`    응답: ${JSON.stringify(me)?.slice(0, 200)}`);
    failed++; return;
  }
  console.log(`  ✓ 봇 확인: @${me.result.username}`);

  if (!TG_CHAT) {
    console.log('  · TELEGRAM_CHAT_ID 미지정 → 최근 대화에서 탐색 중…');
    const up = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/getUpdates`).then((r) => r.json()).catch(() => null);
    const chats = new Map();
    for (const u of (up?.result ?? [])) {
      const c = u.message?.chat ?? u.channel_post?.chat;
      if (c) chats.set(String(c.id), c);
    }
    if (!chats.size) {
      console.log(`  ✗ 대화를 찾지 못했습니다.`);
      console.log(`    텔레그램에서 @${me.result.username} 를 열고 /start 를 한 번 보낸 뒤 다시 실행하세요.`);
      failed++; return;
    }
    for (const [id, c] of chats) {
      const label = c.title || [c.first_name, c.last_name].filter(Boolean).join(' ') || c.username || '(이름없음)';
      console.log(`    발견: chat_id=${id}  (${c.type} / ${label})`);
    }
    TG_CHAT = [...chats.keys()][0];
    console.log(`  · 첫 번째 값으로 테스트합니다: TELEGRAM_CHAT_ID=${TG_CHAT}`);
  }

  const res = await fetch(`https://api.telegram.org/bot${TG_TOKEN}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: TG_CHAT,
      parse_mode: 'HTML',
      text: '💬 <b>새 댓글</b>\n\n<b>ㅇㅇ</b> <i>(123.45)</i>\n알림 테스트입니다\n\n<a href="https://blog.onetwohour.com/">blog.onetwohour.com</a>',
    }),
  });
  const j = await res.json().catch(() => ({}));
  if (res.ok && j.ok) console.log(`  ✓ 발송 성공 — 텔레그램을 확인하세요.  (TELEGRAM_CHAT_ID=${TG_CHAT})`);
  else { console.log(`  ✗ 발송 실패 ${res.status}: ${JSON.stringify(j).slice(0, 300)}`); failed++; }
}

async function discord() {
  if (!DISCORD_URL) { console.log('\n[디스코드] 건너뜀 (DISCORD_WEBHOOK_URL 없음)'); return; }
  console.log('\n[디스코드]');
  if (!/^https:\/\/(discord\.com|discordapp\.com)\/api\/webhooks\//.test(DISCORD_URL)) {
    console.log('  ! URL 형식이 웹후크가 아닌 것 같습니다: https://discord.com/api/webhooks/... 형태여야 합니다.');
  }
  const res = await fetch(DISCORD_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      embeds: [{
        title: '💬 새 댓글',
        description: '알림 테스트입니다',
        url: 'https://blog.onetwohour.com/',
        color: 0x4f8cff,
        author: { name: 'ㅇㅇ (123.45)' },
        footer: { text: '/테스트-글/' },
        timestamp: new Date().toISOString(),
      }],
    }),
  });
  if (res.ok) console.log('  ✓ 발송 성공 — 디스코드 채널을 확인하세요.');
  else { console.log(`  ✗ 발송 실패 ${res.status}: ${(await res.text()).slice(0, 300)}`); failed++; }
}

await telegram();
await discord();

console.log(failed ? `\n=== 실패 ${failed}건 — 위 메시지를 확인하세요 ===` : '\n=== 모두 정상. 이 값들을 Supabase 시크릿에 그대로 등록하세요 ===');
// fetch가 남긴 keep-alive 소켓이 있는 상태로 process.exit()을 부르면
// Windows에서 libuv assertion으로 죽는다. 종료 코드만 정하고 자연 종료시킨다.
process.exitCode = failed ? 1 : 0;
