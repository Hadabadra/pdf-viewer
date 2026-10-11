/* צופה PDF+OCR — לקוח לגשר אוצריא (שירות Windows מקומי): OCR של Windows (Windows.Media.Ocr).
   בלי הגשר, בלי חבילת השפה או בכל כשל — הצופה חוזר בשקט למנוע Tesseract המובנה. */
(function () {
  'use strict';
  const PV = window.PV;

  const PORTS = [47917, 47918, 47919, 47920, 47921];
  const HOST = 'http://127.0.0.1:';
  PV.BRIDGE_URL = 'https://github.com/e0548433917-gif/otzaria-system-tools/releases/latest';

  const B = (PV.bridge = { port: null, info: null, ocr: null });

  function isIter(r) { return r && typeof r[Symbol.asyncIterator] === 'function'; }

  async function openStream(params) {
    if (!PV.hasOtz()) throw new Error('unavailable');
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
      timeoutMs: Math.min(Math.max(timeoutMs || 30000, 1000), 120000),
    };
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

  /** סריקת הפורטים ב-GET /health. מחזיר את מידע הגשר או null. */
  B.probe = async function () {
    B.port = null; B.info = null; B.ocr = null;
    if (!PV.hasOtz()) return null;
    const found = await Promise.all(PORTS.map((port) =>
      request(port, '/health', null, 2500, 'GET')
        .then((d) => (d && d.name === 'otzaria-bridge' ? { port, info: d } : null))
        .catch(() => null)));
    const hit = found.find(Boolean);
    if (!hit) return null;
    B.port = hit.port; B.info = hit.info;
    return B.info;
  };

  B.call = function (path, body, timeoutMs) {
    if (!B.port) throw new Error('bridge not connected');
    return request(B.port, path, body, timeoutMs);
  };

  /** מצב מנוע ה-OCR של Windows: { bridge, available, hebrew, maxImageDimension } */
  B.checkOcr = async function () {
    const st = { bridge: false, available: false, hebrew: false, maxImageDimension: 10000 };
    try {
      if (await B.probe()) {
        st.bridge = true;
        const d = await B.call('/ocr/status', {}, 8000);
        st.available = !!d.available;
        st.hebrew = !!d.hebrew;
        if (d.maxImageDimension) st.maxImageDimension = d.maxImageDimension;
      }
    } catch (e) { /* גשר ישן בלי /ocr, או לא זמין */ }
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
