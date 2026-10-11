/* צופה PDF+OCR — חיפוש בתוך המסמך (שכבת הטקסט), עם התעלמות מניקוד וטעמים. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer;

  const F = (PV.find = { query: '', matches: [], index: -1, gen: 0 });
  const NIKUD_RE = /[֑-ֽֿ-ׇ]/;

  /** אינדקס לעמוד: טקסט מנורמל + מיפוי כל תו בחזרה ל-(פריט, מיקום). */
  const indexCache = new Map();
  async function pageIndex(n, ignoreNikud) {
    const key = n + ':' + (ignoreNikud ? 1 : 0);
    if (indexCache.has(key)) return indexCache.get(key);
    const tc = await V.getPageTextContent(n);
    const map = [];
    let text = '';
    if (tc) {
      tc.items.forEach((it, i) => {
        if (typeof it.str !== 'string') return;
        for (let c = 0; c < it.str.length; c++) {
          const ch = it.str[c];
          if (ignoreNikud && NIKUD_RE.test(ch)) continue;
          text += ch.toLowerCase();
          map.push([i, c]);
        }
        text += it.hasEOL ? '\n' : '';
        if (it.hasEOL) map.push([i, it.str.length]);
      });
    }
    const res = { text, map };
    indexCache.set(key, res);
    return res;
  }
  PV.on('doc', () => { indexCache.clear(); F.reset(); });

  function normalizeQuery(q, ignoreNikud) {
    let s = q.toLowerCase().replace(/\s+/g, ' ').trim();
    if (ignoreNikud) s = s.replace(/[֑-ֽֿ-ׇ]/g, '');
    return s;
  }

  F.reset = function () {
    F.gen++;
    F.matches = []; F.index = -1; F.query = '';
    document.querySelectorAll('.textLayer .match').forEach(unwrapMatch);
    $('find-count').textContent = '';
  };

  F.search = async function (q) {
    const ignore = $('find-nikud').checked;
    const nq = normalizeQuery(q || '', ignore);
    F.reset();
    if (!nq || !V.doc || V.doc.kind !== 'pdf') return;
    F.query = nq;
    const gen = F.gen;
    $('find-count').textContent = PV.t('מחפש…');
    const start = V.page;
    // סריקה מהעמוד הנוכחי והלאה, ואז מההתחלה — כדי שהתוצאה הראשונה תהיה קרובה
    const order = [];
    for (let n = start; n <= V.count; n++) order.push(n);
    for (let n = 1; n < start; n++) order.push(n);
    const found = [];
    let jumped = false;
    for (let k = 0; k < order.length; k++) {
      const n = order[k];
      let idx;
      try { idx = await pageIndex(n, ignore); } catch (e) { continue; }
      if (gen !== F.gen) return;
      const flat = idx.text.replace(/\n/g, ' ');
      let pos = flat.indexOf(nq);
      while (pos >= 0) {
        found.push({ page: n, start: pos, end: pos + nq.length });
        pos = flat.indexOf(nq, pos + Math.max(1, nq.length));
      }
      if (!jumped && found.length) {
        jumped = true;
        F.matches = found.slice().sort(cmp);
        F.index = F.matches.indexOf(found[0]);
        showCurrent();
      }
      if (k % 25 === 24) {
        $('find-count').textContent = PV.t('מחפש… {n}%', { n: Math.round((k / order.length) * 100) });
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    if (gen !== F.gen) return;
    const current = F.matches[F.index];
    F.matches = found.sort(cmp);
    F.index = current ? F.matches.findIndex((m) => m.page === current.page && m.start === current.start) : -1;
    updateCount();
    highlightRendered();
    if (!F.matches.length) $('find-count').textContent = PV.t('לא נמצא');
  };
  const cmp = (a, b) => a.page - b.page || a.start - b.start;

  function updateCount() {
    $('find-count').textContent = F.matches.length ? (F.index + 1) + ' / ' + F.matches.length : '';
  }

  F.step = function (dir) {
    if (!F.matches.length) return;
    F.index = (F.index + dir + F.matches.length) % F.matches.length;
    showCurrent();
  };

  function showCurrent() {
    const m = F.matches[F.index];
    if (!m) return;
    updateCount();
    if (V.page !== m.page) V.goTo(m.page);
    highlightRendered();
    setTimeout(() => {
      const cur = document.querySelector('.textLayer .match.current');
      if (cur) cur.scrollIntoView({ block: 'center', inline: 'nearest' });
    }, 60);
  }

  // ── הדגשה בשכבת הטקסט ────────────────────────────────────────────────
  function unwrapMatch(span) {
    const parent = span.parentNode;
    if (!parent) return;
    parent.replaceChild(document.createTextNode(span.textContent), span);
    parent.normalize();
  }

  async function highlightPage(n, textDivs) {
    const pageEl = V.els[n - 1];
    if (!pageEl) return;
    pageEl.querySelectorAll('.textLayer .match').forEach(unwrapMatch);
    const ms = F.matches.filter((m) => m.page === n);
    if (!ms.length || !textDivs) return;
    const idx = await pageIndex(n, $('find-nikud').checked);
    // לכל פריט: רשימת טווחים [from,to,current]
    const perItem = new Map();
    ms.forEach((m) => {
      const isCur = F.matches[F.index] === m;
      for (let p = m.start; p < m.end && p < idx.map.length; p++) {
        const [item, ch] = idx.map[p];
        if (!perItem.has(item)) perItem.set(item, []);
        const arr = perItem.get(item);
        const last = arr[arr.length - 1];
        if (last && last[1] === ch && last[2] === isCur) last[1] = ch + 1;
        else arr.push([ch, ch + 1, isCur]);
      }
    });
    perItem.forEach((ranges, item) => {
      const div = textDivs[item];
      if (!div) return;
      const str = div.textContent;
      div.textContent = '';
      let pos = 0;
      ranges.forEach(([a, b, cur]) => {
        if (a > pos) div.appendChild(document.createTextNode(str.slice(pos, a)));
        const s = document.createElement('span');
        s.className = 'match' + (cur ? ' current' : '');
        s.textContent = str.slice(a, b);
        div.appendChild(s);
        pos = b;
      });
      if (pos < str.length) div.appendChild(document.createTextNode(str.slice(pos)));
    });
  }

  function highlightRendered() {
    V.rendered.forEach((r, n) => { if (r.textDivs) highlightPage(n, r.textDivs); });
  }
  PV.on('textlayer', ({ page, textDivs }) => { if (F.matches.length) highlightPage(page, textDivs); });

  // ── ממשק ──────────────────────────────────────────────────────────────
  F.open = function () {
    if (!V.doc || V.doc.kind !== 'pdf') { PV.toast(PV.t('חיפוש זמין במסמכי PDF עם שכבת טקסט')); return; }
    $('findbar').hidden = false;
    const sel = String(window.getSelection() || '').trim();
    if (sel && sel.length < 80 && !sel.includes('\n')) $('find-input').value = sel;
    $('find-input').focus();
    $('find-input').select();
    if ($('find-input').value) F.search($('find-input').value);
  };
  F.close = function () {
    $('findbar').hidden = true;
    F.reset();
    $('viewer').focus({ preventScroll: true });
  };

  const runSearch = PV.debounce(() => F.search($('find-input').value), 280);
  document.addEventListener('DOMContentLoaded', () => {
    $('find-input').addEventListener('input', runSearch);
    $('find-input').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (F.query !== normalizeQuery($('find-input').value, $('find-nikud').checked)) F.search($('find-input').value);
        else F.step(e.shiftKey ? -1 : 1);
      } else if (e.key === 'Escape') { e.preventDefault(); F.close(); }
    });
    $('find-nikud').addEventListener('change', () => F.search($('find-input').value));
    $('find-next').addEventListener('click', () => F.step(1));
    $('find-prev').addEventListener('click', () => F.step(-1));
    $('find-close').addEventListener('click', F.close);
  });
})();
