/* צופה PDF+OCR — חילוץ טקסט: שכבה מוטבעת, OCR (Tesseract.js מובנה), אזור מסומן ומסמך שלם,
   וחלונית הטקסט (העתקה, שמירה, הדפסה, ייצוא PDF, חיפוש בספרייה). */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer;
  const O = (PV.ocr = { busy: false });

  // ── מנוע Tesseract (קבצי המנוע ארוזים ב-base64, בלי רשת) ─────────────
  let worker = null, workerPromise = null, bundlePromise = null;
  function loadBundle() {
    if (bundlePromise) return bundlePromise;
    bundlePromise = new Promise((resolve, reject) => {
      if (window.__OTZ_WORKER_BUNDLE_B64__) { resolve(); return; }
      const s = document.createElement('script');
      s.src = './vendor/ocr-worker-loader.js';
      s.onload = () => resolve();
      s.onerror = () => { bundlePromise = null; reject(new Error(PV.t('טעינת מנוע ה-OCR נכשלה'))); };
      document.head.appendChild(s);
    });
    return bundlePromise;
  }

  // שפות נוספות שהמשתמש הוסיף (IndexedDB, base64)
  let langsDbP = null;
  function langsDb() {
    if (langsDbP) return langsDbP;
    langsDbP = new Promise((resolve, reject) => {
      const req = indexedDB.open('pdfviewer-ocr-langs', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('langs', { keyPath: 'code' });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return langsDbP;
  }
  function idb(mode, fn) {
    return langsDb().then((db) => new Promise((resolve, reject) => {
      const tx = db.transaction('langs', mode);
      const req = fn(tx.objectStore('langs'));
      tx.oncomplete = () => resolve(req && req.result);
      tx.onerror = () => reject(tx.error);
    }));
  }
  O.getLanguages = () => idb('readonly', (s) => s.getAll()).then((r) => r || [], () => []);
  O.addLanguage = (code, b64) => idb('readwrite', (s) => s.put({ code, b64 }));
  O.removeLanguage = (code) => idb('readwrite', (s) => s.delete(code));
  O.resetWorker = async function () {
    if (worker) { try { await worker.terminate(); } catch (e) { /* כבר נסגר */ } }
    worker = null; workerPromise = null;
  };

  let progressHook = null;
  async function getWorker() {
    if (worker) return worker;
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      await loadBundle();
      const extra = await O.getLanguages();
      const assets = Object.assign({}, window.__OTZ_BASE_ASSETS_B64__);
      const codes = ['heb'];
      extra.forEach((l) => { assets[l.code + '.traineddata'] = l.b64; codes.push(l.code); });
      const assetsJs = 'self.__OTZ_OCR_B64__ = ' + JSON.stringify(assets) + ';\n';
      const bin = atob(window.__OTZ_WORKER_BUNDLE_B64__);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([assetsJs, bytes.buffer], { type: 'text/javascript' }));
      const w = await Tesseract.createWorker(codes.join('+'), 1, {
        workerPath: blobUrl,
        workerBlobURL: false,
        corePath: './vendor/tesseract-core-simd-lstm.wasm.js',
        langPath: './vendor/lang-data/',
        gzip: false,
        logger: (m) => { if (progressHook && m.status === 'recognizing text' && typeof m.progress === 'number') progressHook(m.progress); },
      });
      worker = w;
      return w;
    })();
    try { return await workerPromise; } catch (e) { workerPromise = null; throw e; }
  }

  function tidy(text) {
    let t = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!PV.settings.ocrLines) t = t.replace(/([^\n])\n(?!\n)/g, '$1 ');
    return t;
  }

  /** OCR על קנבס/תמונה. onProgress(0..1) אופציונלי. */
  // מסמך בשני טורים: כל טור לבד (ימין ואז שמאל)
  /** תיאור המנוע שעבד בפועל בזיהוי האחרון (מוצג בחלונית הטקסט ובהודעות) */
  O.lastRun = null;
  function runLabel(sec, renderMs) {
    const r = O.lastRun;
    if (!r) return '';
    const f = (ms) => (ms / 1000).toFixed(1);
    let s;
    if (r.engine === 'oneocr') {
      s = PV.t('מנוע Windows ישיר (oneocr)');
      const bits = [];
      if (renderMs != null) bits.push(PV.t('רינדור') + ' ' + f(renderMs));
      if (r.enc != null) bits.push(PV.t('קידוד') + ' ' + f(r.enc));
      if (r.call != null) bits.push(PV.t('גשר') + ' ' + f(r.call));
      if (r.ms) bits.push(PV.t('טעינה') + ' ' + f(r.ms.load || 0) + ' · ' + PV.t('זיהוי') + ' ' + f(r.ms.ocr || 0) + (r.ms.ort ? ' · ORT ' + r.ms.ort : ''));
      if (r.size) bits.push(r.size);
      if (bits.length) s += ' (' + bits.join(' · ') + ')';
    } else if (r.engine === 'snip-ui') s = PV.t('כלי החיתוך (דרך החלון) — המנוע הישיר לא פעל');
    else s = 'Tesseract';
    if (sec != null) s += ' · ' + sec.toFixed(1) + ' ' + PV.t('שנ׳');
    return s;
  }
  function warnFallback() {
    const r = O.lastRun;
    if (r && r.engine === 'snip-ui') PV.toast(PV.t('המנוע הישיר לא עבד, הזיהוי בוצע דרך כלי החיתוך: {r}', { r: r.reason || '' }), { long: true });
  }

  /** "1-5, 8, 10-12" → [1,2,3,4,5,8,10,11,12]; null אם הפורמט שגוי, [] אם אין עמודים בתחום */
  O.parseRange = function (str, total) {
    const set = new Set();
    const parts = String(str || '').replace(/\s*[-–—]\s*/g, '-').split(/[,;\s]+/).filter(Boolean);
    for (const part of parts) {
      const m = part.match(/^(\d+)-(\d+)$/);
      if (m) {
        let a = +m[1], b = +m[2];
        if (a > b) [a, b] = [b, a];
        for (let i = Math.max(1, a); i <= Math.min(total, b); i++) set.add(i);
      } else if (/^\d+$/.test(part)) {
        const n = +part;
        if (n >= 1 && n <= total) set.add(n);
      } else return null;
    }
    return [...set].sort((x, y) => x - y);
  };

  O.engineOverride = null; // 'snip' | 'tesseract' — לפעולה בודדת, בלי לשנות את ההגדרה
  const currentEngine = () => O.engineOverride || PV.settings.ocrEngine;
  O.recognize = async function (source, onProgress) {
    if (currentEngine() !== 'snip' && PV.settings.ocrCols && source instanceof HTMLCanvasElement && source.width > 200) {
      const W = source.width, H = source.height, half = Math.floor(W / 2), parts = [];
      for (const [x, w] of [[half, W - half], [0, half]]) {
        const c = document.createElement('canvas');
        c.width = w; c.height = H;
        c.getContext('2d').drawImage(source, x, 0, w, H, 0, 0, w, H);
        parts.push(await O.recognizeOne(c, onProgress ? (p) => onProgress(p / 2 + (parts.length ? 0.5 : 0)) : null));
      }
      return parts.filter(Boolean).join('\n\n');
    }
    return O.recognizeOne(source, onProgress);
  };
  O.recognizeOne = async function (source, onProgress) {
    if (currentEngine() === 'snip' && source instanceof HTMLCanvasElement) {
      // כלי החיתוך של Windows דרך הגשר. בכשל — שגיאה גלויה, בלי מעבר שקט ל-Tesseract
      const t = await PV.bridge.snipRecognizeCanvas(source);
      O.lastRun = PV.bridge.lastRun;
      if (onProgress) onProgress(1);
      return tidy(t);
    }
    O.lastRun = { engine: 'tesseract' };
    const w = await getWorker();
    progressHook = onProgress || null;
    try {
      const { data } = await w.recognize(source);
      return tidy(data.text);
    } finally { progressHook = null; }
  };
  O.selfTest = async function () {
    const c = document.createElement('canvas');
    c.width = 220; c.height = 80;
    const ctx = c.getContext('2d');
    ctx.fillStyle = 'white'; ctx.fillRect(0, 0, 220, 80);
    ctx.fillStyle = 'black'; ctx.font = '40px sans-serif'; ctx.direction = 'rtl'; ctx.textAlign = 'right';
    ctx.fillText('שלום עולם', 205, 54);
    return O.recognize(c);
  };

  // ── פעולות על המסמך ──────────────────────────────────────────────────
  function needPaged() {
    if (V.isPaged()) return true;
    PV.toast(PV.t('יש לפתוח PDF או תמונה'));
    return false;
  }
  const docLabel = () => (V.doc && V.doc.name) || '';

  O.extractPage = async function (n) {
    if (!needPaged()) return;
    const page = n || V.page;
    if (V.doc.kind === 'pdf') {
      const text = await V.getPageText(page);
      if (text) { O.show(text, { title: PV.t('טקסט מוטבע — עמוד {n}', { n: page }), sub: docLabel(), source: 'embedded' }); return; }
      PV.toast(PV.t('אין טקסט מוטבע בעמוד — מריץ OCR…'));
    }
    await O.ocrPage(page);
  };

  O.ocrPage = async function (n, opts) {
    if (!needPaged() || O.busy) return;
    const page = n || V.page;
    O.busy = true;
    O.engineOverride = (opts && opts.engine) || null;
    PV.progress.show(currentEngine() === 'snip' ? PV.t('מפעיל את כלי החיתוך…') : PV.t('טוען את מנוע ה-OCR…'));
    try {
      const t0 = Date.now();
      const canvas = await V.renderOffscreen(page, Number(PV.settings.ocrQuality) || 2);
      const renderMs = Date.now() - t0;
      PV.progress.update(PV.t('מזהה טקסט בעמוד {n}…', { n: page }), 0);
      const text = await O.recognize(canvas, (p) => PV.progress.update(null, p));
      O.show(text, { title: PV.t('OCR — עמוד {n}', { n: page }), sub: docLabel() + ' · ' + runLabel((Date.now() - t0) / 1000, renderMs), source: 'ocr' });
      warnFallback();
      if (!text) PV.toast(PV.t('לא זוהה טקסט בעמוד'));
    } catch (e) {
      PV.error(PV.t('שגיאה ב-OCR: {e}', { e: PV.errMsg(e) }));
    } finally { O.busy = false; O.engineOverride = null; PV.progress.hide(); }
  };

  O.ocrCanvas = async function (canvas, label) {
    if (O.busy) return;
    O.busy = true;
    PV.progress.show(PV.t('מזהה טקסט…'));
    try {
      const t0 = Date.now();
      const text = await O.recognize(canvas, (p) => PV.progress.update(null, p));
      O.show(text, { title: label || PV.t('OCR'), sub: docLabel() + ' · ' + runLabel((Date.now() - t0) / 1000), source: 'ocr' });
      warnFallback();
      if (!text) PV.toast(PV.t('לא זוהה טקסט'));
    } catch (e) {
      PV.error(PV.t('שגיאה ב-OCR: {e}', { e: PV.errMsg(e) }));
    } finally { O.busy = false; PV.progress.hide(); }
  };

  /** מסמך שלם או טווח עמודים (opts.pages = [מספרי עמודים]): OCR, או רק הטקסט המוטבע. opts.engine = 'snip' | 'tesseract'. */
  O.processAll = async function (useOcr, opts) {
    if (!needPaged() || O.busy) return;
    if (!useOcr && V.doc.kind !== 'pdf') { useOcr = true; }
    const engine = (opts && opts.engine) || null;
    const list = (opts && opts.pages && opts.pages.length) ? opts.pages : Array.from({ length: V.count }, (_, i) => i + 1);
    const total = list.length;
    const partial = total !== V.count;
    const viaSnip = (engine || PV.settings.ocrEngine) === 'snip';
    const slowSnip = viaSnip && useOcr && PV.hasOtz() && !(await PV.bridge.directAvailable());
    if (useOcr && ((total > 30) || (slowSnip && total > 3)) && PV.hasOtz()) {
      const ok = await PV.tryCall('ui.showConfirm', {
        title: partial ? PV.t('OCR — טווח עמודים') : PV.t('OCR לכל המסמך'),
        content: slowSnip
          ? PV.t('במסמך {n} עמודים. זיהוי דרך כלי החיתוך לוקח כמה שניות לכל עמוד, כלי החיתוך ייפתח ויסגר שוב ושוב, ואסור להשתמש במחשב בזמן הריצה. להמשיך? (אפשר לבטל בכל רגע)', { n: total })
          : PV.t('במסמך {n} עמודים, והזיהוי עשוי לקחת כמה דקות. להמשיך? (אפשר לבטל בכל רגע)', { n: total }),
      }, { confirmed: true });
      if (ok && ok.confirmed === false) return;
    }
    O.busy = true;
    O.engineOverride = engine;
    let streak = 0;
    let cancelled = false;
    const docAtStart = V.doc;
    PV.progress.show(PV.t('מכין…'), () => { cancelled = true; });
    if (useOcr) PV.tryCall('ui.setUnsavedChanges', { hasChanges: true, message: PV.t('זיהוי הטקסט במסמך עדיין רץ') });
    const parts = [];
    let pre = null; // העמוד הבא מוכן מראש בזמן שהמנוע מזהה את הנוכחי
    const t0 = Date.now();
    const st0 = PV.bridge.stats ? { ...PV.bridge.stats } : null;
    O.lastRun = null;
    const baseTitle = partial ? PV.t('OCR — טווח עמודים') : PV.t('OCR — כל המסמך');
    const title = useOcr ? baseTitle : PV.t('הטקסט המוטבע — כל המסמך');
    try {
      for (let i = 0; i < total; i++) {
        const n = list[i];
        if (cancelled || V.doc !== docAtStart) break;
        PV.progress.update(PV.t('עמוד {n} ({i}/{t})…', { n, i: i + 1, t: total }), i / total);
        let text = '';
        // OCR מפורש תמיד מזהה את העמוד; השכבה המוטבעת רק ב„חילוץ טקסט“
        if (!useOcr && V.doc.kind === 'pdf') text = await V.getPageText(n);
        if (useOcr) {
          const q = Number(PV.settings.ocrQuality) || 2;
          let canvas = (pre && pre.n === n) ? await pre.p : null;
          if (!canvas) canvas = await V.renderOffscreen(n, q);
          pre = null;
          if (i + 1 < total && !cancelled) { const nx = list[i + 1]; pre = { n: nx, p: V.renderOffscreen(nx, q).catch(() => null) }; }
          try {
            text = await O.recognize(canvas, (p) => PV.progress.update(null, (i + p) / total));
            streak = 0;
          } catch (e) {
            // עמוד שנכשל לא עוצר את כל הריצה; שלושה כשלונות רצופים כן עוצרים
            if (!viaSnip || ++streak >= 3) throw e;
            text = PV.t('(שגיאה בזיהוי: {e})', { e: PV.errMsg(e) });
          }
          canvas.width = 0; canvas.height = 0;
        }
        parts.push('— ' + PV.t('עמוד {n}', { n }) + ' —\n' + (text || PV.t('(אין טקסט)')));
        if ((i + 1) % 3 === 0 || i + 1 === total) O.show(parts.join('\n\n'), { title, sub: docLabel() + ' · ' + (i + 1) + '/' + total, source: useOcr ? 'ocr' : 'embedded', quiet: true });
      }
      const secPerPage = parts.length ? (Date.now() - t0) / 1000 / parts.length : null;
      O.show(parts.join('\n\n'), { title, sub: docLabel() + (useOcr && O.lastRun ? ' · ' + runLabel(secPerPage) + ' / ' + PV.t('עמוד') : ''), source: useOcr ? 'ocr' : 'embedded' });
      if (cancelled) PV.toast(PV.t('הופסק אחרי {n} עמודים', { n: parts.length }));
      else {
        PV.toast(PV.t('הושלם: {n} עמודים', { n: parts.length }) + (useOcr && O.lastRun ? ' · ' + runLabel(secPerPage) : ''));
        const fb = st0 ? PV.bridge.stats.fb - st0.fb : 0;
        if (fb > 0) PV.toast(PV.t('{n} עמודים עברו דרך כלי החיתוך', { n: fb }) + ': ' + (O.lastRun && O.lastRun.reason || ''), { long: true });
      }
    } catch (e) {
      PV.error(PV.t('שגיאה: {e}', { e: PV.errMsg(e) }));
    } finally {
      O.busy = false;
      O.engineOverride = null;
      PV.progress.hide();
      PV.tryCall('ui.setUnsavedChanges', { hasChanges: false });
    }
  };

  // ── בחירת אזור על העמוד ───────────────────────────────────────────────
  const viewerEl = $('viewer');
  let regionDrag = null;
  O.startRegion = function () {
    if (!needPaged()) return;
    viewerEl.classList.add('region-mode');
    PV.toast(PV.t('גררו מלבן סביב האזור שברצונכם לזהות (Esc לביטול)'), { long: true });
  };
  O.cancelRegion = function () {
    viewerEl.classList.remove('region-mode');
    if (regionDrag && regionDrag.box) regionDrag.box.remove();
    regionDrag = null;
  };
  viewerEl.addEventListener('mousedown', (e) => {
    if (!viewerEl.classList.contains('region-mode') || e.button !== 0) return;
    const pageEl = e.target.closest('.page');
    if (!pageEl) return;
    e.preventDefault();
    const r = pageEl.getBoundingClientRect();
    const box = document.createElement('div');
    box.className = 'region-box';
    pageEl.appendChild(box);
    regionDrag = { pageEl, x0: e.clientX - r.left, y0: e.clientY - r.top, box, rect: null };
  });
  window.addEventListener('mousemove', (e) => {
    if (!regionDrag) return;
    const r = regionDrag.pageEl.getBoundingClientRect();
    const x1 = Math.max(0, Math.min(r.width, e.clientX - r.left)), y1 = Math.max(0, Math.min(r.height, e.clientY - r.top));
    const x = Math.min(regionDrag.x0, x1), y = Math.min(regionDrag.y0, y1);
    const w = Math.abs(x1 - regionDrag.x0), h = Math.abs(y1 - regionDrag.y0);
    Object.assign(regionDrag.box.style, { left: x + 'px', top: y + 'px', width: w + 'px', height: h + 'px' });
    regionDrag.rect = { x: x / r.width, y: y / r.height, w: w / r.width, h: h / r.height };
  });
  window.addEventListener('mouseup', async () => {
    if (!regionDrag) return;
    const d = regionDrag;
    regionDrag = null;
    viewerEl.classList.remove('region-mode');
    setTimeout(() => d.box.remove(), 400);
    if (!d.rect || d.rect.w < 0.01 || d.rect.h < 0.01) { PV.toast(PV.t('האזור קטן מדי')); return; }
    const page = Number(d.pageEl.dataset.page);
    // אם יש טקסט מוטבע בתוך האזור — עדיף עליו
    const embedded = await textInRegion(page, d.rect);
    if (embedded) { O.show(embedded, { title: PV.t('טקסט מוטבע — אזור בעמוד {n}', { n: page }), sub: docLabel(), source: 'embedded' }); return; }
    const full = await V.renderOffscreen(page, Math.max(2.5, Number(PV.settings.ocrQuality) || 2));
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(d.rect.w * full.width));
    crop.height = Math.max(1, Math.round(d.rect.h * full.height));
    crop.getContext('2d').drawImage(full, d.rect.x * full.width, d.rect.y * full.height, crop.width, crop.height, 0, 0, crop.width, crop.height);
    full.width = 0;
    await O.ocrCanvas(crop, PV.t('OCR — אזור בעמוד {n}', { n: page }));
  });

  async function textInRegion(page, rect) {
    if (!V.doc || V.doc.kind !== 'pdf' || V.rotation) return '';
    const tc = await V.getPageTextContent(page);
    if (!tc || !tc.items.length) return '';
    const p = await V.doc.pdf.getPage(page);
    const vp = p.getViewport({ scale: 1 });
    let out = '';
    tc.items.forEach((it) => {
      if (typeof it.str !== 'string' || !it.transform) return;
      const [x, y] = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const cx = (x + (it.width || 0) / 2) / vp.width, cy = (y - (it.height || 0) / 2) / vp.height;
      if (cx >= rect.x && cx <= rect.x + rect.w && cy >= rect.y && cy <= rect.y + rect.h) out += it.str + (it.hasEOL ? '\n' : '');
      else if (it.hasEOL && out && !out.endsWith('\n')) out += '\n';
    });
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── חלונית הטקסט ──────────────────────────────────────────────────────
  const outEl = $('text-output');
  O.show = function (text, opts) {
    const o = opts || {};
    $('textpanel').hidden = false;
    $('btn-textpanel').classList.add('active');
    outEl.textContent = text || '';
    outEl.setAttribute('contenteditable', 'false');
    $('text-title').textContent = o.title || PV.t('טקסט');
    $('text-sub').textContent = o.sub || '';
    O.lastSource = o.source || '';
    updateFooter();
    if (!o.quiet && text && o.copy) copyText(true);
    PV.emit('text');
  };
  O.getText = () => outEl.innerText.replace(/ /g, ' ').trim();
  function updateFooter() {
    const t = O.getText();
    const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
    $('text-footer').textContent = t ? PV.t('{w} מילים · {c} תווים', { w: words, c: t.length }) + (O.lastSource === 'ocr' ? ' · OCR' : '') : '';
  }
  outEl.addEventListener('input', updateFooter);

  async function copyText(silent) {
    const t = selectionIn(outEl) || O.getText();
    if (!t) { PV.toast(PV.t('אין טקסט להעתקה')); return; }
    try { await navigator.clipboard.writeText(t); if (!silent) PV.toast(PV.t('הטקסט הועתק')); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents(outEl);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      document.execCommand('copy');
      if (!silent) PV.toast(PV.t('הטקסט הועתק'));
    }
  }
  O.copy = copyText;
  function selectionIn(el) {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !el.contains(s.anchorNode)) return '';
    return String(s).trim();
  }

  function baseName() {
    const n = (V.doc && V.doc.name) || PV.t('טקסט');
    return n.replace(/\.[^.]+$/, '') + (O.lastSource === 'ocr' ? ' - OCR' : '');
  }

  /** שמירה כקובץ: דרך אוצריא (שמור בשם), ומחוץ לה הורדה רגילה. */
  O.saveText = async function () {
    const text = O.getText();
    if (!text) { PV.toast(PV.t('אין טקסט לשמירה')); return; }
    const blob = new Blob(['﻿' + text.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
    if (PV.hasOtz()) {
      try {
        const up = await PV.call('fs.beginBinaryWrite', { purpose: 'user-file', expectedSize: blob.size });
        const res = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: blob });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const done = await PV.call('fs.commitUserFileWrite', { writeToken: up.writeToken, suggestedName: baseName(), extension: 'txt', title: PV.t('שמירת הטקסט') });
        if (done && !done.cancelled) PV.toast(PV.t('נשמר: {n}', { n: done.name || '' }));
        return;
      } catch (e) {
        if (e && e.code === 'permission_denied' || (e && /permission/.test(String(e.code)))) { PV.error(PV.t('אין הרשאה לשמירת קבצים — אפשר לאשר אותה בהגדרות התוסף')); return; }
        PV.error(PV.t('השמירה נכשלה: {e}', { e: PV.errMsg(e) }));
        return;
      }
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = baseName() + '.txt';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  };

  function fillPrintRoot() {
    const root = $('print-root');
    root.className = 'print-root';
    root.innerHTML = '';
    const h = document.createElement('h1');
    h.textContent = [$('text-title').textContent, $('text-sub').textContent].filter(Boolean).join(' · ');
    root.appendChild(h);
    root.appendChild(document.createTextNode(O.getText()));
  }

  // הדפסה וייצוא חייבים לצאת ישירות מהלחיצה (בלי await לפני) — אוצריא בודקת הפעלת-משתמש
  O.printText = function () {
    if (!O.getText()) { PV.toast(PV.t('אין טקסט להדפסה')); return; }
    fillPrintRoot();
    if (PV.hasOtz()) {
      PV.call('ui.print', { jobName: baseName(), pageSize: 'a4', marginMm: 15 }).catch((e) => {
        if (e && e.code === 'error.unknown_method') window.print(); else PV.error(PV.errMsg(e));
      });
    } else window.print();
  };
  O.exportPdf = function () {
    if (!O.getText()) { PV.toast(PV.t('אין טקסט לייצוא')); return; }
    fillPrintRoot();
    if (!PV.hasOtz()) { window.print(); return; }
    PV.call('ui.exportPdf', { fileName: baseName(), title: PV.t('ייצוא ל-PDF'), pageSize: 'a4', marginMm: 15 })
      .then((r) => { if (r && r.saved) PV.toast(PV.t('נשמר: {n}', { n: r.name || '' })); })
      .catch((e) => PV.error(PV.t('הייצוא נכשל: {e}', { e: PV.errMsg(e) })));
  };

  /** חיפוש טקסט בספרייה של אוצריא (מסך החיפוש המובנה). */
  O.searchLibrary = async function (text) {
    let q = String(text || '').replace(/\s+/g, ' ').trim();
    if (!q) { PV.toast(PV.t('סמנו קודם טקסט לחיפוש')); return; }
    if (q.length > 80) q = q.split(' ').slice(0, 8).join(' ');
    if (!PV.hasOtz()) { PV.toast(PV.t('חיפוש בספרייה זמין בתוך אוצריא')); return; }
    try { await PV.call('reader.openSearchTab', { query: q, autoSearch: true }); }
    catch (e) { PV.error(PV.t('לא ניתן לפתוח חיפוש: {e}', { e: PV.errMsg(e) })); }
  };

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-tact]').forEach((b) => b.addEventListener('click', () => {
      const act = b.getAttribute('data-tact');
      if (act === 'copy') copyText();
      else if (act === 'save') O.saveText();
      else if (act === 'print') O.printText();
      else if (act === 'pdf') O.exportPdf();
      else if (act === 'search') O.searchLibrary(selectionIn(outEl) || O.getText().slice(0, 120));
      else if (act === 'edit') {
        const on = outEl.getAttribute('contenteditable') !== 'true';
        outEl.setAttribute('contenteditable', on ? 'true' : 'false');
        b.classList.toggle('active', on);
        if (on) { outEl.focus(); PV.toast(PV.t('מצב עריכה — אפשר לתקן את הטקסט')); }
      } else if (act === 'clear') { outEl.textContent = ''; $('text-sub').textContent = ''; updateFooter(); }
    }));
    $('btn-close-panel').addEventListener('click', () => { $('textpanel').hidden = true; $('btn-textpanel').classList.remove('active'); });
  });
})();
