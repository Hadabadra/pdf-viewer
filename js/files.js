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

  // ── פתיחת Blob/File לפי סוג ───────────────────────────────────────────
  /** meta: { source, page } — source משמש לאחרונים ולחזרה לעמוד. */
  Fs.openBlob = async function (blob, name, meta) {
    const m = meta || {};
    const kind = kindOf(name, blob.type);
    if (!kind) { PV.error(PV.t('סוג הקובץ אינו נתמך: {n}', { n: name })); return false; }
    PV.progress.show(PV.t('פותח את {n}…', { n: name }));
    try {
      const open = { name, source: m.source || null, page: m.page };
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
        await V.open('text', { parts: [{ title: '', text: await blob.text() }] }, Object.assign(open, { zoom: 1 }));
      } else {
        const zip = await JSZip.loadAsync(await blob.arrayBuffer());
        const parts = await extractZip(zip, kind);
        await V.open('text', { parts: parts.length ? parts : [{ title: '', text: PV.t('(לא נמצא טקסט בקובץ)') }] }, Object.assign(open, { zoom: 1 }));
      }
      if (m.source) Fs.addRecent(Object.assign({ name, size: blob.size, kind }, m.source));
      return true;
    } catch (e) {
      PV.error(PV.t('לא ניתן לפתוח את הקובץ: {e}', { e: PV.errMsg(e) }));
      return false;
    } finally { PV.progress.hide(); }
  };

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
  Fs.openUrl = async function (url, name, meta) {
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('HTTP ' + resp.status);
    return Fs.openBlob(await resp.blob(), name, meta);
  };

  // ── דיאלוג פתיחה ──────────────────────────────────────────────────────
  Fs.pick = async function () {
    if (PV.hasOtz()) {
      try {
        const r = await PV.call('fs.pickUserFile', { title: PV.t('פתיחת קובץ'), extensions: EXTENSIONS });
        if (!r || r.cancelled) return;
        await Fs.openUrl(r.url, r.name, { source: { type: 'token', token: r.token } });
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
  const keyOf = (s) => (s.type === 'token' ? 't:' + s.token : s.type === 'book' ? 'b:' + (s.bookUid || s.bookId) : s.type === 'folder' ? 'f:' + s.folderToken + ':' + s.path : '');
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
    t.className = 'li-title'; t.textContent = title; t.title = title;
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

  Fs.renderRecents = function () {
    [['recents', 'recents-empty', recents.length], ['welcome-recent-list', null, 6]].forEach(([listId, emptyId, max]) => {
      const ul = $(listId);
      ul.innerHTML = '';
      recents.slice(0, max).forEach((r) => {
        const sub = [r.type === 'book' ? PV.t('ספר מהספרייה') : PV.formatSize(r.size), r.page > 1 ? PV.t('עמוד {n}', { n: r.page }) : '', PV.relTime(r.ts)].filter(Boolean).join(' · ');
        ul.appendChild(makeItem(recentIcon(r), r.name, sub, () => Fs.openRecent(r), [['dismiss', PV.t('הסרה מהרשימה'), () => {
          recents = recents.filter((x) => x.key !== r.key);
          PV.store.set('recents', recents);
          Fs.renderRecents();
        }]]));
      });
      if (emptyId) $(emptyId).hidden = recents.length > 0;
    });
    $('welcome-recents').hidden = recents.length === 0;
  };

  Fs.openRecent = async function (r) {
    const page = PV.settings.resume ? r.page : undefined;
    try {
      if (r.type === 'token') {
        const d = await PV.call('fs.resolveFileUrl', { token: r.token });
        await Fs.openUrl(d.url, d.name || r.name, { source: { type: 'token', token: r.token }, page });
      } else if (r.type === 'book') {
        await Fs.openLibraryBook({ bookUid: r.bookUid, bookId: r.bookId, type: r.bookType || 'pdf', name: r.name }, page);
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
  $('btn-clear-recents').addEventListener('click', () => { recents = []; PV.store.set('recents', recents); Fs.renderRecents(); });

  // ── ספרי PDF מהספרייה של אוצריא ───────────────────────────────────────
  /** q: { bookUid?, id?, bookId?, type?, name? } */
  Fs.openLibraryBook = async function (q, page) {
    const query = q.bookUid ? { bookUid: q.bookUid } : q.id != null ? { id: q.id, type: q.type || 'pdf' } : { bookId: q.bookId, type: q.type || 'pdf' };
    const d = await PV.call('library.openBookFile', query);
    if (!d || !d.url) throw new Error(PV.t('לספר אין קובץ'));
    const name = d.name || ((q.name || PV.t('ספר')) + '.pdf');
    return Fs.openUrl(d.url, name, {
      page,
      source: { type: 'book', bookUid: q.bookUid || null, bookId: q.bookId || null, bookType: q.type || 'pdf' },
    });
  };

  /** ספרי PDF שפתוחים עכשיו בקורא של אוצריא. */
  Fs.refreshOpenBooks = async function () {
    const ul = $('open-books');
    ul.innerHTML = '';
    const st = PV.hasOtz() ? await PV.tryCall('reader.getCurrentState', {}) : null;
    const tabs = (st && st.openTabs ? st.openTabs : []).filter((t) => t.type === 'pdf' && !t.isSelf);
    tabs.forEach((t) => {
      const sub = t.index ? PV.t('עמוד {n}', { n: t.index }) : '';
      ul.appendChild(makeItem('book_open', t.book || t.bookId, sub, () => {
        Fs.openLibraryBook({ id: t.id, bookId: t.bookId, type: 'pdf', name: t.book }, t.index || 1)
          .catch((e) => PV.error(PV.t('לא ניתן לפתוח את הספר: {e}', { e: PV.errMsg(e) })));
      }));
    });
    $('open-books-empty').hidden = tabs.length > 0;
    return tabs;
  };

  // ── התיקיות שלי ───────────────────────────────────────────────────────
  let folders = [];
  Fs.loadFolders = async function () {
    const f = await PV.store.get('folders', []);
    folders = Array.isArray(f) ? f : [];
    Fs.renderFolders();
  };
  Fs.addFolder = async function () {
    if (!PV.hasOtz()) { PV.toast(PV.t('תיקיות זמינות בתוך אוצריא')); return; }
    try {
      const r = await PV.call('fs.pickUserFolder', { title: PV.t('הוספת תיקייה לצופה PDF+OCR') });
      if (!r || r.cancelled) return;
      if (!folders.some((f) => f.folderToken === r.folderToken)) folders.push({ folderToken: r.folderToken, name: r.name, path: r.path });
      await PV.store.set('folders', folders);
      Fs.renderFolders();
      PV.emit('show-files');
      PV.toast(PV.t('התיקייה "{n}" נוספה', { n: r.name }));
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
    Fs.renderFolders();
    Fs.syncLibrary();
  }

  Fs.renderFolders = function () {
    const ul = $('folders');
    ul.innerHTML = '';
    folders.forEach((f) => ul.appendChild(folderNode(f, '', f.name, f.path)));
    $('folders-empty').hidden = folders.length > 0;
  };
  function folderNode(f, path, label, sub) {
    const li = document.createElement('li');
    const row = makeItem('folder', label, sub, toggle, path === '' ? [['delete', PV.t('הסרת התיקייה'), () => removeFolder(f)]] : null);
    const kids = document.createElement('ul');
    kids.className = 'list';
    kids.hidden = true;
    let loaded = false;
    async function toggle() {
      kids.hidden = !kids.hidden;
      if (!kids.hidden && !loaded) {
        loaded = true;
        kids.innerHTML = '';
        try {
          const d = await PV.call('fs.listUserFolder', { folderToken: f.folderToken, path });
          const entries = (d && d.entries) || [];
          entries.forEach((en) => {
            if (en.type === 'dir') kids.appendChild(folderNode(f, en.path, en.name, ''));
            else if (kindOf(en.name)) {
              const li2 = document.createElement('li');
              li2.appendChild(makeItem(kindOf(en.name) === 'pdf' ? 'document_pdf' : kindOf(en.name) === 'image' || kindOf(en.name) === 'tiff' ? 'image' : 'document',
                en.name, PV.formatSize(en.size), () => Fs.openFolderFile(f.folderToken, en.path, en.name)));
              kids.appendChild(li2);
            }
          });
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
    }
    li.append(row, kids);
    return li;
  }

  Fs.openFolderFile = async function (folderToken, path, name, page) {
    try {
      const d = await PV.call('fs.openFolderFile', { folderToken, path });
      await Fs.openUrl(d.url, d.name || name, { page, source: { type: 'folder', folderToken, path } });
    } catch (e) { PV.error(PV.t('לא ניתן לפתוח את הקובץ: {e}', { e: PV.errMsg(e) })); }
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
        while (queue.length && books.length < 20000) {
          const cur = queue.shift();
          let d;
          try { d = await PV.call('fs.listUserFolder', { folderToken: f.folderToken, path: cur.path, extensions: ['pdf'] }); }
          catch (e) { continue; }
          for (const en of d.entries || []) {
            if (en.type === 'dir') { if (cur.depth < 6) queue.push({ path: en.path, depth: cur.depth + 1, cat: cur.cat.concat(en.name) }); continue; }
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
      const lines = xml.split(/<\/w:p>/).map((p) => {
        let t = '', m;
        const re = /<w:t[^>]*>([^<]*)<\/w:t>|<w:tab\/>|<w:br\/>/g;
        while ((m = re.exec(p))) t += m[1] !== undefined ? m[1] : (m[0] === '<w:tab/>' ? '\t' : '\n');
        return dec(t);
      });
      return [{ title: '', text: lines.join('\n').replace(/\n{3,}/g, '\n\n').trim() }];
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
