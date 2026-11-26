/* צופה PDF+OCR — מנוע כתב יד „משקפת" (Mishkefet-v1, איתי ענבר).
   קוד המנוע ארוז בתוסף (vendor/mishkefet-runtime.js); המודל (כ-58MB) גדול ממגבלת החנות,
   ולכן יורד פעם אחת מ-GitHub ונשמר ב-IndexedDB. אפשר גם לבחור את קובץ המודל ידנית. */
(function () {
  'use strict';
  const PV = window.PV;
  const M = PV.mishkefet = {};
  M.MODEL_URL = 'https://raw.githubusercontent.com/Hadabadra/pdf-viewer/mishkefet-model/mishkefet-v1.bin';
  M.MODEL_PAGE = 'https://github.com/Hadabadra/pdf-viewer/raw/mishkefet-model/mishkefet-v1.bin';
  const DB = 'pv-mishkefet', STORE = 'assets', KEY = 'mishkefet-v1';

  function idb() {
    return new Promise((res, rej) => {
      if (!window.indexedDB) { rej(new Error('no indexedDB')); return; }
      const r = indexedDB.open(DB, 1);
      r.onupgradeneeded = () => r.result.createObjectStore(STORE);
      r.onsuccess = () => res(r.result);
      r.onerror = () => rej(r.error);
    });
  }
  async function cacheGet() {
    try {
      const db = await idb();
      return await new Promise((res) => {
        const q = db.transaction(STORE).objectStore(STORE).get(KEY);
        q.onsuccess = () => res(q.result || null);
        q.onerror = () => res(null);
      });
    } catch (e) { return null; }
  }
  async function cachePut(buf) {
    try {
      const db = await idb();
      await new Promise((res) => {
        const t = db.transaction(STORE, 'readwrite');
        t.objectStore(STORE).put(buf, KEY);
        t.oncomplete = res; t.onerror = res; t.onabort = res;
      });
    } catch (e) { /* בלי מטמון — יורד שוב בפעם הבאה */ }
  }
  M.clearCache = async () => {
    try { const db = await idb(); await new Promise((r) => { const t = db.transaction(STORE, 'readwrite'); t.objectStore(STORE).delete(KEY); t.oncomplete = r; t.onerror = r; }); } catch (e) { /* */ }
  };
  M.isCached = async () => !!(await cacheGet());
  /** גרסה מלאה: המודל ארוז בתוסף (אין צורך בהורדה) */
  M.isEmbedded = () => !!(window.__MK_EMBED__ && window.__MK_EMBED__.n);

  /** קובץ המודל: MKF1 + אורך כותרת + JSON (שם, מיקום ואורך של כל חלק) + הבייטים */
  function parseContainer(buf) {
    const u8 = new Uint8Array(buf);
    if (String.fromCharCode(u8[0], u8[1], u8[2], u8[3]) !== 'MKF1') throw new Error(PV.t('קובץ המודל אינו תקין'));
    const hl = new DataView(buf).getUint32(4, true);
    const hdr = JSON.parse(new TextDecoder().decode(u8.subarray(8, 8 + hl)));
    const base = 8 + hl, out = {};
    for (const [k, off, len] of hdr.parts) out[k] = u8.slice(base + off, base + off + len);
    return out;
  }
  const b64 = (s) => { const bin = atob(s), u = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u[i] = bin.charCodeAt(i); return u; };

  /** גרסה מלאה (מהגיטהאב): המודל ארוז בתוסף כ-vendor/mishkefet-model/mk.<n>.js (base64 של gzip) ונטען בתגי script —
   *  WHY: fetch לקובץ מקומי מהחבילה לא עובד ב-WebView של אוצריא */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      const s = document.createElement('script');
      s.onload = () => { s.remove(); resolve(); };
      s.onerror = () => reject(new Error('script ' + src));
      s.src = src; document.head.appendChild(s);
    });
  }
  async function embedded(stage) {
    const E = window.__MK_EMBED__;
    if (!E || !E.n) return null;
    stage(PV.t('טוען את מודל כתב היד מהתוסף...'));
    const parts = window.__MK_CHUNKS__ = window.__MK_CHUNKS__ || {};
    for (let k = 0; k < E.n; k++) if (!parts[k]) await loadScript('./vendor/mishkefet-model/mk.' + k + '.js');
    const gz = new Blob(Array.from({ length: E.n }, (_, k) => b64(parts[k])));
    window.__MK_CHUNKS__ = null;
    return await new Response(gz.stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer();
  }

  async function download(stage) {
    stage(PV.t('מוריד את מודל כתב היד (פעם אחת, כ-58MB)...'));
    const f = await PV.call('network.fetchFile', { url: M.MODEL_URL, maxBytes: 100 * 1024 * 1024, timeoutMs: 600000 });
    const r = await fetch(f.url);
    if (!r.ok) throw new Error('HTTP ' + r.status);
    const buf = await r.arrayBuffer();
    try { if (f.token) await PV.call('fs.revokeFile', { token: f.token }); } catch (e) { /* */ }
    return buf;
  }
  /** בחירת קובץ המודל מהמחשב — כשאין רשת או שהכתובת עוד לא אושרה באוצריא */
  M.pickModelFile = async function () {
    const r = await PV.call('fs.pickUserFile', { title: PV.t('בחירת קובץ מודל כתב היד (mishkefet-v1.bin)'), extensions: ['bin'] });
    if (!r || r.cancelled) return false;
    const buf = await (await fetch(r.url)).arrayBuffer();
    parseContainer(buf);
    await cachePut(buf);
    assetsPromise = null;
    return true;
  };

  let assetsPromise = null;
  function loadAssets(stage) {
    if (!assetsPromise) assetsPromise = (async () => {
      let buf = await cacheGet();
      if (!buf) {
        try { buf = await embedded(stage).catch(() => null) || await download(stage); }
        catch (e) {
          const err = new Error(PV.t('לא ניתן להוריד את מודל כתב היד ({r}). אפשר להוריד אותו ידנית ולבחור אותו בהגדרות ← OCR.', { r: PV.errMsg(e) }));
          err.code = 'mishkefet.model'; throw err;
        }
        parseContainer(buf);
        await cachePut(buf);
      }
      stage(PV.t('מכין את מנוע כתב היד...'));
      const a = parseContainer(buf), rt = window.__MK_RT__;
      return { wasm: a.wasm, model: a.model, lm: a.lm, words: new TextDecoder().decode(a.words),
        code: new TextDecoder().decode(b64(rt.code)), glue: b64(rt.glue), chars: rt.chars };
    })().catch((e) => { assetsPromise = null; throw e; });
    return assetsPromise;
  }

  let worker = null, ready = null, msgId = 0;
  const pending = new Map();
  function call(msg, onProgress) {
    return new Promise((resolve, reject) => {
      const id = ++msgId;
      pending.set(id, { resolve, reject, onProgress });
      worker.postMessage(Object.assign({ id }, msg));
    });
  }
  function start(stage) {
    if (ready) return ready;
    ready = (async () => {
      const a = await loadAssets(stage);
      stage(PV.t('מאתחל מנוע כתב יד...'));
      worker = new Worker(URL.createObjectURL(new Blob([a.code], { type: 'text/javascript' })));
      worker.onmessage = (e) => {
        const m = e.data, p = pending.get(m.id);
        if (!p) return;
        if (m.type === 'progress') { if (p.onProgress) p.onProgress(m.p); return; }
        pending.delete(m.id);
        if (m.type === 'error') p.reject(new Error(m.message)); else p.resolve(m);
      };
      worker.onerror = (e) => {
        const err = new Error(PV.t('שגיאה במנוע כתב היד') + ': ' + ((e && e.message) || ''));
        for (const p of pending.values()) p.reject(err);
        pending.clear();
      };
      await call({ type: 'init', wasm: a.wasm, glue: a.glue, model: a.model, lm: a.lm, words: a.words, chars: a.chars, torah: null });
    })().catch((e) => { M.reset(); throw e; });
    return ready;
  }
  M.reset = function () {
    if (worker) { try { worker.terminate(); } catch (e) { /* */ } }
    worker = null; ready = null;
    for (const p of pending.values()) p.reject(new Error(PV.t('בוטל')));
    pending.clear();
  };

  function gray(canvas) {
    const w = canvas.width, h = canvas.height;
    const px = canvas.getContext('2d', { willReadFrequently: true }).getImageData(0, 0, w, h).data;
    const g = new Uint8Array(w * h);
    for (let i = 0, j = 0; i < g.length; i++, j += 4) {
      const a = px[j + 3] / 255;
      g[i] = ((px[j] * a + 255 * (1 - a)) * 19595 + (px[j + 1] * a + 255 * (1 - a)) * 38470 + (px[j + 2] * a + 255 * (1 - a)) * 7471 + 0x8000) >> 16;
    }
    return { w, h, data: g };
  }

  /** זיהוי כתב יד בקנבס — מחזיר טקסט, שורה לכל שורה שזוהתה */
  M.recognize = async function (canvas, onProgress) {
    const stage = (s) => { if (PV.progress && PV.progress.update) PV.progress.update(s, null); };
    await start(stage);
    stage(PV.t('מזהה כתב יד...'));
    const m = await call({ type: 'recognize', img: gray(canvas), mode: 'auto' }, (p) => {
      if (!onProgress) return;
      if (p.stage === 'line') onProgress(p.n ? p.i / p.n : 0); else onProgress(p.fraction || 0);
    });
    if (onProgress) onProgress(1);
    return m.result.lines.map((l) => l.text).join('\n');
  };
})();
