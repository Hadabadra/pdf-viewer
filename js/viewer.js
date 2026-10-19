/* צופה PDF+OCR — מנוע התצוגה: גלילה רציפה, רינדור עצל, שכבת טקסט, תקריב, סיבוב,
   עמודים ממוזערים ותוכן עניינים. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$;
  pdfjsLib.GlobalWorkerOptions.workerSrc = './vendor/pdf.worker.min.js';

  const MAX_RENDERED = 10;
  const MAX_CONCURRENT = 2;        // עמודים שמצטיירים במקביל (הקרובים לעמוד הנוכחי קודם)
  const SCROLL_IDLE_MS = 140;      // שכבת הטקסט (כבדה) נבנית רק אחרי שהגלילה נעצרה
  const ZOOM_HOLD_MS = 90;         // בזמן רצף תקריבים — הקנבס הישן נמתח, והרינדור מחדש מחכה
  const PAGE_GAP_PX = 14;

  const V = (PV.viewer = {
    doc: null,          // { kind, name, pdf?, images?, text?, html?, source }
    count: 0,
    page: 1,
    scale: 1,
    zoomMode: 'fit-width',
    rotation: 0,
    night: false,
    pageBox: [],        // [{w,h,rotate}] — מידות העמוד ב-scale 1, לפני סיבוב המשתמש
    els: [],            // div.page לכל עמוד
    rendered: new Map(),// pageNum -> { gen, task }
    textContent: new Map(), // pageNum -> textContent (מטמון)
    gen: 0,
  });

  const viewerEl = $('viewer'), pagesEl = $('pages');

  // ── מידות ──────────────────────────────────────────────────────────────
  function boxFor(n) {
    const b = V.pageBox[n - 1] || V.pageBox[0] || { w: 600, h: 800, rotate: 0 };
    const rot = ((b.rotate || 0) + V.rotation) % 180 !== 0;
    return { w: rot ? b.h : b.w, h: rot ? b.w : b.h };
  }
  function availableSize() {
    const cs = getComputedStyle(pagesEl);
    const padX = parseFloat(cs.paddingLeft) + parseFloat(cs.paddingRight);
    // גובה: 8px מרווח מעל ו-8px מתחת לעמוד (כמו קפיצת goTo), כך שהתאמה לגובה מדויקת
    return { w: Math.max(120, viewerEl.clientWidth - padX), h: Math.max(120, viewerEl.clientHeight - 16) };
  }
  function computeScale(mode) {
    if (typeof mode === 'number') return mode;
    const ref = boxFor(V.page || 1), av = availableSize();
    const fw = av.w / ref.w;
    if (mode === 'fit-page') return Math.min(fw, av.h / ref.h);
    if (mode === 'fit-height') return av.h / ref.h;
    return Math.min(fw, 4);
  }
  V.computeScale = computeScale;

  // ── טעינת מסמך ─────────────────────────────────────────────────────────
  /** מנקה את התצוגה בלי להרוס את המסמך (כדי שלשונית אחרת תוכל להציג מסמך אחר, והמסמך יישאר בזיכרון). */
  V.unmount = function () {
    V.gen++;
    V.rendered.forEach((r) => { if (r.task) try { r.task.cancel(); } catch (e) { /* בוטל */ } });
    V.doc = null; V.count = 0; V.page = 1; V.pageBox = []; V.els = [];
    V.rendered.clear(); V.textContent = new Map(); pendingText.length = 0;
    pagesEl.innerHTML = '';
    pagesEl.hidden = false;
    viewerEl.querySelectorAll('.doc-frame').forEach((f) => f.remove());
  };
  V.destroyDoc = function (doc) {
    if (doc && doc.busyOcr) { doc.destroyLater = true; return; } // ה-OCR עדיין רץ על המסמך — ייהרס רק בסיומו
    if (doc && doc.pdf) { try { doc.pdf.destroy(); } catch (e) { /* כבר נסגר */ } }
  };
  /** סגירה מלאה של המסמך המוצג (הורס אותו) ומעבר למסך הפתיחה. */
  V.close = function () {
    const d = V.doc;
    V.unmount();
    V.destroyDoc(d);
    $('welcome').hidden = false;
    PV.emit('doc', null);
  };
  /** לשונית ריקה: מסך הפתיחה, בלי להרוס שום מסמך. */
  V.showEmpty = function () {
    V.unmount();
    $('welcome').hidden = false;
    PV.emit('doc', null);
  };
  /** מצב התצוגה של המסמך הנוכחי, להחזרה מאוחר יותר ב-V.resume. המסמך נשאר בזיכרון. */
  V.suspend = function () {
    if (!V.doc) return null;
    const st = {
      doc: V.doc, count: V.count, pageBox: V.pageBox, textContent: V.textContent,
      zoomMode: V.zoomMode, rotation: V.rotation, page: V.page, frac: V.count ? pageOffsetFraction() : 0,
    };
    V.unmount();
    return st;
  };
  /** מציג מחדש מסמך שהושהה ב-V.suspend, באותו עמוד, תקריב וסיבוב. */
  V.resume = function (st, meta) {
    const opts = meta || {};
    V.unmount();
    const gen = V.gen;
    V.doc = st.doc; V.count = st.count; V.pageBox = st.pageBox; V.textContent = st.textContent || new Map();
    V.rotation = st.rotation || 0;
    V.page = 1;
    $('welcome').hidden = true;
    mountDocView(V.doc, gen);
    V.docOrigin = opts.origin || 'resume';
    V.setZoom(isNaN(Number(st.zoomMode)) ? st.zoomMode : Number(st.zoomMode), { noScroll: true });
    viewerEl.scrollTop = 0;
    if (st.page && st.page > 1 && st.page <= V.count) V.goTo(st.page, { instant: true, fraction: st.frac || 0 });
    PV.emit('doc', V.doc);
    updateVisible();
    viewerEl.focus({ preventScroll: true });
  };

  function mountDocView(doc, gen) {
    if (doc.kind === 'pdf' || doc.kind === 'images') {
      buildPages();
      if (doc.kind === 'pdf' && !doc.measured) measurePagesInBackground(gen);
    } else if (doc.kind === 'text') {
      const box = document.createElement('div');
      box.className = 'doc-text';
      doc.parts.forEach((p, i) => {
        if (p.title && doc.parts.length > 1) {
          const h = document.createElement('span');
          h.className = 'doc-part';
          h.textContent = p.title;
          box.appendChild(h);
        }
        if (p.blocks) {
          p.blocks.forEach((b) => {
            const el = document.createElement(b.h ? 'h' + (b.h + 1) : 'div');
            if (b.h) el.className = 'doc-h';
            b.runs.forEach((r) => {
              if (r.b && !b.h) { const s = document.createElement('b'); s.textContent = r.t; el.appendChild(s); }
              else el.appendChild(document.createTextNode(r.t));
            });
            if (!b.runs.length) el.appendChild(document.createTextNode('\u200b'));
            box.appendChild(el);
          });
        } else box.appendChild(document.createTextNode(p.text + (i < doc.parts.length - 1 ? '\n' : '')));
      });
      pagesEl.appendChild(box);
    } else if (doc.kind === 'html') {
      const frame = document.createElement('iframe');
      frame.className = 'doc-frame';
      frame.setAttribute('sandbox', '');
      frame.srcdoc = doc.html;
      pagesEl.hidden = true;
      viewerEl.appendChild(frame);
      doc.frame = frame;
    }
  }

  /** kind: 'pdf' (data: ArrayBuffer) | 'images' (data: HTMLCanvasElement[]) | 'text' (data: {parts:[{title,text}]}) | 'html' (data: string) */
  V.open = async function (kind, data, meta) {
    const opts = meta || {};
    let pdf = null;
    if (kind === 'pdf') {
      // גופני ה-PDF הסטנדרטיים (Foxit/Liberation) — בלעדיהם גופנים לא מוטבעים מוצגים משובשים (עברית ודפוס ישן)
      // data: ArrayBuffer (הקובץ כבר בזיכרון) או { url, onProgress } — טעינה הדרגתית מהשרת המקומי של אוצריא (תמיכה ב-Range), בלי להוריד את כל הקובץ לזיכרון
      const fromUrl = data && typeof data === 'object' && data.url;
      const task = pdfjsLib.getDocument(Object.assign(fromUrl ? { url: data.url, rangeChunkSize: 1048576 } : { data }, { isEvalSupported: false, enableXfa: false, standardFontDataUrl: new URL('vendor/standard_fonts/', document.baseURI).href, cMapUrl: new URL('vendor/cmaps/', document.baseURI).href, cMapPacked: true,
        // 3.5.2: גופנים לא מוטבעים/סמליים — לא להחליף בגופן מערכת, ולצייר את צורות האותיות עצמן במקום FontFace
        useSystemFonts: false, disableFontFace: true }));
      if (fromUrl && data.onProgress) task.onProgress = data.onProgress;
      pdf = await task.promise;
    }
    if (opts.beforeMount) {
      try { opts.beforeMount(); } catch (e) { if (pdf) { try { pdf.destroy(); } catch (x) { /* */ } } throw e; }
    }
    const prevDoc = V.doc;
    V.unmount();
    if (prevDoc && opts.destroyPrev) V.destroyDoc(prevDoc);
    const gen = V.gen;
    V.doc = { kind, name: opts.name || '', source: opts.source || null, pdf };
    V.rotation = opts.rotation || 0;
    V.page = 1;
    $('welcome').hidden = true;

    if (kind === 'pdf') {
      V.count = pdf.numPages;
      const first = await pdf.getPage(1);
      const vp = first.getViewport({ scale: 1 });
      const base = { w: vp.width, h: vp.height, rotate: 0 };
      V.pageBox = Array.from({ length: V.count }, () => Object.assign({}, base));
      if (gen !== V.gen) return;
    } else if (kind === 'images') {
      V.doc.images = data;
      V.count = data.length;
      V.pageBox = data.map((c) => ({ w: c.width, h: c.height, rotate: 0 }));
    } else if (kind === 'text') {
      V.doc.parts = data.parts;
      V.count = 0;
    } else if (kind === 'html') {
      V.doc.html = data;
      V.count = 0;
    }
    mountDocView(V.doc, gen);
    V.docOrigin = opts.origin || 'open';

    const startMode = opts.zoom != null ? opts.zoom : PV.settings.zoom;
    V.setZoom(isNaN(Number(startMode)) ? startMode : Number(startMode), { noScroll: true });
    viewerEl.scrollTop = 0;
    if (opts.page && opts.page > 1 && opts.page <= V.count) V.goTo(opts.page, { instant: true, fraction: opts.frac || 0 });
    PV.emit('doc', V.doc);
    updateVisible();
    viewerEl.focus({ preventScroll: true });
  };

  // מידות מדויקות לכל עמוד (עמודים בגדלים שונים) — ברקע, בלי לעכב את הפתיחה
  async function measurePagesInBackground(gen) {
    const pdf = V.doc && V.doc.pdf;
    if (!pdf) return;
    let changed = false;
    for (let n = 1; n <= V.count; n++) {
      if (gen !== V.gen) return;
      try {
        const p = await pdf.getPage(n);
        const vp = p.getViewport({ scale: 1 });
        const b = V.pageBox[n - 1];
        if (Math.abs(b.w - vp.width) > 0.5 || Math.abs(b.h - vp.height) > 0.5) {
          V.pageBox[n - 1] = { w: vp.width, h: vp.height, rotate: 0 };
          changed = true;
        }
      } catch (e) { /* עמוד פגום — נשאר במידות ברירת המחדל */ }
      if (n % 40 === 0) await new Promise((r) => setTimeout(r, 0));
    }
    if (gen === V.gen && V.doc) V.doc.measured = true;
    if (changed && gen === V.gen) relayout(true);
  }

  function buildPages() {
    pagesEl.innerHTML = '';
    V.els = [];
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= V.count; n++) {
      const d = document.createElement('div');
      d.className = 'page';
      d.dataset.page = n;
      frag.appendChild(d);
      V.els.push(d);
    }
    pagesEl.appendChild(frag);
  }

  function sizePages() {
    V.els.forEach((d, i) => {
      const b = boxFor(i + 1);
      d.style.width = Math.floor(b.w * V.scale) + 'px';
      d.style.height = Math.floor(b.h * V.scale) + 'px';
    });
  }

  function unrenderAll() {
    V.rendered.forEach((r) => { if (r.task) try { r.task.cancel(); } catch (e) { /* בוטל */ } });
    V.rendered.clear();
    pendingText.length = 0;
    V.els.forEach((d) => {
      d.querySelectorAll('canvas.page-canvas, .textLayer, .page-loading').forEach((c) => {
        if (c.tagName === 'CANVAS') { c.width = 0; c.height = 0; }
        c.remove();
      });
    });
  }

  /** שינוי מידה בלי לרוקן: הקנבסים הקיימים נשארים ונמתחים (CSS) עד שהרינדור החדש מוכן — בלי הבהוב לבן. */
  function softUnrenderAll() {
    V.rendered.forEach((r) => { if (r.task) try { r.task.cancel(); } catch (e) { /* בוטל */ } });
    V.rendered.clear();
    pendingText.length = 0;
    V.els.forEach((d) => d.querySelectorAll('.textLayer, .page-loading').forEach((c) => c.remove()));
  }
  function trimStaleCanvases() {
    const [a, b] = visibleRange();
    V.els.forEach((d, i) => {
      const n = i + 1;
      if (n >= a && n <= b) return;
      d.querySelectorAll('canvas.page-canvas').forEach((c) => { c.width = 0; c.height = 0; c.remove(); });
    });
  }

  /** keep=true: תקריב/שינוי גודל (הקנבס הישן נשאר זמנית). בסיבוב — מרוקנים כרגיל, כי הצורה משתנה. */
  function relayout(keep) {
    if (!V.doc) return;
    const anchor = V.page, frac = pageOffsetFraction();
    V.gen++;
    if (keep) softUnrenderAll(); else unrenderAll();
    sizePages();
    if (V.count) V.goTo(anchor, { instant: true, fraction: frac, silent: true });
    if (keep) { holdUntil = performance.now() + ZOOM_HOLD_MS; trimStaleCanvases(); }
    updateVisible();
    PV.emit('layout');
  }

  function pageOffsetFraction() {
    const el = V.els[V.page - 1];
    if (!el) return 0;
    const top = viewerEl.scrollTop - el.offsetTop;
    return Math.max(0, Math.min(1, top / Math.max(1, el.offsetHeight)));
  }

  // ── תקריב וסיבוב ──────────────────────────────────────────────────────
  V.setZoom = function (mode, opts) {
    if (!V.doc) return;
    V.zoomMode = mode;
    if (V.doc.kind === 'text') {
      const s = typeof mode === 'number' ? mode : 1;
      V.scale = s;
      const box = pagesEl.querySelector('.doc-text');
      if (box) box.style.fontSize = 'calc(var(--reading-size) * ' + s + ')';
      PV.emit('zoom');
      return;
    }
    if (!V.count) { PV.emit('zoom'); return; }
    const next = Math.max(0.25, Math.min(5, computeScale(mode)));
    if (Math.abs(next - V.scale) < 0.001 && V.els[0] && V.els[0].style.width) { PV.emit('zoom'); return; }
    V.scale = next;
    if (opts && opts.noScroll) { V.gen++; unrenderAll(); sizePages(); updateVisible(); }
    else relayout(true);
    PV.emit('zoom');
  };
  V.zoomBy = function (dir) {
    const steps = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5];
    const cur = V.scale;
    let next = cur;
    if (dir > 0) next = steps.find((s) => s > cur + 0.01) || 5;
    else next = steps.slice().reverse().find((s) => s < cur - 0.01) || 0.25;
    V.setZoom(next);
  };
  V.rotate = function () {
    if (!V.count) return;
    V.rotation = (V.rotation + 90) % 360;
    if (typeof V.zoomMode === 'string') V.scale = computeScale(V.zoomMode);
    relayout();
    PV.emit('rotate');
  };
  V.setNight = function (on) {
    V.night = !!on;
    viewerEl.classList.toggle('night', V.night);
    PV.emit('night');
  };

  // ── ניווט ──────────────────────────────────────────────────────────────
  V.goTo = function (n, opts) {
    const o = opts || {};
    if (!V.count) return;
    const page = Math.max(1, Math.min(V.count, Math.round(n)));
    const el = V.els[page - 1];
    const top = el.offsetTop + (o.fraction ? el.offsetHeight * o.fraction : -8);
    viewerEl.scrollTop = Math.max(0, top);
    if (V.page !== page) { V.page = page; PV.emit('page', page); }
  };
  V.pageFrac = () => (V.count ? pageOffsetFraction() : 0);
  V.next = () => V.goTo(V.page + 1);
  V.prev = () => V.goTo(V.page - 1);

  function findCurrentPage() {
    if (!V.count) return;
    const probe = viewerEl.scrollTop + Math.min(viewerEl.clientHeight * 0.35, 260);
    let lo = 0, hi = V.els.length - 1, ans = 0;
    while (lo <= hi) {
      const mid = (lo + hi) >> 1;
      if (V.els[mid].offsetTop <= probe) { ans = mid; lo = mid + 1; } else hi = mid - 1;
    }
    const p = ans + 1;
    if (p !== V.page) { V.page = p; PV.emit('page', p); }
  }

  // ── רינדור עצל ─────────────────────────────────────────────────────────
  let activeRenders = 0;      // רינדורי קנבס בתהליך
  let holdUntil = 0, holdTimer = 0;
  const pendingText = [];     // שכבות טקסט שנדחו עד שהגלילה נעצרת
  V.scrolling = false;
  function visibleRange() {
    if (!V.count) return [0, -1];
    const top = viewerEl.scrollTop - 600, bottom = viewerEl.scrollTop + viewerEl.clientHeight + 600;
    let first = -1, last = -1;
    let lo = 0, hi = V.els.length - 1;
    while (lo <= hi) { // העמוד הראשון שתחתיתו מתחת ל-top
      const mid = (lo + hi) >> 1, e = V.els[mid];
      if (e.offsetTop + e.offsetHeight >= top) { first = mid; hi = mid - 1; } else lo = mid + 1;
    }
    if (first < 0) return [0, -1];
    last = first;
    while (last + 1 < V.els.length && V.els[last + 1].offsetTop <= bottom) last++;
    return [first + 1, last + 1];
  }

  function updateVisible() {
    if (!V.doc || !V.count) return;
    const [a, b] = visibleRange();
    // רינדור שעדיין רץ לעמוד שיצא מהטווח — מבוטל, כדי לפנות את המנוע לעמודים שרואים עכשיו
    Array.from(V.rendered.entries()).forEach(([n, r]) => { if (!r.done && (n < a - 1 || n > b + 1)) unrenderPage(n); });
    if (V.rendered.size > MAX_RENDERED) {
      const far = Array.from(V.rendered.keys()).filter((n) => n < a - 1 || n > b + 1)
        .sort((x, y) => Math.abs(y - V.page) - Math.abs(x - V.page));
      far.slice(0, V.rendered.size - MAX_RENDERED).forEach(unrenderPage);
    }
    pumpRenders();
  }
  /** רינדור מחדש של העמודים הנראים (למשל אחרי שינוי איכות התצוגה) — הקנבס הישן נשאר עד שהחדש מוכן */
  V.rerender = function () { if (V.doc && V.count) relayout(true); };
  /** מתחיל רינדורים חדשים, הקרוב לעמוד הנוכחי קודם, עד MAX_CONCURRENT במקביל. */
  function pumpRenders() {
    if (!V.doc || !V.count) return;
    const wait = holdUntil - performance.now();
    if (wait > 0) { clearTimeout(holdTimer); holdTimer = setTimeout(pumpRenders, wait + 5); return; }
    const [a, b] = visibleRange();
    const need = [];
    for (let n = a; n <= b && n > 0; n++) if (!V.rendered.has(n)) need.push(n);
    need.sort((x, y) => Math.abs(x - V.page) - Math.abs(y - V.page));
    while (activeRenders < MAX_CONCURRENT && need.length) renderPage(need.shift());
  }
  /** בונה שכבות טקסט שנדחו (הקרובות לעמוד הנוכחי קודם), בלי לחסום את הגלילה */
  async function flushText() {
    pendingText.sort((x, y) => Math.abs(x.n - V.page) - Math.abs(y.n - V.page));
    while (pendingText.length && !V.scrolling) {
      const t = pendingText.shift();
      if (t.gen !== V.gen || V.rendered.get(t.n) !== t.entry) continue;
      try { await renderTextLayer(t.n, t.page, t.viewport, t.d, t.gen, t.entry); } catch (e) { /* בוטל */ }
      await new Promise((r) => setTimeout(r, 0));
    }
  }
  V.refresh = updateVisible;

  function unrenderPage(n) {
    const r = V.rendered.get(n);
    if (r && r.task) try { r.task.cancel(); } catch (e) { /* בוטל */ }
    V.rendered.delete(n);
    const d = V.els[n - 1];
    if (!d) return;
    d.querySelectorAll('canvas.page-canvas, .textLayer').forEach((c) => {
      if (c.tagName === 'CANVAS') { c.width = 0; c.height = 0; }
      c.remove();
    });
  }

  async function renderPage(n) {
    const gen = V.gen, d = V.els[n - 1];
    if (!d) return;
    const entry = { gen, task: null, done: false };
    V.rendered.set(n, entry);
    activeRenders++;
    let released = false;
    const release = () => { if (!released) { released = true; activeRenders--; } };
    // חדות: דגימת־יתר (לפחות פי 2) עם תקרה לזיכרון הקנבס
    const dpr = Math.max(window.devicePixelRatio || 1, Number(PV.settings.renderQuality) || 2);
    const canvas = document.createElement('canvas');
    canvas.className = 'page-canvas';
    // אם כבר יש קנבס ישן (אחרי תקריב) — מציירים בצד ומחליפים רק כשמוכן
    const stale = Array.from(d.querySelectorAll('canvas.page-canvas'));
    const swap = () => { stale.forEach((c) => { c.width = 0; c.height = 0; c.remove(); }); if (!canvas.isConnected) d.insertBefore(canvas, d.firstChild); };
    try {
      if (V.doc.kind === 'pdf') {
        const page = await V.doc.pdf.getPage(n);
        if (gen !== V.gen || V.rendered.get(n) !== entry) return;
        const viewport = page.getViewport({ scale: V.scale, rotation: (page.rotate + V.rotation) % 360 });
        const q = Math.max(1, Math.min(dpr, Math.sqrt(24e6 / (viewport.width * viewport.height))));
        canvas.width = Math.floor(viewport.width * q);
        canvas.height = Math.floor(viewport.height * q);
        if (!stale.length) d.insertBefore(canvas, d.firstChild);
        entry.task = page.render({ canvasContext: canvas.getContext('2d'), viewport, transform: q !== 1 ? [q, 0, 0, q, 0, 0] : null });
        await entry.task.promise;
        if (gen !== V.gen || V.rendered.get(n) !== entry) return;
        swap();
        entry.done = true;
        release();
        pumpRenders();
        if (V.scrolling) pendingText.push({ n, page, viewport, d, gen, entry });
        else await renderTextLayer(n, page, viewport, d, gen, entry);
      } else if (V.doc.kind === 'images') {
        const src = V.doc.images[n - 1];
        const b = boxFor(n);
        const w = b.w * V.scale, h = b.h * V.scale;
        canvas.width = Math.floor(w * dpr);
        canvas.height = Math.floor(h * dpr);
        const ctx = canvas.getContext('2d');
        drawRotated(ctx, src, canvas.width, canvas.height, V.rotation);
        canvas.classList.add('doc-image');
        swap();
        entry.done = true;
      }
    } catch (e) {
      if (e && e.name === 'RenderingCancelledException') return;
      console.error(e);
    } finally {
      release();
      pumpRenders();
    }
  }

  function drawRotated(ctx, src, W, H, rot) {
    ctx.save();
    ctx.translate(W / 2, H / 2);
    ctx.rotate((rot * Math.PI) / 180);
    const sw = rot % 180 ? H : W, sh = rot % 180 ? W : H;
    ctx.drawImage(src, -sw / 2, -sh / 2, sw, sh);
    ctx.restore();
  }

  async function renderTextLayer(n, page, viewport, d, gen, entry) {
    let tc = V.textContent.get(n);
    if (!tc) { tc = await page.getTextContent(); V.textContent.set(n, tc); }
    if (gen !== V.gen || V.rendered.get(n) !== entry || !tc.items.length) return;
    const layer = document.createElement('div');
    layer.className = 'textLayer';
    layer.style.setProperty('--scale-factor', viewport.scale);
    const textDivs = [];
    d.appendChild(layer);
    const task = pdfjsLib.renderTextLayer({ textContentSource: tc, container: layer, viewport, textDivs });
    await task.promise;
    if (gen !== V.gen || V.rendered.get(n) !== entry) return;
    const end = document.createElement('div');
    end.className = 'endOfContent';
    layer.appendChild(end);
    entry.textDivs = textDivs;
    PV.emit('textlayer', { page: n, textDivs, items: tc.items });
  }

  // ── שירותים לשאר המודולים ───────────────────────────────────────────────
  /** טקסט מוטבע של עמוד (PDF בלבד). */
  V.getPageTextContent = async function (n, doc) {
    const D = doc || V.doc;
    if (!D || D.kind !== 'pdf') return null;
    if (D !== V.doc) { const p = await D.pdf.getPage(n); return p.getTextContent(); } // מסמך שאינו מוצג כרגע (ריצת OCR ברקע)
    let tc = V.textContent.get(n);
    if (!tc) { const p = await D.pdf.getPage(n); tc = await p.getTextContent(); V.textContent.set(n, tc); }
    return tc;
  };
  V.getPageText = async function (n, doc) {
    const tc = await V.getPageTextContent(n, doc);
    if (!tc) return '';
    let out = '';
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      out += it.str;
      if (it.hasEOL) out += '\n';
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  /** רינדור עמוד לקנבס מחוץ למסך, ב-scale נתון (ל-OCR ולהדפסה).
      opts: { doc, rotation } — למסמך אחר מהמוצג כרגע (כך שה-OCR ממשיך גם כשעוברים ללשונית אחרת). */
  V.renderOffscreen = async function (n, scale, opts) {
    const D = (opts && opts.doc) || V.doc;
    const rotation = opts && opts.rotation != null ? opts.rotation : V.rotation;
    const canvas = document.createElement('canvas');
    if (D.kind === 'pdf') {
      const page = await D.pdf.getPage(n);
      const rot = (page.rotate + rotation) % 360;
      const v1 = page.getViewport({ scale: 1, rotation: rot });
      scale = Math.min(scale, 9000 / Math.max(v1.width, v1.height));   // תקרה: צלע עד 9000 פיקסלים (כמו בשכבת הטקסט)
      const viewport = page.getViewport({ scale, rotation: rot });
      canvas.width = Math.floor(viewport.width);
      canvas.height = Math.floor(viewport.height);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
    } else if (D.kind === 'images') {
      const src = D.images[n - 1];
      const swap = rotation % 180 !== 0;
      const b = { w: swap ? src.height : src.width, h: swap ? src.width : src.height };
      const f = Math.min(scale, 4000 / Math.max(b.w, b.h));
      canvas.width = Math.floor(b.w * f);
      canvas.height = Math.floor(b.h * f);
      const ctx = canvas.getContext('2d');
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      drawRotated(ctx, src, canvas.width, canvas.height, rotation);
    }
    return canvas;
  };
  V.isPaged = () => !!(V.doc && (V.doc.kind === 'pdf' || V.doc.kind === 'images'));

  // ── עמודים ממוזערים ────────────────────────────────────────────────────
  const thumbsEl = $('thumbs');
  let thumbObserver = null, thumbGen = 0, thumbPumping = false;
  const thumbQueue = [];
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  /** ממוזערים אחד-אחד ובעדיפות נמוכה: לא מתחרים עם רינדור העמודים הגדולים על המנוע */
  async function pumpThumbs() {
    if (thumbPumping) return;
    thumbPumping = true;
    try {
      while (thumbQueue.length) {
        if (activeRenders > 0 || V.scrolling || pendingText.length) { await sleep(150); continue; }
        const it = thumbQueue.shift();
        if (it.myGen !== thumbGen) continue;
        await renderThumb(it.btn, it.myGen);
        await sleep(15);
      }
    } finally { thumbPumping = false; }
  }
  V.buildThumbs = function () {
    thumbGen++;
    thumbQueue.length = 0;
    thumbsEl.innerHTML = '';
    if (thumbObserver) thumbObserver.disconnect();
    $('thumbs-empty').hidden = V.isPaged();
    if (!V.isPaged()) return;
    const myGen = thumbGen;
    const root = thumbsEl.closest('.tab-panel');
    thumbObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (!en.isIntersecting) return;
        thumbObserver.unobserve(en.target);
        thumbQueue.push({ btn: en.target, myGen });
        pumpThumbs();
      });
    }, { root, rootMargin: '300px' });
    const frag = document.createDocumentFragment();
    for (let n = 1; n <= V.count; n++) {
      const b = document.createElement('button');
      b.className = 'thumb' + (n === V.page ? ' current' : '');
      b.dataset.page = n;
      const ph = document.createElement('div');
      ph.className = 'thumb-ph';
      const box = boxFor(n);
      ph.style.height = (7.5 * box.h / box.w) + 'em';
      const lab = document.createElement('span');
      lab.textContent = n;
      b.append(ph, lab);
      b.addEventListener('click', () => V.goTo(n));
      frag.appendChild(b);
      thumbObserver.observe(b);
    }
    thumbsEl.appendChild(frag);
  };
  async function renderThumb(btn, myGen) {
    const n = Number(btn.dataset.page);
    try {
      const fontPx = parseFloat(getComputedStyle(btn).fontSize) || 14;
      const targetW = 7.5 * fontPx * (window.devicePixelRatio || 1);
      const b = boxFor(n);
      const c = await V.renderOffscreen(n, targetW / b.w);
      if (myGen !== thumbGen) return;
      const ph = btn.querySelector('.thumb-ph');
      if (ph) ph.replaceWith(c);
      if (V.night) c.classList.add('doc-image');
    } catch (e) { /* ממוזער שנכשל נשאר מציין מקום */ }
  }
  V.markThumb = function (n) {
    const cur = thumbsEl.querySelector('.thumb.current');
    if (cur) cur.classList.remove('current');
    const t = thumbsEl.querySelector('.thumb[data-page="' + n + '"]');
    if (t) {
      t.classList.add('current');
      const panel = thumbsEl.closest('.tab-panel');
      if (panel && !panel.hidden) {
        const tr = t.getBoundingClientRect(), pr = panel.getBoundingClientRect();
        if (tr.top < pr.top || tr.bottom > pr.bottom) t.scrollIntoView({ block: 'nearest' });
      }
    }
  };

  // ── תוכן עניינים ──────────────────────────────────────────────────────
  V.buildToc = async function () {
    const tocEl = $('toc');
    tocEl.innerHTML = '';
    $('toc-empty').hidden = false;
    if (!V.doc || V.doc.kind !== 'pdf') return false;
    const pdf = V.doc.pdf, gen = V.gen;
    let outline = null;
    try { outline = await pdf.getOutline(); } catch (e) { outline = null; }
    if (!outline || !outline.length || gen !== V.gen) return false;
    async function destPage(dest) {
      try {
        const d = typeof dest === 'string' ? await pdf.getDestination(dest) : dest;
        if (!d || !d[0]) return null;
        if (typeof d[0] === 'number') return d[0] + 1;
        return (await pdf.getPageIndex(d[0])) + 1;
      } catch (e) { return null; }
    }
    function build(items, parent, depth) {
      items.forEach((it) => {
        const li = document.createElement('li');
        const row = document.createElement('div');
        row.className = 'list-item toc-item';
        const hasKids = it.items && it.items.length && depth < 8;
        const tog = document.createElement('span');
        tog.className = 'tree-toggle';
        if (hasKids) tog.appendChild(PV.icon('chevron_down'));
        const txt = document.createElement('span');
        txt.className = 'li-text';
        const title = document.createElement('span');
        title.className = 'li-title';
        title.textContent = it.title || '—';
        title.title = it.title || '';
        txt.appendChild(title);
        row.append(tog, txt);
        li.appendChild(row);
        let sub = null;
        if (hasKids) {
          sub = document.createElement('ul');
          sub.className = 'list';
          sub.hidden = depth >= 1;
          if (sub.hidden) tog.firstChild.style.transform = 'rotate(90deg)';
          build(it.items, sub, depth + 1);
          li.appendChild(sub);
          tog.addEventListener('click', (e) => {
            e.stopPropagation();
            sub.hidden = !sub.hidden;
            tog.firstChild.style.transform = sub.hidden ? 'rotate(' + (PV.lang === 'he' ? 90 : -90) + 'deg)' : '';
          });
        }
        row.addEventListener('click', async () => {
          if (it.dest) { const p = await destPage(it.dest); if (p) V.goTo(p); }
          else if (it.url) PV.tryCall('app.openUrl', { url: it.url });
        });
        parent.appendChild(li);
      });
    }
    build(outline, tocEl, 0);
    $('toc-empty').hidden = true;
    return true;
  };

  // ── אירועי גלילה ושינוי גודל ──────────────────────────────────────────
  let scrollRaf = 0;
  let scrollIdleTimer = 0;
  viewerEl.addEventListener('scroll', () => {
    V.scrolling = true;
    clearTimeout(scrollIdleTimer);
    scrollIdleTimer = setTimeout(() => { V.scrolling = false; flushText(); }, SCROLL_IDLE_MS);
    if (scrollRaf) return;
    scrollRaf = requestAnimationFrame(() => { scrollRaf = 0; findCurrentPage(); updateVisible(); });
  }, { passive: true });

  let lastW = 0, lastH = 0;
  const ro = new ResizeObserver(PV.debounce(() => {
    const w = viewerEl.clientWidth, h = viewerEl.clientHeight;
    if (Math.abs(w - lastW) < 2 && Math.abs(h - lastH) < 2) return;
    lastW = w; lastH = h;
    if (V.doc && V.count && typeof V.zoomMode === 'string') {
      const next = computeScale(V.zoomMode);
      if (Math.abs(next - V.scale) > 0.005) { V.scale = next; relayout(true); PV.emit('zoom'); }
    } else updateVisible();
  }, 120));
  ro.observe(viewerEl);

  // תקריב בגלגלת עם Ctrl
  viewerEl.addEventListener('wheel', (e) => {
    if (!e.ctrlKey || !V.count) return;
    e.preventDefault();
    V.zoomBy(e.deltaY < 0 ? 1 : -1);
  }, { passive: false });
})();
