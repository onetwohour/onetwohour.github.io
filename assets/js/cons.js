/* 콘팩 등록·관리 (/cons/). 콘팩 = 콘 여러 장 묶음. 이미지를 미리보기로 여러 장 추가 후 한 번에 등록(approved=false, 검수 후 노출). */
(function () {
  'use strict';
  var cfg = window.WK_SB;
  var root = document.querySelector('[data-wk-conpage]');
  if (!cfg || !cfg.url || !cfg.key || !root || !window.supabase) return;

  var client = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var MAX = 5242880; // 5MB / 장
  var authEl = root.querySelector('[data-con-auth]');
  var mineWrap = root.querySelector('[data-con-minewrap]');
  var mineEl = root.querySelector('[data-con-mine]');
  var user = null;
  var staged = [];
  var seq = 0;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isVideo(url) { return /\.(mp4|webm)(\?|#|$)/i.test(url || ''); }
  function conMedia(url) {
    if (isVideo(url)) return '<video src="' + esc(url) + '" autoplay muted loop playsinline></video>';
    return '<img src="' + esc(url) + '" alt="" loading="lazy">';
  }
  function nameOf(u) { var m = (u && u.user_metadata) || {}; return m.nickname || m.user_name || m.name || m.full_name || (u && u.email ? u.email.split('@')[0] : '사용자'); }
  function avatarOf(u) { var m = (u && u.user_metadata) || {}; return m.avatar_url || m.picture || ''; }
  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
  function avatarHTML(name, url) {
    if (url) return '<img class="wk-cm-av" src="' + esc(url) + '" alt="" loading="lazy">';
    return '<span class="wk-cm-av wk-cm-av--ph">' + esc(initial(name)) + '</span>';
  }

  /* ---------- 콘팩 등록 폼 ---------- */
  function uploadCardHTML() {
    return '<div class="wk-conpage__card"><h2>새 콘팩 등록</h2>' +
      '<input type="text" class="wk-conpage__name" maxlength="20" placeholder="콘팩 이름 (예: 냥콘)" data-con-name>' +
      '<div class="wk-conup" data-con-stage></div>' +
      '<input type="file" accept="image/png,image/jpeg,image/gif,image/webp,video/mp4,video/webm" multiple hidden data-con-file>' +
      '<div class="wk-conup__foot"><button class="wk-btn wk-btn--primary" data-con-submit type="button" disabled>콘팩 등록</button>' +
      '<span class="wk-cm-emomsg" data-con-msg></span></div></div>';
  }
  function stageHTML() {
    var tiles = staged.map(function (s) {
      return '<div class="wk-conup__tile" data-sid="' + s.id + '">' + conMedia(s.url) +
        '<button class="wk-conup__del" data-con-stagedel type="button" aria-label="제거">×</button></div>';
    }).join('');
    return tiles + '<button class="wk-conup__add" data-con-add type="button" aria-label="콘 이미지 추가">＋</button>';
  }
  function renderStage() {
    var stage = root.querySelector('[data-con-stage]'); if (stage) stage.innerHTML = stageHTML();
    var sub = root.querySelector('[data-con-submit]');
    if (sub) { sub.disabled = staged.length === 0; sub.textContent = staged.length ? ('콘팩 등록 (' + staged.length + ')') : '콘팩 등록'; }
  }
  function addFiles(files) {
    var msg = root.querySelector('[data-con-msg]'); if (msg) msg.textContent = '';
    [].forEach.call(files, function (f) {
      if (!/^image\//.test(f.type) && !/^video\/(mp4|webm)$/.test(f.type)) { if (msg) msg.textContent = '이미지 또는 짧은 영상만 가능'; return; }
      if (f.size > MAX) { if (msg) msg.textContent = '5MB 이하만'; return; }
      staged.push({ id: 's' + (++seq), file: f, url: URL.createObjectURL(f) });
    });
    renderStage();
  }
  function removeStaged(id) {
    staged = staged.filter(function (s) { if (s.id === id) { try { URL.revokeObjectURL(s.url); } catch (e) {} return false; } return true; });
    renderStage();
  }

  /* ---------- 화면 ---------- */
  function render() {
    if (user) {
      authEl.innerHTML =
        '<div class="wk-conpage__me">' + avatarHTML(nameOf(user), avatarOf(user)) +
        '<b>' + esc(nameOf(user)) + '</b>' +
        '<button class="wk-cm-textbtn" data-con-logout type="button">로그아웃</button></div>' +
        uploadCardHTML();
      mineWrap.hidden = false;
      renderStage();
      loadMine();
    } else {
      authEl.innerHTML =
        '<div class="wk-conpage__login"><span>로그인</span>' +
        '<button class="wk-cm-oauth wk-cm-oauth--gh" data-con-oauth="github" type="button">GitHub</button>' +
        '<button class="wk-cm-oauth wk-cm-oauth--gg" data-con-oauth="google" type="button">Google</button></div>';
      mineWrap.hidden = true; mineEl.innerHTML = '';
    }
  }

  function mineTileHTML(e) {
    return '<div class="wk-conup__tile" data-id="' + esc(e.id) + '" data-url="' + esc(e.url) + '">' +
      conMedia(e.url) +
      '<button class="wk-conup__del" data-con-del type="button" aria-label="삭제">×</button></div>';
  }
  function loadMine() {
    client.from('emoticons').select('id,url,pack,approved').eq('user_id', user.id).order('created_at', { ascending: false }).then(function (res) {
      var data = (res && res.data) || [];
      if (!data.length) { mineEl.innerHTML = '<div class="wk-conpage__empty">아직 등록한 콘팩이 없습니다.</div>'; return; }
      var groups = {}, order = [];
      data.forEach(function (e) { var p = e.pack || '기본'; if (!groups[p]) { groups[p] = []; order.push(p); } groups[p].push(e); });
      mineEl.innerHTML = order.map(function (p) {
        var cons = groups[p];
        var pend = cons.filter(function (c) { return !c.approved; }).length;
        var st = pend ? '<span class="wk-conpack__st wk-conpack__st--wait">검수중 ' + pend + '</span>'
                      : '<span class="wk-conpack__st wk-conpack__st--ok">승인됨</span>';
        return '<div class="wk-conpack"><div class="wk-conpack__head">' + esc(p) +
          '<span class="wk-conpack__count">' + cons.length + '개</span>' + st + '</div>' +
          '<div class="wk-conpack__grid">' + cons.map(mineTileHTML).join('') + '</div></div>';
      }).join('');
    });
  }

  /* ---------- 액션 ---------- */
  function signIn(p) { client.auth.signInWithOAuth({ provider: p, options: { redirectTo: location.href.split('#')[0] } }); }

  function uploadPack() {
    var nameInput = root.querySelector('[data-con-name]');
    var msg = root.querySelector('[data-con-msg]');
    var sub = root.querySelector('[data-con-submit]');
    var name = ((nameInput && nameInput.value) || '').trim().slice(0, 20);
    if (!name) { msg.textContent = '콘팩 이름을 입력하세요'; return; }
    if (!staged.length) { msg.textContent = '콘 이미지를 추가하세요'; return; }
    sub.disabled = true;
    var items = staged.slice();
    var done = 0, failed = 0;

    function finish() {
      msg.textContent = failed ? ('등록 ' + done + '개 완료 (실패 ' + failed + ') — 검수 후 표시') : '등록됨 — 검수 후 콘 목록에 표시됩니다';
      staged.forEach(function (s) { try { URL.revokeObjectURL(s.url); } catch (e) {} });
      staged = []; if (nameInput) nameInput.value = '';
      renderStage(); loadMine();
    }
    function step(i) {
      if (i >= items.length) { finish(); return; }
      msg.textContent = '등록 중… ' + (done + failed) + '/' + items.length;
      var f = items[i].file;
      var code = 'c' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      var ext = (f.name.split('.').pop() || 'png').toLowerCase();
      var path = user.id + '/' + code + '.' + ext;
      client.storage.from('emoticons').upload(path, f, { upsert: true, contentType: f.type }).then(function (up) {
        if (up.error) { failed++; step(i + 1); return; }
        var pub = client.storage.from('emoticons').getPublicUrl(path).data.publicUrl;
        client.from('emoticons').insert({ user_id: user.id, shortcode: code, url: pub, pack: name, approved: false }).then(function (ins) {
          if (ins.error) failed++; else done++;
          step(i + 1);
        });
      });
    }
    step(0);
  }

  function delCon(tile) {
    if (!confirm('이 콘을 삭제할까요?')) return;
    var id = tile.dataset.id;
    var m = (tile.dataset.url || '').match(/\/emoticons\/(.+)$/);
    var storagePath = m ? decodeURIComponent(m[1]) : null;
    client.from('emoticons').delete().eq('id', id).then(function () {
      if (storagePath) client.storage.from('emoticons').remove([storagePath]);
      loadMine();
    });
  }

  root.addEventListener('click', function (e) {
    var b = e.target.closest('[data-con-oauth],[data-con-logout],[data-con-add],[data-con-stagedel],[data-con-submit],[data-con-del]');
    if (!b) return;
    if (b.dataset.conOauth) { signIn(b.dataset.conOauth); return; }
    if (b.hasAttribute('data-con-logout')) { client.auth.signOut(); return; }
    if (b.hasAttribute('data-con-add')) { var fi = root.querySelector('[data-con-file]'); if (fi) fi.click(); return; }
    if (b.hasAttribute('data-con-stagedel')) { removeStaged(b.closest('.wk-conup__tile').dataset.sid); return; }
    if (b.hasAttribute('data-con-submit')) { uploadPack(); return; }
    if (b.hasAttribute('data-con-del')) { delCon(b.closest('.wk-conup__tile')); return; }
  });
  root.addEventListener('change', function (e) {
    var fi = e.target.closest('[data-con-file]'); if (!fi) return;
    addFiles(fi.files); fi.value = '';
  });

  client.auth.getSession().then(function (res) { user = (res && res.data && res.data.session) ? res.data.session.user : null; render(); });
  client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; render(); });
})();
