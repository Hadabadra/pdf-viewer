/* צופה PDF+OCR — לקוח לגשר אוצריא (שירות Windows מקומי): OCR של Windows (Windows.Media.Ocr).
   בלי הגשר, בלי חבילת השפה או בכל כשל — הצופה חוזר בשקט למנוע Tesseract המובנה. */
(function () {
  'use strict';
  const PV = window.PV;

  const PORTS = [47917, 47918, 47919, 47920, 47921];
  const HOST = 'http://127.0.0.1:';
  PV.BRIDGE_URL = 'https://github.com/e0548433917-gif/otzaria-system-tools/releases/latest';

  const B = (PV.bridge = { port: null, info: null, ocr: null, token: null });
  const TOKEN_KEY = 'bridgeToken';

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

  async function loadToken() {
    if (B.token) return B.token;
    try {
      const r = await window.Otzaria.call('storage.get', { key: TOKEN_KEY });
      const v = r && r.success !== false ? (Object.prototype.hasOwnProperty.call(r, 'data') ? r.data : r) : null;
      const t = v && typeof v === 'object' ? v.value : v;
      if (typeof t === 'string' && t.length >= 32) B.token = t;
    } catch (e) { /* אין אחסון */ }
    return B.token;
  }

  /** צימוד לגשר 3.x (חלון אישור במחשב). חייב להיות ביוזמת המשתמשת. */
  B.pair = async function () {
    if (!B.port) await B.probe();
    if (!B.port) throw new Error(PV.t('הגשר לא נמצא'));
    const d = await request(B.port, '/pair/request', { client: 'pdf-viewer-old', name: 'צופה PDF+OCR' }, 120000);
    if (!d || !d.token) throw new Error(PV.t('הצימוד נדחה'));
    B.token = d.token;
    try { await window.Otzaria.call('storage.set', { key: TOKEN_KEY, value: d.token }); } catch (e) { /* יתבקש שוב בהפעלה הבאה */ }
    return true;
  };

  /** noPair — בלי לפתוח בקשת צימוד (בדיקות רקע) */
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

  /** חיפוש קבצים זורם (NDJSON). onHit לכל תוצאה; signal.stop = true לעצירה. */
  B.search = async function (params, onHit, signal) {
    if (!B.port) throw new Error('bridge not connected');
    await loadToken();
    let retried = false;
    for (;;) {
      const p = { url: HOST + B.port + '/fs/search', method: 'POST', timeoutMs: 120000,
        headers: { 'X-Otzaria-Bridge': '1', 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(params) };
      if (B.token) p.headers['X-Otzaria-Token'] = B.token;
      let buf = '', err = null;
      const feed = (line) => {
        line = line.trim(); if (!line) return;
        let o = null; try { o = JSON.parse(line); } catch (e) { return; }
        if (o.ok === false && o.error) err = o.error; else if (o.type === 'hit') onHit(o);
      };
      for await (const ch of await openStream(p)) {
        if (signal && signal.stop) return;
        if (!ch || ch.type !== 'data' || !ch.body) continue;
        buf += ch.body;
        let i;
        while ((i = buf.indexOf('\n')) >= 0) { feed(buf.slice(0, i)); buf = buf.slice(i + 1); }
      }
      feed(buf);
      if (err && err.code === 'unpaired' && !retried) { retried = true; await B.pair(); continue; }
      if (err) { const e = new Error(err.message || 'search failed'); e.code = err.code; throw e; }
      return;
    }
  };

  B.roots = async function () {
    const d = await B.call('/fs/roots', {}, 8000);
    const out = (d.known || []).map((k) => ({ name: k.name, path: k.path }));
    for (const dr of d.drives || []) out.push({ name: PV.t('כונן') + ' ' + dr.path, path: dr.path });
    return out;
  };

  B.readFile = async function (path) {
    const d = await B.call('/fs/read', { path, maxBytes: 50 * 1024 * 1024 }, 120000);
    if (d.truncated) throw new Error(PV.t('הקובץ גדול מ-50MB'));
    return 'data:' + (d.mime || 'application/octet-stream') + ';base64,' + d.content;
  };

  /** חלון חיפוש קובץ לפי שם, ופתיחת התוצאה שנבחרה */
  B.searchDialog = async function () {
    if (!PV.hasOtz() || !(await B.probe())) { PV.error(PV.t('חיפוש קבצים דורש את גשר אוצריא פועל')); return; }
    let roots;
    try { roots = await B.roots(); }
    catch (e) {
      if (e.code !== 'unpaired') { PV.error(PV.errMsg(e)); return; }
      try { await B.pair(); roots = await B.roots(); } catch (e2) { PV.error(PV.errMsg(e2)); return; }
    }
    const sig = { stop: false };
    const scrim = document.createElement('div');
    scrim.style.cssText = 'position:fixed;inset:0;z-index:300;display:flex;align-items:center;justify-content:center;background:var(--color-scrim);padding:1em';
    const box = document.createElement('div');
    box.style.cssText = 'width:min(34em,100%);max-height:90%;overflow:auto;background:var(--color-surface);color:var(--color-on-surface);border-radius:var(--radius-lg);padding:1.2em;display:flex;flex-direction:column;gap:.7em';
    const title = document.createElement('div'); title.style.fontWeight = '700'; title.textContent = PV.t('חיפוש קובץ במחשב');
    const sel = document.createElement('select'); sel.className = 'input';
    roots.forEach((r, i) => { const o = document.createElement('option'); o.value = i; o.textContent = r.name; sel.appendChild(o); });
    const q = document.createElement('input'); q.className = 'input'; q.placeholder = PV.t('חלק משם הקובץ (אפשר * ?)');
    const info = document.createElement('div'); info.className = 'muted';
    const res = document.createElement('div'); res.style.cssText = 'max-height:40vh;overflow:auto;display:flex;flex-direction:column;gap:.2em';
    const row = document.createElement('div'); row.style.cssText = 'display:flex;gap:.5em';
    const go = document.createElement('button'); go.className = 'btn'; go.textContent = PV.t('חיפוש');
    const close = document.createElement('button'); close.className = 'btn tonal'; close.textContent = PV.t('סגירה');
    row.append(go, close); box.append(title, sel, q, info, res, row); scrim.appendChild(box); document.body.appendChild(scrim);
    const shut = () => { sig.stop = true; scrim.remove(); };
    close.onclick = shut;
    scrim.addEventListener('mousedown', (e) => { if (e.target === scrim) shut(); });
    let n = 0;
    const run = async () => {
      const text = q.value.trim(); if (!text) return;
      sig.stop = true; await new Promise((r) => setTimeout(r, 60)); sig.stop = false; n = 0; res.textContent = ''; info.textContent = PV.t('מחפש…');
      try {
        await B.search({ root: roots[+sel.value].path, query: text, includeDirs: false, maxResults: 300,
          extensions: ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'docx', 'epub', 'txt', 'md'] }, (h) => {
          n++;
          const b = document.createElement('button'); b.className = 'btn tonal'; b.style.cssText = 'text-align:right;display:block;width:100%';
          const nm = document.createElement('div'); nm.textContent = h.name;
          const pa = document.createElement('div'); pa.className = 'muted'; pa.dir = 'ltr'; pa.style.textAlign = 'right'; pa.textContent = h.path;
          b.append(nm, pa);
          b.onclick = async () => {
            shut();
            try { PV.toast(PV.t('טוען…')); const url = await B.readFile(h.path); await PV.files.openUrl(url, h.name, { source: null }); }
            catch (e) { PV.error(PV.errMsg(e)); }
          };
          res.appendChild(b); info.textContent = PV.t('נמצאו') + ' ' + n;
        }, sig);
        if (!sig.stop) info.textContent = n ? PV.t('נמצאו') + ' ' + n : PV.t('לא נמצאו קבצים');
      } catch (e) { info.textContent = PV.errMsg(e); }
    };
    go.onclick = run; q.onkeydown = (e) => { if (e.key === 'Enter') run(); };
    setTimeout(() => q.focus(), 30);
  };

  /** מצב מנוע ה-OCR של Windows: { bridge, available, hebrew, maxImageDimension } */
  B.checkOcr = async function () {
    const st = { unpaired: false, bridge: false, available: false, hebrew: false, maxImageDimension: 10000 };
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
