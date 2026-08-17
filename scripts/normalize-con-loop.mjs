#!/usr/bin/env node
/**
 * 이미 스토리지에 올라간 콘(webp/gif)의 반복 횟수를 무한(0)으로 정규화한다.
 * assets/js/cons.js 의 patchWebpLoop/patchGifLoop 와 동일한 로직 — 재인코딩 없이 루프 필드만 덮어쓴다.
 *
 * 신규 업로드는 cons.js가 이미 처리하므로, 이 스크립트는 기존 파일 보정용 1회성이다.
 * 멱등하므로 여러 번 돌려도 안전하다(이미 무한인 파일은 건너뜀).
 *
 *   node scripts/normalize-con-loop.mjs            # 변경 대상만 조회 (dry-run, 기본값)
 *   node scripts/normalize-con-loop.mjs --apply    # 실제 반영
 *
 * 필요 환경변수 (Supabase 대시보드 > Project Settings > API):
 *   SUPABASE_URL                (예: https://xxxx.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY   서비스 롤 키 — 절대 커밋하지 말 것
 */

const SUPABASE_URL = (process.env.SUPABASE_URL || '').replace(/\/+$/, '');
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const APPLY = process.argv.includes('--apply');
const BUCKET = 'emoticons';

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('SUPABASE_URL 과 SUPABASE_SERVICE_ROLE_KEY 환경변수가 필요합니다.');
  console.error('예) $env:SUPABASE_URL="https://xxxx.supabase.co"; $env:SUPABASE_SERVICE_ROLE_KEY="..."');
  process.exit(2);
}

/* ---------- cons.js 와 동일한 패치 로직 ---------- */
function patchWebpLoop(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  if (b.length < 16) return null;
  if (b[0] !== 0x52 || b[1] !== 0x49 || b[2] !== 0x46 || b[3] !== 0x46) return null;
  if (b[8] !== 0x57 || b[9] !== 0x45 || b[10] !== 0x42 || b[11] !== 0x50) return null;
  let off = 12;
  while (off + 8 <= b.length) {
    const size = dv.getUint32(off + 4, true);
    if (size > b.length - off - 8) return null;
    if (b[off] === 0x41 && b[off + 1] === 0x4E && b[off + 2] === 0x49 && b[off + 3] === 0x4D && size >= 6) {
      if (dv.getUint16(off + 12, true) === 0) return null;
      dv.setUint16(off + 12, 0, true);
      return buf;
    }
    off += 8 + size + (size & 1);
  }
  return null;
}
const GIF_NETSCAPE = [0x21, 0xFF, 0x0B, 0x4E, 0x45, 0x54, 0x53, 0x43, 0x41, 0x50, 0x45, 0x32, 0x2E, 0x30, 0x03, 0x01, 0x00, 0x00, 0x00];
function patchGifLoop(buf) {
  const b = new Uint8Array(buf);
  if (b.length < 14) return null;
  if (b[0] !== 0x47 || b[1] !== 0x49 || b[2] !== 0x46) return null;
  for (let i = 0; i + 18 < b.length; i++) {
    if (b[i] !== 0x21 || b[i + 1] !== 0xFF || b[i + 2] !== 0x0B) continue;
    let hit = true;
    for (let j = 3; j < 16; j++) { if (b[i + j] !== GIF_NETSCAPE[j]) { hit = false; break; } }
    if (!hit) continue;
    if (b[i + 16] === 0 && b[i + 17] === 0) return null;
    b[i + 16] = 0; b[i + 17] = 0;
    return buf;
  }
  let pos = 13;
  if (b[10] & 0x80) pos += 3 * (1 << ((b[10] & 7) + 1));
  if (pos > b.length) return null;
  const out = new Uint8Array(b.length + GIF_NETSCAPE.length);
  out.set(b.subarray(0, pos), 0);
  out.set(GIF_NETSCAPE, pos);
  out.set(b.subarray(pos), pos + GIF_NETSCAPE.length);
  return out.buffer;
}

