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
      // סדר קריאה לפי מיקום לטקסט עברי שכתוב בסדר חזותי; האינדקס i נשאר של הפריט המקורי, כך שההדגשה על שכבת הטקסט לא משתנה
      const ro = window.ReadOrder && window.ReadOrder.sequence(tc.items);
      const sps = ro || !window.ReadOrder ? [] : window.ReadOrder.spaces(tc.items);
      const seq = ro || tc.items.map((it, i) => ({ i, eol: !!it.hasEOL, sp: !!sps[i] }));
      seq.forEach((e) => {
        const it = tc.items[e.i], i = e.i;
        if (typeof it.str !== 'string') return;
        if (e.sp) { text += ' '; map.push([i, 0, true]); }   // 6.0.1: רווח שנוסף באינדקס — לא תו אמיתי של הפריט, ולכן לא מודגש
        const str = ro && ro.mirror ? window.ReadOrder.mirror(it.str) : it.str;
        for (let c = 0; c < str.length; c++) {
          const ch = str[c];
          if (ignoreNikud && NIKUD_RE.test(ch)) continue;
          text += ch.toLowerCase();
          map.push([i, c]);
        }
        text += e.eol ? '\n' : '';
        if (e.eol) map.push([i, it.str.length, true]);
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
    // 6.0.1: נקודת העוגן היא המקום שבו הצופה נמצא בפועל (העמוד שבראש התצוגה ומיקום הגלילה בתוכו), לא רק מספר העמוד.
    // קופצים לתוצאה הראשונה מהעוגן והלאה; רק אם אין כזו — לקרובה ביותר מאחור.
    const anchor = anchorPos();
    const start = anchor.page;
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
      const before = found.length;
      let pos = flat.indexOf(nq);
      while (pos >= 0) {
        found.push({ page: n, start: pos, end: pos + nq.length });
        pos = flat.indexOf(nq, pos + Math.max(1, nq.length));
      }
      if (!jumped && found.length > before && n >= start) {
        // מועמדת לקפיצה: ראשונה אחרי העוגן (בעמוד העוגן — לפי המיקום האנכי; בעמודים שאחריו — הראשונה)
        let pick = null;
        for (let q = before; q < found.length && !pick; q++) {
          if (n > start || await afterAnchor(n, idx, found[q], anchor)) pick = found[q];
          if (gen !== F.gen) return;
        }
        if (pick) {
          jumped = true;
          F.matches = found.slice().sort(cmp);
          F.index = F.matches.indexOf(pick);
          showCurrent();
        }
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
    if (!current && F.matches.length) {
      // אין תוצאה מהעוגן והלאה — הקרובה ביותר מאחור (האחרונה לפני העוגן)
      let back = F.matches.length - 1;
      for (let q = F.matches.length - 1; q >= 0; q--) {
        const m = F.matches[q];
        if (m.page < anchor.page || (m.page === anchor.page)) { back = q; break; }
      }
      F.index = back;
      showCurrent();
    }
    updateCount();
    highlightRendered();
    if (!F.matches.length) $('find-count').textContent = PV.t('לא נמצא');
  };
  const cmp = (a, b) => a.page - b.page || a.start - b.start;

  /** 6.0.1: העמוד שבראש התצוגה והמיקום (שבר מגובה העמוד, מראש העמוד) של ראש התצוגה בתוכו. */
  function anchorPos() {
    const vw = $('viewer');
    let page = Math.max(1, Math.min(V.count, V.page || 1)), frac = 0;
    try {
      const st = vw.scrollTop + 1;
      while (page > 1 && V.els[page - 1] && V.els[page - 1].offsetTop > st) page--;
      while (page < V.count && V.els[page] && V.els[page - 1].offsetTop + V.els[page - 1].offsetHeight <= st) page++;
      const el = V.els[page - 1];
      if (el) frac = Math.max(0, (vw.scrollTop - el.offsetTop) / Math.max(1, el.offsetHeight));
    } catch (e) { /* נשארים עם העמוד הנוכחי */ }
    return { page, frac };
  }
  /** האם התוצאה m (בעמוד העוגן) נמצאת בעוגן או אחריו. לפי המיקום האנכי של הפריט בעמוד; אם אי אפשר לחשב (עמוד מסובב) — לפי סדר הקריאה. */
  async function afterAnchor(n, idx, m, anchor) {
    if (anchor.frac <= 0) return true;
    try {
      const ent = idx.map[m.start];
      const tc = await V.getPageTextContent(n);
      const page = await V.doc.pdf.getPage(n);
      const it = tc && ent && tc.items[ent[0]];
      const h = V.pageBox[n - 1] && V.pageBox[n - 1].h;
      if (!it || !it.transform || !h || (page.rotate % 360) !== 0 || V.rotation) return true;
      const y = (h - it.transform[5] - Math.abs(it.transform[3])) / h;   // ראש השורה, שבר מגובה העמוד מלמעלה
      return y >= anchor.frac - 0.002;
    } catch (e) { return true; }
  }

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
        const [item, ch, synthetic] = idx.map[p];
        if (synthetic) continue;   // 6.0.1: רווחים ומעברי שורה של האינדקס לא ממופים לתו אמיתי — קודם הם יצרו טווחים כפולים ושיבשו את הטקסט בשכבה
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
    $('find-input').focus({ preventScroll: true });   // 6.0.1: בלי זה הדפדפן גולל את הצופה (פס החיפוש בתוכו) לתחילת המסמך
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
