/* צופה PDF+OCR — שמירת PDF עם שכבת טקסט (OCR) ממוקמת לפי מילים, למסמך או לתיקייה שלמה.
   המקור לא נדרס: נוצר קובץ חדש (באותה תיקייה עם סיומת בשם, או בתיקייה אחרת שנבחרה). שכבת OCR ישנה מוחלפת בחדשה. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer, O = PV.ocr, Fs = PV.files, B = PV.bridge;
  const S = (PV.searchable = {});

  PV.BRIDGE_WRITE_MIN = '3.4.0'; // /fs/write-binary (עם יצירת תיקיות) ו-/fs/pick-save-file
  const HOST_WRITE_MAX = 100 * 1024 * 1024 - 4096; // מגבלת אוצריא לכתיבה דרך חלון השמירה שלה (100MB)
  const IMG_PT = 72 / 150; // תמונה בלי DPI ידוע: מניחים 150 DPI
  const DEF = { src: 'doc', ask: true, out: 'same', suffix: ' - OCR', outPath: '', outName: '', replace: true, skipDigital: true, sub: true, engine: '' };
  S.opts = Object.assign({}, DEF);
  S.srcFolder = null; // { folderToken, name, path } — תיקיית מקור שנבחרה לסריקה
  S.busy = false;

  S.load = async function () {
    const v = await PV.store.get('searchable', null);
    if (v && typeof v === 'object') Object.assign(S.opts, v);
    // 5.4.1: "לשאול איפה לשמור" מופעל כברירת מחדל — חד־פעמי גם למי ששמור אצלו ערך ישן "כבוי"
    if (!v || !v.askV2) { S.opts.ask = true; S.opts.askV2 = true; S.save(); }
  };
  S.save = () => PV.store.set('searchable', S.opts);

  // ── עזרי נתיבים ──────────────────────────────────────────────────────
  const joinPath = (a, b) => String(a).replace(/[\\/]+$/, '') + '\\' + String(b || '').replace(/^[\\/]+/, '').replace(/\//g, '\\');
  const dirOf = (p) => { const s = String(p || ''); const i = Math.max(s.lastIndexOf('\\'), s.lastIndexOf('/')); return i < 0 ? '' : s.slice(0, i); };
  const stemOf = (n) => String(n || '').replace(/\.[^.]+$/, '');
  const isAbs = (p) => /^[a-zA-Z]:[\\/]/.test(p || '') || /^\\\\/.test(p || '');

  // ── מנוע ─────────────────────────────────────────────────────────────
  /** 'windows' (המנוע הישיר דרך הגשר) או 'tesseract'. אם נבחר Windows והוא לא זמין — Tesseract, עם אזהרה. */
  S.resolveEngine = async function (choice) {
    let e = O.engineFor(choice) || 'tesseract';   // כתב רש"י (אם נבחר) תמיד ב-Tesseract
    if (e === 'snip') e = 'windows';
    const warn = [];
    if (e === 'windows') {
      const ok = PV.hasOtz() && await B.directAvailable();
      if (!ok) { e = 'tesseract'; warn.push(PV.t('המנוע הישיר של Windows אינו זמין — נעשה שימוש ב-Tesseract')); }
    }
    return { engine: e, warn };
  };

  /** מילים עם מיקום מהקנבס: [{ text, q:[x1,y1..x4,y4] }] בפיקסלים של הקנבס. */
  S.layout = async function (canvas, engine, onProgress) {
    if (engine === 'windows') {
      if (O.mixedOn()) return O.hybridLayout(canvas, onProgress);   // Windows לעברית + Tesseract (מודל רש"י) לשורות ברש"י
      const d = await B.ocrLayoutCanvas(canvas);
      const out = [];
      for (const ln of (d && d.lines) || []) {
        const ws = (ln.words && ln.words.length) ? ln.words : [{ text: ln.text, box: ln.box }];
        for (const w of ws) {
          const t = String(w.text || '').trim();
          if (t && w.box && w.box.length === 8) out.push({ text: t, q: w.box });
        }
      }
      return out;
    }
    return O.layoutTesseract(canvas, onProgress);
  };

  // ── רינדור עמוד PDF ──────────────────────────────────────────────────
  async function renderPdfPage(jsPage, scale) {
    const vp1 = jsPage.getViewport({ scale: 1 });
    const f = Math.min(scale, 9000 / Math.max(vp1.width, vp1.height));
    const vp = jsPage.getViewport({ scale: f });
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(vp.width));
    c.height = Math.max(1, Math.floor(vp.height));
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await jsPage.render({ canvasContext: ctx, viewport: vp }).promise;
    return { canvas: c, vp1 };
  }

  function toUserWords(words, vp, canvas) {
    const sx = canvas.width / vp.width, sy = canvas.height / vp.height;
    return words.map((w) => Object.assign({ text: w.text }, window.PdfText.wordToUser(vp, sx, sy, w.q)));
  }

  function newStats() { return { pages: 0, done: 0, skippedDigital: 0, skippedHasOcr: 0, empty: 0, words: 0, replaced: 0, flattened: 0 }; }

  /** מחליף את כל תוכן העמוד בתמונה של העמוד כפי שהוא נראה (בלי שום טקסט), כדי שאפשר יהיה להסיר גם טקסט דיגיטלי קיים
   *  ולהשאיר רק את שכבת הטקסט החדשה בלי לשנות את המראה. vp1 = viewport של pdf.js בקנה מידה 1 (כולל סיבוב וחיתוך העמוד). */
  async function flattenPage(L, doc, page, jpgBytes, vp1) {
    const img = await doc.embedJpg(jpgBytes);
    const bl = vp1.convertToPdfPoint(0, vp1.height), br = vp1.convertToPdfPoint(vp1.width, vp1.height), tl = vp1.convertToPdfPoint(0, 0);
    const m = [br[0] - bl[0], br[1] - bl[1], tl[0] - bl[0], tl[1] - bl[1], bl[0], bl[1]].map((x) => Math.round(x * 1e4) / 1e4);
    const ctx = doc.context;
    page.node.setXObject(L.PDFName.of('OcrBg'), img.ref);
    const bg = ctx.register(ctx.flateStream(new TextEncoder().encode('q ' + m.join(' ') + ' cm /OcrBg Do Q\n')));
    page.node.set(L.PDFName.of('Contents'), ctx.obj([bg]));   // מערך (ולא הפניה בודדת): כך pdf-lib יכול להוסיף אחר כך את שכבת הטקסט
  }

  // ── PDF קיים: השכבה נוספת על המקור (התוכן המקורי נשמר) ─────────────────
  /** o: { engine, scale, replace, skipDigital, onPage(i,n,p), cancelled() } → { bytes|null, stats } */
  S.processPdf = async function (bytes, o) {
    const L = window.PDFLib, PT = window.PdfText;
    if (!L || !PT) throw new Error(PV.t('רכיב ה-PDF לא נטען'));
    let doc;
    try { doc = await L.PDFDocument.load(bytes, { updateMetadata: false }); }
    catch (e) {
      throw new Error(/encrypt/i.test(String(e && e.message)) ? PV.t('המסמך מוצפן או מוגן בסיסמה') : PV.t('לא ניתן לקרוא את ה-PDF: {e}', { e: PV.errMsg(e) }));
    }
    const js = await pdfjsLib.getDocument({
      data: new Uint8Array(bytes), isEvalSupported: false, enableXfa: false,
      standardFontDataUrl: new URL('vendor/standard_fonts/', document.baseURI).href,
      cMapUrl: new URL('vendor/cmaps/', document.baseURI).href, cMapPacked: true, useSystemFonts: false, disableFontFace: true,
    }).promise;
    const st = newStats();
    st.pages = doc.getPageCount();
    let fontRef = null;
    try {
      for (let i = 0; i < st.pages; i++) {
        if (o.cancelled && o.cancelled()) { st.cancelled = true; return { bytes: null, stats: st }; }
        if (o.onPage) o.onPage(i + 1, st.pages, 0);
        const page = doc.getPage(i);
        const ins = PT.inspectPage(L, page);
        if (ins.visible && o.skipDigital) { st.skippedDigital++; continue; }
        if (ins.hidden > 0 && !o.replace) { st.skippedHasOcr++; continue; }
        // החלפה מלאה: יש בעמוד טקסט דיגיטלי גלוי, והמשתמש ביקש להחליף שכבה קיימת ולא לדלג על טקסט דיגיטלי —
        // הטקסט הישן נמחק, והעמוד נשמר כתמונה (אחרת אי אפשר להסיר טקסט גלוי בלי שייעלם מהעמוד)
        const flatten = !!(o.replace && ins.visible && !o.skipDigital);
        const jsPage = await js.getPage(i + 1);
        const { canvas, vp1 } = await renderPdfPage(jsPage, o.scale);
        let words, flatBytes = null;
        const cw = canvas.width, ch = canvas.height;
        try {
          words = await S.layout(canvas, o.engine, (p) => o.onPage && o.onPage(i + 1, st.pages, p));
          if (flatten && words.length) {
            const blob = await new Promise((r) => canvas.toBlob(r, 'image/jpeg', 0.92));
            flatBytes = new Uint8Array(await blob.arrayBuffer());
          }
        } finally { canvas.width = 0; canvas.height = 0; }
        if (!words.length) { st.empty++; continue; }
        if (!fontRef) fontRef = PT.embedFont(L, doc);
        const user = toUserWords(words, vp1, { width: cw, height: ch });
        if (flatBytes) { await flattenPage(L, doc, page, flatBytes, vp1); st.flattened++; }
        const r = PT.applyLayer(L, doc, page, fontRef, user, { replace: o.replace });
        st.done++; st.words += r.words; if (r.removedBlocks) st.replaced++;
      }
    } finally { try { js.destroy(); } catch (e) { /* */ } }
    if (!st.done) return { bytes: null, stats: st };
    return { bytes: await doc.save(), stats: st };
  };

  // ── תמונות / TIFF: נבנה PDF חדש מהתמונות עם שכבת הטקסט ────────────────
  S.processImages = async function (canvases, o) {
    const L = window.PDFLib, PT = window.PdfText;
    if (!L || !PT) throw new Error(PV.t('רכיב ה-PDF לא נטען'));
    const doc = await L.PDFDocument.create();
    const st = newStats();
    st.pages = canvases.length;
    let fontRef = null;
    for (let i = 0; i < canvases.length; i++) {
      if (o.cancelled && o.cancelled()) { st.cancelled = true; return { bytes: null, stats: st }; }
      if (o.onPage) o.onPage(i + 1, st.pages, 0);
      let src = canvases[i];
      const f = Math.min(1, 9000 / Math.max(src.width, src.height));
      if (f < 1) { // תמונה ענקית: מקטינים לצורך הזיהוי והשמירה
        const c = document.createElement('canvas');
        c.width = Math.floor(src.width * f); c.height = Math.floor(src.height * f);
        c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
        src = c;
      }
      const blob = await new Promise((r) => src.toBlob(r, 'image/jpeg', 0.92));
      const img = await doc.embedJpg(new Uint8Array(await blob.arrayBuffer()));
      const W = src.width * IMG_PT, H = src.height * IMG_PT;
      const page = doc.addPage([W, H]);
      page.drawImage(img, { x: 0, y: 0, width: W, height: H });
      const words = await S.layout(src, o.engine, (p) => o.onPage && o.onPage(i + 1, st.pages, p));
      if (!words.length) { st.empty++; st.done++; continue; }
      if (!fontRef) fontRef = PT.embedFont(L, doc);
      const vp = { width: src.width, height: src.height, convertToPdfPoint: (x, y) => [x * IMG_PT, H - y * IMG_PT] };
      const r = PT.applyLayer(L, doc, page, fontRef, toUserWords(words, vp, src), { replace: false });
      st.done++; st.words += r.words;
    }
    return { bytes: await doc.save(), stats: st };
  };

  async function blobToCanvases(blob, kind) {
    if (kind === 'tiff') return Fs.decodeTiffBuffer(await blob.arrayBuffer());
    return [await Fs.blobToCanvas(blob)];
  }

  /** מעבד קובץ (Blob) לפי סוגו. מחזיר { bytes|null, stats }. */
  S.processBlob = async function (blob, name, o) {
    const kind = Fs.kindOf(name, blob.type);
    if (kind === 'pdf') return S.processPdf(await blob.arrayBuffer(), o);
    if (kind === 'image' || kind === 'tiff') return S.processImages(await blobToCanvases(blob, kind), o);
    throw new Error(PV.t('סוג הקובץ אינו נתמך: {n}', { n: name }));
  };

  // ── שמירה ─────────────────────────────────────────────────────────────
  function bridgeCanWrite() {
    return PV.hasOtz() && B.port && !B.versionLt(B.info && B.info.version, PV.BRIDGE_WRITE_MIN);
  }
  async function ensureBridge() {
    if (!PV.hasOtz()) return false;
    try {
      if (!B.port && !(await B.probe())) return false;
      return bridgeCanWrite();
    } catch (e) { return false; }
  }

  /** שמירה דרך חלון "שמור בשם" של אוצריא. אוצריא מגבילה כתיבה כזו ל-100MB. */
  async function saveViaHostDialog(bytes, suggested) {
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (PV.hasOtz()) {
      const up = await PV.call('fs.beginBinaryWrite', { purpose: 'user-file', expectedSize: blob.size });
      const res = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'application/pdf' }, body: blob });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const done = await PV.call('fs.commitUserFileWrite', { writeToken: up.writeToken, suggestedName: suggested, extension: 'pdf', title: PV.t('שמירת PDF עם שכבת טקסט') });
      if (!done || done.cancelled) return null;
      return done.name || suggested + '.pdf';
    }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = suggested + '.pdf';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return suggested + '.pdf';
  }

  /** תיקיית היעד הצפויה למסמך הפתוח (לפי "ליד המקור" / "תיקייה אחרת"); null אם לא ידועה. */
  function outDirForCurrent() {
    if (S.opts.out === 'folder' && S.opts.outPath) return S.opts.outPath;
    const s = V.doc && V.doc.source;
    if (s && s.type === 'folder') {
      const f = Fs.getFolders().find((x) => x.folderToken === s.folderToken);
      if (f && isAbs(f.path)) return joinPath(f.path, dirOf(s.path));
    }
    return null;
  }

  /** בחירת יעד לפני העיבוד — כדי שלא נגלה אחרי זמן רב שאי אפשר לשמור.
   *  מחזיר { path } (נבחר בחלון), { dir } (תיקייה קבועה, ללא שאלה), { host: true } (חלון אוצריא אחרי העיבוד), או null (בוטל). */
  async function chooseTarget(stem) {
    const file = stem + (S.opts.suffix || '') + '.pdf';
    const guess = outDirForCurrent() || S.opts.outPath || '';
    const bridgeOk = await ensureBridge();
    if (!S.opts.ask) {
      const dir = outDirForCurrent();
      if (dir && bridgeOk) return { dir };
      if (!dir) PV.toast(PV.t('לא ידועה תיקיית המקור ולא הוגדרה תיקיית יעד — בחרו מיקום לשמירה'), { long: true });
    }
    if (bridgeOk) {
      const r = await B.pickSaveFile({ suggestedName: file, initialDir: guess, title: PV.t('שמירת PDF עם שכבת טקסט') });
      if (!r || r.cancelled) return null;
      return { path: r.path };
    }
    return { host: true, file };
  }

  /** שמירה לפי היעד שנבחר. אם נכשלה — לא מאבדים את העבודה: מציעים מיקום אחר (דרך הגשר). */
  async function writeTarget(bytes, stem, target) {
    const file = stem + (S.opts.suffix || '') + '.pdf';
    try {
      if (target.path) return await B.writeBinary(target.path, bytes, { overwrite: true }); // החלון כבר שאל על דריסה
      if (target.dir) return await B.writeBinary(joinPath(target.dir, file), bytes);
      if (bytes.length <= HOST_WRITE_MAX) return await saveViaHostDialog(bytes, stem + (S.opts.suffix || ''));
      throw new Error(PV.t('הקובץ גדול מ-100MB, ואוצריא לא מאפשרת לתוסף לשמור קבצים כאלה בחלון השמירה שלה. נדרש גשר אוצריא {v} ומעלה', { v: PV.BRIDGE_WRITE_MIN }));
    } catch (e) {
      if (!(await ensureBridge())) throw e;
      PV.toast(PV.t('השמירה נכשלה ({e}) — בחרו מיקום אחר, הזיהוי נשמר בזיכרון', { e: PV.errMsg(e) }), { long: true });
      const r = await B.pickSaveFile({ suggestedName: file, initialDir: S.opts.outPath || '', title: PV.t('שמירת PDF עם שכבת טקסט') });
      if (!r || r.cancelled) throw e;
      return B.writeBinary(r.path, bytes, { overwrite: true });
    }
  }

  // ── הרצה ──────────────────────────────────────────────────────────────
  function summaryLine(name, r, outPath) {
    const s = r.stats, bits = [];
    bits.push(PV.t('{a} מתוך {b} עמודים', { a: s.done, b: s.pages }));
    if (s.words) bits.push(PV.t('{n} מילים', { n: s.words }));
    if (s.replaced) bits.push(PV.t('שכבת OCR ישנה הוחלפה ב-{n} עמודים', { n: s.replaced }));
    if (s.flattened) bits.push(PV.t('טקסט דיגיטלי קיים הוחלף בשכבה החדשה ב-{n} עמודים (העמוד נשמר כתמונה)', { n: s.flattened }));
    if (s.skippedDigital) bits.push(PV.t('{n} עמודים עם טקסט דיגיטלי דולגו', { n: s.skippedDigital }));
    if (s.skippedHasOcr) bits.push(PV.t('{n} עמודים עם OCR קיים דולגו', { n: s.skippedHasOcr }));
    if (s.empty) bits.push(PV.t('{n} עמודים בלי טקסט', { n: s.empty }));
    return '✓ ' + name + ' → ' + (outPath || '') + '\n    ' + bits.join(' · ');
  }

  function baseOptions(eng, cancelledRef, onPage) {
    return {
      engine: eng.engine, replace: !!S.opts.replace, skipDigital: !!S.opts.skipDigital,
      scale: Number(PV.settings.ocrQuality) || 2, cancelled: () => cancelledRef.v, onPage,
    };
  }

  async function runCurrent() {
    if (!V.doc || !(V.doc.blob || V.doc.blobUrl)) { PV.toast(PV.t('פתחו קודם PDF או תמונה')); return; }
    const name = V.doc.name || PV.t('מסמך');
    const target = await chooseTarget(stemOf(name)); // קודם היעד, אחר כך העיבוד
    if (!target) { PV.toast(PV.t('השמירה בוטלה')); return; }
    const eng = await S.resolveEngine(S.opts.engine);
    const cancel = { v: false };
    S.cancelFn = () => { cancel.v = true; };
    PV.progress.show(PV.t('מכין…'), () => { cancel.v = true; });
    PV.tryCall('ui.setUnsavedChanges', { hasChanges: true, message: PV.t('זיהוי הטקסט במסמך עדיין רץ') });
    try {
      const o = baseOptions(eng, cancel, (i, n, p) => PV.progress.update(PV.t('עמוד {n} ({i}/{t})…', { n: i, i, t: n }), (i - 1 + p) / n));
      const srcBlob = await PV.files.docBlob(V.doc);
      if (!srcBlob) { PV.toast(PV.t('לא ניתן לקרוא את הקובץ המקורי')); return; }
      const r = await S.processBlob(srcBlob, name, o);
      if (r.stats.cancelled) { PV.toast(PV.t('הופסק')); return; }
      if (!r.bytes) { PV.toast(PV.t('לא נוספה שכבת טקסט (כל העמודים דולגו או ריקים)') + (r.stats.skippedDigital ? ' · ' + PV.t('כדי להחליף גם טקסט דיגיטלי קיים — כבו את "דילוג על טקסט דיגיטלי"') : ''), { long: true }); return; }
      PV.progress.update(PV.t('שומר…'), 1);
      const where = await writeTarget(r.bytes, stemOf(name), target);
      if (!where) { PV.toast(PV.t('השמירה בוטלה')); return; }
      O.show([summaryLine(name, r, where)].concat(eng.warn).join('\n'), { title: PV.t('PDF עם שכבת טקסט'), sub: name, source: 'ocr' });
      PV.toast(PV.t('נשמר: {n}', { n: String(where).split('\\').pop() }));
    } catch (e) {
      PV.error(PV.t('שגיאה: {e}', { e: PV.errMsg(e) }));
    } finally {
      PV.progress.hide();
      PV.tryCall('ui.setUnsavedChanges', { hasChanges: false });
    }
  }

  const norm = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();

  /** אוסף קבצים לעיבוד (רקורסיבי). תיקייה שנכשלה בקריאה לא עוצרת את הסריקה; תיקיית היעד עצמה מדולגת. */
  async function listFolder(f, rel, ctx) {
    if (ctx.cancel.v) return;
    const abs = rel ? joinPath(f.path, rel) : f.path;
    if (ctx.skipAbs && norm(abs) === ctx.skipAbs) return; // תיקיית הפלט בתוך המקור — לא מעבדים את התוצאות
    let d;
    try { d = await PV.call('fs.listUserFolder', { folderToken: f.folderToken, path: rel, extensions: ['pdf', 'png', 'jpg', 'jpeg', 'tif', 'tiff'] }); }
    catch (e) { ctx.notes.push('✗ ' + (rel || f.name) + ': ' + PV.errMsg(e)); return; }
    if (d && d.truncated) ctx.notes.push('! ' + (rel || f.name) + ': ' + PV.t('בתיקייה יותר מ-2000 פריטים — עובדו רק הראשונים'));
    for (const en of (d && d.entries) || []) {
      if (ctx.cancel.v) return;
      if (en.type === 'dir') { if (ctx.sub) await listFolder(f, en.path, ctx); }
      else if (['pdf', 'image', 'tiff'].includes(Fs.kindOf(en.name))) ctx.files.push(en);
    }
  }

  async function runFolder() {
    const f = S.srcFolder;
    if (!f) { PV.toast(PV.t('בחרו תיקייה לסריקה')); return; }
    if (!isAbs(f.path)) { PV.error(PV.t('לא ידוע נתיב התיקייה — בחרו אותה שוב')); return; }
    if (S.opts.out === 'folder' && !S.opts.outPath) { PV.toast(PV.t('בחרו תיקיית יעד')); return; }
    if (!(await ensureBridge())) { PV.error(PV.t('שמירה לתיקייה דורשת גשר אוצריא {v} ומעלה (מחובר ופועל)', { v: PV.BRIDGE_WRITE_MIN })); return; }
    const eng = await S.resolveEngine(S.opts.engine);
    const cancel = { v: false };
    S.cancelFn = () => { cancel.v = true; };
    PV.progress.show(PV.t('סורק את התיקייה…'), () => { cancel.v = true; });
    PV.tryCall('ui.setUnsavedChanges', { hasChanges: true, message: PV.t('זיהוי הטקסט בתיקייה עדיין רץ') });
    const lines = [], t0 = Date.now();
    let ok = 0, failed = 0;
    try {
      const suffix = S.opts.suffix || '';
      const ctx = { files: [], notes: [], cancel, sub: !!S.opts.sub, skipAbs: S.opts.out === 'folder' ? norm(S.opts.outPath) : '' };
      await listFolder(f, '', ctx);
      // קבצים שכבר נוצרו בריצה קודמת (השם מסתיים בסיומת) — לא מעבדים שוב
      const esc = (x) => x.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const made = suffix ? new RegExp(esc(suffix) + '(?: \\(\\d+\\))?$') : null; // "שם - OCR" או "שם - OCR (2)"
      const todo = ctx.files.filter((en) => !(made && made.test(stemOf(en.name))));
      if (!todo.length && !cancel.v) { PV.toast(PV.t('לא נמצאו קבצים לעיבוד')); if (ctx.notes.length) O.show(ctx.notes.join('\n'), { title: PV.t('OCR לתיקייה'), sub: f.name, source: 'ocr' }); return; }
      for (let k = 0; k < todo.length; k++) {
        if (cancel.v) break;
        const en = todo[k];
        const label = PV.t('קובץ {i}/{t}: {n}', { i: k + 1, t: todo.length, n: en.name });
        PV.progress.update(label, k / todo.length);
        try {
          const d = await PV.call('fs.openFolderFile', { folderToken: f.folderToken, path: en.path });
          const resp = await fetch(d.url);
          if (!resp.ok) throw new Error('HTTP ' + resp.status);
          const blob = await resp.blob();
          const o = baseOptions(eng, cancel, (i, n, p) => PV.progress.update(label + ' · ' + PV.t('עמוד {n}', { n: i }) + '/' + n, (k + (i - 1 + p) / n) / todo.length));
          const r = await S.processBlob(blob, en.name, o);
          if (r.stats.cancelled) break;
          if (!r.bytes) { lines.push('– ' + en.name + ': ' + PV.t('דולג (אין עמודים לעיבוד)')); continue; }
          const rel = dirOf(en.path);
          const base = S.opts.out === 'folder' ? S.opts.outPath : f.path;
          const dir = rel ? joinPath(base, rel) : base; // מבנה תתי-התיקיות נשמר; תיקיות חסרות נוצרות בגשר
          const where = await B.writeBinary(joinPath(dir, stemOf(en.name) + suffix + '.pdf'), r.bytes);
          lines.push(summaryLine(en.name, r, where));
          ok++;
        } catch (e) {
          failed++;
          lines.push('✗ ' + en.name + ': ' + PV.errMsg(e));
        }
      }
      const secs = Math.round((Date.now() - t0) / 1000);
      const head = (cancel.v ? PV.t('הופסק') + ' · ' : '') + PV.t('הושלמו {a} קבצים, {b} נכשלו · {s} שניות', { a: ok, b: failed, s: secs });
      O.show([head].concat(eng.warn, ctx.notes, [''], lines).join('\n'), { title: PV.t('OCR לתיקייה'), sub: f.name, source: 'ocr' });
      PV.toast(head);
    } catch (e) {
      PV.error(PV.t('שגיאה: {e}', { e: PV.errMsg(e) }));
    } finally {
      PV.progress.hide();
      PV.tryCall('ui.setUnsavedChanges', { hasChanges: false });
    }
  }

  S.start = async function () {
    if (!(await O.requestStart())) return;
    S.busy = true;
    PV.progress.show(PV.t('מכין…'));   // משוב מיידי: בדיקת הגשר ובחירת מיקום השמירה יכולות לקחת כמה שניות
    try {
      try { await S.save(); } catch (e) { /* שמירת ההגדרות לא חוסמת את הריצה */ }
      if (S.opts.src === 'folder') await runFolder(); else await runCurrent();
    } catch (e) {
      PV.error(PV.t('שגיאה: {e}', { e: PV.errMsg(e) }));
    } finally {
      PV.progress.hide();
      S.cancelFn = null;
      S.busy = false;
    }
  };

  // ── בחירת תיקיות ──────────────────────────────────────────────────────
  S.pickSource = async function () {
    if (!PV.hasOtz()) { PV.toast(PV.t('תיקיות זמינות בתוך אוצריא')); return; }
    try {
      const r = await PV.call('fs.pickUserFolder', { title: PV.t('בחירת תיקייה לזיהוי טקסט') });
      if (!r || r.cancelled) return;
      if (S.srcFolder && S.srcFolder.folderToken !== r.folderToken) PV.tryCall('fs.revokeFolder', { folderToken: S.srcFolder.folderToken });
      S.srcFolder = { folderToken: r.folderToken, name: r.name, path: r.path };
      S.refreshUi();
    } catch (e) { PV.error(PV.t('לא ניתן לבחור תיקייה: {e}', { e: PV.errMsg(e) })); }
  };
  S.pickOut = async function () {
    if (!PV.hasOtz()) { PV.toast(PV.t('תיקיות זמינות בתוך אוצריא')); return; }
    try {
      const r = await PV.call('fs.pickUserFolder', { title: PV.t('בחירת תיקיית יעד') });
      if (!r || r.cancelled) return;
      PV.tryCall('fs.revokeFolder', { folderToken: r.folderToken }); // הכתיבה עוברת דרך הגשר לפי נתיב; ההרשאה של אוצריא לא נדרשת
      S.opts.outPath = r.path; S.opts.outName = r.name;
      S.save();
      S.refreshUi();
    } catch (e) { PV.error(PV.t('לא ניתן לבחור תיקייה: {e}', { e: PV.errMsg(e) })); }
  };

  // ── ממשק ──────────────────────────────────────────────────────────────
  S.refreshUi = function () {
    const o = S.opts;
    $('s-src').value = o.src;
    $('s-src-row').hidden = o.src !== 'folder';
    $('s-sub-row').hidden = o.src !== 'folder';
    $('s-src-label').textContent = S.srcFolder ? S.srcFolder.path : PV.t('לא נבחרה תיקייה');
    $('s-engine').value = o.engine || '';
    $('s-replace').checked = !!o.replace;
    $('s-skip').checked = !!o.skipDigital;
    $('s-sub').checked = !!o.sub;
    $('s-ask').checked = !!o.ask;
    $('s-ask-row').hidden = o.src === 'folder';   // השאלה חלה על מסמך בודד; בסריקת תיקייה נשמר לפי המיקום שהוגדר
    $('s-out').value = o.out;
    $('s-suffix').value = o.suffix;
    $('s-out-row').hidden = o.out !== 'folder';
    $('s-out').closest('.setting-row').hidden = false;
    $('s-out-label').textContent = o.outPath || PV.t('לא נבחרה תיקייה');
    $('s-out-hint').textContent = (o.ask && o.src === 'doc' ? PV.t('במסמך בודד תיפתח שאלה איפה לשמור (המיקום כאן הוא ברירת המחדל שלה). ') : '')
      + (o.out === 'same'
        ? PV.t('בלי שאלה: הקובץ החדש יישמר ליד המקור עם הסיומת בשם. קובץ קיים לא נדרס (נוסף מספר).')
        : PV.t('בלי שאלה: הקבצים יישמרו בתיקייה שנבחרה (בסריקת תיקייה — עם אותו מבנה תת-תיקיות). קובץ קיים לא נדרס.'));
  };
  S.bindUi = function () {
    const o = S.opts, upd = () => { S.save(); S.refreshUi(); };
    $('s-src').addEventListener('change', () => { o.src = $('s-src').value; upd(); });
    $('s-engine').addEventListener('change', () => { o.engine = $('s-engine').value; upd(); });
    $('s-ask').addEventListener('change', () => { o.ask = $('s-ask').checked; upd(); });
    $('s-replace').addEventListener('change', () => { o.replace = $('s-replace').checked; upd(); });
    $('s-skip').addEventListener('change', () => { o.skipDigital = $('s-skip').checked; upd(); });
    $('s-sub').addEventListener('change', () => { o.sub = $('s-sub').checked; upd(); });
    $('s-out').addEventListener('change', () => { o.out = $('s-out').value; upd(); });
    $('s-suffix').addEventListener('change', () => { o.suffix = $('s-suffix').value.replace(/[\\/:*?"<>|]/g, ''); upd(); });
    $('s-pick-src').addEventListener('click', () => S.pickSource());
    $('s-pick-out').addEventListener('click', () => S.pickOut());
    $('s-go').addEventListener('click', () => {
      try { if (S.closePanel) S.closePanel(); } catch (e) { /* סגירת החלונית לא חוסמת את ההתחלה */ }
      S.start().catch((e) => PV.error(PV.t('שגיאה: {e}', { e: PV.errMsg(e) })));
    });
  };
})();
