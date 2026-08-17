/* WIKILOG client-side search over /search.json */
(function () {
  'use strict';

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function highlight(text, q) {
    var t = String(text || '');
    var i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(t);
    return esc(t.slice(0, i)) + '<mark>' + esc(t.slice(i, i + q.length)) + '</mark>' + esc(t.slice(i + q.length));
  }

  function snippet(text, q) {
    var t = String(text || '');
    var i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return esc(t.slice(0, 160));
    var start = Math.max(0, i - 60);
    var pre = (start > 0 ? '… ' : '') + t.slice(start, i);
    var hit = t.slice(i, i + q.length);
    var post = t.slice(i + q.length, i + q.length + 100);
    return esc(pre) + '<mark>' + esc(hit) + '</mark>' + esc(post) + (t.length > i + q.length + 100 ? ' …' : '');
  }

  var params = new URLSearchParams(window.location.search);
  var q = (params.get('q') || '').trim();

  var input = document.getElementById('wk-search-input');
  if (input) input.value = q;

  var qEl = document.getElementById('wk-q');
  var rcWrap = document.getElementById('wk-rcwrap');
  var rcEl = document.getElementById('wk-rc');
  var results = document.getElementById('wk-results');
  var empty = document.getElementById('wk-search-empty');

  if (qEl) qEl.textContent = q ? "'" + q + "'" : '';

  if (!q) { return; }

  fetch('/search.json', { cache: 'no-cache' })
    .then(function (r) { return r.json(); })
    .then(function (data) {
      var ql = q.toLowerCase();
      var hits = data.filter(function (it) {
        var tags = it.tags && it.tags.join ? it.tags.join(' ') : '';
        var hay = (it.title + ' ' + (it.summary || '') + ' ' + tags + ' ' + (it.content || '')).toLowerCase();
        return hay.indexOf(ql) !== -1;
      });

      if (rcEl) rcEl.textContent = hits.length;
      if (rcWrap) rcWrap.hidden = false;

      if (!hits.length) {
        if (empty) { empty.hidden = false; empty.textContent = "'" + q + "' 에 대한 결과가 없습니다."; }
        results.innerHTML = '';
        return;
      }
      if (empty) empty.hidden = true;

      results.innerHTML = hits.map(function (it) {
        var summaryHasHit = it.summary && it.summary.toLowerCase().indexOf(ql) !== -1;
        var snText = summaryHasHit ? it.summary : (it.content || it.summary || '');
        var crumb = '글' + (it.tags && it.tags.length ? ' · ' + it.tags[0] : '');
        return '<a class="wk-result" href="' + esc(it.url) + '">'
          + '<div class="wk-result__crumb">' + esc(crumb) + '</div>'
          + '<div class="wk-result__title">' + highlight(it.title, q) + '</div>'
          + '<div class="wk-result__snippet">' + snippet(snText, q) + '</div>'
          + '<div class="wk-result__meta">' + esc(it.date || '') + '</div>'
          + '</a>';
      }).join('');
    })
    .catch(function () {
      if (empty) { empty.hidden = false; empty.textContent = '검색 인덱스를 불러오지 못했습니다.'; }
    });
})();
