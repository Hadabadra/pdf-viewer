/* ספריית PDF+OCR — לקוח לגשר אוצריא (שירות Windows מקומי): OCR של Windows (Windows.Media.Ocr).
   בלי הגשר, בלי חבילת השפה או בכל כשל — חוזרים בשקט למנוע Tesseract המובנה. (הועבר מצופה PDF+OCR 3.2.0) */
(function () {
  'use strict';
  const PORTS = [47917, 47918, 47919, 47920, 47921];
  const HOST = 'http://127.0.0.1:';
  const hasOtz = () => typeof window.Otzaria !== 'undefined' && window.Otzaria && typeof window.Otzaria.call === 'function';

  const B = (window.OcrBridge = {
    port: null, info: null, ocr: null, token: null,
    DOWNLOAD_URL: 'https://github.com/e0548433917-gif/otzaria-system-tools/releases/latest'
  });

  const TOKEN_KEY = 'bridgeToken';
  async function host(method, params) {
    const r = await window.Otzaria.call(method, params || {});
    if (r && r.success === false) throw new Error((r.error && r.error.message) || method);
    return r && Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r;
  }
  async function loadToken() {
    if (B.token) return B.token;
    try { const v = await host('storage.get', { key: TOKEN_KEY }); const t = v && typeof v === 'object' ? v.value : v; if (typeof t === 'string' && t.length >= 32) B.token = t; } catch (e) { /* אין אחסון */ }
    return B.token || null;
  }
  async function saveToken(t) { B.token = t; try { await host('storage.set', { key: TOKEN_KEY, value: t }); } catch (e) { /* ייבקש שוב בהפעלה הבאה */ } }

  function isIter(r) { return r && typeof r[Symbol.asyncIterator] === 'function'; }

  async function openStream(params) {
    if (!hasOtz()) throw new Error('unavailable');
    let r = window.Otzaria.call('network.fetchStream', params);
    if (isIter(r)) return r;
    r = await r;
    if (isIter(r)) return r;
    if (r && r.success === false) { const e = new Error((r.error && r.error.message) || 'unreachable'); e.code = r.error && r.error.code; throw e; }
    if (r && r.success && isIter(r.data)) return r.data;
    throw new Error('unexpected network.fetchStream result');
  }

  async function request(port, path, body, timeoutMs, method) {
    const p = {
      url: HOST + port + path,
      method: method || 'POST',
      headers: { 'X-Otzaria-Bridge': '1' },
      timeoutMs: Math.min(Math.max(timeoutMs || 30000, 1000), 120000)
    };
    if (B.token && path !== '/health') p.headers['X-Otzaria-Token'] = B.token;
    if (p.method === 'POST') {
      p.headers['Content-Type'] = 'application/json; charset=utf-8';
      p.body = JSON.stringify(body || {});
    }
    let status = 0, text = '';
    for await (const ch of await openStream(p)) {
      if (!ch) continue;
      if (ch.type === 'response') { status = ch.status; continue; }
      if (ch.type === 'data' && ch.body) text += ch.body;
    }
    let env = null;
    try { env = JSON.parse(text); } catch (e) { env = null; }
    if (!env || typeof env !== 'object') throw new Error('bad bridge response (HTTP ' + status + ')');
    if (env.ok) return env.data;
    const er = env.error || {};
    const e = new Error(er.message || ('bridge error (HTTP ' + status + ')'));
    e.code = er.code;
    throw e;
  }

  /** צימוד לגשר (גשר 3.0 ומעלה): נפתח חלון אישור במחשב. חייב להיות ביוזמת המשתמשת. */
  B.pair = async function () {
    if (!B.port) await B.probe();
    if (!B.port) throw new Error('הגשר לא נמצא');
    const d = await request(B.port, '/pair/request', { client: 'pdf-viewer', name: 'ספריית PDF+OCR' }, 120000);
    if (!d || !d.token) throw new Error('הצימוד נדחה');
    await saveToken(d.token);
    return true;
  };

  /** קריאה לגשר. noPair — בלי לפתוח בקשת צימוד אם חסר (בדיקות רקע). */
  B.call = async function (path, body, timeoutMs, noPair) {
    if (!B.port) throw new Error('bridge not connected');
    await loadToken();
    try { return await request(B.port, path, body, timeoutMs); }
    catch (e) {
      if (e.code !== 'unpaired' || noPair) throw e;
      await B.pair();
      return request(B.port, path, body, timeoutMs);
    }
  };

  /** חיפוש קבצים זורם. onHit(hit) לכל תוצאה; signal.stop = true לעצירה. */
  B.search = async function (params, onHit, signal) {
    if (!B.port) throw new Error('bridge not connected');
    await loadToken();
    let retried = false;
    for (;;) {
      const p = { url: HOST + B.port + '/fs/search', method: 'POST', timeoutMs: 120000,
        headers: { 'X-Otzaria-Bridge': '1', 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(params) };
      if (B.token) p.headers['X-Otzaria-Token'] = B.token;
      let status = 0, buf = '', err = null;
      for await (const ch of await openStream(p)) {
        if (signal && signal.stop) return;
        if (!ch) continue;
        if (ch.type === 'response') { status = ch.status; continue; }
        if (ch.type !== 'data' || !ch.body) continue;
        buf += ch.body;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) {
          const line = buf.slice(0, i).trim(); buf = buf.slice(i + 1);
          if (!line) continue;
          let o = null; try { o = JSON.parse(line); } catch (e) { continue; }
          if (o.ok === false && o.error) err = o.error;
          else if (o.type === 'hit') onHit(o);
        }
      }
      if (!err && buf.trim()) { try { const o = JSON.parse(buf); if (o.ok === false && o.error) err = o.error; } catch (e) { /* סוף זרם */ } }
      if (err && err.code === 'unpaired' && !retried) { retried = true; await B.pair(); continue; }
      if (err) { const e = new Error(err.message || 'search failed'); e.code = err.code; throw e; }
      return;
    }
  };

  /** שמות תיקיות לחיפוש: כוננים ותיקיות מוכרות */
  B.roots = async function () {
    const d = await B.call('/fs/roots', {}, 8000);
    const out = (d.known || []).map((k) => ({ name: k.name, path: k.path }));
    for (const dr of d.drives || []) out.push({ name: 'כונן ' + dr.path, path: dr.path });
    return out;
  };

  /** קורא קובץ PDF דרך הגשר ומחזיר data: URL */
  B.readPdf = async function (path) {
    const d = await B.call('/fs/read', { path, maxBytes: 50 * 1024 * 1024 }, 120000);
    if (d.truncated) throw new Error('הקובץ גדול מ-50MB');
    return 'data:application/pdf;base64,' + d.content;
  };

  /** סריקת הפורטים ב-GET /health. מחזיר את מידע הגשר או null. */
  B.probe = async function () {
    B.port = null; B.info = null; B.ocr = null;
    if (!hasOtz()) return null;
    const found = await Promise.all(PORTS.map((port) =>
      request(port, '/health', null, 2500, 'GET')
        .then((d) => (d && d.name === 'otzaria-bridge' ? { port, info: d } : null))
        .catch(() => null)));
    const hit = found.find(Boolean);
    if (!hit) return null;
    B.port = hit.port; B.info = hit.info;
    return B.info;
  };

  /** מצב מנוע ה-OCR של Windows: { bridge, available, hebrew, maxImageDimension } */
  B.checkOcr = async function () {
    const st = { bridge: false, available: false, hebrew: false, maxImageDimension: 10000 };
    try {
      if (await B.probe()) {
        st.bridge = true;
        await loadToken();
        const d = await B.call('/ocr/status', {}, 8000, true);
        st.available = !!d.available;
        st.hebrew = !!d.hebrew;
        if (d.maxImageDimension) st.maxImageDimension = d.maxImageDimension;
      }
    } catch (e) { if (e && e.code === 'unpaired') st.unpaired = true; /* אחרת: גשר ישן בלי /ocr */ }
    B.ocr = st;
    return st;
  };

  /** האם מנוע Windows מוכן לשימוש (גשר + חבילת עברית) */
  B.ocrReady = () => !!(B.ocr && B.ocr.bridge && B.ocr.available && B.ocr.hebrew);

  /** OCR של קנבס דרך הגשר. מחזיר טקסט, או זורק שגיאה (הקורא חוזר ל-Tesseract). */
  B.recognizeCanvas = async function (canvas) {
    const max = (B.ocr && B.ocr.maxImageDimension) || 10000;
    let c = canvas;
    const big = Math.max(canvas.width, canvas.height);
    if (big > max) {
      const k = max / big;
      c = document.createElement('canvas');
      c.width = Math.max(1, Math.floor(canvas.width * k));
      c.height = Math.max(1, Math.floor(canvas.height * k));
      c.getContext('2d').drawImage(canvas, 0, 0, c.width, c.height);
    }
    const data = await B.call('/ocr/recognize', { image: c.toDataURL('image/png'), lang: 'he-IL' }, 120000);
    const lines = Array.isArray(data.lines) ? data.lines.map((l) => l.text) : null;
    return lines ? lines.join('\n') : String(data.text || '');
  };
})();
