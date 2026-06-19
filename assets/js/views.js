/* Supabase view counts + likes (dependency-free REST). Degrades silently if unavailable. */
(function () {
  'use strict';
  var cfg = window.WK_SB;
  if (!cfg || !cfg.url || !cfg.key) return;
  var base = cfg.url.replace(/\/+$/, '');
  var auth = { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key };
  var jsonAuth = Object.assign({ 'Content-Type': 'application/json' }, auth);

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
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
  function topViews(limit) {
    return fetch(base + '/rest/v1/post_views?select=slug,views&order=views.desc&limit=' + limit, { headers: auth })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; });
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

  /* ---- home: popular list by views + swap 대표 문서 to #1 ---- */
  var popWrap = document.querySelector('[data-wk-popular]');
  if (popWrap) {
    Promise.all([
      topViews(8),
      fetch('/search.json', { cache: 'no-cache' }).then(function (r) { return r.json(); }).catch(function () { return []; })
    ]).then(function (res) {
      var views = res[0] || [], posts = res[1] || [];
      if (!views.length || !posts.length) return;
      var byPath = {};
      posts.forEach(function (p) { byPath[p.url.replace(/^https?:\/\/[^/]+/, '')] = p; });
      var items = [];
      views.forEach(function (v) {
        var path = v.slug.charAt(0) === '/' ? v.slug : '/' + v.slug;
        var p = byPath[path] || byPath[v.slug];
        if (p) items.push({ p: p, views: v.views });
      });
      if (!items.length) return;

      var list = document.querySelector('[data-wk-popular-list]');
      if (list) {
        list.innerHTML = items.slice(0, 5).map(function (it, i) {
          var p = it.p, tag = (p.tags && p.tags[0]) || '';
          return '<a class="wk-rank" href="' + esc(p.url) + '"><span class="wk-rank__num">' + (i + 1) +
            '</span><div class="wk-rank__body"><div class="wk-rank__title">' + esc(p.title) +
            '</div><div class="wk-rank__meta">' + (tag ? esc(tag) + ' · ' : '') + esc(p.date) +
            '</div></div></a>';
        }).join('');
        popWrap.hidden = false;
      }

      var feat = document.querySelector('[data-wk-feature]');
      if (feat && items[0]) {
        var fp = items[0].p;
        feat.setAttribute('href', fp.url);
        setText(feat.querySelector('.wk-feature__cat'), (fp.tags && fp.tags[0]) || '');
        setText(feat.querySelector('.wk-feature__title'), fp.title);
        setText(feat.querySelector('.wk-feature__desc'), fp.summary || '');
        setText(feat.querySelector('.wk-feature__meta'), fp.date + (fp.tags && fp.tags.length ? ' · ' + fp.tags.join(', ') : ''));
        var thumb = feat.querySelector('.wk-feature__thumb');
        if (thumb && fp.cover) {
          thumb.style.backgroundImage = "url('" + fp.cover + "')";
          thumb.style.backgroundSize = 'cover';
          thumb.style.backgroundPosition = 'center';
          thumb.style.backgroundRepeat = 'no-repeat';
        }
      }
    }).catch(function () {});
  }

  function setText(el, t) { if (el) el.textContent = t; }
})();
