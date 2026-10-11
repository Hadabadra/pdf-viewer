/* ספריית PDF+OCR — מנוע זיהוי טקסט: Tesseract.js מובנה (עברית, בלי רשת) או OCR של Windows דרך הגשר.
   (הועבר מצופה PDF+OCR 3.2.0; ללא ניהול שפות נוספות. הממשק נמצא ב-app.js.) */
(function () {
  'use strict';
  const O = (window.OcrEngine = { opts: { engine: 'tesseract', lines: true } });

  let worker = null, workerPromise = null, progressHook = null;
  const loaded = {};
  function loadScript(src) {
    if (loaded[src]) return loaded[src];
    loaded[src] = new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.src = src;
      s.onload = () => resolve();
      s.onerror = () => { delete loaded[src]; reject(new Error('טעינת מנוע הזיהוי נכשלה')); };
      document.head.appendChild(s);
    });
    return loaded[src];
  }

  async function getWorker() {
    if (worker) return worker;
    if (workerPromise) return workerPromise;
    workerPromise = (async () => {
      await loadScript('./vendor/tesseract.min.js');
      if (!window.__OTZ_WORKER_BUNDLE_B64__) await loadScript('./vendor/ocr-worker-loader.js');
      const assets = Object.assign({}, window.__OTZ_BASE_ASSETS_B64__);
      const assetsJs = 'self.__OTZ_OCR_B64__ = ' + JSON.stringify(assets) + ';\n';
      const bin = atob(window.__OTZ_WORKER_BUNDLE_B64__);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
      const blobUrl = URL.createObjectURL(new Blob([assetsJs, bytes.buffer], { type: 'text/javascript' }));
      const w = await Tesseract.createWorker('heb', 1, {
        workerPath: blobUrl,
        workerBlobURL: false,
        corePath: './vendor/tesseract-core-simd-lstm.wasm.js',
        langPath: './vendor/lang-data/',
        gzip: false,
        logger: (m) => { if (progressHook && m.status === 'recognizing text' && typeof m.progress === 'number') progressHook(m.progress); }
      });
      worker = w;
      return w;
    })();
    try { return await workerPromise; } catch (e) { workerPromise = null; throw e; }
  }

  O.resetWorker = async function () {
    if (worker) { try { await worker.terminate(); } catch (e) { /* כבר נסגר */ } }
    worker = null; workerPromise = null;
  };

  function tidy(text) {
    let t = String(text || '').replace(/\r/g, '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
    if (!O.opts.lines) t = t.replace(/([^\n])\n(?!\n)/g, '$1 ');
    return t;
  }

  /** האם OCR של Windows ישמש בפועל (נבחר בהגדרות + הגשר מוכן). */
  O.usingWindows = () => O.opts.engine === 'windows' && !!(window.OcrBridge && window.OcrBridge.ocrReady());

  /** OCR על קנבס. onProgress(0..1) אופציונלי. כשל בגשר — חזרה שקטה ל-Tesseract. */
  O.recognize = async function (canvas, onProgress) {
    if (O.usingWindows()) {
      try {
        const t = await window.OcrBridge.recognizeCanvas(canvas);
        if (onProgress) onProgress(1);
        return tidy(t);
      } catch (e) { /* חזרה ל-Tesseract */ }
    }
    const w = await getWorker();
    progressHook = onProgress || null;
    try {
      const { data } = await w.recognize(canvas);
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
})();
