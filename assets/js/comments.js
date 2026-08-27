/* Self-hosted comments on Supabase. Auth(GitHub/Google)+닉네임, 익명(IP), 스레드, 이모지 반응, 콘(콘팩 picker, 선택 전용). */
(function () {
  'use strict';
  var cfg = window.WK_SB;
  var section = document.querySelector('[data-wk-comments]');
  if (!cfg || !cfg.url || !cfg.key || !section || !window.supabase) return;

  var client = window.supabase.createClient(cfg.url, cfg.key, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true }
  });
  var base = cfg.url.replace(/\/+$/, '');
  var slug = section.getAttribute('data-slug');
  var authEl = section.querySelector('[data-wk-cm-auth]');
  var listEl = section.querySelector('[data-wk-cm-list]');
  var countEl = section.querySelector('[data-wk-cm-count]');
  var EMOJIS = ['👍', '❤️', '😂', '🎉', '😮', '😢', '🔥', '👀'];
  var RECENT_KEY = 'wk_con_recent';
  var FAV_KEY = 'wk_con_fav';
  var user = null;
  var rows = [];
  var reactionsMap = {};
  var emoticonMap = {};   // code -> url 캐시 (지연 로드로 채워짐)
  var packs = [];         // [{name, thumb}] — 콘팩 목록만 (콘은 탭 누를 때 로드)
  var packCons = {};      // packName -> [{code,url}]
  var loadingPack = {};
  var activePack = null;
  var searchQuery = '';

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function isVideo(url) { return /\.(mp4|webm)(\?|#|$)/i.test(url || ''); }
  function conMedia(url, cls) {
    if (isVideo(url)) return '<video class="' + cls + '" src="' + esc(url) + '" autoplay muted loop playsinline></video>';
    return '<img class="' + cls + '" src="' + esc(url) + '" alt="콘" loading="lazy">';
  }
  function fmt(d) {
    try { return new Date(d).toLocaleString('ko-KR', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }); }
    catch (e) { return ''; }
  }
  function renderBody(text) {
    var t = (text || '').trim();
    var only = t.match(/^:([a-z0-9_]{2,24}):$/);
    if (only && emoticonMap[only[1]]) {
      return conMedia(emoticonMap[only[1]], 'wk-emoticon wk-emoticon--big');
    }
    var s = esc(text).replace(/:([a-z0-9_]{2,24}):/g, function (m, code) {
      var url = emoticonMap[code];
      return url ? conMedia(url, 'wk-emoticon') : m;
    });
    return s.replace(/\n/g, '<br>');
  }
  function nameOf(u) { var m = (u && u.user_metadata) || {}; return m.nickname || m.user_name || m.name || m.full_name || (u && u.email ? u.email.split('@')[0] : '사용자'); }
  function avatarOf(u) { var m = (u && u.user_metadata) || {}; return m.avatar_url || m.picture || ''; }
  function initial(n) { return (n || '?').trim().charAt(0).toUpperCase(); }
  function avatarHTML(name, url) {
    if (url) return '<img class="wk-cm-av" src="' + esc(url) + '" alt="" loading="lazy">';
    return '<span class="wk-cm-av wk-cm-av--ph">' + esc(initial(name)) + '</span>';
  }

  /* ---------- 콘 picker (선택 전용) ---------- */
  function recent() { try { return JSON.parse(localStorage.getItem(RECENT_KEY) || '[]'); } catch (e) { return []; } }
  function pushRecent(code) {
    var r = recent().filter(function (c) { return c !== code; });
    r.unshift(code); r = r.slice(0, 21);
    try { localStorage.setItem(RECENT_KEY, JSON.stringify(r)); } catch (e) {}
  }
  function fav() { try { return JSON.parse(localStorage.getItem(FAV_KEY) || '[]'); } catch (e) { return []; } }
  function isFav(name) { return fav().indexOf(name) >= 0; }
  function toggleFav(name) {
    var f = fav(); var i = f.indexOf(name);
    if (i >= 0) f.splice(i, 1); else f.unshift(name);
    try { localStorage.setItem(FAV_KEY, JSON.stringify(f)); } catch (e) {}
  }
  function conBtn(code, url) {
    return '<button class="wk-cm-emo" data-code="' + esc(code) + '" type="button">' + conMedia(url, '') + '</button>';
  }
  function conGrid(pack) {
    if (pack === '__recent') {
      var rec = recent().map(function (code) { return emoticonMap[code] ? { code: code, url: emoticonMap[code] } : null; }).filter(Boolean);
      if (!rec.length) return '<div class="wk-cm-emoempty">최근 사용한 콘이 없습니다.</div>';
      return rec.map(function (c) { return conBtn(c.code, c.url); }).join('');
    }
    if (!packCons[pack]) return '<div class="wk-cm-emoempty">불러오는 중…</div>';
    if (!packCons[pack].length) return '<div class="wk-cm-emoempty">등록된 콘이 없습니다.</div>';
    return packCons[pack].map(function (c) { return conBtn(c.code, c.url); }).join('');
  }
  function conTabs() {
    var q = searchQuery.trim().toLowerCase();
    var favs = fav();
    var list = packs.filter(function (p) { return !q || p.name.toLowerCase().indexOf(q) >= 0; });
    // 즐겨찾기 콘팩을 앞으로 (원래 순서는 유지)
    list.sort(function (a, b) {
      var fa = favs.indexOf(a.name) >= 0, fb = favs.indexOf(b.name) >= 0;
      return (fa === fb) ? 0 : (fa ? -1 : 1);
    });
    var tabs = '<button class="wk-con__tab' + (activePack === '__recent' ? ' is-active' : '') + '" data-pack="__recent" type="button" title="최근 사용"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><circle cx="12" cy="12" r="9"></circle><path d="M12 7.5V12l3 2"></path></svg></button>';
    tabs += list.map(function (p) {
      var thumb = (p.thumb && !isVideo(p.thumb)) ? '<img src="' + esc(p.thumb) + '" alt="" loading="lazy">' : esc((p.name || '?').charAt(0));
      return '<button class="wk-con__tab' + (activePack === p.name ? ' is-active' : '') + (isFav(p.name) ? ' is-fav' : '') + '" data-pack="' + esc(p.name) + '" type="button" title="' + esc(p.name) + '">' + thumb + '</button>';
    }).join('');
    if (!list.length) tabs += '<span class="wk-con__noresult">검색 결과 없음</span>';
    return tabs;
  }
  function conPickerHTML() {
    return '<div class="wk-con" hidden>' +
      '<div class="wk-con__top">' +
      '<button class="wk-con__fav" data-act="con-fav" type="button" title="이 콘팩 즐겨찾기" aria-label="즐겨찾기">★</button>' +
      '<a class="wk-con__gear" href="/cons/" title="내 콘 관리" aria-label="내 콘 관리">⚙</a></div>' +
      '<div class="wk-con__search"><input type="search" class="wk-con__searchinput" data-wk-con-search placeholder="콘팩 검색" autocomplete="off"></div>' +
      '<div class="wk-con__tabs" data-wk-con-tabs></div>' +
      '<div class="wk-con__grid" data-wk-con-grid></div></div>';
  }
  function fillGrid(picker) { var g = picker.querySelector('[data-wk-con-grid]'); if (g) g.innerHTML = conGrid(activePack); }
  function fillTabs(picker) { var t = picker.querySelector('[data-wk-con-tabs]'); if (t) t.innerHTML = conTabs(); }
  // 탭 노드는 유지한 채 active만 토글 (재생성 시 클릭 노드가 분리돼 바깥-클릭으로 오판되는 것 방지)
  function setActiveTab(picker) {
    [].forEach.call(picker.querySelectorAll('.wk-con__tab'), function (b) { b.classList.toggle('is-active', b.dataset.pack === activePack); });
  }
  function renderCon(picker) {
    if (!picker) return;
    // 기본 탭은 콘 데이터가 로드된 뒤 결정 — 유효한 최근 콘이 있을 때만 '최근', 아니면 첫 콘팩
    if (activePack === null && packs.length) {
      var validRecent = recent().filter(function (c) { return emoticonMap[c]; });
      activePack = validRecent.length ? '__recent' : packs[0].name;
    }
    fillGrid(picker); fillTabs(picker); updateFavBtn(picker);
  }
  function updateFavBtn(picker) {
    var b = picker.querySelector('.wk-con__fav'); if (!b) return;
    var realPack = activePack && activePack !== '__recent';
    b.style.display = realPack ? '' : 'none';
    b.classList.toggle('is-on', realPack && isFav(activePack));
  }
  function renderAllPickers() { [].forEach.call(section.querySelectorAll('.wk-con'), function (p) { renderCon(p); }); }
  function closePickers() { [].forEach.call(section.querySelectorAll('.wk-con'), function (p) { p.hidden = true; }); }

  function formHTML(isReply) {
    var ph = isReply ? '답글' : '댓글';
    var nameField = user ? '' : '<input class="wk-cm-name" type="text" maxlength="20" placeholder="닉네임">';
    var con = '<span class="wk-con-anchor"><button class="wk-cm-emobtn" data-act="con-toggle" type="button">콘</button>' + conPickerHTML() + '</span>';
    var login = (!user && !isReply) ?
      '<button class="wk-cm-oauth wk-cm-oauth--gh" data-oauth="github" type="button">GitHub</button>' +
      '<button class="wk-cm-oauth wk-cm-oauth--gg" data-oauth="google" type="button">Google</button>' : '';
    return '<form class="wk-cm-form' + (isReply ? ' wk-cm-form--reply' : '') + '"><div class="wk-cm-box">' +
      '<textarea class="wk-cm-ta" placeholder="' + ph + '" maxlength="4000" required></textarea>' +
      '<div class="wk-cm-bar"><div class="wk-cm-bar__l">' + nameField + con + '</div>' +
      '<div class="wk-cm-bar__r">' + login + '<button class="wk-btn wk-btn--primary" type="submit">등록</button></div>' +
      '</div></div></form>';
  }

  /* ---------- auth / compose ---------- */
  function renderAuth() {
    if (user) {
      authEl.innerHTML =
        '<div class="wk-cm-id">' + avatarHTML(nameOf(user), avatarOf(user)) +
        '<b>' + esc(nameOf(user)) + '</b>' +
        '<button class="wk-cm-textbtn" data-act="editname" type="button">닉네임 변경</button>' +
        '<button class="wk-cm-textbtn" data-act="logout" type="button">로그아웃</button></div>' +
        '<div class="wk-cm-nameedit" hidden><input class="wk-cm-nameinput" type="text" maxlength="20" value="' + esc(nameOf(user)) + '">' +
        '<button class="wk-btn wk-btn--primary" data-act="savename" type="button">저장</button>' +
        '<button class="wk-cm-textbtn" data-act="canceledit" type="button">취소</button></div>' +
        formHTML(false);
    } else {
      authEl.innerHTML = formHTML(false);
    }
    renderAllPickers();
  }

  /* ---------- list ---------- */
  function reactBar(c) {
    var rmap = reactionsMap[c.id] || {};
    var chips = Object.keys(rmap).filter(function (e) { return rmap[e].count > 0; }).map(function (e) {
      var r = rmap[e];
      return '<button class="wk-cm-react' + (r.mine ? ' is-mine' : '') + '" data-emoji="' + esc(e) + '" type="button">' + e + ' <span>' + r.count + '</span></button>';
    }).join('');
    var add = '<button class="wk-cm-react-add" data-act="react-add" type="button" aria-label="반응 추가">＋</button>' +
      '<span class="wk-cm-palette" hidden>' + EMOJIS.map(function (e) { return '<button class="wk-cm-pal" data-emoji="' + esc(e) + '" type="button">' + e + '</button>'; }).join('') + '</span>';
    return '<div class="wk-cm-reacts" data-rid="' + esc(c.id) + '">' + chips + add + '</div>';
  }
  function commentNode(c) {
    var anon = !c.user_id;
    var mine = user && c.user_id === user.id;
    var av = anon ? avatarHTML(c.author_name, '') : avatarHTML(c.author_name, c.author_avatar);
    var ipTag = (anon && c.ip) ? '<span class="wk-cm-ip">(' + esc(c.ip) + ')</span>' : '';
    var kids = c._children || [];
    var hasKids = kids.length > 0;
    var children = kids.map(commentNode).join('');
    return '<div class="wk-cm-item' + (hasKids ? ' wk-cm-item--haskids' : '') + '" data-id="' + esc(c.id) + '">' +
      '<div class="wk-cm-row">' + av +
      '<div class="wk-cm-main"><div class="wk-cm-head"><b>' + esc(c.author_name) + '</b>' + ipTag +
      '<span class="wk-cm-time">' + esc(fmt(c.created_at)) + '</span></div>' +
      '<div class="wk-cm-body">' + renderBody(c.body) + '</div>' + reactBar(c) +
      '<div class="wk-cm-actions"><button class="wk-cm-textbtn" data-act="reply" type="button">답글</button>' +
      (mine ? '<button class="wk-cm-textbtn wk-cm-textbtn--del" data-act="delete" type="button">삭제</button>' : '') +
      '</div><div class="wk-cm-replyslot"></div></div></div>' +
      (hasKids ? '<div class="wk-cm-children">' + children + '</div>' : '') +
      '</div>';
  }
  function buildTree(list) {
    var byId = {}, roots = [];
    list.forEach(function (c) { c._children = []; byId[c.id] = c; });
    list.forEach(function (c) { if (c.parent_id && byId[c.parent_id]) byId[c.parent_id]._children.push(c); else roots.push(c); });
    return roots;
  }
  function renderList() {
    if (countEl) countEl.textContent = rows.length ? rows.length : '';
    if (!rows.length) { listEl.innerHTML = '<div class="wk-cm-empty">첫 댓글을 남겨보세요.</div>'; return; }
    listEl.innerHTML = buildTree(rows.slice()).map(commentNode).join('');
  }

  function loadReactions() {
    var ids = rows.map(function (r) { return r.id; });
    if (!ids.length) { reactionsMap = {}; renderList(); return; }
    client.from('comment_reactions').select('comment_id,emoji,user_id').in('comment_id', ids).then(function (res) {
      var map = {};
      ((res && res.data) || []).forEach(function (r) {
        var m = map[r.comment_id] = map[r.comment_id] || {};
        var e = m[r.emoji] = m[r.emoji] || { count: 0, mine: false };
        e.count++; if (user && r.user_id === user.id) e.mine = true;
      });
      reactionsMap = map; renderList();
    });
  }
  function loadComments() {
    client.from('comments').select('*').eq('slug', slug).eq('is_hidden', false)
      .order('created_at', { ascending: true })
      .then(function (res) {
        rows = (res && res.data) || [];
        var codes = {};
        rows.forEach(function (c) { var m = (c.body || '').match(/:[a-z0-9_]{2,24}:/g); if (m) m.forEach(function (x) { codes[x.slice(1, -1)] = 1; }); });
        loadCodes(Object.keys(codes), loadReactions);
      });
  }
  // 콘이 수만 개라 한 번에 못 받음 → 콘팩 목록만 받고(con_packs 뷰), 콘은 탭 누를 때 지연 로드
  function loadPacks() {
    client.from('con_packs').select('pack,thumb').then(function (res) {
      packs = ((res && res.data) || []).map(function (r) { return { name: r.pack, thumb: r.thumb }; });
      if (activePack === null && packs.length) {
        var vr = recent().filter(function (c) { return emoticonMap[c]; });
        activePack = vr.length ? '__recent' : packs[0].name;
      }
      renderAllPickers();
      if (activePack && activePack !== '__recent') loadPackCons(activePack, renderAllPickers);
    });
  }
  function loadPackCons(pack, cb) {
    if (packCons[pack]) { if (cb) cb(); return; }
    if (loadingPack[pack]) return;
    loadingPack[pack] = true;
    client.from('emoticons').select('shortcode,url').eq('pack', pack).eq('approved', true).order('shortcode', { ascending: true }).then(function (res) {
      var arr = ((res && res.data) || []).map(function (e) { emoticonMap[e.shortcode] = e.url; return { code: e.shortcode, url: e.url }; });
      packCons[pack] = arr; loadingPack[pack] = false;
      if (cb) cb();
    });
  }
  // 최근 사용/댓글에 박힌 콘의 url을 코드로 직접 조회해 캐시
  function loadCodes(list, cb) {
    var need = list.filter(function (c) { return !emoticonMap[c]; });
    if (!need.length) { if (cb) cb(); return; }
    client.from('emoticons').select('shortcode,url').in('shortcode', need).then(function (res) {
      ((res && res.data) || []).forEach(function (e) { emoticonMap[e.shortcode] = e.url; });
      if (cb) cb();
    });
  }

  /* ---------- actions ---------- */
  function signIn(provider) { client.auth.signInWithOAuth({ provider: provider, options: { redirectTo: location.href.split('#')[0] } }); }
  function insertComment(body, parentId) {
    return client.from('comments').insert({ slug: slug, parent_id: parentId || null, user_id: user.id, author_name: nameOf(user), author_avatar: avatarOf(user), body: body });
  }
  function postAnon(body, parentId, name) {
    return fetch(base + '/functions/v1/post-comment', { method: 'POST', headers: { 'Content-Type': 'application/json', 'apikey': cfg.key },
      body: JSON.stringify({ slug: slug, parent_id: parentId || null, body: body, author_name: name || null }) }).then(function (r) { return r.ok ? r.json() : null; });
  }
  // 비로그인 사용자가 반응을 누르면 상단 로그인 영역으로 유도
  function nudgeLogin() {
    var box = authEl.querySelector('.wk-cm-box') || authEl;
    box.scrollIntoView({ behavior: 'smooth', block: 'center' });
    box.classList.remove('wk-cm-flash'); void box.offsetWidth; box.classList.add('wk-cm-flash');
  }
  function toggleReaction(cid, emoji) {
    if (!user) return;
    var rmap = reactionsMap[cid] || {};
    var mine = rmap[emoji] && rmap[emoji].mine;
    var p = mine ? client.from('comment_reactions').delete().eq('comment_id', cid).eq('user_id', user.id).eq('emoji', emoji)
      : client.from('comment_reactions').insert({ comment_id: cid, user_id: user.id, emoji: emoji });
    p.then(function () { loadReactions(); });
  }

  function submitCon(emoBtn) {
    var code = emoBtn.dataset.code;
    var picker = emoBtn.closest('.wk-con'); if (picker) picker.hidden = true;
    pushRecent(code);
    var form = emoBtn.closest('form');
    var nameInput = form ? form.querySelector('.wk-cm-name') : null;
    var name = nameInput ? nameInput.value.trim() : null;
    var parentId = null;
    if (form && form.classList.contains('wk-cm-form--reply')) { var item = form.closest('.wk-cm-item'); if (item) parentId = item.dataset.id; }
    var body = ':' + code + ':';
    (user ? insertComment(body, parentId) : postAnon(body, parentId, name)).then(function () { loadComments(); });
  }

  section.addEventListener('click', function (e) {
    var btn = e.target.closest('[data-oauth], [data-act], .wk-cm-react, .wk-cm-pal, .wk-cm-emo, .wk-con__tab');
    if (!btn) return;
    if (btn.dataset.oauth) { signIn(btn.dataset.oauth); return; }
    if (btn.classList.contains('wk-cm-react') || btn.classList.contains('wk-cm-pal')) {
      if (!user) { nudgeLogin(); return; }
      var bar = btn.closest('.wk-cm-reacts'); if (bar) toggleReaction(bar.dataset.rid, btn.dataset.emoji); return;
    }
    if (btn.classList.contains('wk-con__tab')) {
      activePack = btn.dataset.pack; var tpk = btn.closest('.wk-con'); setActiveTab(tpk); updateFavBtn(tpk); fillGrid(tpk);
      if (activePack !== '__recent' && !packCons[activePack]) loadPackCons(activePack, function () { fillGrid(tpk); });
      return;
    }
    if (btn.classList.contains('wk-cm-emo')) { submitCon(btn); return; }
    var act = btn.dataset.act;
    if (act === 'react-add') { var pal = btn.closest('.wk-cm-reacts').querySelector('.wk-cm-palette'); if (pal) pal.hidden = !pal.hidden; return; }
    if (act === 'con-fav') {
      if (activePack && activePack !== '__recent') { toggleFav(activePack); var fpk = btn.closest('.wk-con'); fillTabs(fpk); updateFavBtn(fpk); }
      return;
    }
    if (act === 'con-toggle') { var p = btn.closest('.wk-con-anchor').querySelector('.wk-con'); var willOpen = p && p.hidden; closePickers(); if (willOpen) { p.hidden = false; renderCon(p); } return; }
    if (act === 'logout') { client.auth.signOut(); return; }
    if (act === 'editname') { var ed = authEl.querySelector('.wk-cm-nameedit'); if (ed) { ed.hidden = false; var i = ed.querySelector('input'); if (i) i.focus(); } return; }
    if (act === 'canceledit') { var ed2 = authEl.querySelector('.wk-cm-nameedit'); if (ed2) ed2.hidden = true; return; }
    if (act === 'savename') {
      var inp = authEl.querySelector('.wk-cm-nameinput'); var nn = inp ? inp.value.trim().slice(0, 20) : '';
      if (!nn) return;
      client.auth.updateUser({ data: { nickname: nn } }).then(function (res) { if (res && res.data && res.data.user) user = res.data.user; renderAuth(); });
      return;
    }
    if (act === 'reply') {
      var item = btn.closest('.wk-cm-item');
      var slot = item.querySelector(':scope > .wk-cm-row > .wk-cm-main > .wk-cm-replyslot');
      if (slot.querySelector('form')) { slot.innerHTML = ''; return; }
      slot.innerHTML = formHTML(true); var rta = slot.querySelector('textarea'); if (rta) rta.focus(); return;
    }
    if (act === 'delete') {
      if (!confirm('댓글을 삭제할까요?')) return;
      var id = btn.closest('.wk-cm-item').dataset.id;
      client.from('comments').delete().eq('id', id).then(function () { loadComments(); });
    }
  });

  // picker 바깥 클릭 시 모두 닫기
  document.addEventListener('click', function (e) {
    if (e.target.closest('.wk-con') || e.target.closest('.wk-cm-emobtn')) return;
    closePickers();
  });

  // 콘팩 검색 — 탭 목록 필터
  section.addEventListener('input', function (e) {
    var s = e.target.closest('[data-wk-con-search]'); if (!s) return;
    searchQuery = s.value || '';
    var picker = s.closest('.wk-con'); if (picker) fillTabs(picker);
  });

  section.addEventListener('submit', function (e) {
    var form = e.target.closest('form'); if (!form) return;
    e.preventDefault();
    var ta = form.querySelector('textarea'); if (!ta) return;
    var body = (ta.value || '').trim(); if (!body) return;
    var nameInput = form.querySelector('.wk-cm-name'); var name = nameInput ? nameInput.value.trim() : null;
    var parentId = null;
    if (form.classList.contains('wk-cm-form--reply')) { var item = form.closest('.wk-cm-item'); if (item) parentId = item.dataset.id; }
    ta.disabled = true;
    var done = function () { ta.value = ''; ta.disabled = false; loadComments(); };
    (user ? insertComment(body, parentId) : postAnon(body, parentId, name)).then(done, function () { ta.disabled = false; });
  });

  /* ---------- init ---------- */
  client.auth.getSession().then(function (res) { user = (res && res.data && res.data.session) ? res.data.session.user : null; renderAuth(); loadComments(); });
  client.auth.onAuthStateChange(function (_e, sess) { user = sess ? sess.user : null; renderAuth(); loadComments(); });
  renderAuth();
  loadPacks();
  loadCodes(recent(), renderAllPickers);
})();
