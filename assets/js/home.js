/* 대문 대표 문서·인기 글을 조회수 1위 기준으로 교체.
   defer 없이 마크업 직후에 실행해야 서버가 렌더한 글이 다른 글로 바뀌는 장면이 노출되지 않는다.
   세션 캐시가 살아 있으면 요청 없이 즉시 적용하고, 없을 때만 스켈레톤을 띄운다. */
(function () {
  'use strict';
  var feat = document.querySelector('[data-wk-feature]');
  var popWrap = document.querySelector('[data-wk-popular]');
  var list = document.querySelector('[data-wk-popular-list]');
  if (!feat && !popWrap) return;

  var KEY = 'wk:home';
  var TTL = 600000;
  var thumb = feat && feat.querySelector('.wk-feature__thumb');
  var thumbStyle = thumb ? thumb.getAttribute('style') : null;
  var thumbClass = thumb ? thumb.getAttribute('class') : null;

  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  function setText(el, t) { if (el) el.textContent = t; }

  function readCache() {
    try {
      var c = JSON.parse(sessionStorage.getItem(KEY) || 'null');
      if (c && c.d && Date.now() - c.t < TTL) return c.d;
    } catch (e) {}
    return null;
  }
  function writeCache(d) {
    try { sessionStorage.setItem(KEY, JSON.stringify({ t: Date.now(), d: d })); } catch (e) {}
  }

  function rankHTML(it, i) {
    return '<a class="wk-rank" href="' + esc(it.url) + '"><span class="wk-rank__num">' + (i + 1) +
      '</span><div class="wk-rank__body"><div class="wk-rank__title">' + esc(it.title) +
      '</div><div class="wk-rank__meta">' + (it.tag ? esc(it.tag) + ' · ' : '') + esc(it.date) +
      '</div></div></a>';
  }

  function showSkeleton() {
    if (feat) {
      feat.classList.add('is-loading');
      if (thumb) thumb.removeAttribute('style');
    }
    if (popWrap && list) {
      var s = '';
      for (var i = 0; i < 5; i++) {
        s += '<div class="wk-rank wk-rank--skel"><span class="wk-rank__num">' + (i + 1) +
          '</span><div class="wk-rank__body"><div class="wk-rank__title"></div><div class="wk-rank__meta"></div></div></div>';
      }
      list.innerHTML = s;
      popWrap.classList.add('is-loading');
      popWrap.hidden = false;
    }
  }

  /* 조회수를 못 받은 경우 서버가 렌더한 대표 문서를 그대로 되돌린다 */
  function restore() {
    if (feat) feat.classList.remove('is-loading');
    if (thumb) {
      thumb.removeAttribute('style');
      if (thumbStyle != null) thumb.setAttribute('style', thumbStyle);
      if (thumbClass != null) thumb.setAttribute('class', thumbClass);
    }
    if (popWrap && list) {
      popWrap.classList.remove('is-loading');
      list.innerHTML = '';
      popWrap.hidden = true;
    }
  }

  function apply(items) {
    if (!items || !items.length) { restore(); return; }
    if (popWrap && list) {
      list.innerHTML = items.slice(0, 5).map(rankHTML).join('');
      popWrap.classList.remove('is-loading');
      popWrap.hidden = false;
    }
    var fp = items[0];
    if (feat) {
      feat.setAttribute('href', fp.url);
      setText(feat.querySelector('.wk-feature__cat'), fp.tag);
      setText(feat.querySelector('.wk-feature__title'), fp.title);
      setText(feat.querySelector('.wk-feature__desc'), fp.summary);
      setText(feat.querySelector('.wk-feature__meta'), fp.meta);
      if (thumb) {
        thumb.removeAttribute('style');
        if (fp.cover) {
          thumb.setAttribute('class', 'wk-feature__thumb');
          thumb.style.backgroundImage = "url('" + fp.cover + "')";
          thumb.style.backgroundSize = 'cover';
          thumb.style.backgroundPosition = 'center';
          thumb.style.backgroundRepeat = 'no-repeat';
        } else {
          thumb.setAttribute('class', 'wk-feature__thumb wk-thumb--empty');
        }
      }
      feat.classList.remove('is-loading');
    }
  }

  function build(views, posts) {
    if (!views.length || !posts.length) return [];
    var byPath = {};
    posts.forEach(function (p) { byPath[p.url.replace(/^https?:\/\/[^/]+/, '')] = p; });
    var out = [];
    views.forEach(function (v) {
      var path = v.slug.charAt(0) === '/' ? v.slug : '/' + v.slug;
      var p = byPath[path] || byPath[v.slug];
      if (!p) return;
      var tags = p.tags || [];
      out.push({
        url: p.url,
        title: p.title,
        summary: p.summary || '',
        date: p.date,
        tag: tags[0] || '',
        meta: p.date + (tags.length ? ' · ' + tags.join(', ') : ''),
        cover: p.cover || ''
      });
    });
    return out;
  }

  var cached = readCache();
  if (cached) { apply(cached); return; }

  var cfg = window.WK_SB;
  if (!cfg || !cfg.url || !cfg.key) return;
  var base = cfg.url.replace(/\/+$/, '');
  var auth = { 'apikey': cfg.key, 'Authorization': 'Bearer ' + cfg.key };

  showSkeleton();
  Promise.all([
    fetch(base + '/rest/v1/post_views?select=slug,views&order=views.desc&limit=8', { headers: auth })
      .then(function (r) { return r.ok ? r.json() : []; }).catch(function () { return []; }),
    fetch('/search.json', { cache: 'no-cache' })
      .then(function (r) { return r.json(); }).catch(function () { return []; })
  ]).then(function (res) {
    var items = build(res[0] || [], res[1] || []);
    if (!items.length) { restore(); return; }
    writeCache(items);
    apply(items);
  }).catch(function () { restore(); });
})();