/* ---------- 진단용: 현재 루프 값 읽기 ---------- */
function readLoop(buf) {
  const b = new Uint8Array(buf), dv = new DataView(buf);
  if (b[0] === 0x52 && b[8] === 0x57) {
    let off = 12;
    while (off + 8 <= b.length) {
      const size = dv.getUint32(off + 4, true);
      if (size > b.length - off - 8) break;
      if (b[off] === 0x41 && b[off + 1] === 0x4E && b[off + 2] === 0x49 && b[off + 3] === 0x4D && size >= 6) {
        return dv.getUint16(off + 12, true);
      }
      off += 8 + size + (size & 1);
    }
    return 'static';
  }
  if (b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) {
    for (let i = 0; i + 18 < b.length; i++) {
      if (b[i] === 0x21 && b[i + 1] === 0xFF && b[i + 2] === 0x0B &&
          String.fromCharCode(...b.slice(i + 3, i + 14)) === 'NETSCAPE2.0') return b[i + 16] | (b[i + 17] << 8);
    }
    return 'no-netscape(=1회)';
  }
  return '?';
}

const sbHeaders = { apikey: SERVICE_KEY, Authorization: `Bearer ${SERVICE_KEY}` };

async function listCons() {
  const out = [];
  const PAGE = 1000;
  for (let from = 0; ; from += PAGE) {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/emoticons?select=id,shortcode,url&order=id`, {
      headers: { ...sbHeaders, Range: `${from}-${from + PAGE - 1}` },
    });
    if (!res.ok) throw new Error(`목록 조회 실패 ${res.status}: ${await res.text()}`);
    const rows = await res.json();
    out.push(...rows);
    if (rows.length < PAGE) break;
  }
  return out;
}

function storagePath(url) {
  const m = String(url || '').match(new RegExp(`/storage/v1/object/public/${BUCKET}/(.+)$`));
  return m ? decodeURIComponent(m[1].split('?')[0]) : null;
}

async function main() {
  console.log(APPLY ? '=== APPLY 모드: 실제로 덮어씁니다 ===' : '=== DRY-RUN (반영하려면 --apply) ===');
  const rows = await listCons();
  const targets = rows.filter((r) => /\.(webp|gif)(\?|#|$)/i.test(r.url || ''));
  console.log(`전체 ${rows.length}개 중 webp/gif ${targets.length}개 검사\n`);

  let patched = 0, skipped = 0, failed = 0;

  for (const r of targets) {
    const path = storagePath(r.url);
    if (!path) { console.log(`  SKIP  ${r.shortcode} — 스토리지 경로 파싱 실패`); skipped++; continue; }

    let buf;
    try {
      const res = await fetch(r.url, { cache: 'no-store' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      buf = await res.arrayBuffer();
    } catch (e) {
      console.log(`  FAIL  ${r.shortcode} — 다운로드 실패: ${e.message}`); failed++; continue;
    }

    const before = readLoop(buf);
    const isGif = /\.gif(\?|#|$)/i.test(r.url);
    let out = null;
    try { out = isGif ? patchGifLoop(buf) : patchWebpLoop(buf); } catch (e) { out = null; }

    if (!out) { console.log(`  SKIP  ${r.shortcode}  loop=${before} (변경 불필요)`); skipped++; continue; }

    if (!APPLY) { console.log(`  TODO  ${r.shortcode}  loop=${before} -> 0  (${path})`); patched++; continue; }

    const ct = isGif ? 'image/gif' : 'image/webp';
    const up = await fetch(`${SUPABASE_URL}/storage/v1/object/${BUCKET}/${path.split('/').map(encodeURIComponent).join('/')}`, {
      method: 'PUT',
      headers: { ...sbHeaders, 'Content-Type': ct, 'x-upsert': 'true', 'Cache-Control': 'max-age=3600' },
      body: Buffer.from(out),
    });
    if (!up.ok) { console.log(`  FAIL  ${r.shortcode} — 업로드 실패 ${up.status}: ${await up.text()}`); failed++; continue; }
    console.log(`  DONE  ${r.shortcode}  loop=${before} -> 0`);
    patched++;
  }

  console.log(`\n=== ${APPLY ? '반영' : '대상'} ${patched} / 건너뜀 ${skipped} / 실패 ${failed} ===`);
  if (!APPLY && patched) console.log('실제 반영: node scripts/normalize-con-loop.mjs --apply');
  if (APPLY && patched) console.log('CDN 캐시가 남아 있으면 최대 1시간 뒤 반영됩니다.');
  process.exit(failed ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
