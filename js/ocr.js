/* צופה PDF+OCR — חילוץ טקסט: שכבה מוטבעת, OCR (Tesseract.js מובנה), אזור מסומן ומסמך שלם,
   וחלונית הטקסט (העתקה, שמירה, הדפסה, ייצוא PDF, חיפוש בספרייה). */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer;
  const O = (PV.ocr = { busy: false });

  // ── מנוע Tesseract (קבצי המנוע ארוזים ב-base64, בלי רשת) ─────────────
  const workers = {}, workerPromises = {};   // 'heb' (עברי, ברירת מחדל) ו-'rashi' (מודל כתב רש"י) — מנוע נפרד לכל אחד
  let bundlePromise = null;
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
    for (const k of Object.keys(workers)) { try { await workers[k].terminate(); } catch (e) { /* כבר נסגר */ } delete workers[k]; }
    for (const k of Object.keys(workerPromises)) delete workerPromises[k];
  };
  // ── מודלי Tesseract ארוזים בתוסף (vendor/lang-data) ──
  const isRashiLang = (l) => /rashi/i.test(l.code);
  // רש"י: heb_rashi = מדויק (best), heb_rashi_fast = מהיר. עברית: מדויק = heb_best (קובץ), מהיר = heb (מובנה בתוך מנוע ה-OCR)
  const RASHI_FILES = { best: 'heb_rashi', fast: 'heb_rashi_fast' };
  const rashiKey = () => (PV.settings.rashiModel === 'fast' ? 'fast' : 'best');
  const hebKey = () => (PV.settings.ocrEngine === 'tesseract-fast' ? 'fast' : 'best');
  const mName = (k) => PV.t(k === 'fast' ? 'מהיר' : 'מדויק');
  // מודל מותאם שנבחר לכתב (הגדרות ← OCR ← שפות); '' = ללא (המודל המובנה לפי ההגדרות)
  const customHeb = () => PV.settings.customHeb || '';
  const customRashi = () => PV.settings.customRashi || '';
  const hebPart = () => (customHeb() ? 'c-' + customHeb() : hebKey());
  const rashiPart = () => (customRashi() ? 'c-' + customRashi() : rashiKey());
  const partLabel = (part) => (part.indexOf('c-') === 0 ? part.slice(2) : mName(part));
  /** קוד המודל הנבחר בהגדרות ("מנוע זיהוי כתב רש"י") */
  O.rashiCode = () => RASHI_FILES[rashiKey()];
  // המודלים ארוזים כקבצי JS קטנים (vendor/lang-data/<קוד>.<n>.js, כ-0.9MB כל אחד, base64 של נתונים מעורבלים ב-XOR) ונטענים בתג script —
  // התוסף לא יכול לקרוא קבצים רגילים (fetch/XHR נחסמים), ורק סקריפטים נטענים. קובץ JS בודד וגדול הכשיל את ההתקנה, ולכן הפיצול.
  const LANG_CHUNKS = {"heb_best": 6, "heb_rashi": 10, "heb_rashi_fast": 10};
  const LANG_SEED = 0x9E3779B9 | 0;
  const bundledLangs = {};   // code → Promise<base64|null>
  const bundledErr = {};     // code → סיבת הכשל האחרונה (לאבחון)
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      const timer = setTimeout(() => reject(new Error('timeout ' + src)), 60000);
      s.onload = () => { clearTimeout(timer); resolve(); };
      s.onerror = () => { clearTimeout(timer); reject(new Error('script ' + src)); };
      s.src = src;
      document.head.appendChild(s);
    });
  }
  /** base64 של נתונים מעורבלים (XOR עם xorshift32) → base64 של המודל המקורי */
  function descramble(b64) {
    const bin = atob(b64), n = bin.length, out = new Uint8Array(n);
    let x = LANG_SEED;
    for (let i = 0; i < n; i++) { x ^= x << 13; x ^= x >>> 17; x ^= x << 5; out[i] = bin.charCodeAt(i) ^ (x & 255); }
    let r = '';
    for (let i = 0; i < n; i += 8192) r += String.fromCharCode.apply(null, out.subarray(i, i + 8192));
    return btoa(r);
  }
  function loadBundled(code) {
    if (bundledLangs[code]) return bundledLangs[code];
    const n = LANG_CHUNKS[code];
    if (!n) return Promise.resolve(null);
    bundledLangs[code] = (async () => {
      const store = (window.__OTZ_LANG_CHUNKS__ = window.__OTZ_LANG_CHUNKS__ || {});
      const key = (k) => code + ':' + k;
      await Promise.all(Array.from({ length: n }, (_, k) => (store[key(k)] ? null : loadScript('./vendor/lang-data/' + code + '.' + k + '.js'))));
      let joined = '';
      for (let k = 0; k < n; k++) { if (!store[key(k)]) throw new Error('missing part ' + k); joined += store[key(k)]; }
      for (let k = 0; k < n; k++) delete store[key(k)];
      return descramble(joined);
    })().then((v) => { delete bundledErr[code]; return v; })
      .catch((e) => { bundledErr[code] = PV.errMsg(e); delete bundledLangs[code]; return null; });
    return bundledLangs[code];
  }
  O.loadModel = loadBundled;   // base64 של מודל ארוז (לבדיקות/אבחון)
  O.modelError = (code) => bundledErr[code || O.rashiCode()] || '';
  const usedHeb = {};   // מפתח מנוע → 'best' | 'fast' | 'c-<קוד>': מודל העברית שנטען בפועל (אם הקובץ המדויק לא נטען — המהיר)
  const usedRashi = {};  // כנ"ל לרש"י
  /** מודל רש"י זמין: הארוז בתוסף, או כזה שהמשתמש הוסיף ידנית */
  O.hasRashi = async () => {
    if (customRashi()) return true;
    const user = await O.getLanguages().then((a) => a.some(isRashiLang), () => false);
    if (user) return true;
    try { return !!(await loadBundled(O.rashiCode())); } catch (e) { return false; }
  };
  /** כתב רש"י פעיל: נבחר "רש"י" בתפריט הזיהוי (ובמצב זיהוי, לא חילוץ). גובר על המנוע שהוגדר בהגדרות. */
  O.rashiOn = () => PV.settings.ocrScript === 'rashi' && PV.settings.ocrMode !== 'extract';
  /** כתב מעורב פעיל: עברית + רש"י באותו מעבר, כל אחד במודל שהוגדר בהגדרות. */
  O.mixedOn = () => PV.settings.ocrScript === 'mixed' && PV.settings.ocrMode !== 'extract';
  const scriptKind = () => (O.rashiOn() ? 'rashi' : (O.mixedOn() ? 'mixed' : 'heb'));
  /** המנוע בפועל: Windows רק אם נבחר במפורש או בהגדרות — כתב רש"י תמיד ב-Tesseract. במעורב עם Windows: Windows לעברית + Tesseract לרש"י. */
  O.engineFor = (override) => {
    if (override === 'snip') return 'snip';
    if (O.rashiOn()) return 'tesseract';
    if (!override && customHeb()) return 'tesseract';   // נבחר מודל עברי מותאם: Tesseract עם המודל הזה (גובר על Windows)
    const e = override || PV.settings.ocrEngine;
    return e === 'tesseract-fast' ? 'tesseract' : e;
  };
  /** האם במעורב Windows מזהה את העברית (ו-Tesseract רק את הרש"י) */
  const hybridWindows = () => PV.settings.ocrEngine === 'snip' && !customHeb();
  /** שם המנוע להצגה בתפריט הזיהוי */
  O.engineName = function () {
    const win = PV.settings.ocrEngine === 'snip';
    if (O.rashiOn()) return 'Tesseract (' + PV.t('רש"י') + ' · ' + partLabel(rashiPart()) + ')';
    if (O.mixedOn()) {
      return hybridWindows() ? 'Windows + Tesseract (' + PV.t('מעורב') + ': ' + PV.t('רש"י') + ' ' + partLabel(rashiPart()) + ')'
        : 'Tesseract (' + PV.t('מעורב') + ': ' + PV.t('עברי') + ' ' + partLabel(hebPart()) + ' + ' + PV.t('רש"י') + ' ' + partLabel(rashiPart()) + ')';
    }
    return win && !customHeb() ? 'Windows' : 'Tesseract (' + partLabel(hebPart()) + ')';
  };

  let progressHook = null;
  const tagFor = (kind) => (kind === 'rashi' ? 'rashi:' + rashiPart() : (kind === 'mixed' ? 'mixed:' + hebPart() + ':' + rashiPart() : 'heb:' + hebPart()));
  async function getWorker(kind) {
    kind = kind || scriptKind();
    const tag = tagFor(kind);   // מנוע נפרד לכל שילוב של מודלים
    if (workers[tag]) return workers[tag];
    if (workerPromises[tag]) return workerPromises[tag];
    workerPromises[tag] = (async () => {
      await loadBundle();
      const extra = await O.getLanguages();
      const assets = Object.assign({}, window.__OTZ_BASE_ASSETS_B64__);
      const codes = [];
      const addCustom = (part) => {
        const r = extra.find((l) => l.code === part.slice(2));
        if (!r) return false;   // הוסר מאז הבחירה — חוזרים למודל המובנה
        assets[r.code + '.traineddata'] = r.b64;
        codes.push(r.code);
        return true;
      };
      const addHeb = async (key) => {
        if (key.indexOf('c-') === 0 && addCustom(key)) { usedHeb[tag] = key; return; }
        if (key.indexOf('c-') === 0) key = hebKey();
        if (key === 'best') {
          const b64 = await loadBundled('heb_best');
          if (b64) { assets['heb_best.traineddata'] = b64; usedHeb[tag] = 'best'; codes.push('heb_best'); return; }
        }
        usedHeb[tag] = 'fast'; codes.push('heb');   // המהיר מובנה בתוך מנוע ה-OCR (גם גיבוי אם הקובץ המדויק לא נטען)
      };
      const addRashi = async (key) => {
        if (key.indexOf('c-') === 0 && addCustom(key)) { usedRashi[tag] = key; return; }
        if (key.indexOf('c-') === 0) key = rashiKey();
        usedRashi[tag] = key;
        const code = RASHI_FILES[key] || RASHI_FILES.best;
        // קודם הקובץ הארוז בתוסף; אם אי אפשר לטעון אותו — מודל רש"י שהמשתמש הוסיף ידנית
        let b64 = await loadBundled(code);
        let useCode = code;
        if (!b64) {
          const r = extra.find((l) => l.code === code) || extra.find(isRashiLang);
          if (r) { b64 = r.b64; useCode = r.code; }
        }
        if (!b64) throw new Error(PV.t('מודל כתב רש"י לא נמצא — טעינת הקובץ מהתוסף נכשלה') + (bundledErr[code] ? ' (' + bundledErr[code] + ')' : ''));
        assets[useCode + '.traineddata'] = b64;
        codes.push(useCode);
      };
      if (kind === 'rashi') await addRashi(rashiPart());
      else if (kind === 'mixed') { await addHeb(hebPart()); await addRashi(rashiPart()); }   // העברית ראשונה: שפה ראשית
      else await addHeb(hebPart());
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
        cacheMethod: 'none',   // בלי מטמון IndexedDB של Tesseract.js: הוא נשמר לפי שם הקובץ (heb_rashi...) ושימש מודל ישן מגרסאות קודמות במקום המודל שבתוסף
        logger: (m) => { if (progressHook && m.status === 'recognizing text' && typeof m.progress === 'number') progressHook(m.progress); },
      });
      workers[tag] = w;
      return w;
    })();
    try { return await workerPromises[tag]; } catch (e) { delete workerPromises[tag]; throw e; }
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
    else if (r.engine === 'hybrid') s = 'Windows + Tesseract · ' + PV.t('מעורב') + ' (' + PV.t('מודל רש"י') + ' ' + partLabel(r.rashiModel) + ')';
    else if (r.kind === 'rashi') s = 'Tesseract · ' + PV.t('מודל רש"י') + ' (' + partLabel(r.rashiModel) + ')';
    else if (r.kind === 'mixed') s = 'Tesseract · ' + PV.t('מעורב') + ' (' + PV.t('עברי') + ' ' + partLabel(r.hebModel) + ' + ' + PV.t('רש"י') + ' ' + partLabel(r.rashiModel) + ')';
    else s = 'Tesseract (' + partLabel(r.hebModel) + ')';
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
  const currentEngine = () => O.engineFor(O.engineOverride);
  /** מחפש רווח אנכי ברור באמצע הדף (בין שני טורים). מחזיר x בפיקסלים של הקנבס, או null אם אין רווח ברור —
   *  כלומר הדף נראה כטור אחד ואין טעם לפצל. מודד "כהות" לכל עמודת פיקסלים בתמונה מוקטנת, ולכן עובד גם בסריקות אפורות. */
  O.findGutter = function (src) {
    const W = src.width, H = src.height;
    if (W < 200 || H < 100) return null;
    const sw = Math.min(W, 500), sh = Math.max(1, Math.round(H * sw / W));
    const c = document.createElement('canvas');
    c.width = sw; c.height = sh;
    const ctx = c.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(src, 0, 0, sw, sh);
    const px = ctx.getImageData(0, 0, sw, sh).data, n = sw * sh, lum = new Float32Array(n), hist = new Uint32Array(256);
    for (let i = 0; i < n; i++) { const v = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2]; lum[i] = v; hist[v | 0]++; }
    let acc = 0, bg = 255;                         // רקע = האחוזון ה-90 של הבהירות
    for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) { bg = v; break; } }
    const col = new Float32Array(sw);
    for (let y = 0; y < sh; y++) for (let x = 0; x < sw; x++) { const d = bg - lum[y * sw + x]; if (d > 0) col[x] += d; }
    let m = 0;
    for (let x = 0; x < sw; x++) { col[x] /= sh; m += col[x]; }
    m /= sw;
    c.width = 0;
    if (m < 2) return null;                        // דף ריק כמעט
    const lo = Math.floor(sw * 0.3), hi = Math.ceil(sw * 0.7), minRun = Math.max(3, Math.round(sw * 0.015));
    let best = null, start = -1;
    for (let x = lo; x <= hi + 1; x++) {
      const gap = x <= hi && col[x] < m * 0.2;
      if (gap && start < 0) start = x;
      if (!gap && start >= 0) { if (x - start >= minRun && (!best || x - start > best[1] - best[0])) best = [start, x]; start = -1; }
    }
    if (!best) return null;
    const side = (a, b) => { let t = 0; for (let x = a; x < b; x++) t += col[x]; return t / Math.max(1, b - a); };
    if (side(0, best[0]) < m * 0.5 || side(best[1], sw) < m * 0.5) return null;   // בצד אחד אין טקסט — לא שני טורים
    return Math.round(((best[0] + best[1]) / 2) * W / sw);
  };

  /** opts.noCols — בלי פיצול לטורים (אזור שסומן ידנית: המשתמש כבר בחר מה לזהות). */
  O.recognize = async function (source, onProgress, opts) {
    const o = opts || {};
    if (PV.settings.ocrCols && !o.noCols && source instanceof HTMLCanvasElement && source.width > 200) {
      const W = source.width, H = source.height;
      // Tesseract: פיצול באמצע (כמו קודם). Windows: מפצלים רק אם יש רווח ברור בין הטורים, ובמקום הרווח — כדי לא לחתוך מילים
      let cut = Math.floor(W / 2);
      if (currentEngine() === 'snip') cut = O.findGutter(source);
      if (cut != null) {
        const parts = [];
        for (const [x, w] of [[cut, W - cut], [0, cut]]) {
          const c = document.createElement('canvas');
          c.width = w; c.height = H;
          c.getContext('2d').drawImage(source, x, 0, w, H, 0, 0, w, H);
          parts.push(await O.recognizeOne(c, onProgress ? (p) => onProgress(p / 2 + (parts.length ? 0.5 : 0)) : null));
        }
        return parts.filter(Boolean).join('\n\n');
      }
    }
    return O.recognizeOne(source, onProgress);
  };
  O.recognizeOne = async function (source, onProgress) {
    if (currentEngine() === 'snip' && source instanceof HTMLCanvasElement) {
      if (O.mixedOn()) {
        // מעורב עם Windows: Windows לעברית + Tesseract (מודל רש"י) לשורות ברש"י. אם המנוע הישיר לא זמין — Tesseract מעורב
        if (await hybridOk()) {
          const lines = await hybridLines(source, onProgress);
          O.lastRun = { engine: 'hybrid', rashiModel: usedRashi[tagFor('rashi')] || rashiPart() };
          return tidy(lines.map((l) => l.text).filter(Boolean).join('\n'));
        }
        warnNoDirect();
      } else {
        // כלי החיתוך של Windows דרך הגשר. בכשל — שגיאה גלויה, בלי מעבר שקט ל-Tesseract
        const t = await PV.bridge.snipRecognizeCanvas(source);
        O.lastRun = PV.bridge.lastRun;
        if (onProgress) onProgress(1);
        return tidy(t);
      }
    }
    const kind = scriptKind();
    const w = await getWorker(kind);
    O.lastRun = { engine: 'tesseract', kind, hebModel: usedHeb[tagFor(kind)] || hebPart(), rashiModel: usedRashi[tagFor(kind)] || rashiPart() };
    progressHook = onProgress || null;
    try {
      const { data } = await w.recognize(source);
      return tidy(data.text);
    } finally { progressHook = null; }
  };
  /** מילים עם מיקום מ-Tesseract: [{ text, q:[x1,y1,x2,y2,x3,y3,x4,y4] }] בפיקסלים של הקנבס (לשכבת טקסט ב-PDF). */
  /** מילים מ-Tesseract עם ביטחון: [{ text, conf, x0,y0,x1,y1, cx, cy, i }] בסדר הקריאה של המנוע */
  async function tesseractWords(canvas, kind, onProgress) {
    const w = await getWorker(kind);
    progressHook = onProgress || null;
    try {
      const { data } = await w.recognize(canvas);
      const raw = [];
      if (Array.isArray(data.words) && data.words.length) raw.push(...data.words);
      else (data.blocks || []).forEach((b) => (b.paragraphs || []).forEach((p) => (p.lines || []).forEach((l) => (l.words || []).forEach((x) => raw.push(x)))));
      return raw.filter((x) => x && x.bbox && String(x.text || '').trim()).map((x, i) => {
        const b = x.bbox;
        return { text: String(x.text).trim(), conf: Number(x.confidence) || 0, x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1, cx: (b.x0 + b.x1) / 2, cy: (b.y0 + b.y1) / 2, i };
      });
    } finally { progressHook = null; }
  }
  const wordQ = (w) => [w.x0, w.y0, w.x1, w.y0, w.x1, w.y1, w.x0, w.y1];
  /** מילים עם מיקום מ-Tesseract: [{ text, q:[x1,y1,x2,y2,x3,y3,x4,y4] }] בפיקסלים של הקנבס (לשכבת טקסט ב-PDF). */
  O.layoutTesseract = async function (canvas, onProgress) {
    return (await tesseractWords(canvas, null, onProgress)).map((w) => ({ text: w.text, q: wordQ(w) }));
  };

  // ── מעורב עם Windows ────────────────────────────────────────────────
  // Windows מזהה עברית טוב אך לא רש"י. לכן מריצים גם Tesseract עם מודל רש"י, ושורה שבה Tesseract בטוח בתוצאה
  // (ביטחון ממוצע ≥ הסף) נלקחת ממנו; כל שאר השורות — מ-Windows. מדידה: מודל רש"י על כתב מרובע נותן ביטחון ממוצע של כ-55 (מקסימום כ-79),
  // ולכן הסף גבוה מזה. נבדק רק על כתב מרובע — את הסף כדאי לכוונן על דפי רש"י אמיתיים.
  const RASHI_MIN_CONF = 82;
  let warnedDirect = false;
  const hybridOk = async () => PV.hasOtz() && await PV.bridge.directAvailable();
  function warnNoDirect() {
    if (warnedDirect) return;
    warnedDirect = true;
    PV.toast(PV.t('המנוע הישיר של Windows אינו זמין — נעשה שימוש ב-Tesseract'));
  }
  const boxBounds = (b) => ({ x0: Math.min(b[0], b[2], b[4], b[6]), x1: Math.max(b[0], b[2], b[4], b[6]), y0: Math.min(b[1], b[3], b[5], b[7]), y1: Math.max(b[1], b[3], b[5], b[7]) });
  /** שורות ממוזגות: [{ text, bb, words:[{text,q}] }] — Windows, ובמקום השורות ברש"י שזוהו ב-Tesseract */
  async function hybridLines(canvas, onProgress) {
    const win = await PV.bridge.ocrLayoutCanvas(canvas);
    if (onProgress) onProgress(0.3);
    const rw = await tesseractWords(canvas, 'rashi', (p) => onProgress && onProgress(0.3 + p * 0.7));
    const used = new Set();
    const out = [];
    for (const ln of (win && win.lines) || []) {
      const ws = (ln.words && ln.words.length) ? ln.words : [{ text: ln.text, box: ln.box }];
      const words = ws.filter((w) => w && String(w.text || '').trim() && w.box && w.box.length === 8).map((w) => ({ text: String(w.text).trim(), q: w.box }));
      let bb = (ln.box && ln.box.length === 8) ? boxBounds(ln.box) : null;
      if (!bb && words.length) {
        const all = words.map((w) => boxBounds(w.q));
        bb = { x0: Math.min(...all.map((a) => a.x0)), x1: Math.max(...all.map((a) => a.x1)), y0: Math.min(...all.map((a) => a.y0)), y1: Math.max(...all.map((a) => a.y1)) };
      }
      const winText = String(ln.text || ws.map((w) => w.text).join(' ')).trim();
      if (!bb) { out.push({ text: winText, bb: null, words }); continue; }
      const inside = rw.filter((w) => !used.has(w) && w.cx >= bb.x0 - 4 && w.cx <= bb.x1 + 4 && w.cy >= bb.y0 && w.cy <= bb.y1);
      const mean = inside.length ? inside.reduce((a, w) => a + w.conf, 0) / inside.length : 0;
      if (inside.length && mean >= RASHI_MIN_CONF) {
        inside.forEach((w) => used.add(w));
        out.push({ text: inside.map((w) => w.text).join(' '), bb, words: inside.map((w) => ({ text: w.text, q: wordQ(w) })) });
      } else out.push({ text: winText, bb, words });
    }
    // שורות ברש"י ש-Windows לא זיהה בכלל: מקבצים את המילים שנותרו לשורות לפי גובה
    const rest = rw.filter((w) => !used.has(w)).sort((a, b) => a.cy - b.cy);
    const groups = [];
    let cur = null;
    for (const w of rest) {
      if (cur && Math.abs(w.cy - cur.cy) <= Math.max(6, cur.h * 0.6)) { cur.ws.push(w); cur.cy = cur.ws.reduce((a, x) => a + x.cy, 0) / cur.ws.length; }
      else { cur = { ws: [w], cy: w.cy, h: Math.max(1, w.y1 - w.y0) }; groups.push(cur); }
    }
    for (const g of groups) {
      const mean = g.ws.reduce((a, w) => a + w.conf, 0) / g.ws.length;
      if (mean < RASHI_MIN_CONF) continue;
      const ws = g.ws.slice().sort((a, b) => a.i - b.i);
      const bb = { x0: Math.min(...ws.map((w) => w.x0)), x1: Math.max(...ws.map((w) => w.x1)), y0: Math.min(...ws.map((w) => w.y0)), y1: Math.max(...ws.map((w) => w.y1)) };
      const line = { text: ws.map((w) => w.text).join(' '), bb, words: ws.map((w) => ({ text: w.text, q: wordQ(w) })) };
      const at = out.findIndex((l) => l.bb && l.bb.y0 > bb.y0);
      if (at < 0) out.push(line); else out.splice(at, 0, line);
    }
    return out;
  }
  /** מילים עם מיקום לשכבת טקסט ב-PDF, במצב מעורב עם Windows */
  O.hybridLayout = async function (canvas, onProgress) {
    const lines = await hybridLines(canvas, onProgress);
    return lines.flatMap((l) => l.words).filter((w) => w && w.text && w.q && w.q.length === 8);
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

  // ── ריצת OCR ברקע: המסמך נתפס בתחילת הריצה, כך שאפשר לעבור ללשונית אחרת בלי לעצור ──
  /** O.job = { doc, name, total, i, n } — המסמך שה-OCR רץ עליו כרגע. */
  function jobBegin(doc, total) {
    O.busy = true;
    if (doc) doc.busyOcr = true;
    O.job = { doc, name: (doc && doc.name) || '', total: total || 1, i: 0, n: 0, aborted: false, cancel: null };
    O.job.cancel = () => { O.job && (O.job.aborted = true); };   // עבודה של עמוד בודד: התוצאה נזרקת; processAll מחליף בעצירה אחרי העמוד הנוכחי
    return O.job;
  }
  function jobEnd() {
    const j = O.job;
    O.busy = false; O.job = null;
    if (j && j.doc) {
      j.doc.busyOcr = false;
      if (j.doc.destroyLater) { j.doc.destroyLater = false; V.destroyDoc(j.doc); } // הלשונית נסגרה בזמן הריצה
    }
  }
  const inBackground = () => !!(O.job && O.job.doc && O.job.doc !== V.doc);
  /** האם רץ כעת זיהוי כלשהו (OCR רגיל או PDF עם שכבת טקסט). */
  O.isBusy = () => !!(O.busy || (PV.searchable && PV.searchable.busy));
  /** מבקש מהריצה הפעילה להפסיק (אחרי העמוד הנוכחי). */
  O.cancelActive = function () {
    if (O.job && O.job.cancel) { try { O.job.cancel(); } catch (e) { /* */ } }
    if (PV.searchable && PV.searchable.cancelFn) { try { PV.searchable.cancelFn(); } catch (e) { /* */ } }
  };
  let askingBusy = false;
  function busyDialog() {
    return new Promise((resolve) => {
      const dlg = $('busy-dlg');
      if (!dlg) { resolve(false); return; }
      const j = O.job;
      let name = (j && j.name) || '';
      if (!name && PV.searchable && PV.searchable.busy) name = PV.t('PDF עם שכבת טקסט');
      $('busy-dlg-text').textContent = PV.t('ה-OCR עדיין פועל') + (name ? PV.t(' על «{n}»', { n: name }) : '')
        + (j && j.total > 1 && j.i > 0 ? PV.t(' (עמוד {p}, {i} מתוך {t})', { p: j.n, i: j.i, t: j.total }) : '') + '. '
        + PV.t('להפסיק ולבטל את הזיהוי הקודם ולהתחיל את החדש, או להמשיך עם הקודם עד שיסתיים (הזיהוי החדש לא יופעל)?');
      const done = (v) => {
        dlg.hidden = true;
        $('busy-dlg-stop').onclick = $('busy-dlg-keep').onclick = null;
        document.removeEventListener('keydown', onKey, true);
        resolve(v);
      };
      const onKey = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
      document.addEventListener('keydown', onKey, true);
      $('busy-dlg-stop').onclick = () => done(true);
      $('busy-dlg-keep').onclick = () => done(false);
      dlg.hidden = false;
      $('busy-dlg-keep').focus();
    });
  }
  /** נקרא לפני התחלת זיהוי חדש. true = אפשר להתחיל (אין ריצה, או שהמשתמש בחר להפסיק את הקודמת והיא נעצרה); false = לא להתחיל. */
  O.requestStart = async function () {
    if (!O.isBusy()) return true;
    if (askingBusy) return false;
    askingBusy = true;
    let stop = false;
    try { stop = await busyDialog(); } finally { askingBusy = false; }
    if (!stop) return false;
    if (!O.isBusy()) return true;   // הריצה הקודמת הסתיימה בזמן שהדיאלוג היה פתוח
    O.cancelActive();
    PV.toast(PV.t('מפסיק את הזיהוי הקודם…'), { info: true });
    const t0 = Date.now();
    while (O.isBusy() && Date.now() - t0 < 120000) await new Promise((r) => setTimeout(r, 100));
    if (O.isBusy()) { PV.error(PV.t('לא הצלחנו לעצור את הזיהוי הקודם')); return false; }
    return true;
  };
  /** הודעה (בסגנון שגיאה) כשמנסים להפעיל OCR נוסף בזמן שאחד כבר רץ. */
  O.notifyBusy = function () {
    const j = O.job;
    let msg = PV.t('ה-OCR עדיין פועל');
    if (j && j.name) msg += PV.t(' על «{n}»', { n: j.name });
    if (j && j.total > 1 && j.i > 0) msg += PV.t(' (עמוד {p}, {i} מתוך {t})', { p: j.n, i: j.i, t: j.total });
    msg += '. ' + PV.t('אי אפשר להפעיל זיהוי נוסף עד שיסתיים. אפשר להמשיך לעיין במסמכים אחרים ולעבור בין לשוניות, והתוצאה תופיע בחלונית הטקסט.');
    if (j && j.total > 1) msg += ' ' + PV.t('לעצירה — כפתור "ביטול" בחלונית ההתקדמות.');
    PV.error(msg);
  };
  // מעבר למסמך אחר (או ללשונית ריקה) בזמן שה-OCR רץ — מודיעים שהוא ממשיך ברקע, פעם אחת בלבד
  PV.on('doc', (d) => {
    if (O.busy && O.job && O.job.doc && d !== O.job.doc && !O.job.notified) {
      const j = O.job;
      j.notified = true;   // ההודעה מוצגת פעם אחת בלבד לכל ריצה (ביציאה הראשונה מהמסמך, או בסגירתו)
      PV.toast(PV.t('ה-OCR של «{n}» ממשיך לפעול ברקע', { n: j.name }) + (j.total > 1 ? ' · ' + PV.t('{i} מתוך {t} עמודים', { i: j.i, t: j.total }) : '') + '. ' + PV.t('אפשר להמשיך לעיין'), { long: true, info: true });
    }
  });

  /** opts.noOcr — חילוץ מוטבע בלבד: בלי מעבר ל-OCR כשאין טקסט מוטבע. */
  O.extractPage = async function (n, opts) {
    if (!needPaged()) return;
    const page = n || V.page;
    const noOcr = !!(opts && opts.noOcr);
    if (V.doc.kind === 'pdf') {
      const text = await V.getPageText(page);
      if (text) { O.show(text, { title: PV.t('טקסט מוטבע — עמוד {n}', { n: page }), sub: docLabel(), source: 'embedded' }); return; }
      if (noOcr) { PV.toast(PV.t('אין טקסט מוטבע בעמוד')); return; }
      PV.toast(PV.t('אין טקסט מוטבע בעמוד — מריץ OCR…'));
    } else if (noOcr) { PV.toast(PV.t('אין טקסט מוטבע במסמך הזה')); return; }
    await O.ocrPage(page);
  };

  O.ocrPage = async function (n, opts) {
    if (!needPaged()) return;
    if (!(await O.requestStart())) return;
    const page = n || V.page;
    const doc = V.doc, rotation = V.rotation, label = docLabel();
    const job1 = jobBegin(doc, 1);
    job1.n = page;
    O.engineOverride = (opts && opts.engine) || null;
    PV.progress.show(currentEngine() === 'snip' ? PV.t('מפעיל את כלי החיתוך…') : PV.t('טוען את מנוע ה-OCR…'));
    try {
      const t0 = Date.now();
      const canvas = await V.renderOffscreen(page, Number(PV.settings.ocrQuality) || 2, { doc, rotation });
      const renderMs = Date.now() - t0;
      PV.progress.update((inBackground() ? '«' + label + '» · ' : '') + PV.t('מזהה טקסט בעמוד {n}…', { n: page }), 0);
      const text = await O.recognize(canvas, (p) => PV.progress.update(null, p));
      if (job1.aborted) return;   // בוטל בדיאלוג — לא מציגים תוצאה
      O.show(text, { title: PV.t('OCR — עמוד {n}', { n: page }), sub: label + ' · ' + runLabel((Date.now() - t0) / 1000, renderMs), source: 'ocr', doc });
      warnFallback();
      if (!text) PV.toast(PV.t('לא זוהה טקסט בעמוד'));
      else if (inBackground()) PV.toast(PV.t('ה-OCR של «{n}» הסתיים — התוצאה בחלונית הטקסט', { n: label }));
    } catch (e) {
      PV.error(PV.t('שגיאה ב-OCR: {e}', { e: PV.errMsg(e) }));
    } finally { jobEnd(); O.engineOverride = null; PV.progress.hide(); }
  };

  O.ocrCanvas = async function (canvas, label, opts) {
    if (!(await O.requestStart())) return;
    const doc = V.doc, name = docLabel();
    const jobC = jobBegin(doc, 1);
    PV.progress.show(PV.t('מזהה טקסט…'));
    try {
      const t0 = Date.now();
      const text = await O.recognize(canvas, (p) => PV.progress.update(null, p), opts);
      if (jobC.aborted) return;   // בוטל בדיאלוג — לא מציגים תוצאה
      O.show(text, { title: label || PV.t('OCR'), sub: name + ' · ' + runLabel((Date.now() - t0) / 1000), source: 'ocr', doc });
      warnFallback();
      if (!text) PV.toast(PV.t('לא זוהה טקסט'));
    } catch (e) {
      PV.error(PV.t('שגיאה ב-OCR: {e}', { e: PV.errMsg(e) }));
    } finally { jobEnd(); PV.progress.hide(); }
  };

  /** מסמך שלם או טווח עמודים (opts.pages = [מספרי עמודים]): OCR, או רק הטקסט המוטבע. opts.engine = 'snip' | 'tesseract'. */
  O.processAll = async function (useOcr, opts) {
    if (!needPaged()) return;
    if (!(await O.requestStart())) return;
    if (!useOcr && V.doc.kind !== 'pdf') { useOcr = true; }
    const engine = (opts && opts.engine) || null;
    const list = (opts && opts.pages && opts.pages.length) ? opts.pages : Array.from({ length: V.count }, (_, i) => i + 1);
    const total = list.length;
    const partial = total !== V.count;
    const viaSnip = O.engineFor(engine) === 'snip';
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
    if (!(await O.requestStart())) return; // בזמן שחיכינו לאישור התחיל זיהוי אחר
    const docAtStart = V.doc, rotAtStart = V.rotation, label = docLabel();
    const job = jobBegin(docAtStart, total);
    O.engineOverride = engine;
    let streak = 0;
    let cancelled = false;
    job.cancel = () => { cancelled = true; };
    const pfx = () => (inBackground() ? '«' + label + '» · ' : '');
    PV.progress.show(PV.t('מכין…'), () => { cancelled = true; });
    if (useOcr) PV.tryCall('ui.setUnsavedChanges', { hasChanges: true, message: PV.t('זיהוי הטקסט במסמך עדיין רץ') });
    const parts = [];
    let pre = null; // העמוד הבא מוכן מראש בזמן שהמנוע מזהה את הנוכחי
    const t0 = Date.now();
    const st0 = PV.bridge.stats ? { ...PV.bridge.stats } : null;
    O.lastRun = null;
    const baseTitle = partial ? PV.t('OCR — טווח עמודים') : PV.t('OCR — כל המסמך');
    const title = useOcr ? baseTitle : (partial ? PV.t('הטקסט המוטבע — טווח עמודים') : PV.t('הטקסט המוטבע — כל המסמך'));
    try {
      for (let i = 0; i < total; i++) {
        const n = list[i];
        if (cancelled) break;
        job.n = n; job.i = i + 1;
        PV.progress.update(pfx() + PV.t('עמוד {n} ({i}/{t})…', { n, i: i + 1, t: total }), i / total);
        let text = '';
        if (!useOcr && docAtStart.kind === 'pdf') text = await V.getPageText(n, docAtStart); // "OCR" מזהה תמיד במנוע; רק "טקסט מוטבע" מחלץ את הקיים
        if (useOcr) {
          const q = Number(PV.settings.ocrQuality) || 2;
          let canvas = (pre && pre.n === n) ? await pre.p : null;
          if (!canvas) canvas = await V.renderOffscreen(n, q, { doc: docAtStart, rotation: rotAtStart });
          pre = null;
          if (i + 1 < total && !cancelled) { const nx = list[i + 1]; pre = { n: nx, p: V.renderOffscreen(nx, q, { doc: docAtStart, rotation: rotAtStart }).catch(() => null) }; }
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
        if ((i + 1) % 3 === 0 || i + 1 === total) O.show(parts.join('\n\n'), { title, sub: label + ' · ' + (i + 1) + '/' + total, source: useOcr ? 'ocr' : 'embedded', quiet: true, doc: docAtStart });
      }
      const secPerPage = parts.length ? (Date.now() - t0) / 1000 / parts.length : null;
      O.show(parts.join('\n\n'), { title, sub: label + (useOcr && O.lastRun ? ' · ' + runLabel(secPerPage) + ' / ' + PV.t('עמוד') : ''), source: useOcr ? 'ocr' : 'embedded', doc: docAtStart });
      if (cancelled) PV.toast(PV.t('הופסק אחרי {n} עמודים', { n: parts.length }) + (inBackground() ? ' · «' + label + '»' : ''));
      else {
        PV.toast(PV.t('הושלם: {n} עמודים', { n: parts.length }) + (inBackground() ? ' · «' + label + '»' : '') + (useOcr && O.lastRun ? ' · ' + runLabel(secPerPage) : ''));
        const fb = st0 ? PV.bridge.stats.fb - st0.fb : 0;
        if (fb > 0) PV.toast(PV.t('{n} עמודים עברו דרך כלי החיתוך', { n: fb }) + ': ' + (O.lastRun && O.lastRun.reason || ''), { long: true });
      }
    } catch (e) {
      PV.error(PV.t('שגיאה: {e}', { e: PV.errMsg(e) }));
    } finally {
      jobEnd();
      O.engineOverride = null;
      PV.progress.hide();
      PV.tryCall('ui.setUnsavedChanges', { hasChanges: false });
    }
  };

  // ── בחירת אזור על העמוד ───────────────────────────────────────────────
  const viewerEl = $('viewer');
  let regionDrag = null, regionMode = 'ocr';
  /** mode: 'ocr' (ברירת מחדל) — זיהוי טקסט באזור; 'extract' — חילוץ הטקסט המוטבע באזור בלבד. */
  O.startRegion = function (mode) {
    if (!needPaged()) return;
    regionMode = mode === 'extract' ? 'extract' : 'ocr';
    viewerEl.classList.add('region-mode');
    PV.toast(regionMode === 'extract'
      ? PV.t('גררו מלבן סביב האזור שברצונכם לחלץ ממנו טקסט מוטבע (Esc לביטול)')
      : PV.t('גררו מלבן סביב האזור שברצונכם לזהות (Esc לביטול)'), { long: true });
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
    if (regionMode === 'extract') {
      regionMode = 'ocr';
      const embedded = await textInRegion(page, d.rect);
      if (embedded) O.show(embedded, { title: PV.t('טקסט מוטבע — אזור בעמוד {n}', { n: page }), sub: docLabel(), source: 'embedded' });
      else PV.toast(PV.t('אין טקסט מוטבע באזור המסומן'));
      return;
    }
    // "OCR לאזור" מזהה תמיד במנוע שנבחר בהגדרות (הטקסט המוטבע זמין בנפרד: "חלץ טקסט מוטבע")
    const full = await V.renderOffscreen(page, Math.max(2.5, Number(PV.settings.ocrQuality) || 2));
    const crop = document.createElement('canvas');
    crop.width = Math.max(1, Math.round(d.rect.w * full.width));
    crop.height = Math.max(1, Math.round(d.rect.h * full.height));
    crop.getContext('2d').drawImage(full, d.rect.x * full.width, d.rect.y * full.height, crop.width, crop.height, 0, 0, crop.width, crop.height);
    full.width = 0;
    await O.ocrCanvas(crop, PV.t('OCR — אזור בעמוד {n}', { n: page }), { noCols: true });
  });

  /** הטקסט המוטבע שנמצא בתוך מלבן (שברי 0..1 של העמוד כפי שמוצג, כולל סיבוב). בחירה לפי מיקום כל תו. */
  async function textInRegion(page, rect) {
    if (!V.doc || V.doc.kind !== 'pdf') return '';
    const tc = await V.getPageTextContent(page);
    if (!tc || !tc.items.length) return '';
    const p = await V.doc.pdf.getPage(page);
    const vp = p.getViewport({ scale: 1, rotation: (p.rotate + V.rotation) % 360 });
    const x0 = rect.x * vp.width, x1 = (rect.x + rect.w) * vp.width;
    const y0 = rect.y * vp.height, y1 = (rect.y + rect.h) * vp.height;
    let out = '';
    tc.items.forEach((it) => {
      if (typeof it.str !== 'string' || !it.transform) return;
      const [a, b, c, d, e, f] = it.transform;
      const len = it.str.length;
      if (len) {
        const sx = Math.hypot(a, b) || 1, sy = Math.hypot(c, d) || 1;
        const w = it.width || 0, h = it.height || sy;
        const rtl = it.dir === 'rtl';
        for (let i = 0; i < len; i++) {
          const fr = (rtl ? len - i - 0.5 : i + 0.5) / len;
          const px = e + (a / sx) * w * fr + (c / sy) * h * 0.35;
          const py = f + (b / sx) * w * fr + (d / sy) * h * 0.35;
          const [vx, vy] = vp.convertToViewportPoint(px, py);
          if (vx >= x0 && vx <= x1 && vy >= y0 && vy <= y1) out += it.str[i];
        }
      }
      if (it.hasEOL && out && !out.endsWith('\n')) out += '\n';
    });
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }

  // ── חלונית הטקסט ──────────────────────────────────────────────────────
  const outEl = $('text-output');
  // ניקוד וטעמים (U+0591–U+05C7), בלי מקף (05BE), פסק (05C0), סוף פסוק (05C3) ונון הפוכה (05C6)
  const NIQQUD_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7]/g;
  let rawText = '';   // הטקסט המלא (עם ניקוד, אם יש); מה שמוצג, מועתק ומיוצא נגזר ממנו לפי "הצג ניקוד"
  const view = (t) => (PV.settings.showNiqqud ? String(t || '') : String(t || '').replace(NIQQUD_RE, ''));
  function renderText() { outEl.textContent = view(rawText); }
  O.show = function (text, opts) {
    const o = opts || {};
    if (o.doc && o.doc !== V.doc) {
      // תוצאת זיהוי שרצה ברקע: נשמרת בלשונית של המסמך שלה, בלי לשנות את מה שמוצג עכשיו
      if (PV.tabs && PV.tabs.setDocText) PV.tabs.setDocText(o.doc, { text: text || '', title: o.title || PV.t('טקסט'), sub: o.sub || '', source: o.source || '' });
      return;
    }
    $('textpanel').hidden = false;
    $('btn-textpanel').classList.add('active');
    rawText = text || '';
    renderText();
    outEl.setAttribute('contenteditable', 'false');
    $('text-title').textContent = o.title || PV.t('טקסט');
    $('text-sub').textContent = o.sub || '';
    O.lastSource = o.source || '';
    updateFooter();
    if (!o.quiet && text && o.copy) copyText(true);
    PV.emit('text');
  };
  O.getText = () => outEl.innerText.replace(/ /g, ' ').trim();   // הטקסט כפי שמוצג (לפי "הצג ניקוד") — ממנו יוצאים העתקה, שמירה, הדפסה וייצוא
  /** הטקסט המלא כולל ניקוד (לשמירה בלשוניות ובזיכרון הממשק) */
  O.getRawText = () => (rawText || '').trim();
  /** הצגת/הסתרת ניקוד בחלונית הטקסט */
  O.setNiqqud = function (on) {
    PV.settings.showNiqqud = !!on;
    PV.saveSettings();
    renderText();
    updateFooter();
    PV.emit('settings', 'showNiqqud');
  };
  /** תוכן חלונית הטקסט של הלשונית הנוכחית (null אם ריקה) — נשמר בלשונית כשעוברים לאחרת */
  O.snapshotText = function () {
    const t = O.getRawText();
    return t ? { text: t, title: $('text-title').textContent, sub: $('text-sub').textContent, source: O.lastSource || '' } : null;
  };
  /** מציג בחלונית את הטקסט של לשונית (null = ריקה). לא פותח ולא סוגר את החלונית. */
  O.setText = function (st) {
    rawText = (st && st.text) || '';
    renderText();
    outEl.setAttribute('contenteditable', 'false');
    const eb = document.querySelector('#textpanel [data-tact="edit"]');
    if (eb) eb.classList.remove('active');
    $('text-title').textContent = (st && st.title) || PV.t('טקסט');
    $('text-sub').textContent = (st && st.sub) || '';
    O.lastSource = (st && st.source) || '';
    updateFooter();
  };
  function updateFooter() {
    const t = O.getText();
    const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
    $('text-footer').textContent = t ? PV.t('{w} מילים · {c} תווים', { w: words, c: t.length }) + (O.lastSource === 'ocr' ? ' · OCR' : '') : '';
  }
  // עריכה ידנית: הטקסט הערוך (כפי שמוצג) הופך לטקסט המלא
  outEl.addEventListener('input', () => { rawText = O.getText(); updateFooter(); });

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
      } else if (act === 'clear') { rawText = ''; outEl.textContent = ''; $('text-sub').textContent = ''; updateFooter(); }
    }));
    // לחיצה ימנית על חלונית הטקסט: הצג ניקוד (וי כשמופעל)
    const tctx = $('text-ctx'), tNiq = tctx.querySelector('[data-tcact="niqqud"]');
    const hideTctx = () => { tctx.hidden = true; };
    $('textpanel').addEventListener('contextmenu', (e) => {
      e.preventDefault();
      tNiq.classList.toggle('checked', !!PV.settings.showNiqqud);
      tctx.hidden = false;
      const w = tctx.offsetWidth, h = tctx.offsetHeight;
      tctx.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - w - 6)) + 'px';
      tctx.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - h - 6)) + 'px';
    });
    tNiq.addEventListener('click', (e) => { e.stopPropagation(); hideTctx(); O.setNiqqud(!PV.settings.showNiqqud); });
    document.addEventListener('click', hideTctx);
    window.addEventListener('blur', hideTctx);
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideTctx(); });
    $('btn-close-panel').addEventListener('click', () => { $('textpanel').hidden = true; $('btn-textpanel').classList.remove('active'); });
  });
})();
