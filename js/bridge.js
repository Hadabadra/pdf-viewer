/* צופה PDF+OCR — לקוח לגשר אוצריא (שירות Windows מקומי).
   מגרסה 3.6.0: צימוד לגשר (נדרש מגשר 3.0), וזיהוי טקסט דרך כלי החיתוך של Windows (גשר 3.1.0 ומעלה).
   ה-OCR של Windows (Windows.Media.Ocr) הוסר: אין לו עברית. */
(function () {
  'use strict';
  const PV = window.PV;

  const PORTS = [47917, 47918, 47919, 47920, 47921];
  const HOST = 'http://127.0.0.1:';
  PV.BRIDGE_URL = 'https://github.com/e0548433917-gif/otzaria-system-tools/releases/latest';
  PV.BRIDGE_MIN = '3.1.0';

  const B = (PV.bridge = { port: null, info: null });

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

  // ── צימוד לגשר (3.0): מפתח אקראי שהגשר נותן אחרי אישור המשתמש בחלון שנפתח במחשב ──
  const TOKEN_KEY = 'bridgeToken';
  let token = null, tokenLoaded = false, pairing = null;
  async function loadToken() {
    if (tokenLoaded) return token;
    tokenLoaded = true;
    const v = await PV.store.get(TOKEN_KEY, null);
    token = typeof v === 'string' && v.length >= 32 ? v : null;
    return token;
  }
  async function saveToken(t) { token = t; await PV.store.set(TOKEN_KEY, t); }

  async function request(port, path, body, timeoutMs, method) {
    const p = {
      url: HOST + port + path,
      method: method || 'POST',
      headers: token ? { 'X-Otzaria-Bridge': '1', 'X-Otzaria-Token': token } : { 'X-Otzaria-Bridge': '1' },
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

  /** סריקת הפורטים ב-GET /health (פתוח בלי צימוד). מחזיר את מידע הגשר או null. */
  B.probe = async function () {
    B.port = null; B.info = null; B.direct = null;
    if (!PV.hasOtz()) return null;
    await loadToken();
    const found = await Promise.all(PORTS.map((port) =>
      request(port, '/health', null, 2500, 'GET')
        .then((d) => (d && d.name === 'otzaria-bridge' ? { port, info: d } : null))
        .catch(() => null)));
    const hit = found.find(Boolean);
    if (!hit) return null;
    B.port = hit.port; B.info = hit.info;
    return B.info;
  };

  /** בקשת צימוד: הגשר מציג חלון אישור במחשב (עד שתי דקות). */
  B.pair = async function () {
    if (pairing) return pairing;
    pairing = (async () => {
      PV.toast(PV.t('אשרו את החיבור בחלון "גשר אוצריא — בקשת גישה" שנפתח במחשב'), { long: true });
      const d = await request(B.port, '/pair/request', { client: 'pdf-viewer', name: 'צופה PDF+OCR' }, 130000);
      await saveToken(d.token);
    })();
    try { await pairing; } finally { pairing = null; }
  };

  B.call = async function (path, body, timeoutMs) {
    if (!B.port) throw new Error('bridge not connected');
    await loadToken();
    try { return await request(B.port, path, body, timeoutMs); }
    catch (e) {
      if (!e || e.code !== 'unpaired') throw e;
      await B.pair();
      return request(B.port, path, body, timeoutMs);
    }
  };

  /** האם גרסת הגשר a נמוכה מ-b (למשל "3.0.0" < "3.1.0") */
  B.versionLt = function (a, b) {
    const x = String(a || '0').split('.').map(Number), y = String(b).split('.').map(Number);
    for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); }
    return false;
  };

  // ── כלי החיתוך (גשר 3.1.0+) ───────────────────────────────────────────
  /** { installed: bool|null, running: bool, scriptOverride: bool } */
  B.snipStatus = () => B.call('/snip/status', {}, 15000);
  /** רשימת הרכיבים בחלון כלי החיתוך הפתוח (לאבחון שמות כפתורים) */
  B.snipDump = () => B.call('/snip/dump', {}, 30000);

  /** מזהה טקסט בקנבס. קודם המנוע הישיר (גשר 3.2+); אם אינו זמין — כלי החיתוך דרך החלון.
   *  B.lastRun מתעד באיזה מנוע זה בוצע בפועל ({engine:'oneocr'|'snip-ui', reason?, ms?}). */
  B.lastRun = null;
  B.snipRecognizeCanvas = async function (canvas) {
    if (!B.port && !(await B.probe())) throw new Error(PV.t('הגשר לא זמין (לא מותקן או לא פועל)'));
    if (B.versionLt(B.info && B.info.version, PV.BRIDGE_MIN)) {
      throw new Error(PV.t('גרסת הגשר ({v}) ישנה — נדרשת {m} ומעלה', { v: (B.info && B.info.version) || '?', m: PV.BRIDGE_MIN }));
    }
    let reason = '';
    if (B.direct !== false) {
      try {
        // JPEG איכותי: קידוד מהיר בהרבה מ-PNG (לחזרה ל-PNG: 'image/png' בלי פרמטר איכות)
        const te = Date.now();
        const img = canvas.toDataURL('image/jpeg', 0.95);
        const enc = Date.now() - te;
        const tc = Date.now();
        const d = await B.call('/oneocr/recognize', { image: img }, 120000);
        B.direct = true;
        B.lastRun = { engine: 'oneocr', ms: (d && d.ms) || null, enc, call: Date.now() - tc, size: canvas.width + '×' + canvas.height };
        if (d && d.ms) { B.stats.n++; B.stats.ocr += d.ms.ocr || 0; B.stats.decode += d.ms.decode || 0; }
        return String((d && d.text) || '');
      } catch (e) {
        if (!e || (e.code !== 'unsupported' && e.code !== 'not_found' && e.code !== 'ocr_failed')) throw e;
        reason = PV.errMsg(e);
        if (e.code !== 'ocr_failed') { B.direct = false; B.directReason = reason; } // כשל חד-פעמי לא מכבה את המנוע
      }
    } else reason = B.directReason || PV.t('לא זמין');
    B.stats.fb++;
    B.lastRun = { engine: 'snip-ui', reason };
    const d = await B.call('/snip/ocr', { image: canvas.toDataURL('image/png'), timeoutSec: 30 }, 120000);
    return String((d && d.text) || '');
  };

  /** האם המנוע הישיר זמין (גשר 3.2+ וקבצי כלי החיתוך נמצאו). המצב נשמר עד הבדיקה הבאה של הגשר. */
  B.direct = null;
  B.directReason = '';
  B.stats = { n: 0, ocr: 0, decode: 0, fb: 0 }; // זמני המנוע הישיר (מילישניות) וספירת נפילות לכלי החיתוך
  B.directAvailable = async function () {
    if (B.direct !== null) return B.direct;
    try {
      if (!B.port && !(await B.probe())) return false;
      const s = await B.call('/oneocr/status', {}, 30000);
      B.direct = !!(s && s.available);
      B.directReason = (s && s.error) || '';
    } catch (e) { B.direct = false; B.directReason = PV.errMsg(e); }
    return B.direct;
  };

  /** מבנה מלא: שורות, מילים וקואורדינטות בפיקסלים של הקנבס (לשכבת טקסט מדויקת). זורק שגיאה אם המנוע הישיר לא זמין. */
  B.ocrLayoutCanvas = async function (canvas) {
    if (!B.port && !(await B.probe())) throw new Error(PV.t('הגשר לא זמין (לא מותקן או לא פועל)'));
    return B.call('/oneocr/recognize', { image: canvas.toDataURL('image/png') }, 120000);
  };

  // ── חיפוש קובץ לפי שם במחשב (מ-3.6.0) ──
  /** חיפוש קבצים זורם (NDJSON). onHit לכל תוצאה; signal.stop = true לעצירה. */
  B.search = async function (params, onHit, signal) {
    if (!B.port && !(await B.probe())) throw new Error(PV.t('הגשר לא זמין (לא מותקן או לא פועל)'));
    await loadToken();
    let retried = false;
    for (;;) {
      const p = { url: HOST + B.port + '/fs/search', method: 'POST', timeoutMs: 120000,
        headers: { 'X-Otzaria-Bridge': '1', 'Content-Type': 'application/json; charset=utf-8' }, body: JSON.stringify(params) };
      if (token) p.headers['X-Otzaria-Token'] = token;
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
})();
