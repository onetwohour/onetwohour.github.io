/* Supabase view counts + likes (dependency-free REST). Degrades silently if unavailable. */
(function () {
  'use strict';
  var cfg = window.WK_SB;
  if (!cfg || !cfg.url || !cfg.key) return;
  var base = cfg.url.replace(/\/+$/, '');
  var auth = { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key };
  var jsonAuth = Object.assign({ 'Content-Type': 'application/json' }, auth);

  function num(n) { return Number(n || 0).toLocaleString(); }

  function rpc(fn, slug) {
    return fetch(base + '/rest/v1/rpc/' + fn, { method: 'POST', headers: jsonAuth, body: JSON.stringify({ p_slug: slug }) })
      .then(function (r) { return r.ok ? r.json() : null; }).catch(function () { return null; });
  }
  function readCol(table, col, slug) {
    return fetch(base + '/rest/v1/' + table + '?select=' + col + '&slug=eq.' + encodeURIComponent(slug), { headers: auth })
      .then(function (r) { return r.ok ? r.json() : []; })
      .then(function (a) { return (a && a[0]) ? a[0][col] : 0; }).catch(function () { return null; });
  }

  /* ---- post page: count view (no display), like button ---- */
  var docEl = document.querySelector('[data-wk-slug]');
  if (docEl) {
    var slug = docEl.getAttribute('data-wk-slug');
    var counted = false;
    try { counted = sessionStorage.getItem('wkv:' + slug) === '1'; } catch (e) {}
    if (!counted) {
      rpc('increment_views', slug).then(function () { try { sessionStorage.setItem('wkv:' + slug, '1'); } catch (e) {} });
    }
    setupLike(slug);
  }

  function setupLike(slug) {
    var wrap = document.querySelector('[data-wk-like]');
    if (!wrap) return;
    var btn = wrap.querySelector('.wk-like__btn');
    var countEl = wrap.querySelector('[data-wk-like-count]');
    var key = 'wkl:' + slug;
    var liked = false;
    try { liked = localStorage.getItem(key) === '1'; } catch (e) {}
    if (liked) { btn.classList.add('is-liked'); btn.setAttribute('aria-pressed', 'true'); }
    readCol('post_likes', 'likes', slug).then(function (n) { if (n != null && countEl) countEl.textContent = num(n); });
    btn.addEventListener('click', function () {
      if (btn.classList.contains('is-liked')) return;
      btn.classList.add('is-liked');
      btn.setAttribute('aria-pressed', 'true');
      try { localStorage.setItem(key, '1'); } catch (e) {}
      rpc('increment_likes', slug).then(function (n) { if (n != null && countEl) countEl.textContent = num(n); });
    });
  }
})();
