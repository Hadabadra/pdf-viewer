/* צופה PDF+OCR — פתיחת קבצים: דיאלוג אוצריא, אחרונים, "התיקיות שלי", ספרי PDF מהספרייה,
   קבצים בחיפוש הספרייה (ספק ספרים), וחילוץ טקסט ממסמכי Office/EPUB. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer;
  const Fs = (PV.files = {});

  const PROVIDER = 'pdfocr';
  const EXTENSIONS = ['pdf', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tif', 'tiff', 'docx', 'pptx', 'xlsx', 'epub', 'txt', 'md', 'csv', 'json', 'html', 'htm', 'xml', 'log'];

  function kindOf(name, type) {
    const n = String(name || '').toLowerCase(), t = String(type || '');
    if (n.endsWith('.pdf') || t === 'application/pdf') return 'pdf';
    const ext = (n.match(/\.([a-z0-9]+)$/) || [])[1] || '';
    if (['docx', 'pptx', 'xlsx', 'epub'].includes(ext)) return ext;
    if (ext === 'tif' || ext === 'tiff' || t === 'image/tiff') return 'tiff';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'svg'].includes(ext) || t.startsWith('image/')) return 'image';
    if (ext === 'html' || ext === 'htm' || t === 'text/html') return 'html';
    if (['txt', 'md', 'csv', 'json', 'log', 'xml', 'ini'].includes(ext) || t.startsWith('text/')) return 'text';
    return null;
  }
  Fs.kindOf = kindOf;

  // סוגי הקבצים שמוצגים בעץ התיקיות ובחיפוש בתיקיות: PDF, Word, Markdown, טקסט ותמונות מקובלות
  const SEARCH_EXTS = new Set(['pdf', 'docx', 'md', 'txt', 'png', 'jpg', 'jpeg', 'gif', 'webp', 'tif', 'tiff']);
  const MAX_DEPTH = 100;   // עומק מרבי של תתי-תיקיות בעץ ובחיפוש
  const nrmSearch = PV.nrmSearch;
  const EXT_LIST = Array.from(SEARCH_EXTS);
  // בקשת סוגים מאוצריא: גם באותיות גדולות, למקרה שהסינון שלה רגיש לגודל האותיות (‎.PDF)
  const extArg = (list) => list.concat(list.map((e) => e.toUpperCase()));
  /** תיקייה עם יותר מ-2,000 פריטים: אוצריא מחזירה רק חלק (truncated). שואלים שוב לכל סוג קובץ בנפרד — לכל סוג מגבלה משלו. */
  async function mergeTruncated(d, fetchExt) {
    const list = ((d && d.entries) || []).slice();
    if (!(d && d.truncated)) return { entries: list, truncated: false };
    const seenP = new Set(list.map((e) => e.path));
    let still = false;
    for (const ext of EXT_LIST) {
      let r;
      try { r = await fetchExt(ext); } catch (e) { still = true; continue; }
      for (const e of (r && r.entries) || []) if (e.type !== 'dir' && !seenP.has(e.path)) { seenP.add(e.path); list.push(e); }
      if (r && r.truncated) still = true;
    }
    return { entries: list, truncated: still };
  }
  const LIB_MAX_BOOKS = 100000;   // מספר מרבי של קבצי PDF שמסונכרנים לחיפוש הספרייה של אוצריא
  function isListed(name) {
    const ext = (String(name || '').toLowerCase().match(/\.([a-z0-9]+)$/) || [])[1] || '';
    return SEARCH_EXTS.has(ext) && !!kindOf(name);
  }

  // ── פתיחת Blob/File לפי סוג ───────────────────────────────────────────
  /** meta: { source, page } — source משמש לאחרונים ולחזרה לעמוד. */
  Fs.openBlob = async function (blob, name, meta) {
    const m = meta || {};
    const kind = kindOf(name, blob.type);
    if (!kind) { PV.error(PV.t('סוג הקובץ אינו נתמך: {n}', { n: name })); return false; }
    const ctx = PV.tabs ? PV.tabs.begin(Object.assign({}, m, { name })) : null;
    if (ctx && ctx.existing) { await PV.tabs.focusExisting(ctx.existing, m.page); return true; }
    PV.progress.show(PV.t('פותח את {n}…', { n: name }));
    try {
      const open = { name, source: m.source || null, page: m.page, frac: m.frac, rotation: m.rotation, zoom: m.zoom, origin: m.origin };
      if (ctx) Object.assign(open, ctx.openMeta);
      if (kind === 'pdf') {
        await V.open('pdf', await blob.arrayBuffer(), open);
      } else if (kind === 'image') {
        const img = await loadImage(blob);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth; c.height = img.naturalHeight;
        c.getContext('2d').drawImage(img, 0, 0);
        await V.open('images', [c], Object.assign(open, { zoom: m.zoom != null ? m.zoom : (c.width < 900 ? 1 : 'fit-width') }));
      } else if (kind === 'tiff') {
        await V.open('images', decodeTiff(await blob.arrayBuffer()), open);
      } else if (kind === 'html') {
        await V.open('html', await blob.text(), open);
      } else if (kind === 'text') {
        await V.open('text', { parts: [{ title: '', text: await blob.text() }] }, Object.assign(open, { zoom: m.zoom != null ? m.zoom : 1 }));
      } else {
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const parts = await extractZip(zip, kind);
        await V.open('text', { parts: parts.length ? parts : [{ title: '', text: PV.t('(לא נמצא טקסט בקובץ)') }] }, Object.assign(open, { zoom: m.zoom != null ? m.zoom : 1 }));
      }
      if (V.doc && (kind === 'pdf' || kind === 'image' || kind === 'tiff')) V.doc.blob = blob; // לשמירת PDF עם שכבת טקסט
      if (ctx) PV.tabs.commit(ctx, V.doc);
      if (m.source && !m.noRecent) Fs.addRecent(Object.assign({ name, size: blob.size, kind }, m.source));
      return true;
    } catch (e) {
      if (ctx) PV.tabs.rollback(ctx);
      if (e && e.code === 'tab.stale') return false;
      PV.error(PV.t('לא ניתן לפתוח את הקובץ: {e}', { e: PV.errMsg(e) }));
      return false;
    } finally { PV.progress.hide(); }
  };

  Fs.blobToCanvas = async function (blob) {
    const img = await loadImage(blob);
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    c.getContext('2d').drawImage(img, 0, 0);
    return c;
  };
  Fs.decodeTiffBuffer = (buf) => decodeTiff(buf);
  Fs.getFolders = () => folders;

  function loadImage(blob) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);
      img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error(PV.t('קובץ תמונה לא תקין'))); };
      img.src = url;
    });
  }
  function decodeTiff(buf) {
    const ifds = UTIF.decode(buf);
    const out = [];
    ifds.forEach((ifd) => {
      try {
        UTIF.decodeImage(buf, ifd);
        if (!ifd.width || !ifd.height) return;
        const rgba = UTIF.toRGBA8(ifd);
        const c = document.createElement('canvas');
        c.width = ifd.width; c.height = ifd.height;
        c.getContext('2d').putImageData(new ImageData(new Uint8ClampedArray(rgba), ifd.width, ifd.height), 0, 0);
        out.push(c);
      } catch (e) { /* עמוד לא נתמך — מדלגים */ }
    });
    if (!out.length) throw new Error(PV.t('קובץ TIFF לא תקין'));
    return out;
  }

  /** פתיחה מ-URL (שרת הקבצים של אוצריא, או dataUrl). */
  /** פתיחה לפי מקור שמור (קובץ, ספר מהספרייה או קובץ בתיקייה) — לשחזור לשוניות. */
  Fs.openSource = async function (src, meta) {
    const m = Object.assign({}, meta, { source: src });
    let d = null;
    if (src.type === 'token') d = await PV.call('fs.resolveFileUrl', { token: src.token });
    else if (src.type === 'book') d = await PV.call('library.openBookFile', src.bookUid ? { bookUid: src.bookUid } : src.id != null ? { id: src.id, type: src.bookType || 'pdf' } : { bookId: src.bookId, type: src.bookType || 'pdf' });
    else if (src.type === 'folder') d = await PV.call('fs.openFolderFile', { folderToken: src.folderToken, path: src.path });
    if (!d || !d.url) return false;
    return Fs.openUrl(d.url, d.name || m.name || PV.t('ספר'), m);
  };

  Fs.openUrl = async function (url, name, meta) {
    const ex = PV.tabs && PV.tabs.existingFor(meta);
    if (ex) { await PV.tabs.focusExisting(ex, meta && meta.page); return true; }
    // PDF גדול: pdf.js קורא ישירות מהשרת המקומי של אוצריא (עם Range) — נפתח מיד, בלי להוריד את כל הקובץ לזיכרון.
    // אם משהו נכשל — חוזרים לדרך הרגילה (הורדה מלאה).
    if (kindOf(name) === 'pdf') {
      try {
        const size = (meta && meta.size > 0) ? meta.size : await remoteSize(url);
        if (size >= PDF_STREAM_MIN) {
          const r = await Fs.openPdfUrl(url, name, meta, size);
          if (r !== null) return r;
        }
      } catch (e) { /* ממשיכים לדרך הרגילה */ }
    }
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return Fs.openBlob(await resp.blob(), name, meta);
  };

  const PDF_STREAM_MIN = 20 * 1024 * 1024;
  async function remoteSize(url) {
    try {
      const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(url, { method: 'HEAD', signal: ctl.signal });
      clearTimeout(t);
      const n = Number(r.headers.get('content-length'));
      return r.ok && n > 0 ? n : 0;
    } catch (e) { return 0; }
  }
  /** פותח PDF ישירות מכתובת (טעינה הדרגתית). מחזיר true/false כשטופל, ו-null כשיש לנסות את הדרך הרגילה. */
  Fs.openPdfUrl = async function (url, name, meta, size) {
    const m = meta || {};
    const ctx = PV.tabs ? PV.tabs.begin(Object.assign({}, m, { name })) : null;
    if (ctx && ctx.existing) { await PV.tabs.focusExisting(ctx.existing, m.page); return true; }
    PV.progress.show(PV.t('פותח את {n}…', { n: name }));
    try {
      const open = { name, source: m.source || null, page: m.page, frac: m.frac, rotation: m.rotation, zoom: m.zoom, origin: m.origin };
      if (ctx) Object.assign(open, ctx.openMeta);
      await V.open('pdf', { url, onProgress: (p) => { if (p && p.total) PV.progress.update(PV.t('טוען… {a} מתוך {t}', { a: PV.formatSize(p.loaded), t: PV.formatSize(p.total) }), Math.min(1, p.loaded / p.total)); } }, open);
      if (V.doc) V.doc.blobUrl = url;   // לשמירת PDF עם שכבת טקסט — הקובץ נטען רק אז (Fs.docBlob)
      if (ctx) PV.tabs.commit(ctx, V.doc);
      if (m.source && !m.noRecent) Fs.addRecent(Object.assign({ name, size, kind: 'pdf' }, m.source));
      return true;
    } catch (e) {
      if (ctx) PV.tabs.rollback(ctx);
      if (e && e.code === 'tab.stale') return false;
      return null;   // נכשל — חוזרים להורדה מלאה
    } finally { PV.progress.hide(); }
  };
  /** ה-Blob של המסמך הפתוח (נטען לפי דרישה אם המסמך נפתח בטעינה הדרגתית). */
  Fs.docBlob = async function (doc) {
    if (!doc) return null;
    if (doc.blob) return doc.blob;
    if (doc.blobUrl) { const r = await fetch(doc.blobUrl); if (r.ok) { doc.blob = await r.blob(); return doc.blob; } }
    return null;
  };

  // ── דיאלוג פתיחה ──────────────────────────────────────────────────────
  Fs.pick = async function () {
    if (PV.hasOtz()) {
      try {
        const r = await PV.call('fs.pickUserFile', { title: PV.t('פתיחת קובץ'), extensions: EXTENSIONS });
        if (!r || r.cancelled) return;
        await Fs.openUrl(r.url, r.name, { source: { type: 'token', token: r.token }, size: r.size });
        return;
      } catch (e) {
        if (e && e.code !== 'error.unknown_method' && !/permission/.test(String(e.code))) { PV.error(PV.errMsg(e)); return; }
      }
    }
    const input = $('file-input');
    input.value = '';
    input.click();
  };
  document.addEventListener('DOMContentLoaded', () => {
    $('file-input').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) Fs.openBlob(f, f.name, { source: null });
    });
  });

  // ── אחרונים ───────────────────────────────────────────────────────────
  const RECENTS_MAX = 15;
  let recents = [];
  const keyOf = (s) => (s.type === 'token' ? 't:' + s.token : s.type === 'book' ? 'b:' + (s.bookUid || (s.id != null ? 'id:' + s.id : s.bookId)) : s.type === 'folder' ? 'f:' + s.folderToken + ':' + s.path : '');
  Fs.loadRecents = async function () {
    const r = await PV.store.get('recents', []);
    recents = Array.isArray(r) ? r : [];
    Fs.renderRecents();
  };
  Fs.addRecent = function (entry) {
    const key = keyOf(entry);
    if (!key) return;
    const old = recents.find((r) => r.key === key);
    recents = recents.filter((r) => r.key !== key);
    recents.unshift(Object.assign({}, old || {}, entry, { key, ts: Date.now() }));
    recents = recents.slice(0, RECENTS_MAX);
    PV.store.set('recents', recents);
    Fs.renderRecents();
  };
  /** 5.7.0: נתיב מלא בדיסק של המסמך הנוכחי (רק לקובץ מתיקייה שנוספה), לפתיחה בתוכנה אחרת דרך הגשר */
  Fs.diskPath = function () {
    if (V.doc && V.doc.diskPath) return V.doc.diskPath;   // 5.8.0: קובץ שנפתח דרך הגשר ("פתח באמצעות", חיפוש במחשב)
    const s = V.doc && V.doc.source;
    if (!s || s.type !== 'folder' || !s.path) return null;
    const f = folders.find((x) => x.folderToken === s.folderToken);
    if (!f || !f.path) return null;
    return f.path.replace(/[\\/]+$/, '') + '\\' + String(s.path).replace(/^[\\/]+/, '').replace(/\//g, '\\');
  };
  Fs.currentRecent = () => (V.doc && V.doc.source ? recents.find((r) => r.key === keyOf(V.doc.source)) : null);
  Fs.rememberPage = PV.debounce(() => {
    const r = Fs.currentRecent();
    if (!r || !V.count) return;
    r.page = V.page;
    PV.store.set('recents', recents);
  }, 1500);
  PV.on('page', () => Fs.rememberPage());

  function recentIcon(r) {
    if (r.type === 'book') return 'book_open';
    if (r.kind === 'pdf') return 'document_pdf';
    if (r.kind === 'image' || r.kind === 'tiff') return 'image';
    return 'document';
  }
  function makeItem(iconName, title, sub, onClick, actions) {
    const li = document.createElement('li');
    li.className = 'list-item';
    li.tabIndex = 0;
    li.appendChild(PV.icon(iconName));
    const txt = document.createElement('span');
    txt.className = 'li-text';
    const t = document.createElement('span');
    t.className = 'li-title'; t.textContent = PV.dispName(title); t.title = title;
    txt.appendChild(t);
    if (sub) { const s = document.createElement('span'); s.className = 'li-sub'; s.textContent = sub; txt.appendChild(s); }
    li.appendChild(txt);
    if (actions && actions.length) {
      const box = document.createElement('span');
      box.className = 'li-actions';
      actions.forEach(([icon, label, fn]) => {
        const b = document.createElement('button');
        b.className = 'icon-btn small'; b.title = label;
        b.appendChild(PV.icon(icon));
        b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
        box.appendChild(b);
      });
      li.appendChild(box);
    }
    li.addEventListener('click', onClick);
    li.addEventListener('keydown', (e) => { if (e.key === 'Enter') onClick(); });
    return li;
  }
  Fs.makeItem = makeItem;
  Fs.fileIcon = (n) => fileIcon(n);

  // חיפוש ברשימת ההיסטוריה (ספרים פתוחים + אחרונים)
  let histQuery = '';
  const norm = (x) => String(x || '').toLowerCase();
  const histMatch = (name) => {
    if (!histQuery) return true;
    const h = nrmSearch(name);
    return histQuery.split(' ').every((t) => h.indexOf(t) >= 0);
  };
  function updateHistNoResults(openCount, recentCount) {
    const none = !!histQuery && !openCount && !recentCount;
    $('history-noresults').hidden = !none;
    if (histQuery) { $('open-books-empty').hidden = true; $('recents-empty').hidden = true; }
  }
  Fs.renderRecents = function () {
    [['recents', 'recents-empty', recents.length], ['welcome-recent-list', null, 6]].forEach(([listId, emptyId, max]) => {
      const ul = $(listId);
      ul.innerHTML = '';
      const isHist = listId === 'recents';
      let shown = 0;
      recents.filter((r) => !isHist || histMatch(r.name)).slice(0, max).forEach((r) => {
        shown++;
        const sub = [r.type === 'book' ? PV.t('ספר מהספרייה') : PV.formatSize(r.size), r.page > 1 ? PV.t('עמוד {n}', { n: r.page }) : '', PV.relTime(r.ts)].filter(Boolean).join(' · ');
        ul.appendChild(makeItem(recentIcon(r), r.name, sub, () => { PV.closePopovers(); Fs.openRecent(r); }, [['dismiss', PV.t('הסרה מהרשימה'), () => {
          recents = recents.filter((x) => x.key !== r.key);
          PV.store.set('recents', recents);
          Fs.renderRecents();
        }]]));
      });
      if (emptyId) $(emptyId).hidden = recents.length > 0;
      if (isHist) updateHistNoResults(lastOpenShown, shown);
    });
    $('welcome-recents').hidden = recents.length === 0;
  };
  let lastOpenShown = 0;

  Fs.openRecent = async function (r) {
    const page = PV.settings.resume ? r.page : undefined;
    try {
      if (r.type === 'token') {
        const d = await PV.call('fs.resolveFileUrl', { token: r.token });
        await Fs.openUrl(d.url, d.name || r.name, { source: { type: 'token', token: r.token }, page });
      } else if (r.type === 'book') {
        await Fs.openLibraryBook({ bookUid: r.bookUid, id: r.id, bookId: r.bookId, type: r.bookType || 'pdf', name: r.name }, page);
      } else if (r.type === 'folder') {
        await Fs.openFolderFile(r.folderToken, r.path, r.name, page);
      }
    } catch (e) {
      if (e && e.code === 'error.not_found') {
        PV.error(PV.t('הקובץ "{n}" לא נמצא — אולי הוזז או נמחק', { n: r.name }));
        recents = recents.filter((x) => x.key !== r.key);
        PV.store.set('recents', recents);
        Fs.renderRecents();
      } else if (!PV.hasOtz()) PV.toast(PV.t('פתיחה מהאחרונים זמינה בתוך אוצריא'));
      else PV.error(PV.t('לא ניתן לפתוח: {e}', { e: PV.errMsg(e) }));
    }
  };
  $('btn-clear-recents').addEventListener('click', (e) => { e.stopPropagation(); recents = []; PV.store.set('recents', recents); Fs.renderRecents(); });

  // ── ספרי PDF מהספרייה של אוצריא ───────────────────────────────────────
  /** q: { bookUid?, id?, bookId?, type?, name? } */
  Fs.openLibraryBook = async function (q, page) {
    const query = q.bookUid ? { bookUid: q.bookUid } : q.id != null ? { id: q.id, type: q.type || 'pdf' } : { bookId: q.bookId, type: q.type || 'pdf' };
    const d = await PV.call('library.openBookFile', query);
    if (!d || !d.url) throw new Error(PV.t('לספר אין קובץ'));
    const name = d.name || ((q.name || PV.t('ספר')) + '.pdf');
    return Fs.openUrl(d.url, name, {
      page,
      source: { type: 'book', bookUid: q.bookUid || null, id: q.id != null ? q.id : null, bookId: q.bookId || null, bookType: q.type || 'pdf' },
    });
  };

  /** ספרי PDF שפתוחים עכשיו בקורא של אוצריא. */
  let openTabsCache = [];
  function renderOpenBooks() {
    const ul = $('open-books');
    ul.innerHTML = '';
    const tabs = openTabsCache.filter((t) => histMatch(t.book || t.bookId));
    tabs.forEach((t) => {
      const sub = t.index ? PV.t('עמוד {n}', { n: t.index }) : '';
      ul.appendChild(makeItem('book_open', t.book || t.bookId, sub, () => {
        PV.closePopovers();
        Fs.openLibraryBook({ id: t.id, bookId: t.bookId, type: 'pdf', name: t.book }, t.index || 1)
          .catch((e) => PV.error(PV.t('לא ניתן לפתוח את הספר: {e}', { e: PV.errMsg(e) })));
      }));
    });
    $('open-books-empty').hidden = openTabsCache.length > 0;
    lastOpenShown = tabs.length;
    updateHistNoResults(tabs.length, $('recents').children.length);
  }
  Fs.refreshOpenBooks = async function () {
    const st = PV.hasOtz() ? await PV.tryCall('reader.getCurrentState', {}) : null;
    openTabsCache = (st && st.openTabs ? st.openTabs : []).filter((t) => t.type === 'pdf' && !t.isSelf);
    renderOpenBooks();
    return openTabsCache;
  };

  // רשימה נפתחת (סמל ההיסטוריה בסרגל הכלים)
  PV.bindPopover($('btn-history'), $('history-menu'));
  $('btn-history').addEventListener('click', () => {
    const open = $('history-menu').classList.contains('open');
    $('btn-history').classList.toggle('active', open);
    if (!open) return;
    histQuery = ''; $('history-search').value = '';
    renderOpenBooks(); Fs.renderRecents();
    Fs.refreshOpenBooks();
    setTimeout(() => $('history-search').focus({ preventScroll: true }), 40);
  });
  document.addEventListener('click', () => $('btn-history').classList.remove('active'));
  $('history-search').addEventListener('input', () => {
    histQuery = nrmSearch($('history-search').value);
    renderOpenBooks(); Fs.renderRecents();
  });
  $('history-search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('history-search').value) { e.stopPropagation(); $('history-search').value = ''; histQuery = ''; renderOpenBooks(); Fs.renderRecents(); }
  });
  $('btn-refresh-tabs').addEventListener('click', (e) => { e.stopPropagation(); Fs.refreshOpenBooks(); });

  // ── התיקיות שלי ───────────────────────────────────────────────────────
  let folders = [];
  // תתי-תיקיות שהוסרו מהרשימה (מפתח: folderToken|path). התיקייה בדיסק לא נוגעת — רק מוסתרת בתוסף
  let excluded = new Set();
  const isExcluded = (f, path) => excluded.has(f.folderToken + '|' + path);
  const saveExcluded = () => PV.store.set('excludedDirs', Array.from(excluded));
  Fs.loadFolders = async function () {
    const f = await PV.store.get('folders', []);
    folders = Array.isArray(f) ? f : [];
    const ex = await PV.store.get('excludedDirs', []);
    excluded = new Set(Array.isArray(ex) ? ex : []);
    Fs.renderFolders();
    // מדד החיפוש מההפעלה הקודמת — החיפוש הראשון מיידי. אם אין מדד, או שהסריקה הקודמת נקטעה באמצע — ממשיכים לסרוק ברקע מיד.
    loadIndexCache().then(() => { if (folders.length && (!folderIndex || resumeState)) startBackgroundIndex(); });
  };
  Fs.addFolder = async function () {
    if (!PV.hasOtz()) { PV.toast(PV.t('תיקיות זמינות בתוך אוצריא')); return; }
    try {
      const r = await PV.call('fs.pickUserFolder', { title: PV.t('הוספת תיקייה לצופה PDF+OCR') });
      if (!r || r.cancelled) return;
      if (!folders.some((f) => f.folderToken === r.folderToken)) folders.push({ folderToken: r.folderToken, name: r.name, path: r.path });
      await PV.store.set('folders', folders);
      folderIndex = null; clearIndexCache();
      Fs.renderFolders();
      if ($('folders-search').value.trim()) runFolderSearch();
      PV.emit('show-files');
      PV.toast(PV.t('התיקייה "{n}" נוספה', { n: r.name }));
      startBackgroundIndex();   // סריקה ברקע מיד, בלי לחכות לחיפוש
      Fs.syncLibrary();
    } catch (e) {
      if (e && e.code === 'error.forbidden') PV.error(PV.t('אי אפשר לבחור את התיקייה הזו (תיקיית מערכת או שורש כונן) — בחרו תת-תיקייה'));
      else PV.error(PV.t('לא ניתן להוסיף תיקייה: {e}', { e: PV.errMsg(e) }));
    }
  };
  async function removeFolder(f) {
    folders = folders.filter((x) => x.folderToken !== f.folderToken);
    await PV.store.set('folders', folders);
    PV.tryCall('fs.revokeFolder', { folderToken: f.folderToken });
    folderIndex = null; clearIndexCache();
    Object.keys(treeOpen).forEach((k) => { if (k.indexOf(f.folderToken + '|') === 0) delete treeOpen[k]; });
    const before = excluded.size;
    Array.from(excluded).forEach((k) => { if (k.indexOf(f.folderToken + '|') === 0) excluded.delete(k); });
    if (excluded.size !== before) saveExcluded();
    Fs.renderFolders();
    if ($('folders-search').value.trim()) runFolderSearch();
    Fs.syncLibrary();
    PV.toast(PV.t('התיקייה \"{n}\" הוסרה מהרשימה', { n: f.name }));
  }

  /** הסתרת תת-תיקייה מהרשימה של התוסף (אינה נמחקת מהדיסק). */
  async function hideSubfolder(f, path, name) {
    excluded.add(nodeKey(f, path));
    await saveExcluded();
    folderIndex = null; clearIndexCache();
    Fs.renderFolders();
    if ($('folders-search').value.trim()) runFolderSearch();
    Fs.syncLibrary();
    PV.toast(PV.t('התיקייה \"{n}\" הוסרה מהרשימה', { n: name }));
  }

  /** שאלת אישור לפני הסרה (חלון האישור של אוצריא; מחוץ לאוצריא — confirm של הדפדפן). */
  async function confirmRemove(name, isRoot) {
    const title = PV.t('הסרת תיקייה');
    const content = isRoot
      ? PV.t('להסיר את התיקייה \"{n}\" מהרשימה? הקבצים עצמם לא יימחקו.', { n: name })
      : PV.t('להסיר את התיקייה \"{n}\" מהרשימה? התיקייה והקבצים עצמם לא יימחקו.', { n: name });
    if (PV.hasOtz()) {
      const r = await PV.tryCall('ui.showConfirm', { title, content }, null);
      if (r && typeof r.confirmed === 'boolean') return r.confirmed;
    }
    return window.confirm(content);
  }
  async function requestRemove(node) {
    if (!(await confirmRemove(node.name, node.isRoot))) return;
    if (node.isRoot) await removeFolder(node.f); else await hideSubfolder(node.f, node.path, node.name);
  }

  // רשימות תיקייה במטמון (עד שהעץ מצויר מחדש) ובדיקה אם בתיקייה יש קבצים נתמכים, גם בעומק.
  // מספר קריאות במקביל מוגבל, כדי לא להציף את אוצריא בעץ גדול.
  const dirCache = new Map(), supCache = new Map();
  let activeCalls = 0;
  const waiters = [];
  const acquire = () => (activeCalls < 6 ? (activeCalls++, Promise.resolve()) : new Promise((r) => waiters.push(r)));
  const release = () => { const n = waiters.shift(); if (n) n(); else activeCalls--; };
  // בדיקות רקע (האם בתיקייה יש קבצים נתמכים) לא תופסות את כל הקריאות — נשארים פנויים כמה מקומות לפעולות המשתמש
  const acquireLow = () => new Promise((r) => { const t = () => { if (activeCalls < 4) { activeCalls++; r(); } else setTimeout(t, 80); }; t(); });
  function listDir(f, path, low) {
    const k = nodeKey(f, path);
    let p = dirCache.get(k);
    if (!p) {
      p = (async () => {
        await (low ? acquireLow() : acquire());
        try {
          const first = await PV.call('fs.listUserFolder', { folderToken: f.folderToken, path, extensions: extArg(EXT_LIST) });
          return await mergeTruncated(first, (ext) => PV.call('fs.listUserFolder', { folderToken: f.folderToken, path, extensions: extArg([ext]) }));
        } finally { release(); }
      })();
      p.catch(() => { if (dirCache.get(k) === p) dirCache.delete(k); });
      dirCache.set(k, p);
    }
    return p;
  }
  function hasSupported(f, path, depth) {
    const k = nodeKey(f, path);
    let p = supCache.get(k);
    if (!p) {
      p = (async () => {
        let d;
        try { d = await listDir(f, path, true); } catch (e) { return true; } // שגיאה — מציגים, כדי שהמשתמש יראה אותה
        const entries = (d && d.entries) || [];
        if (entries.some((en) => en.type !== 'dir' && isListed(en.name))) return true;
        if (depth >= MAX_DEPTH) return false;
        for (const en of entries) {
          if (en.type !== 'dir' || isExcluded(f, en.path)) continue;
          if (await hasSupported(f, en.path, depth + 1)) return true;
        }
        return false;
      })();
      supCache.set(k, p);
    }
    return p;
  }

  // מצב פתיחה של צמתי העץ (נשמר בין ציורים מחדש). תיקיות ראשיות פתוחות כברירת מחדל.
  const treeOpen = {};
  const nodeKey = (f, path) => f.folderToken + '|' + path;
  function fileIcon(name) { const k = kindOf(name); return k === 'pdf' ? 'document_pdf' : (k === 'image' || k === 'tiff') ? 'image' : 'document'; }

  Fs.renderFolders = function () {
    const ul = $('folders');
    ul.innerHTML = '';
    dirCache.clear(); supCache.clear();
    folders.forEach((f) => ul.appendChild(folderNode(f, '', f.name, 0)));
    $('folders-empty').hidden = folders.length > 0;
    $('folders-search').closest('.folders-bar').classList.toggle('no-folders', folders.length === 0);
  };
  function folderNode(f, path, label, depth) {
    const key = nodeKey(f, path), isRoot = path === '';
    const li = document.createElement('li');
    li.className = 'tree-node';
    const row = makeItem('folder', label, '', toggle, null);
    row.classList.add('tree-row');
    row._pvNode = { f, path, name: label, isRoot };
    row.style.paddingInlineStart = (0.4 + depth * 1.05) + 'em';
    const chev = PV.icon('chevron_down', 'tree-chevron');
    row.insertBefore(chev, row.firstChild);
    row.setAttribute('role', 'treeitem');
    if (isRoot) row.title = f.path || label;
    // תיקייה בלי קבצים נתמכים (גם בעומק) תוסתר — התיקיות מוצגות מיד, והבדיקה העמוקה רצה ברקע
    if (!isRoot) {
      hasSupported(f, path, depth).then((ok) => { if (!ok) li.hidden = true; });
    }
    const kids = document.createElement('ul');
    kids.className = 'list';
    kids.setAttribute('role', 'group');
    let loaded = false;
    const isOpen = () => (key in treeOpen ? treeOpen[key] : isRoot);
    function sync() {
      const open = isOpen();
      kids.hidden = !open;
      li.classList.toggle('collapsed', !open);
      row.setAttribute('aria-expanded', open ? 'true' : 'false');
    }
    async function load() {
      if (loaded) return;
      loaded = true;
      kids.innerHTML = '';
      try {
        const d = await listDir(f, path);
        const entries = (d && d.entries) || [];
        entries.forEach((en) => {
          if (en.type === 'dir') { if (!isExcluded(f, en.path)) kids.appendChild(folderNode(f, en.path, en.name, depth + 1)); }
          else if (isListed(en.name)) {
            const li2 = document.createElement('li');
            const r2 = makeItem(fileIcon(en.name), en.name, PV.formatSize(en.size), () => Fs.openFolderFile(f.folderToken, en.path, en.name));
            r2.style.paddingInlineStart = (0.4 + (depth + 1) * 1.05) + 'em';
            const sp = document.createElement('span'); sp.className = 'tree-spacer'; r2.insertBefore(sp, r2.firstChild);
            li2.appendChild(r2);
            kids.appendChild(li2);
          }
        });
        if (!kids.children.length && !isRoot) { li.hidden = true; return; } // תיקייה ריקה מקבצים נתמכים — מוסתרת
        if (!kids.children.length) {
          const e = document.createElement('li'); e.className = 'panel-empty'; e.textContent = PV.t('אין כאן קבצים נתמכים'); kids.appendChild(e);
        }
        if (d && d.truncated) PV.toast(PV.t('בתיקייה יותר מ-2000 פריטים — מוצגים הראשונים'));
      } catch (e) {
        loaded = false;
        const er = document.createElement('li'); er.className = 'panel-empty';
        er.textContent = e && e.code === 'error.not_found' ? PV.t('התיקייה אינה זמינה כרגע (אולי כונן שנותק)') : PV.t('שגיאה: {e}', { e: PV.errMsg(e) });
        kids.appendChild(er);
      }
    }
    function toggle() {
      treeOpen[key] = !isOpen();
      sync();
      if (isOpen()) load();
    }
    sync();
    if (isOpen()) load();
    li.append(row, kids);
    return li;
  }

  // ── לחיצה ימנית: הצגת נתיב בתוצאות החיפוש (בכל חלונית הצד ובשורת החיפוש במחשב), והסרת תיקייה ──
  let ctxNode = null, ctxInfo = '';
  const fctx = $('folder-ctx');
  const fPath = fctx.querySelector('[data-fact="path"]'), fInfo = fctx.querySelector('[data-fact="info"]');
  const fRemove = fctx.querySelector('[data-fact="remove"]'), fSep = fctx.querySelector('[data-fsep]');
  function hideFolderCtx() { fctx.hidden = true; ctxNode = null; ctxInfo = ''; }
  function showFolderCtx(e, node, info) {
    ctxNode = node || null;
    ctxInfo = info || '';
    fPath.classList.toggle('checked', !!PV.settings.searchShowPath);
    fInfo.hidden = !(ctxInfo && !PV.settings.searchShowPath);
    fRemove.hidden = !ctxNode;
    fSep.hidden = !ctxNode;
    fctx.hidden = false;
    const w = fctx.offsetWidth, h = fctx.offsetHeight;
    fctx.style.left = Math.max(4, Math.min(e.clientX, window.innerWidth - w - 6)) + 'px';
    fctx.style.top = Math.max(4, Math.min(e.clientY, window.innerHeight - h - 6)) + 'px';
  }
  document.addEventListener('contextmenu', (e) => {
    const t = e.target;
    if (!t || !t.closest) return;
    const inSidebar = !!t.closest('#sidebar'), inPc = !!t.closest('#welcome-search');
    if (!inSidebar && !inPc) return;
    e.preventDefault();
    const row = t.closest('.tree-row');
    const item = t.closest('[data-path-info]');
    showFolderCtx(e, row && row._pvNode ? row._pvNode : null, item ? item.getAttribute('data-path-info') : '');
  });
  fPath.addEventListener('click', (e) => {
    e.stopPropagation();
    hideFolderCtx();
    PV.settings.searchShowPath = !PV.settings.searchShowPath;
    PV.saveSettings();
    PV.emit('settings', 'searchShowPath');
  });
  fInfo.addEventListener('click', (e) => {
    e.stopPropagation();
    const info = ctxInfo;
    hideFolderCtx();
    if (info) PV.toast(info, { info: true });
  });
  fRemove.addEventListener('click', (e) => {
    e.stopPropagation();
    const node = ctxNode;
    hideFolderCtx();
    if (node) requestRemove(node);
  });
  document.addEventListener('click', hideFolderCtx);
  window.addEventListener('blur', hideFolderCtx);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideFolderCtx(); });
  $('sidebar').addEventListener('scroll', hideFolderCtx, true);

  // ── חיפוש בכל התיקיות שנוספו ──────────────────────────────────────────
  let folderIndex = null, indexing = null, indexTime = 0, indexNote = '';
  let partialIndex = null, onScan = null;   // תוצאות חלקיות בזמן סריקה ראשונה, והאזנה להתקדמות
  const INDEX_MAX_FILES = 200000, INDEX_MAX_DEPTH = MAX_DEPTH, INDEX_TTL = 60000, RESULTS_PAGE = 500;
  const foldersSig = () => folders.map((f) => f.folderToken).join('|');

  // ── קריאת תיקיות בסריקות רקע: הגבלת קריאות במקביל + ניסיון חוזר עם המתנה ──
  // אוצריא מגבילה את קצב הקריאות של תוסף. כשמתקבלת שגיאת עומס, מורידים את מספר הקריאות המקבילות וממתינים יותר.
  const crawlLim = { max: 6, active: 0, q: [] };
  const crawlAcquire = () => (crawlLim.active < crawlLim.max ? (crawlLim.active++, Promise.resolve()) : new Promise((r) => crawlLim.q.push(r)));
  const crawlRelease = () => {
    crawlLim.active--;
    while (crawlLim.q.length && crawlLim.active < crawlLim.max) { crawlLim.active++; crawlLim.q.shift()(); }
  };
  const isRateLimited = (e) => !!e && (e.retryable || /rate|limit|throttl|too_many|quota|busy/i.test(String(e.code || '') + ' ' + String(e.message || '')));
  // אוצריא מגבילה את קצב הקריאות (כ-100 בשנייה). מפזרים את הקריאות מראש במקום לחטוף שגיאת עומס ולחכות; אם בכל זאת מתקבלת שגיאה — מאטים.
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  let paceMs = 12, nextSlot = 0;
  const paceWait = async () => {
    const now = performance.now();
    nextSlot = Math.max(nextSlot, now) + paceMs;
    const w = nextSlot - paceMs - now;
    if (w > 0) await sleep(w);
  };
  async function listWithRetry(f, path, extra) {
    let err;
    for (let i = 0; ; i++) {
      await crawlAcquire();
      try {
        await paceWait();
        return await PV.call('fs.listUserFolder', Object.assign({ folderToken: f.folderToken, path }, extra || {}));
      } catch (e) {
        err = e;
        if (isRateLimited(e)) { crawlLim.max = Math.max(2, crawlLim.max - 1); paceMs = Math.min(40, Math.round(paceMs * 1.5)); }
      } finally { crawlRelease(); }
      if (err && (err.code === 'error.forbidden' || err.code === 'error.not_found')) break;
      if (i + 1 >= (isRateLimited(err) ? 5 : 2)) break;
      await sleep(Math.min(8000, 400 * Math.pow(2, i)));
    }
    throw err;
  }

  // ── שמירת המדד בין הפעלות (IndexedDB; אם אינו זמין — פשוט בלי שמירה) ──
  const IDX_KEY = 'folderIndex';
  function idbRun(mode, fn) {
    return new Promise((resolve, reject) => {
      let req;
      try { req = indexedDB.open('pv-folder-index', 1); } catch (e) { reject(e); return; }
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onerror = () => reject(req.error);
      req.onsuccess = () => {
        const db = req.result;
        try {
          const tx = db.transaction('kv', mode);
          const r = fn(tx.objectStore('kv'));
          tx.oncomplete = () => { db.close(); resolve(r && r.result); };
          tx.onerror = tx.onabort = () => { db.close(); reject(tx.error); };
        } catch (e) { db.close(); reject(e); }
      };
    });
  }
  const INDEX_FILE = 'folder-index.json';
  let lastSavedSig = '', resumeState = null;   // resumeState: מדד חלקי ששוחזר מהפעלה קודמת שנקטעה באמצע הסריקה
  function idxEntry(f, path, name, size) {
    const parent = /[\\/]/.test(path || '') ? String(path).replace(/[\\/][^\\/]*$/, '') : '';
    return { f, path, name, size, where: [f.name].concat(parent ? parent.split(/[\\/]/) : []).join(' / ') };
  }
  const entriesSig = (entries) => { let tot = 0; for (const x of entries) tot += x.size || 0; return foldersSig() + '|' + entries.length + '|' + tot; };
  // נתוני המדד לשמירה. complete=false — נקודת ביניים באמצע סריקה (עם frontier: התיקיות שעוד לא נסרקו, כדי להמשיך משם)
  function makeIndexData(entries, complete, tokens, sig, frontier) {
    const at = new Map(tokens.map((t, i) => [t, i]));
    const data = { v: 3, complete, sig, time: Date.now(), tokens, rows: entries.map((x) => [at.get(x.f.folderToken), x.path, x.size || 0]) };
    if (!complete) data.frontier = (frontier || []).map((c) => [at.get(c[0]), c[1], c[2]]);
    return data;
  }
  async function writeIndexData(data) {
    // קודם קובץ באחסון התוסף (אמין יותר), ואם לא הצליח — IndexedDB
    try { await PV.call('fs.writeFile', { path: INDEX_FILE, content: JSON.stringify(data) }); return true; } catch (e) { /* ננסה IndexedDB */ }
    try { await idbRun('readwrite', (st) => st.put(data, IDX_KEY)); return true; } catch (e) { return false; }
  }
  function saveIndexCache(entries, tokens, sig) {
    const s2 = entriesSig(entries);
    if (s2 === lastSavedSig) return;   // לא השתנה — לא כותבים שוב
    lastSavedSig = s2;
    writeIndexData(makeIndexData(entries, true, tokens, sig)).then((ok) => { if (!ok) lastSavedSig = ''; });
  }
  function clearIndexCache() {
    lastSavedSig = ''; resumeState = null;
    PV.call('fs.deleteEntry', { path: INDEX_FILE }).catch(() => {});
    idbRun('readwrite', (st) => st.delete(IDX_KEY)).catch(() => {});
  }
  const underExcluded = (f, path) => {
    const p = String(path || '');
    for (let i = 0; i < p.length; i++) if ((p[i] === '/' || p[i] === '\\') && excluded.has(f.folderToken + '|' + p.slice(0, i))) return true;
    return false;
  };
  async function readIndexData() {
    try { const r = await PV.call('fs.readFile', { path: INDEX_FILE }); if (r && r.content) { const j = JSON.parse(r.content); if (j && j.v === 3) return j; } } catch (e) { /* אין קובץ, או שנקטע באמצע כתיבה */ }
    try { const j = await idbRun('readonly', (st) => st.get(IDX_KEY)); if (j && j.v === 3) return j; } catch (e) { /* אין מדד שמור */ }
    return null;
  }
  async function loadIndexCache() {
    try {
      const data = await readIndexData();
      if (!data || data.sig !== foldersSig() || !Array.isArray(data.rows) || !Array.isArray(data.tokens) || folderIndex || indexing) return;
      const byTok = new Map(folders.map((f) => [f.folderToken, f]));
      const entries = [];
      for (const r of data.rows) {
        const f = byTok.get(data.tokens[r[0]]);
        if (!f) continue;
        const name = String(r[1]).split(/[\\/]/).pop();
        if (isListed(name) && !underExcluded(f, r[1])) entries.push(idxEntry(f, r[1], name, r[2]));
      }
      folderIndex = entries; indexTime = Number(data.time) || 0;
      if (data.complete === false) {
        // התוסף נסגר באמצע הסריקה: מציגים את מה שכבר נסרק, והסריקה ממשיכה מהתיקיות שנותרו
        const frontier = (Array.isArray(data.frontier) ? data.frontier : []).map((c) => ({ f: byTok.get(data.tokens[c[0]]), path: c[1], depth: c[2] })).filter((c) => c.f && !isExcluded(c.f, c.path));
        resumeState = { entries, frontier };
        indexNote = PV.t('המדד חלקי — הסריקה ממשיכה ברקע');
        lastSavedSig = '';
      } else { indexNote = ''; lastSavedSig = entriesSig(entries); }
    } catch (e) { /* אין מדד שמור */ }
  }

  /** מתחיל לסרוק את התיקיות ברקע (בלי לחכות לחיפוש), ומרענן את התוצאות אם יש טקסט בתיבת החיפוש. */
  function startBackgroundIndex() {
    if (!folders.length) return;
    buildIndex(true).then(() => { if ($('folders-search').value.trim()) runFolderSearch(); }).catch(() => {});
  }

  async function buildIndex(force) {
    if (folderIndex && !force) return folderIndex;
    if (indexing) return indexing;
    indexing = (async () => {
      for (;;) {
        const startSig = foldersSig();
        const startTokens = folders.map((f) => f.folderToken);
        const hadIndex = !!folderIndex;
        let resume = resumeState; resumeState = null;
        if (resume && !resume.frontier.length) resume = null;   // אין מה להמשיך — סורקים מהתחלה
        const entries = resume ? resume.entries.slice() : [];
        const seenKeys = resume ? new Set(entries.map((x) => x.f.folderToken + '|' + x.path)) : null;   // הגנה מכפילויות בהמשך סריקה
        partialIndex = entries;
        const states = [];
        let dirs = 0, failed = 0, tooDeep = 0, truncDirs = 0, capped = false, lastCkpt = Date.now(), lastCkptN = entries.length, ckptBusy = false;
        // נקודות ביניים (כל דקה לפחות): אם התוסף ייסגר באמצע, הסריקה תמשיך מאותו מקום. לא כותבים נקודות ביניים
        // כשכבר יש מדד שלם — כדי לא להחליף אותו במדד חלקי.
        const allowCkpt = !hadIndex || !!resume;
        const checkpoint = () => {
          if (!allowCkpt || ckptBusy || Date.now() - lastCkpt < 60000 || entries.length - lastCkptN < 500) return;
          ckptBusy = true; lastCkpt = Date.now(); lastCkptN = entries.length; lastSavedSig = '';
          const frontier = [];
          states.forEach((st) => Array.from(st.run).concat(st.queue.slice(st.qi)).forEach((c) => frontier.push([st.f.folderToken, c.path, c.depth])));
          writeIndexData(makeIndexData(entries, false, startTokens, startSig, frontier)).then(() => { ckptBusy = false; }, () => { ckptBusy = false; });
        };
        const crawl = (f, startQueue) => new Promise((resolve) => {
          const st = { f, queue: startQueue, qi: 0, run: new Set() };
          states.push(st);
          let running = 0;
          const work = async (cur) => {
            let d;
            try { d = await listWithRetry(f, cur.path, { extensions: extArg(EXT_LIST) }); } catch (e) { failed++; return; }
            dirs++;
            const m = await mergeTruncated(d, (ext) => listWithRetry(f, cur.path, { extensions: extArg([ext]) }));
            if (m.truncated) truncDirs++;
            for (const en of m.entries) {
              if (en.type === 'dir') {
                if (isExcluded(f, en.path)) continue;
                if (cur.depth < INDEX_MAX_DEPTH) st.queue.push({ path: en.path, depth: cur.depth + 1 }); else tooDeep++;
                continue;
              }
              if (!isListed(en.name)) continue;
              if (seenKeys) { const key = f.folderToken + '|' + en.path; if (seenKeys.has(key)) continue; seenKeys.add(key); }
              entries.push(idxEntry(f, en.path, en.name, en.size));
            }
            st.run.delete(cur);   // הושלמה — לא נכללת בנקודת הביניים כ„עוד לא נסרקה“
            if (onScan) onScan();
            checkpoint();
          };
          const pump = () => {
            if (entries.length >= INDEX_MAX_FILES) capped = true;
            while (!capped && running < 6 && st.qi < st.queue.length) {
              const cur = st.queue[st.qi++];
              running++; st.run.add(cur);
              work(cur).catch(() => { failed++; }).then(() => { running--; st.run.delete(cur); pump(); });
            }
            if (!running && (capped || st.qi >= st.queue.length)) resolve();
          };
          pump();
        });
        await Promise.all(folders.map((f) => crawl(f, resume
          ? resume.frontier.filter((c) => c.f === f).map((c) => ({ path: c.path, depth: c.depth }))
          : [{ path: '', depth: 0 }])));
        if (startSig !== foldersSig()) continue;   // התיקיות השתנו באמצע הסריקה — סורקים שוב
        const notes = [];
        if (failed) notes.push(PV.t('לא ניתן היה לקרוא {n} תיקיות — ייתכן שחלק מהקבצים חסרים', { n: failed }));
        if (capped) notes.push(PV.t('הסריקה נעצרה אחרי {n} קבצים — ייתכן שחלק מהקבצים חסרים', { n: INDEX_MAX_FILES }));
        if (truncDirs) notes.push(PV.t('בתיקיות {n} יש יותר מ-2,000 קבצים — חלק מהקבצים לא נכללו', { n: truncDirs }));
        if (tooDeep) notes.push(PV.t('תיקיות עמוקות מ-{n} רמות לא נסרקו', { n: INDEX_MAX_DEPTH }));
        indexNote = notes.join(' · ');
        indexTime = Date.now();
        folderIndex = entries; partialIndex = null;
        saveIndexCache(entries, startTokens, startSig);
        return entries;
      }
    })();
    try { return await indexing; } finally { indexing = null; partialIndex = null; }
  }

  let searchSeq = 0;
  const folderCollator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });
  // הדגשת מילות החיפוש בתוצאות — מתעלמת מניקוד, גרש/גרשיים ואותיות סופיות
  function makeHighlightRe(tokens) {
    const MARK = '[\\u0591-\\u05C7\\u05F3\\u05F4"\'`\\u2018-\\u201F]*';
    const finals = { 'כ': '[כך]', 'מ': '[מם]', 'נ': '[נן]', 'פ': '[פף]', 'צ': '[צץ]' };
    const parts = tokens.map((t) => Array.from(t).map((c) => (finals[c] || c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&')) + MARK).join(''));
    try { return new RegExp(parts.join('|'), 'gi'); } catch (e) { return null; }
  }
  PV.highlight = { makeRe: (tokens) => makeHighlightRe(tokens), apply: (el, re) => highlightIn(el, re) };
  function highlightIn(el, re) {
    if (!el || !re) return;
    const text = el.textContent;
    re.lastIndex = 0;
    const frag = document.createDocumentFragment();
    let last = 0, m, any = false;
    while ((m = re.exec(text)) && m[0].length) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      const mk = document.createElement('mark'); mk.textContent = m[0]; frag.appendChild(mk);
      last = m.index + m[0].length; any = true;
    }
    if (!any) return;
    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    el.textContent = ''; el.appendChild(frag);
  }
  async function runFolderSearch() {
    const raw = $('folders-search').value.trim();
    const ul = $('folder-results');
    const seq = ++searchSeq;
    if (!raw) {
      ul.hidden = true; ul.innerHTML = ''; ul.dataset.state = '';
      $('folders').hidden = false;
      $('folders-empty').hidden = folders.length > 0;
      return;
    }
    $('folders').hidden = true;
    $('folders-empty').hidden = true;
    ul.hidden = false;
    if (!folders.length) { ul.dataset.state = 'done'; ul.innerHTML = ''; const li = document.createElement('li'); li.className = 'panel-empty'; li.textContent = PV.t('עדיין לא נוספו תיקיות'); ul.appendChild(li); return; }
    // המדד נבנה מחדש ברקע אם עבר זמן (קבצים שנוספו בינתיים); התוצאות מתעדכנות כשהוא מוכן
    if (folderIndex && !indexing && Date.now() - indexTime > INDEX_TTL) {
      buildIndex(true).then(() => { if ($('folders-search').value.trim()) runFolderSearch(); }).catch(() => {});
    }
    const tokens = nrmSearch(raw).split(' ').filter(Boolean);
    // דירוג: מילה בתחילת שם הקובץ > בתוך השם > בנתיב התיקייה; שם זהה לחיפוש מקבל בונוס גדול
    const joined = tokens.join(' ');
    const score = (x) => {
      if (x.nk === undefined) { x.nk = nrmSearch(x.name.replace(/\.[^.]+$/, '')); x.dk = nrmSearch(x.where); x.ek = (x.name.match(/\.([^.]+)$/) || [])[1] ? (x.name.match(/\.([^.]+)$/)[1]).toLowerCase() : ''; }
      let sc = 0;
      for (const t of tokens) {
        const i = x.nk.indexOf(t);
        if (i >= 0) sc += (i === 0 || x.nk.charCodeAt(i - 1) === 32) ? 4 : 3;
        else if (x.dk.indexOf(t) >= 0 || x.ek === t) sc += 1;
        else return -1;
      }
      if (x.nk === joined) sc += 10; else if (x.nk.indexOf(joined) >= 0) sc += 2;
      return sc;
    };
    const match = (x) => { x._s = score(x); return x._s >= 0; };
    const hlRe = tokens.length ? makeHighlightRe(tokens) : null;
    let limit = RESULTS_PAGE, scanning = false, current = [], statusLi = null, drawnCount = -1;
    const draw = () => {
      ul.innerHTML = '';
      statusLi = null;
      if (scanning) {
        statusLi = document.createElement('li'); statusLi.className = 'panel-empty';
        ul.appendChild(statusLi);
      }
      current.sort(current.length <= 5000
        ? (a, b) => b._s - a._s || folderCollator.compare(a.name, b.name)
        : (a, b) => b._s - a._s || (a.nk < b.nk ? -1 : a.nk > b.nk ? 1 : 0));
      current.slice(0, limit).forEach((x) => {
        const li = document.createElement('li');
        const it = makeItem(fileIcon(x.name), x.name, x.where, () => Fs.openFolderFile(x.f.folderToken, x.path, x.name));
        it.setAttribute('data-path-info', x.where + ' / ' + x.name);
        if (hlRe) { highlightIn(it.querySelector('.li-title'), hlRe); highlightIn(it.querySelector('.li-sub'), hlRe); }
        li.appendChild(it);
        ul.appendChild(li);
      });
      if (!current.length) { if (!scanning) { const li = document.createElement('li'); li.className = 'panel-empty'; li.textContent = PV.t('לא נמצאו קבצים תואמים'); ul.appendChild(li); } }
      else if (current.length > limit) {
        const li = document.createElement('li'); li.className = 'panel-empty'; li.style.cursor = 'pointer';
        li.setAttribute('role', 'button'); li.tabIndex = 0;
        li.textContent = PV.t('מוצגות {a} מתוך {n} תוצאות — לחצו להצגת עוד', { a: limit, n: current.length });
        const more = () => { limit += RESULTS_PAGE; draw(); };
        li.addEventListener('click', more);
        li.addEventListener('keydown', (e) => { if (e.key === 'Enter') more(); });
        ul.appendChild(li);
      }
      if (!scanning && indexNote) { const li = document.createElement('li'); li.className = 'panel-empty'; li.textContent = indexNote; ul.appendChild(li); }
      drawnCount = current.length;
    };

    // סריקה ראשונה (אין עדיין מדד): מציגים מיד את מה שנמצא עד כה, ומעדכנים תוך כדי הסריקה
    let liveDone = false, timer = null, lastDraw = 0, lastPartial = null, seen = 0, live = null;
    if (!folderIndex) {
      scanning = true; ul.dataset.state = '';
      live = () => {
        if (liveDone || seq !== searchSeq) return;
        const now = Date.now();
        if (now - lastDraw < 300) { if (!timer) timer = setTimeout(() => { timer = null; live(); }, 300 - (now - lastDraw)); return; }
        lastDraw = now;
        const src = partialIndex || [];
        if (src !== lastPartial) { lastPartial = src; seen = 0; current = []; drawnCount = -1; }   // הסריקה התחילה מחדש
        if (tokens.length) for (; seen < src.length; seen++) if (match(src[seen])) current.push(src[seen]);
        const text = PV.t('סורק את התיקיות… נמצאו {n} קבצים', { n: src.length });
        if (drawnCount === current.length && statusLi) statusLi.textContent = text;   // בלי ציור מחדש כשאין תוצאות חדשות (שומר את הבחירה)
        else { draw(); if (statusLi) statusLi.textContent = text; }
      };
      onScan = live;
    }
    let idx;
    try {
      if (live) { live(); }
      idx = await buildIndex();
    } finally {
      liveDone = true; if (timer) clearTimeout(timer);
      if (onScan === live) onScan = null;
    }
    if (seq !== searchSeq) return;
    ul.dataset.state = 'done';
    scanning = false;
    current = tokens.length ? idx.filter(match) : [];
    draw();
  }
  const debouncedSearch = PV.debounce(runFolderSearch, 250);
  $('folders-search').addEventListener('input', debouncedSearch);
  PV.listNav($('folders-search'), $('folder-results'));
  PV.listNav($('history-search'), $('history-menu'));
  $('folders-search').addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && $('folders-search').value) { e.stopPropagation(); $('folders-search').value = ''; runFolderSearch(); }
  });

  Fs.openFolderFile = async function (folderToken, path, name, page) {
    try {
      const d = await PV.call('fs.openFolderFile', { folderToken, path });
      await Fs.openUrl(d.url, d.name || name, { page, source: { type: 'folder', folderToken, path }, size: d.size });
    } catch (e) { PV.error(PV.t('לא ניתן לפתוח את הקובץ: {e}', { e: PV.errMsg(e) })); }
  };

  /** פותח קובץ לפי נתיב מלא דרך אוצריא (בלי הגשר) כשהוא נמצא בתוך אחת התיקיות שב"התיקיות שלי".
   *  מחזיר true אם טופל (נפתח, או שנפתחה הודעת שגיאה), false אם הקובץ מחוץ לתיקיות ויש להשתמש בגשר. */
  Fs.openByPath = async function (absPath, name) {
    const nz = (p) => String(p || '').replace(/\//g, '\\').replace(/\\+$/, '').toLowerCase();
    const target = nz(absPath);
    let best = null, bestLen = 0;
    for (const f of folders) {
      const fp = nz(f.path);
      if (fp && target.indexOf(fp + '\\') === 0 && fp.length > bestLen) { best = f; bestLen = fp.length; }
    }
    if (!best) return false;
    const rel = String(absPath).slice(String(best.path).replace(/[\\/]+$/, '').length).replace(/^[\\/]+/, '');
    if (!rel) return false;
    let d = null;
    for (const cand of Array.from(new Set([rel, rel.replace(/\\/g, '/')]))) {
      try { d = await PV.call('fs.openFolderFile', { folderToken: best.folderToken, path: cand }); d._path = cand; break; } catch (e) { d = null; }
    }
    if (!d) return false;   // אוצריא לא פתחה — ממשיכים לגשר
    try { await Fs.openUrl(d.url, d.name || name, { source: { type: 'folder', folderToken: best.folderToken, path: d._path }, size: d.size }); }
    catch (e) { PV.error(PV.t('לא ניתן לפתוח את הקובץ: {e}', { e: PV.errMsg(e) })); }
    return true;
  };

  // ── קבצי ה-PDF שבתיקיות — בחיפוש הספרייה של אוצריא ────────────────────
  let syncing = false;
  Fs.syncLibrary = async function (opts) {
    if (!PV.hasOtz() || syncing) return;
    const statusEl = $('library-sync-status');
    const enabled = await PV.store.get('showInLibrary', true);
    if (enabled === false) { statusEl.textContent = ''; return; }
    syncing = true;
    try {
      const map = (await PV.store.get('libmap', null)) || { next: 1, items: {} };
      const books = [], used = {};
      let scanned = 0;
      for (const f of folders) {
        const queue = [{ path: '', depth: 0, cat: [f.name] }];
        while (queue.length && books.length < LIB_MAX_BOOKS) {
          const cur = queue.shift();
          let d;
          try { d = await listWithRetry(f, cur.path, { extensions: ['pdf'] }); }
          catch (e) { continue; }
          for (const en of d.entries || []) {
            if (en.type === 'dir') { if (cur.depth < MAX_DEPTH && !isExcluded(f, en.path)) queue.push({ path: en.path, depth: cur.depth + 1, cat: cur.cat.concat(en.name) }); continue; }
            const k = f.folderToken + '|' + en.path;
            let id = map.items[k] && map.items[k].id;
            if (!id) id = map.next++;
            used[k] = { id, folderToken: f.folderToken, path: en.path, name: en.name };
            books.push({ id, title: en.name.replace(/\.pdf$/i, '').slice(0, 300), categoryPath: ('/' + cur.cat.join('/')).slice(0, 300) });
            scanned++;
          }
          if (scanned && scanned % 200 === 0 && opts && opts.verbose) statusEl.textContent = PV.t('סורק… {n} קבצים', { n: scanned });
        }
      }
      map.items = used;
      await PV.store.set('libmap', map);
      await PV.call('library.setProviderBooks', { provider: PROVIDER, books });
      statusEl.textContent = books.length ? PV.t('{n} קבצי PDF מהתיקיות שלכם מופיעים בחיפוש הספרייה', { n: books.length }) : (folders.length ? PV.t('לא נמצאו קבצי PDF בתיקיות') : '');
      if (books.length >= LIB_MAX_BOOKS) statusEl.textContent += ' ' + PV.t('(הגעתם למגבלה של {n} קבצים — חלק מהקבצים לא נכללו)', { n: LIB_MAX_BOOKS });
    } catch (e) {
      statusEl.textContent = PV.t('הסנכרון לספרייה נכשל: {e}', { e: PV.errMsg(e) });
    } finally { syncing = false; }
  };

  Fs.openProviderBook = async function (ev) {
    if (!ev || ev.provider !== PROVIDER) return;
    const map = (await PV.store.get('libmap', null)) || { items: {} };
    const it = Object.values(map.items || {}).find((x) => x.id === ev.id);
    if (!it) { PV.error(PV.t('הקובץ "{n}" לא נמצא — נסו לרענן את התיקיות', { n: ev.title || '' })); return; }
    await Fs.openFolderFile(it.folderToken, it.path, it.name);
  };

  // ── חילוץ טקסט ממסמכי Office/EPUB ──────────────────────────────────────
  const dec = (s) => (s || '').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&#(\d+);/g, (m, n) => String.fromCharCode(Number(n))).replace(/&amp;/g, '&');
  async function extractZip(zip, kind) {
    if (kind === 'docx') {
      const entry = zip.file('word/document.xml');
      if (!entry) throw new Error('word/document.xml');
      const xml = await entry.async('string');
      // פסקאות עם הדגשות וכותרות (זול: לפי <w:b/> ו-pStyle של Heading/Title)
      const blocks = xml.split(/<\/w:p>/).map((p) => {
        const st = (p.match(/<w:pStyle w:val="([^"]+)"/) || [])[1] || '';
        const hm = /^(?:heading|כותרת)\s*(\d)/i.exec(st) || (/^title$/i.test(st) ? [0, '1'] : null);
        const runs = [];
        p.split(/<\/w:r>/).forEach((r) => {
          let t = '', m;
          const re = /<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
          while ((m = re.exec(r))) t += m[1] !== undefined ? m[1] : (m[0] === '<w:tab/>' ? '\t' : '\n');
          if (!t) return;
          const b = /<w:b(?:\s+w:val="(?:1|true|on)")?\s*\/>/.test(r);
          runs.push({ t: dec(t), b });
        });
        return { h: hm ? Math.min(+hm[1] || 1, 3) : 0, runs };
      });
      while (blocks.length && !blocks[blocks.length - 1].runs.length) blocks.pop();
      const text = blocks.map((b) => b.runs.map((r) => r.t).join('')).join('\n').replace(/\n{3,}/g, '\n\n').trim();
      return [{ title: '', text, blocks }];
    }
    if (kind === 'pptx') {
      const files = Object.keys(zip.files).filter((n) => /^ppt\/slides\/slide\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
      const parts = [];
      for (const n of files) {
        const xml = await zip.file(n).async('string');
        const paras = xml.split(/<\/a:p>/).map((p) => { let t = '', m; const re = /<a:t[^>]*>([^<]*)<\/a:t>/g; while ((m = re.exec(p))) t += m[1]; return dec(t); }).filter(Boolean);
        parts.push({ title: PV.t('שקופית {n}', { n: parts.length + 1 }), text: paras.join('\n') });
      }
      return parts;
    }
    if (kind === 'xlsx') {
      const shared = [];
      const se = zip.file('xl/sharedStrings.xml');
      if (se) {
        const xml = await se.async('string');
        let m; const re = /<si>([\s\S]*?)<\/si>/g;
        while ((m = re.exec(xml))) { let t = '', tm; const tr = /<t[^>]*>([^<]*)<\/t>/g; while ((tm = tr.exec(m[1]))) t += tm[1]; shared.push(dec(t)); }
      }
      const files = Object.keys(zip.files).filter((n) => /^xl\/worksheets\/sheet\d+\.xml$/.test(n))
        .sort((a, b) => parseInt(a.match(/(\d+)\.xml/)[1], 10) - parseInt(b.match(/(\d+)\.xml/)[1], 10));
      const parts = [];
      for (const n of files) {
        const xml = await zip.file(n).async('string');
        const rows = [];
        let rm; const rr = /<row\b[^>]*>([\s\S]*?)<\/row>/g;
        while ((rm = rr.exec(xml))) {
          const cells = []; let cm; const cr = /<c\b([^>]*)(?:\/>|>([\s\S]*?)<\/c>)/g;
          while ((cm = cr.exec(rm[1]))) {
            const at = cm[1] || '', inner = cm[2] || '';
            let v = '';
            if (/\st="inlineStr"/.test(at)) { let tm; const tr = /<t[^>]*>([^<]*)<\/t>/g; while ((tm = tr.exec(inner))) v += tm[1]; }
            else { const vm = /<v>([^<]*)<\/v>/.exec(inner); if (vm) v = /\st="s"/.test(at) ? (shared[parseInt(vm[1], 10)] || '') : vm[1]; }
            cells.push(dec(v));
          }
          rows.push(cells.join('\t'));
        }
        parts.push({ title: PV.t('גיליון {n}', { n: parts.length + 1 }), text: rows.join('\n') });
      }
      return parts;
    }
    // epub
    const container = await zip.file('META-INF/container.xml').async('string');
    const opfPath = (/full-path="([^"]+)"/.exec(container) || [])[1];
    if (!opfPath) throw new Error('OPF');
    const dir = opfPath.includes('/') ? opfPath.slice(0, opfPath.lastIndexOf('/') + 1) : '';
    const opf = await zip.file(opfPath).async('string');
    const manifest = {};
    let mm; const ir = /<item\b([^>]*)\/?>/g;
    while ((mm = ir.exec(opf))) { const id = /\sid="([^"]+)"/.exec(mm[1]), href = /\shref="([^"]+)"/.exec(mm[1]); if (id && href) manifest[id[1]] = href[1]; }
    const parts = [];
    let sm; const sr = /<itemref\b([^>]*)\/?>/g;
    while ((sm = sr.exec(opf))) {
      const idref = /\sidref="([^"]+)"/.exec(sm[1]);
      if (!idref || !manifest[idref[1]]) continue;
      const entry = zip.file(dir + decodeURIComponent(manifest[idref[1]])) || zip.file(dir + manifest[idref[1]]);
      if (!entry) continue;
      const html = await entry.async('string');
      const body = html.replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
        .replace(/<\/(p|div|h[1-6]|li|tr|br)\s*>|<br\s*\/?>/gi, '\n').replace(/<[^>]+>/g, '');
      const text = dec(body).replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim();
      const title = (/<title>([^<]*)<\/title>/i.exec(html) || [])[1];
      if (text) parts.push({ title: dec(title || '') || PV.t('פרק {n}', { n: parts.length + 1 }), text });
    }
    return parts;
  }
})();
