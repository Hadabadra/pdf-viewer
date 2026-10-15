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

  /** כתיבת קובץ בינארי דרך הגשר (גשר 3.3+): חתיכות של 1MB; ללא דריסה — קיים → "שם (2).pdf". מחזיר את הנתיב הסופי. */
  function toBase64(u8) {
    return new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(String(fr.result).split(',')[1] || '');
      fr.onerror = () => rej(fr.error || new Error('read failed'));
      fr.readAsDataURL(new Blob([u8]));
    });
  }
  B.writeBinary = async function (path, bytes, opts) {
    if (!B.port && !(await B.probe())) throw new Error(PV.t('הגשר לא זמין (לא מותקן או לא פועל)'));
    const overwrite = !!(opts && opts.overwrite), CH = 1024 * 1024;
    let final = path;
    for (let off = 0; off < Math.max(bytes.length, 1); off += CH) {
      const r = await B.call('/fs/write-binary', { path: final, content: await toBase64(bytes.subarray(off, off + CH)), append: off > 0, unique: off === 0 && !overwrite, overwrite: off === 0 && overwrite, makeDirs: true }, 120000);
      final = (r && r.path) || final;
    }
    return final;
  };

  /** חלון "שמירה בשם" של Windows דרך הגשר (גשר 3.4+, בלי מגבלת הגודל של אוצריא). מחזיר { cancelled, path }. */
  B.pickSaveFile = async function (o) {
    if (!B.port && !(await B.probe())) throw new Error(PV.t('הגשר לא זמין (לא מותקן או לא פועל)'));
    return B.call('/fs/pick-save-file', o || {}, 120000);
  };

  /** מבנה מלא: שורות, מילים וקואורדינטות בפיקסלים של הקנבס (לשכבת טקסט מדויקת). זורק שגיאה אם המנוע הישיר לא זמין. */
  B.ocrLayoutCanvas = async function (canvas) {
    if (!B.port && !(await B.probe())) throw new Error(PV.t('הגשר לא זמין (לא מותקן או לא פועל)'));
    return B.call('/oneocr/recognize', { image: canvas.toDataURL('image/jpeg', 0.95) }, 120000);
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

  /** חיפוש קובץ במחשב תוך כדי הקלדה: שורת חיפוש במסך הפתיחה ורשימה נפתחת */
  const EXT = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'docx', 'epub', 'txt', 'md'];
  B.initLiveSearch = function (input, ul, wrap) {
    if (!input || !ul) return;
    if (!PV.hasOtz()) { if (wrap) wrap.hidden = true; return; }
    let roots = null, sig = { stop: true }, seq = 0;
    const MAX = 100;
    const msg = (t) => { ul.innerHTML = ''; const li = document.createElement('li'); li.className = 'panel-empty'; li.textContent = t; ul.appendChild(li); };
    const close = () => { sig.stop = true; seq++; ul.hidden = true; ul.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); };
    async function getRoots() {
      if (roots) return roots;
      if (!(await B.probe())) throw new Error(PV.t('חיפוש קבצים דורש את גשר אוצריא פועל'));
      try { roots = await B.roots(); }
      catch (e) { if (e.code !== 'unpaired') throw e; await B.pair(); roots = await B.roots(); }
      return roots;
    }
    async function open(h) {
      close(); input.value = '';
      try { PV.toast(PV.t('טוען…')); const url = await B.readFile(h.path); await PV.files.openUrl(url, h.name, { source: null }); }
      catch (e) { PV.error(PV.errMsg(e)); }
    }
    async function run() {
      const text = input.value.trim();
      sig.stop = true;
      if (text.length < 2) { close(); return; }
      const my = ++seq, s = { stop: false }; sig = s;
      ul.hidden = false; input.setAttribute('aria-expanded', 'true'); msg(PV.t('מחפש…'));
      let n = 0; const seen = new Set();
      try {
        for (const r of await getRoots()) {
          if (s.stop || n >= MAX) break;
          await B.search({ root: r.path, query: text, includeDirs: false, maxResults: MAX - n, extensions: EXT }, (h) => {
            if (s.stop || n >= MAX || seen.has(h.path)) return;
            seen.add(h.path);
            if (!n) ul.innerHTML = '';
            n++;
            const li = PV.files.makeItem(PV.files.fileIcon(h.name), h.name, h.path, () => open(h));
            const sub = li.querySelector('.li-sub'); if (sub) sub.dir = 'ltr';
            li.addEventListener('contextmenu', (e) => { e.preventDefault(); PV.toast(h.path, { info: true }); });
            ul.appendChild(li);
          }, s);
        }
        if (my === seq && !s.stop && !n) msg(PV.t('לא נמצאו קבצים'));
      } catch (e) { if (my === seq) msg(PV.errMsg(e)); }
    }
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
    input.addEventListener('input', PV.debounce(run, 300));
    PV.listNav(input, ul, { onEscape: (e) => { if (!ul.hidden) { e.stopPropagation(); close(); } else if (input.value) { e.stopPropagation(); input.value = ''; } } });
    document.addEventListener('mousedown', (e) => { if (!(wrap || ul).contains(e.target)) { sig.stop = true; ul.hidden = true; input.setAttribute('aria-expanded', 'false'); } });
    input.addEventListener('focus', () => { if (ul.children.length && input.value.trim().length >= 2) { ul.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
  };
})();
