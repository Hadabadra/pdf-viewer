/* צופה PDF+OCR — לקוח לגשר אוצריא (שירות Windows מקומי).
   מגרסה 3.6.0: צימוד לגשר, וזיהוי טקסט דרך כלי החיתוך של Windows.
   5.8.0: הגשר ("אחת שאלתי") התחיל מספור חדש מ-1.0.0, שהוא חדש מכל 3.x — ראו versionLt.
   ה-OCR של Windows (Windows.Media.Ocr) הוסר: אין לו עברית. */
(function () {
  'use strict';
  const PV = window.PV;

  const PORTS = [47917, 47918, 47919, 47920, 47921];
  const HOST = 'http://127.0.0.1:';
  PV.BRIDGE_URL = 'https://github.com/Hadabadra/achat-shaalti/releases/latest';
  PV.BRIDGE_MIN = '1.0.1';            // גשר "אחת שאלתי" (מספור 1.x/2.x); לגשר הישן (3.x) ראו MINS למטה
  PV.BRIDGE_OPENWITH_MIN = '1.0.2'; // "פתח באמצעות" של Windows ← התוסף (/pdf/inbox)

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
  const TOKEN_KEY = 'bridgeToken';   // הגשר הישן (3.x) — המפתח הקיים נשמר כמו שהיה
  const tokenKey = () => (B.info && B.family(B.info.version) === 'new' ? TOKEN_KEY + '_new' : TOKEN_KEY);
  let token = null, tokenLoaded = false, pairing = null;
  async function loadToken() {
    if (tokenLoaded) return token;
    tokenLoaded = true;
    const v = await PV.store.get(tokenKey(), null);
    token = typeof v === 'string' && v.length >= 32 ? v : null;
    return token;
  }
  async function saveToken(t) { token = t; await PV.store.set(tokenKey(), t); }

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
    const hits = found.filter(Boolean);
    const hit = hits.find((h) => B.family(h.info && h.info.version) === 'new') || hits[0];   // אם רצים שניהם — מעדיפים את החדש (יש לו יותר יכולות)
    if (!hit) return null;
    B.port = hit.port; B.info = hit.info;
    tokenLoaded = false; await loadToken();   // מפתח הצימוד נשמר בנפרד לכל גשר
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

  /** תאימות לשני הגשרים: הישן (3.x, למשל 3.9.1) והחדש ("אחת שאלתי", 1.x/2.x).
   *  כל יכולת נבדקת מול הגרסה המינימלית של *אותו* גשר (משפחה), ולא מול מספור משותף — כך 3.9.1 לא נחשב "ישן" כי 1.0.1 קטן ממנו.
   *  יכולות שקיימות רק בגשר החדש (פתיחה בתוכנה אחרת, כלי PDF) — לא נתמכות בישן. */
  const MINS = {
    base:     { old: '3.1.0', new: '1.0.1' },   // סריקת פורטים, OCR/חיפוש קבצים
    write:    { old: '3.4.0', new: '1.0.0' },   // /fs/write-binary, /fs/pick-save-file
    openwith: { new: '1.0.2' },                 // /pdf/inbox (פתח באמצעות)
    pdftools: { new: '1.0.2' },                 // /pdf/op/*, /pdf/engines
  };
  const major = (v) => Number(String(v || '0').split('.')[0]) || 0;
  B.family = (v) => (major(v === undefined ? (B.info && B.info.version) : v) >= 3 ? 'old' : 'new');
  const numLt = (a, b2) => { const x = String(a || '0').split('.').map(Number), y = String(b2).split('.').map(Number); for (let i = 0; i < 3; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) < (y[i] || 0); } return false; };
  B.minFor = (cap, v) => (MINS[cap] || {})[B.family(v)] || null;
  B.supports = (cap, v) => { const ver = v === undefined ? (B.info && B.info.version) : v; const m = B.minFor(cap, ver); return !!m && !numLt(ver, m); };
  B.versionLt = function (a, b2) {
    const fa = B.family(a), fb = B.family(b2);
    if (fa !== fb) return fa === 'old';
    return numLt(a, b2);
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
    if (!B.supports('base')) {
      throw new Error(PV.t('גרסת הגשר ({v}) ישנה — נדרשת {m} ומעלה', { v: (B.info && B.info.version) || '?', m: B.minFor('base') || PV.BRIDGE_MIN }));
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

  // קריאת קובץ כ-Blob. עד 50MB — בקריאה אחת (כמו תמיד). גדול יותר — בחלקים (offset), בלי תקרת גודל.
  // קריאה בחלקים דורשת גשר שתומך ב-offset; גשר ישן מחזיר רק את 50MB הראשונים, ואז נזרקת שגיאה ברורה.
  const READ_MAX = 50 * 1024 * 1024, READ_CHUNK = 24 * 1024 * 1024;
  const b64Blob = async (b64, mime) => (await fetch('data:' + (mime || 'application/octet-stream') + ';base64,' + b64)).blob();
  B.readBlob = async function (path, o) {
    const opts = o || {};
    let size = 0;
    try { const st = await B.call('/fs/stat', { path }, 15000); size = Number(st && st.size) || 0; } catch (e) { size = 0; }
    if (size <= READ_MAX) {
      const d = await B.call('/fs/read', { path, maxBytes: READ_MAX }, 120000);
      if (!d.truncated) return d.encoding === 'utf8' ? new Blob([d.content], { type: 'text/plain' }) : b64Blob(d.content, d.mime);
      size = Number(d.size) || size;
    }
    const parts = [];
    let off = 0, mime = '';
    for (;;) {
      if (opts.cancelled && opts.cancelled()) throw new Error('cancelled');
      const d = await B.call('/fs/read', { path, offset: off, maxBytes: READ_CHUNK, binary: true }, 120000);
      if (d.offset === undefined) throw new Error(PV.t('הקובץ גדול מ-50MB — נדרש גשר אוצריא מעודכן שיודע לקרוא קבצים גדולים בחלקים'));
      const part = await b64Blob(d.content, d.mime);
      mime = d.mime || mime;
      if (!part.size && d.truncated) throw new Error(PV.t('קריאת הקובץ נעצרה באמצע'));
      parts.push(part);
      off += part.size;
      if (opts.onProgress) opts.onProgress(size ? Math.min(1, off / size) : 0, off, size);
      if (!d.truncated) break;
    }
    return new Blob(parts, { type: mime });
  };

  /** חיפוש קובץ במחשב תוך כדי הקלדה: שורת חיפוש במסך הפתיחה ורשימה נפתחת */
  const EXT = ['pdf', 'docx', 'md', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff'];   // אותם סוגים כמו בחיפוש בתיקיות
  /** פתיחת קובץ לפי נתיב מלא: בתוך "התיקיות שלי" — דרך אוצריא; אחרת קריאה דרך הגשר.
   *  הנתיב נשמר במסמך (V.doc.diskPath) כדי שכל היכולות שתלויות בנתיב (פתיחה בתוכנה אחרת) יעבדו גם כאן. */
  B.openDiskFile = async function (path, name) {
    name = name || String(path).split(/[\\/]/).pop();
    try { if (PV.files.openByPath && await PV.files.openByPath(path, name)) return true; } catch (e) { /* ממשיכים לגשר */ }
    let cancelled = false, blob = null;
    PV.progress.show(PV.t('טוען…'), () => { cancelled = true; });
    try {
      blob = await B.readBlob(path, {
        cancelled: () => cancelled,
        onProgress: (f, a, t) => PV.progress.update(PV.t('טוען… {a} מתוך {t}', { a: PV.formatSize(a), t: PV.formatSize(t) }), f),
      });
    } catch (e) { if (!cancelled) PV.error(PV.errMsg(e)); }
    PV.progress.hide();
    if (!blob) return false;
    await PV.files.openBlob(blob, name, { source: null });
    if (PV.viewer && PV.viewer.doc) PV.viewer.doc.diskPath = path;
    return true;
  };

  // ── "פתח באמצעות ← צופה PDF+OCR" ב-Windows (גשר 1.0.2+) ──────────────────
  // הגשר שם את הקובץ בתור ופותח את אוצריא בתוסף; כאן שולפים את התור בעלייה, בחזרה לתוסף ובבדיקה תקופתית.
  let inboxBusy = false;
  B.checkInbox = async function () {
    if (inboxBusy || !PV.hasOtz() || Date.now() < (B._inboxSkipUntil || 0)) return;
    inboxBusy = true;
    try {
      if (!B.port && !(await B.probe())) { B._inboxSkipUntil = Date.now() + 30000; return; }   // אין גשר: לא סורקים פורטים כל 3 שניות
      if (!B.supports('openwith')) { B._inboxSkipUntil = Date.now() + 120000; return; }   // גשר ישן / בלי תור — לא בודקים כל 3 שניות
      const r = await B.call('/pdf/inbox/list', {}, 8000);
      const items = (r && r.items) || [];
      if (!items.length) return;
      await B.call('/pdf/inbox/ack', { ids: items.map((x) => x.id) }, 8000).catch(() => {});
      PV.tryCall('plugin.openSelf', {});
      for (const it of items) await B.openDiskFile(it.path, it.name);
    } catch (e) { /* הגשר לא זמין — ננסה שוב */ }
    finally { inboxBusy = false; }
  };
  B.startInbox = function () {
    B.checkInbox();
    setInterval(() => { if (!document.hidden) B.checkInbox(); }, 3000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) B.checkInbox(); });
  };

  B.initLiveSearch = function (input, ul, wrap) {
    if (!input || !ul) return;
    if (!PV.hasOtz()) { if (wrap) wrap.hidden = true; return; }
    let roots = null, rootsP = null, sig = { stop: true }, seq = 0, stale = false;
    const MAX = 100;
    const msg = (t) => { ul.innerHTML = ''; const li = document.createElement('li'); li.className = 'panel-empty'; li.textContent = t; ul.appendChild(li); };
    const close = () => { sig.stop = true; seq++; ul.hidden = true; ul.innerHTML = ''; input.setAttribute('aria-expanded', 'false'); };
    // חיבור הגשר (גילוי + צימוד + רשימת כוננים). רץ ברקע ולא חוסם את התוצאות מהתיקיות שנוספו לתוסף;
    // קריאות במקביל חולקות את אותו חיבור, ואם הוא נכשל — ההקלדה הבאה מנסה שוב.
    function getRoots() {
      if (roots) return Promise.resolve(roots);
      if (!rootsP) {
        rootsP = (async () => {
          try {
            if (!(await B.probe())) throw new Error(PV.t('חיפוש קבצים דורש את גשר אוצריא פועל'));
            try { roots = await B.roots(); }
            catch (e) { if (e.code !== 'unpaired') throw e; await B.pair(); roots = await B.roots(); }
            return roots;
          } finally { rootsP = null; }
        })();
      }
      return rootsP;
    }
    async function open(h) {
      close(); input.value = '';
      await B.openDiskFile(h.path, h.name);
    }
    async function openFolder(x) {
      close(); input.value = '';
      await PV.files.openFolderFile(x.folderToken, x.path, x.name);
    }
    const normPath = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    async function run() {
      const text = input.value.trim();
      sig.stop = true;
      stale = false;
      if (text.length < 2) { close(); return; }
      // החיפוש בגשר הוא לפי תת-מחרוזת בשם. כדי להתעלם מרווחים/קו תחתון/מקף/גרשיים, שולחים לגשר את המילה הארוכה ביותר
      // עם כוכביות, ואת ההתאמה המלאה (כל המילים, בלי ניקוד, בכל סדר) בודקים כאן אחרי שהתוצאות מגיעות.
      const rawTokens = text.replace(/[\u0591-\u05C7*?]/g, (c) => (c === '\u05BE' || c === '\u05C0' || c === '\u05C3' ? ' ' : '')).split(/[\s_\-.'"`\u05F3\u05F4\u2018-\u201F]+/).filter(Boolean);
      const need = PV.nrmSearch(text).split(' ').filter(Boolean);
      if (!rawTokens.length || !need.length) { close(); return; }
      const hlRe = PV.highlight ? PV.highlight.makeRe(need) : null;   // הדגשת המילים שנמצאו
      const serverQuery = '*' + rawTokens.reduce((a, t) => (t.length > a.length ? t : a), '') + '*';
      const my = ++seq, s = { stop: false }; sig = s;
      ul.hidden = false; input.setAttribute('aria-expanded', 'true');
      ul.innerHTML = '';
      let n = 0; const seen = new Set();
      // שורת מצב אחת בסוף הרשימה ("מחפש…", "מתחבר לגשר…"); פריטים חדשים נכנסים לפניה
      let statusLi = null;
      const setStatus = (t) => {
        if (!t) { if (statusLi) { statusLi.remove(); statusLi = null; } return; }
        if (!statusLi) { statusLi = document.createElement('li'); statusLi.className = 'panel-empty'; ul.appendChild(statusLi); }
        statusLi.textContent = t;
      };
      const addItem = (li) => { if (statusLi) ul.insertBefore(li, statusLi); else ul.appendChild(li); };
      const decorate = (li, pathInfo, subTitle) => {
        const sub = li.querySelector('.li-sub'); if (sub) { sub.dir = 'ltr'; sub.title = subTitle; }
        li.setAttribute('data-path-info', pathInfo);
        if (hlRe) { PV.highlight.apply(li.querySelector('.li-title'), hlRe); PV.highlight.apply(li.querySelector('.li-sub'), hlRe); }
      };
      setStatus(PV.t('מחפש…'));

      // שלב 1: התיקיות שנוספו לתוסף — מיד, בלי להמתין לגשר (המדד שלהן נבנה ברקע)
      let fr = null;
      try { fr = PV.files && PV.files.searchFolderFiles ? PV.files.searchFolderFiles(text) : null; } catch (e) { fr = null; }
      if (fr) {
        for (const x of fr.items) {
          if (n >= MAX) break;
          const key = x.abs ? normPath(x.abs) : '';
          if (key) { if (seen.has(key)) continue; seen.add(key); }
          n++;
          const li = PV.files.makeItem(PV.files.fileIcon(x.name), x.name, x.abs || '', () => openFolder(x));
          decorate(li, x.abs || x.name, x.abs || x.name);
          addItem(li);
        }
        if (fr.scanning && fr.wait) {
          // סריקה ראשונה של התיקיות עדיין רצה: כשהיא נגמרת מריצים את החיפוש מחדש עם המדד המלא
          setStatus(PV.t('סורק את התיקיות…'));
          fr.wait.then((idx) => { if (idx && my === seq && !s.stop && input.value.trim() === text) run(); });   // idx ריק = הסריקה נכשלה: לא מריצים שוב (מונע לולאה)
        }
      }

      // שלב 2: כל המחשב דרך הגשר. אם הצימוד עדיין לא אושר — ההמתנה היא ברקע, וברגע שהוא מאושר התוצאות מתווספות כאן לבד
      try {
        const pending = !roots;
        if (pending && !(fr && fr.scanning)) setStatus(n ? PV.t('מתחבר לגשר… תוצאות נוספות מהמחשב יתווספו אוטומטית') : PV.t('מחפש…'));
        const rs = await getRoots();
        if (my !== seq) return;
        if (s.stop) { stale = true; return; }   // הרשימה נסגרה בינתיים: ההקשה הבאה / החזרת המיקוד תריץ מחדש
        if (!(fr && fr.scanning)) setStatus(PV.t('מחפש…'));
        for (const r of rs) {
          if (s.stop || n >= MAX) break;
          await B.search({ root: r.path, query: serverQuery, includeDirs: false, maxResults: Math.min((MAX - n) * 4, 1000), extensions: EXT }, (h) => {
            if (s.stop || n >= MAX) return;
            const key = normPath(h.path);
            if (seen.has(key)) return;
            const hay = PV.nrmSearch(h.name);
            if (!need.every((t) => hay.indexOf(t) >= 0)) return;
            seen.add(key);
            n++;
            const li = PV.files.makeItem(PV.files.fileIcon(h.name), h.name, h.path, () => open(h));
            decorate(li, h.path, h.path);
            addItem(li);
          }, s);
        }
        if (my === seq && !s.stop) {
          if (fr && fr.scanning) setStatus(PV.t('סורק את התיקיות…')); else setStatus(null);
          if (!n && !(fr && fr.scanning)) msg(PV.t('לא נמצאו קבצים'));
        }
      } catch (e) {
        if (my === seq) {
          if (fr && fr.scanning) setStatus(PV.t('סורק את התיקיות…')); else setStatus(null);
          if (!n && !(fr && fr.scanning)) msg(PV.errMsg(e));
        }
      }
    }
    input.setAttribute('role', 'combobox'); input.setAttribute('aria-expanded', 'false');
    input.addEventListener('input', PV.debounce(run, 300));
    PV.listNav(input, ul, { onEscape: (e) => { if (!ul.hidden) { e.stopPropagation(); close(); } else if (input.value) { e.stopPropagation(); input.value = ''; } } });
    // לחיצה מחוץ לרשימה סוגרת אותה — אבל לא לחיצה בתפריט ההקשר של הנתיב (#folder-ctx), שנפתח מלחיצה ימנית על תוצאה ברשימה הזו
    document.addEventListener('mousedown', (e) => { if (!(wrap || ul).contains(e.target) && !(e.target.closest && e.target.closest('#folder-ctx'))) { sig.stop = true; ul.hidden = true; input.setAttribute('aria-expanded', 'false'); } });
    input.addEventListener('focus', () => { if (stale && input.value.trim().length >= 2) { run(); return; } if (ul.children.length && input.value.trim().length >= 2) { ul.hidden = false; input.setAttribute('aria-expanded', 'true'); } });
  };
})();
