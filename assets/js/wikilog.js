/* WIKILOG theme behaviors — vanilla JS, no dependencies */
(function () {
  'use strict';

  var root = document.documentElement;

  /* ---------- Dark mode ---------- */
  function applyTheme(theme) {
    root.setAttribute('data-theme', theme);
    try { localStorage.setItem('theme', theme); } catch (e) {}
    var toggle = document.getElementById('theme-toggle');
    if (toggle) toggle.setAttribute('aria-label', theme === 'dark' ? '라이트 모드로 전환' : '다크 모드로 전환');
  }
  function toggleTheme() {
    applyTheme(root.getAttribute('data-theme') === 'dark' ? 'ink' : 'dark');
  }

  /* ---------- Mobile menu ---------- */
  function setupMenu() {
    var btn = document.getElementById('wk-menu-toggle');
    var nav = document.getElementById('wk-nav');
    if (!btn || !nav) return;
    btn.addEventListener('click', function () {
      var open = nav.classList.toggle('is-open');
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
  }

  /* ---------- Back to top ---------- */
  function setupTop() {
    var btn = document.getElementById('wk-totop');
    if (!btn) return;
    var shown = false;
    function onScroll() {
      var should = window.scrollY > 520;
      if (should !== shown) { shown = should; btn.classList.toggle('is-visible', should); }
    }
    window.addEventListener('scroll', onScroll, { passive: true });
    btn.addEventListener('click', function () { window.scrollTo({ top: 0, behavior: 'smooth' }); });
    onScroll();
  }

  /* ---------- Table of contents + scroll spy ---------- */
  function slug(text, i) {
    var s = (text || '').trim().toLowerCase()
      .replace(/[^\w가-힣\s-]/g, '')
      .replace(/\s+/g, '-');
    return s ? 'sec-' + s : 'sec-' + i;
  }

  function buildTOC() {
    var source = document.querySelector('[data-wk-toc-source]');
    var holders = document.querySelectorAll('[data-wk-toc]');
    if (!source || !holders.length) return;

    var heads = source.querySelectorAll('h2, h3, h4');
    if (!heads.length) {
      holders.forEach(function (h) { h.style.display = 'none'; });
      return;
    }

    // depth relative to the shallowest heading present (so docs starting at h3 still nest from 1)
    var minLevel = 99;
    heads.forEach(function (h) { minLevel = Math.min(minLevel, parseInt(h.tagName[1], 10)); });

    var items = [];
    heads.forEach(function (h, i) {
      if (!h.id) h.id = slug(h.textContent, i);
      var depth = parseInt(h.tagName[1], 10) - minLevel; // 0, 1, 2
      if (depth > 2) depth = 2;
      items.push({ id: h.id, label: h.textContent.trim(), depth: depth });
    });

    var lists = document.querySelectorAll('[data-wk-toc-list]');
    lists.forEach(function (list) {
      var frag = document.createDocumentFragment();
      items.forEach(function (it) {
        var a = document.createElement('a');
        a.href = '#' + it.id;
        a.className = 'wk-toc__link wk-toc__link--lv' + (it.depth + 1);
        a.dataset.tocId = it.id;
        a.textContent = it.label;
        frag.appendChild(a);
      });
      list.appendChild(frag);
    });

  }

  /* ---------- Footnote hover tooltips ---------- */
  function setupFootnotes() {
    var notes = {};
    document.querySelectorAll('.footnotes li').forEach(function (li) {
      var id = li.id.replace(/^fn:/, '');
      var txt = li.textContent.replace(/↩\s*$/, '').trim();
      notes[id] = txt;
    });
    if (!Object.keys(notes).length) return;

    var tip = document.createElement('div');
    tip.className = 'wk-fn-tip';
    document.body.appendChild(tip);

    function refOf(el) {
      var a = el.closest && el.closest('a.footnote, sup[role="doc-noteref"] a, a[href^="#fn:"]');
      return a;
    }
    document.addEventListener('mouseover', function (e) {
      var a = refOf(e.target);
      if (!a) return;
      var href = a.getAttribute('href') || '';
      var n = href.replace('#fn:', '');
      var txt = notes[n];
      if (!txt) return;
      tip.textContent = '[' + n + '] ' + txt;
      tip.classList.add('is-visible');
      var r = a.getBoundingClientRect();
      var tw = tip.offsetWidth || 320;
      var left = r.left;
      if (left + tw > window.innerWidth - 12) left = window.innerWidth - 12 - tw;
      tip.style.left = Math.max(12, left) + 'px';
      tip.style.top = (r.bottom + 8) + 'px';
    });
    document.addEventListener('mouseout', function (e) {
      if (refOf(e.target)) tip.classList.remove('is-visible');
    });
  }

  /* ---------- Collapsible boxes ---------- */
  function setupCollapsibles() {
    document.querySelectorAll('[data-wk-collapse]').forEach(function (box) {
      var btn = box.querySelector('[data-wk-collapse-toggle]');
      if (!btn) return;
      btn.addEventListener('click', function () {
        box.classList.toggle('is-open');
        btn.setAttribute('aria-expanded', box.classList.contains('is-open') ? 'true' : 'false');
      });
    });
  }

  /* ---------- Share / copy link ---------- */
  function setupShare() {
    document.querySelectorAll('[data-wk-copy]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var url = btn.getAttribute('data-wk-copy') || window.location.href;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(url).then(function () {
            var old = btn.textContent;
            btn.textContent = '복사됨!';
            setTimeout(function () { btn.textContent = old; }, 1500);
          });
        }
      });
    });
  }

  /* ---------- list: sort + tag filter ---------- */
  function setupList() {
    var listEl = document.querySelector('[data-wk-list]');
    if (!listEl) return;
    var cards = Array.prototype.slice.call(listEl.querySelectorAll('.wk-postcard'));

    var sortBox = document.querySelector('[data-wk-sort]');
    if (sortBox) {
      sortBox.addEventListener('click', function (e) {
        var btn = e.target.closest('.wk-sorttab');
        if (!btn) return;
        sortBox.querySelectorAll('.wk-sorttab').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var mode = btn.dataset.sort;
        var sorted = cards.slice().sort(function (a, b) {
          if (mode === 'title') return (a.dataset.title || '').localeCompare(b.dataset.title || '', 'ko');
          var da = a.dataset.date || '', db = b.dataset.date || '';
          return mode === 'old' ? da.localeCompare(db) : db.localeCompare(da);
        });
        sorted.forEach(function (c) { listEl.appendChild(c); });
      });
    }

    var filterBox = document.querySelector('[data-wk-filter]');
    var empty = document.querySelector('[data-wk-empty]');
    if (filterBox) {
      filterBox.addEventListener('click', function (e) {
        var btn = e.target.closest('.wk-tagrow');
        if (!btn) return;
        filterBox.querySelectorAll('.wk-tagrow').forEach(function (b) { b.classList.remove('is-active'); });
        btn.classList.add('is-active');
        var tag = btn.dataset.tag;
        var shown = 0;
        cards.forEach(function (c) {
          var ok = tag === '*' || (c.dataset.tags || '').indexOf('|' + tag + '|') !== -1;
          c.style.display = ok ? '' : 'none';
          if (ok) shown++;
        });
        if (empty) empty.hidden = shown !== 0;
      });
    }
  }

  /* ---------- code copy buttons ---------- */
  function setupCodeCopy() {
    var blocks = document.querySelectorAll('.wk-doc__body pre');
    blocks.forEach(function (pre) {
      if (pre.parentNode && pre.parentNode.classList && pre.parentNode.classList.contains('wk-codewrap')) return;
      var wrap = document.createElement('div');
      wrap.className = 'wk-codewrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'wk-copy';
      btn.textContent = '복사';
      btn.addEventListener('click', function (e) {
        e.preventDefault();
        var code = pre.querySelector('code') || pre;
        if (navigator.clipboard) {
          navigator.clipboard.writeText(code.innerText).then(function () {
            btn.textContent = '복사됨';
            setTimeout(function () { btn.textContent = '복사'; }, 1400);
          });
        }
      });
      wrap.appendChild(btn);
    });
  }

  /* ---------- reading progress bar (post pages) ---------- */
  function setupProgress() {
    var article = document.querySelector('.wk-doc__main');
    if (!article) return;
    var bar = document.createElement('div');
    bar.className = 'wk-progress';
    document.body.appendChild(bar);
    function update() {
      var rect = article.getBoundingClientRect();
      var total = article.offsetHeight - window.innerHeight;
      var passed = -rect.top;
      var pct = total > 0 ? Math.min(1, Math.max(0, passed / total)) : 0;
      bar.style.transform = 'scaleX(' + pct + ')';
    }
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    update();
  }

  /* ---------- image lightbox ---------- */
  function setupLightbox() {
    var imgs = document.querySelectorAll('.wk-doc__body img');
    if (!imgs.length) return;
    var overlay;
    function close() { if (overlay) overlay.classList.remove('is-open'); }
    function ensure() {
      if (overlay) return overlay;
      overlay = document.createElement('div');
      overlay.className = 'wk-lightbox';
      overlay.innerHTML = '<img alt="">';
      overlay.addEventListener('click', close);
      document.body.appendChild(overlay);
      document.addEventListener('keydown', function (e) { if (e.key === 'Escape') close(); });
      return overlay;
    }
    imgs.forEach(function (img) {
      img.style.cursor = 'zoom-in';
      img.addEventListener('click', function () {
        var ov = ensure();
        ov.querySelector('img').src = img.currentSrc || img.src;
        ov.classList.add('is-open');
      });
    });
  }

  /* ---------- init ---------- */
  function init() {
    var themeToggle = document.getElementById('theme-toggle');
    if (themeToggle) {
      var cur = root.getAttribute('data-theme') || localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'ink');
      applyTheme(cur);
      themeToggle.addEventListener('click', toggleTheme);
    }
    setupMenu();
    setupTop();
    buildTOC();
    setupFootnotes();
    setupCollapsibles();
    setupShare();
    setupList();
    setupCodeCopy();
    setupProgress();
    setupLightbox();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
