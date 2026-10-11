/* ספריית PDF+OCR — תוסף לאוצריא
 * סריקת תיקייה חד-פעמית (גישה קבועה) · חיפוש לפי חלק מהשם · צופה PDF (pdf.js)
 */
(function () {
  'use strict';

  const PLUGIN_VERSION = '4.0.0';
  const $ = (id) => document.getElementById(id);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const collator = new Intl.Collator('he', { numeric: true, sensitivity: 'base' });

  /* ═════════════════════ אייקונים (SVG inline, currentColor) ═════════════════════ */
  const ICONS = {
    search: '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>',
    x: '<line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>',
    folder: '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/>',
    'folder-plus': '<path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/><line x1="12" y1="11" x2="12" y2="17"/><line x1="9" y1="14" x2="15" y2="14"/>',
    file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/>',
    'chevron-down': '<polyline points="6 9 12 15 18 9"/>',
    'chevron-up': '<polyline points="18 15 12 9 6 15"/>',
    'chevron-left': '<polyline points="15 18 9 12 15 6"/>',
    'zoom-in': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="11" y1="8" x2="11" y2="14"/><line x1="8" y1="11" x2="14" y2="11"/>',
    'zoom-out': '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/><line x1="8" y1="11" x2="14" y2="11"/>',
    'fit-page': '<polyline points="8 6 12 2 16 6"/><polyline points="8 18 12 22 16 18"/><line x1="12" y1="2" x2="12" y2="22"/>',
    'fit-width': '<polyline points="6 8 2 12 6 16"/><polyline points="18 8 22 12 18 16"/><line x1="2" y1="12" x2="22" y2="12"/>',
    list: '<line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>',
    copy: '<rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
    refresh: '<polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>',
    trash: '<polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6m5 0V4a2 2 0 0 1 2-2h0a2 2 0 0 1 2 2v2"/>',
    sidebar: '<rect x="3" y="3" width="18" height="18" rx="2"/><line x1="15" y1="3" x2="15" y2="21"/>',
    alert: '<circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/>',
    plus: '<line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>',
    home: '<path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>',
    clock: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>',
    maximize: '<polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/><line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>',
    crop: '<path d="M6.13 1L6 16a2 2 0 0 0 2 2h15"/><path d="M1 6.13L16 6a2 2 0 0 1 2 2v15"/>',
    printer: '<polyline points="6 9 6 2 18 2 18 9"/><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"/><rect x="6" y="14" width="12" height="8"/>',
    download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
    pin: '<line x1="12" y1="17" x2="12" y2="22"/><path d="M5 17h14v-1.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1v4.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24z"/>',
    scan: '<path d="M3 7V5a2 2 0 0 1 2-2h2"/><path d="M17 3h2a2 2 0 0 1 2 2v2"/><path d="M21 17v2a2 2 0 0 1-2 2h-2"/><path d="M7 21H5a2 2 0 0 1-2-2v-2"/><line x1="7" y1="9" x2="17" y2="9"/><line x1="7" y1="12" x2="17" y2="12"/><line x1="7" y1="15" x2="13" y2="15"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4z"/>',
    hand: '<path d="M18 11V6a2 2 0 0 0-4 0v5"/><path d="M14 10V4a2 2 0 0 0-4 0v6"/><path d="M10 10.5V6a2 2 0 0 0-4 0v8"/><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15"/>',
    minimize: '<polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/><line x1="14" y1="10" x2="21" y2="3"/><line x1="3" y1="21" x2="10" y2="14"/>'
  };
  function svg(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' + (ICONS[name] || '') + '</svg>';
  }
  function hydrateIcons(root) {
    (root || document).querySelectorAll('[data-icon]').forEach((el) => {
      if (!el.firstChild) el.innerHTML = svg(el.getAttribute('data-icon'));
    });
  }

  /* ═════════════════════ עזרים ═════════════════════ */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function plural(n, one, many) {
    return n === 1 ? one : n.toLocaleString('he-IL') + ' ' + many;
  }
  function fmtSize(b) {
    if (!b && b !== 0) return '';
    if (b < 1024 * 1024) return Math.max(1, Math.round(b / 1024)) + ' KB';
    return (b / 1048576).toFixed(b < 10485760 ? 1 : 0) + ' MB';
  }
  function fmtDate(ts) {
    try { return new Date(ts).toLocaleString('he-IL', { dateStyle: 'medium', timeStyle: 'short' }); }
    catch (e) { return ''; }
  }
  function debounce(fn, ms) {
    let t = null;
    const d = (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); };
    d.flush = (...a) => { clearTimeout(t); fn(...a); };
    return d;
  }

  /* ═════════════════════ קריאות ל-API ═════════════════════ */
  async function call(method, payload, retries) {
    const max = retries == null ? 6 : retries;
    for (let i = 0; ; i++) {
      let res;
      try {
        res = await Otzaria.call(method, payload || {});
      } catch (e) {
        res = { success: false, error: { code: 'error.exception', message: String(e && e.message || e) } };
      }
      if (res && res.success) return res;
      const code = res && res.error && res.error.code;
      if (code === 'error.rate_limited' && i < max) { await sleep(70 + i * 70); continue; }
      return res || { success: false, error: { code: 'error.unknown', message: '' } };
    }
  }
  const store = {
    async get(key) { const r = await call('storage.get', { key }); return r.success ? r.data : null; },
    async set(key, value) { if (value == null) return call('storage.remove', { key }); return call('storage.set', { key, value }); },
    async remove(key) { return call('storage.remove', { key }); }
  };
  const toast = {
    msg: (m) => call('ui.showMessage', { message: m }),
    ok: (m) => call('ui.showSuccess', { message: m }),
    err: (m) => call('ui.showError', { message: m })
  };
  function errText(res) {
    const code = res && res.error && res.error.code || '';
    const msg = res && res.error && res.error.message || '';
    if (/permission/.test(code)) return 'אין הרשאה לפעולה. בדקו את הרשאות התוסף בהגדרות אוצריא.';
    if (/folder no longer exists/.test(msg)) return 'התיקייה אינה זמינה כרגע (ייתכן שהכונן מנותק).';
    if (/unknown folder token/.test(msg)) return 'הגישה לתיקייה בוטלה. יש לבחור את התיקייה מחדש.';
    if (/not_found/.test(code)) return 'הפריט לא נמצא — ייתכן שהוזז או נמחק.';
    if (/forbidden/.test(code)) return 'הגישה לנתיב נחסמה.';
    if (/unknown_method/.test(code)) return 'גרסת אוצריא ישנה מדי עבור התוסף (נדרשת 0.9.98 ומעלה).';
    if (/unsupported/.test(code)) return 'לספר הזה אין קובץ מקומי (ספר טקסט מהמאגר). אפשר לחלץ ממנו טקסט בכפתור "חלץ טקסט" בקורא.';
    return msg || 'אירעה שגיאה';
  }

  /* ═════════════════════ ערכת נושא (כל הצבעים מה-API) ═════════════════════ */
  function hexToRgba(hex, alpha) {
    let h = String(hex || '').replace('#', '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (h.length === 8) h = h.slice(0, 6);
    if (!/^[0-9a-f]{6}$/i.test(h)) return 'rgba(128, 128, 128, ' + alpha + ')';
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    return 'rgba(' + r + ', ' + g + ', ' + b + ', ' + alpha + ')';
  }
  const COLOR_MAP = {
    primary: '--color-primary', onPrimary: '--color-on-primary',
    secondary: '--color-secondary', onSecondary: '--color-on-secondary',
    secondaryContainer: '--color-secondary-container', onSecondaryContainer: '--color-on-secondary-container',
    surface: '--color-surface', onSurface: '--color-on-surface', onSurfaceVariant: '--color-on-surface-variant',
    surfaceContainerHigh: '--color-surface-container-high', surfaceContainerHighest: '--color-surface-container-highest',
    error: '--color-error', onError: '--color-on-error',
    errorContainer: '--color-error-container', onErrorContainer: '--color-on-error-container',
    outline: '--color-outline', outlineVariant: '--color-outline-variant', scrim: '--color-scrim'
  };
  function applyTheme(theme) {
    if (!theme || !theme.colorScheme) return;
    const cs = theme.colorScheme, root = document.documentElement;
    Object.keys(COLOR_MAP).forEach((k) => { if (cs[k]) root.style.setProperty(COLOR_MAP[k], cs[k]); });
    root.style.setProperty('--color-primary-subtle', hexToRgba(cs.primary, 0.12));
    root.style.setProperty('--color-secondary-subtle', hexToRgba(cs.secondary, 0.12));
    root.style.setProperty('--color-selection', hexToRgba(cs.primary, 0.35));
    root.style.setProperty('--shadow-soft', hexToRgba(cs.shadow || cs.scrim || '#000000', 0.28));
    document.body.classList.toggle('dark-mode', theme.mode === 'dark');
    const t = theme.typography;
    if (t) {
      if (t.uiFontFamily) root.style.setProperty('--font-ui', "'" + t.uiFontFamily + "', system-ui, sans-serif");
      if (t.fontFamily) root.style.setProperty('--font-main', "'" + t.fontFamily + "', 'David', serif");
      if (t.fontSize) {
        root.style.setProperty('--font-size-base', t.fontSize + 'px');
        // גודל גופן הקריאה משתנה עד 36 — הממשק מקבל גרסה מרוסנת כדי שלא יתנפח.
        const ui = Math.max(14, Math.min(18, Math.round(t.fontSize * 0.62)));
        root.style.setProperty('--ui-font-size', ui + 'px');
      }
      if (t.lineHeight) root.style.setProperty('--line-height', String(t.lineHeight));
    }
  }

  /* ═════════════════════ מצב ═════════════════════ */
  const DEFAULT_SETTINGS = { zoom: 'width', view: 'tree', restoreLast: true, invert: true, libClosed: false, fsFloatBtn: false, libW: 0, fsHideToolbar: true, fsHideTabs: true, hand: false, ocrEngine: 'tesseract', ocrQuality: '2', ocrLines: true, showInLibrary: true, tbOpen: true, tbExtract: true };
  const S = {
    settings: Object.assign({}, DEFAULT_SETTINGS),
    folders: [],             // [{ id, token, name, path, scannedAt, count }]
    files: {},               // id תיקייה -> [[path,size,mtime],…]
    folderIssue: '',         // הודעה כשהתיקייה לא זמינה
    entries: [],             // רשימת המסמכים
    byPath: new Map(),
    tree: null,
    expanded: new Set(),
    query: '',
    limit: 200,
    flatItems: [],
    kbIndex: -1,
    current: null,           // נתיב המסמך הפתוח
    scan: null,              // בקרת סריקה פעילה
    positions: {},           // נתיב -> עמוד אחרון
    recentFiles: [],         // מפתחות קבצים אחרונים (עד 20)
    pinned: [],              // מפתחות קבצים נעוצים
    homeShown: false
  };
  // לשוניות: path === null הוא הדף הראשי
  const T = { tabs: [{ id: 1, path: null, page: null }], active: 1, nextId: 2 };

  /* ═════════════════════ נרמול וחיפוש ═════════════════════ */
  const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  function normalize(s) {
    return String(s).toLowerCase()
      .replace(/[֑-ׇ]/g, '')
      .replace(/[׳״"'`´‘’“”]/g, '')
      .replace(/[ךםןףץ]/g, (c) => FINALS[c])
      .replace(/[_\-.,;:()\[\]{}\/\\|+]+/g, ' ')
      .replace(/\s+/g, ' ').trim();
  }
  function makeEntry(path, size, modified, folder, multi) {
    const tp = multi ? folder.name + '/' + path : path;       // נתיב תצוגה (עם שם התיקייה כשיש כמה)
    const i = tp.lastIndexOf('/');
    const name = i >= 0 ? tp.slice(i + 1) : tp;
    const dir = i >= 0 ? tp.slice(0, i) : '';
    const disp = name.replace(/\.pdf$/i, '');
    const key = folder.id ? folder.id + ':' + path : path;     // מפתח ייחודי (תיקייה ראשונה ישנה: הנתיב עצמו)
    return { key, path, ft: folder.token, tp, name, dir, disp, size: size || 0, mtime: modified || null, nk: normalize(disp), dk: normalize(dir) };
  }
  function rebuildEntries() {
    const multi = S.folders.length > 1, out = [];
    for (const f of S.folders) for (const r of (S.files[f.id] || [])) out.push(makeEntry(r[0], r[1], r[2], f, multi));
    out.sort((a, b) => collator.compare(a.tp, b.tp));
    S.entries = out;
    S.byPath = new Map(out.map((e) => [e.key, e]));
    restoreExtra();
    S.tree = buildTree(out);
    scheduleProviderSync();
  }
  function folderLabel() {
    return S.folders.length === 1 ? S.folders[0].name : S.folders.length.toLocaleString('he-IL') + ' תיקיות';
  }
  function buildTree(entries) {
    const root = { name: '', path: '', dirs: new Map(), files: [], count: 0 };
    for (const e of entries) {
      const parts = e.tp.split('/');
      let node = root;
      node.count++;
      for (let i = 0; i < parts.length - 1; i++) {
        const seg = parts[i];
        let child = node.dirs.get(seg);
        if (!child) {
          child = { name: seg, path: parts.slice(0, i + 1).join('/'), dirs: new Map(), files: [], count: 0 };
          node.dirs.set(seg, child);
        }
        child.count++;
        node = child;
      }
      node.files.push(e);
    }
    return root;
  }
  function searchEntries(q) {
    const tokens = normalize(q).split(' ').filter(Boolean);
    if (!tokens.length) return { tokens, results: [] };
    const joined = tokens.join(' ');
    const out = [];
    for (const e of S.entries) {
      let score = 0, ok = true;
      for (const t of tokens) {
        const idx = e.nk.indexOf(t);
        if (idx >= 0) score += (idx === 0 || e.nk.charCodeAt(idx - 1) === 32) ? 4 : 3;
        else if (e.dk.indexOf(t) >= 0) score += 1;
        else { ok = false; break; }
      }
      if (!ok) continue;
      if (e.nk === joined) score += 10;
      else if (e.nk.indexOf(joined) >= 0) score += 2;
      out.push({ e, score });
    }
    out.sort((a, b) => b.score - a.score || collator.compare(a.e.disp, b.e.disp));
    return { tokens, results: out.map((x) => x.e) };
  }
  function highlighter(tokens) {
    if (!tokens.length) return (s) => esc(s);
    const MARK = '[\\u0591-\\u05C7\\u05F3\\u05F4"\']*';
    const finals = { 'כ': '[כך]', 'מ': '[מם]', 'נ': '[נן]', 'פ': '[פף]', 'צ': '[צץ]' };
    const parts = tokens.map((t) => Array.from(t).map((c) => {
      if (finals[c]) return finals[c] + MARK;
      return c.replace(/[.*+?^${}()|[\]\\\/]/g, '\\$&') + MARK;
    }).join(''));
    let re;
    try { re = new RegExp(parts.join('|'), 'gi'); } catch (e) { return (s) => esc(s); }
    return (s) => {
      let out = '', last = 0, m;
      re.lastIndex = 0;
      while ((m = re.exec(s)) && m[0].length) {
        out += esc(s.slice(last, m.index)) + '<mark>' + esc(m[0]) + '</mark>';
        last = m.index + m[0].length;
      }
      return out + esc(s.slice(last));
    };
  }

  /* ═════════════════════ ספרייה — רינדור ═════════════════════ */
  const el = {};
  function cacheEls() {
    ['app', 'workspace', 'library', 'search', 'search-clear', 'lib-meta', 'lib-list', 'viewer', 'viewer-toolbar', 'viewer-body',
      'toc-panel', 'toc-list', 'pages-scroll', 'pages', 'doc-status', 'stage', 'btn-toc', 'btn-library', 'btn-settings',
      'tb-prev', 'tb-next', 'page-input', 'page-total', 'tb-zoom-out', 'tb-zoom-in', 'zoom-select', 'tb-fit-width', 'tb-fit-page',
      'no-text-chip', 'settings-panel', 'settings-scrim', 'tabbar', 'tabs', 'tab-add', 'btn-fullscreen',
      'tb-crop', 'tb-print', 'crop-hint', 'modal-scrim', 'modal', 'fs-exit', 'lib-resizer', 'tb-hand', 'tb-ocr', 'ocr-menu', 'text-panel', 'tp-title', 'tp-sub', 'tp-output', 'tp-footer', 'tp-close', 'ocr-progress', 'op-label', 'op-cancel', 'op-bar', 'op-fill'
    ].forEach((id) => { el[id] = $(id); });
  }

  function renderLibrary() {
    const list = el['lib-list'];
    const top = list.scrollTop;
    const q = S.query.trim();
    el['search-clear'].hidden = !S.query;

    if (!S.entries.length) {
      el['lib-meta'].innerHTML = '';
      list.innerHTML = '<div class="empty-note">לא נמצאו מסמכים בתיקייה.</div>';
      S.flatItems = [];
      return;
    }

    let html = '';
    if (q) {
      const { tokens, results } = searchEntries(q);
      const hl = highlighter(tokens);
      S.flatItems = results.slice(0, S.limit);
      el['lib-meta'].innerHTML = '<span>' + (results.length ? plural(results.length, 'תוצאה אחת', 'תוצאות') : 'אין תוצאות') + '</span><span class="grow"></span>' + metaIssue();
      if (!results.length) {
        html = '<div class="empty-note">לא נמצא מסמך שמתאים ל־<strong>' + esc(q) + '</strong>.<br>נסו חלק קצר יותר מהשם, או מילה מהתיקייה.</div>';
      } else {
        html = S.flatItems.map((e, i) => fileRowFlat(e, hl, i)).join('');
        if (results.length > S.limit) {
          html += '<button class="more-btn" data-kind="more">הצגת עוד (' + (results.length - S.limit).toLocaleString('he-IL') + ')</button>';
        }
      }
    } else if (S.settings.view === 'flat') {
      S.flatItems = S.entries.slice(0, S.limit);
      el['lib-meta'].innerHTML = '<span>' + plural(S.entries.length, 'מסמך אחד', 'מסמכים') + '</span><span class="grow"></span>' + metaIssue();
      html = S.flatItems.map((e, i) => fileRowFlat(e, (s) => esc(s), i)).join('');
      if (S.entries.length > S.limit) {
        html += '<button class="more-btn" data-kind="more">הצגת עוד (' + (S.entries.length - S.limit).toLocaleString('he-IL') + ')</button>';
      }
    } else {
      S.flatItems = [];
      el['lib-meta'].innerHTML = '<span>' + plural(S.entries.length, 'מסמך אחד', 'מסמכים') + '</span><span class="grow"></span>' + metaIssue();
      html = treeHtml(S.tree, 0);
    }
    list.innerHTML = html;
    list.scrollTop = top;
    S.kbIndex = q && S.flatItems.length ? 0 : -1;
    markKb();
  }
  function metaIssue() {
    return S.folderIssue ? '<span class="meta-warn" title="' + esc(S.folderIssue) + '">' + esc(S.folderIssue) + '</span>' : '';
  }
  function fileRowFlat(e, hl, i) {
    const sel = e.key === S.current ? ' selected' : '';
    return '<div class="lib-item' + sel + '" role="option" data-kind="file" data-i="' + i + '" data-path="' + esc(e.key) + '" title="' + esc(e.tp) + '">' +
      svg('file') +
      '<div class="lib-text"><div class="lib-name">' + hl(e.disp) + '</div>' +
      (e.dir ? '<div class="lib-path">' + hl(e.dir.split('/').join(' ‹ ')) + '</div>' : '') + '</div>' +
      '<span class="lib-size">' + fmtSize(e.size) + '</span></div>';
  }
  function treeHtml(node, depth) {
    let out = '';
    const dirs = Array.from(node.dirs.values()).sort((a, b) => collator.compare(a.name, b.name));
    for (const d of dirs) {
      const open = S.expanded.has(d.path);
      out += '<div class="tree-row dir' + (open ? ' open' : '') + '" data-kind="dir" data-path="' + esc(d.path) + '" style="--depth:' + depth + '">' +
        '<span class="tree-chev">' + svg('chevron-left') + '</span>' + svg('folder') +
        '<span class="tree-name">' + esc(d.name) + '</span><span class="tree-count">' + d.count.toLocaleString('he-IL') + '</span></div>';
      if (open) out += '<div class="tree-children">' + treeHtml(d, depth + 1) + '</div>';
    }
    const files = node.files.slice().sort((a, b) => collator.compare(a.disp, b.disp));
    for (const f of files) {
      const sel = f.key === S.current ? ' selected' : '';
      out += '<div class="tree-row file' + sel + '" data-kind="file" data-path="' + esc(f.key) + '" style="--depth:' + depth + '" title="' + esc(f.tp) + '">' +
        '<span class="tree-chev" style="visibility:hidden">' + svg('chevron-left') + '</span>' + svg('file') +
        '<span class="tree-name">' + esc(f.disp) + '</span></div>';
    }
    return out;
  }
  function markKb() {
    const items = el['lib-list'].querySelectorAll('.lib-item');
    items.forEach((n) => n.classList.remove('kb-focus'));
    if (S.kbIndex >= 0 && items[S.kbIndex]) {
      items[S.kbIndex].classList.add('kb-focus');
      items[S.kbIndex].scrollIntoView({ block: 'nearest' });
    }
  }
  function toggleDir(path) {
    if (S.expanded.has(path)) S.expanded.delete(path); else S.expanded.add(path);
    renderLibrary();
  }
  function expandTo(path) {
    const en = S.byPath.get(path);
    const parts = (en ? en.tp : path).split('/');
    for (let i = 1; i < parts.length; i++) S.expanded.add(parts.slice(0, i).join('/'));
  }
  function markSelected() {
    el['lib-list'].querySelectorAll('.selected').forEach((n) => n.classList.remove('selected'));
    const n = Array.from(el['lib-list'].querySelectorAll('[data-kind="file"]')).find((x) => x.getAttribute('data-path') === S.current);
    if (n) n.classList.add('selected');
  }

  /* ═════════════════════ במה: פתיחה ראשונה / סריקה / ריק / שגיאה ═════════════════════ */
  function showStage(html, cls) {
    S.homeShown = false;
    document.body.classList.toggle('home-mode', cls === 'home');
    el.stage.className = 'stage' + (cls ? ' ' + cls : '');
    el.stage.innerHTML = html;
    el.stage.hidden = false;
    hydrateIcons(el.stage);
  }
  function hideStage() { S.homeShown = false; document.body.classList.remove('home-mode'); el.stage.hidden = true; el.stage.innerHTML = ''; }
  function setNarrowView(view) { el.workspace.classList.toggle('show-viewer', view === 'viewer'); }

  function stageOnboard() {
    el.workspace.classList.add('no-folder');
    setNarrowView('viewer');
    showStage(
      '<div class="card stage-card">' +
      '<div class="stage-icon" data-icon="folder"></div>' +
      '<div class="stage-title">טעינת תיקייה</div>' +
      '<div class="stage-text">בחרו תיקייה אחת שמכילה את המסמכים שלכם, כולל תתי־התיקיות.<br>' +
      'הסריקה נעשית <strong>פעם אחת</strong> והרשימה נשמרת — בפעמים הבאות הכול זמין מיד.</div>' +
      '<div class="stage-actions"><button class="btn-primary" id="st-pick"><span data-icon="folder-plus"></span>בחירת תיקייה</button></div>' +
      '</div>');
    $('st-pick').onclick = addFolder;
  }
  function stageEmpty() {
    el.workspace.classList.remove('no-folder');
    setNarrowView('library');
    const n = S.entries.length;
    if (!n) {
      showStage(
        '<div class="card stage-card"><div class="stage-icon" data-icon="alert"></div>' +
        '<div class="stage-title">לא נמצאו מסמכים</div>' +
        '<div class="stage-text">בתיקייה <strong>' + esc(folderLabel()) + '</strong> אין מסמכים נתמכים.</div>' +
        '<div class="stage-actions"><button class="btn-secondary" id="st-rescan"><span data-icon="refresh"></span>סריקה מחדש</button>' +
        '<button class="btn-primary" id="st-pick"><span data-icon="folder-plus"></span>בחירת תיקייה אחרת</button></div></div>');
      $('st-rescan').onclick = () => rescan();
      $('st-pick').onclick = addFolder;
      return;
    }
    showHome();
  }
  function stageError(title, text, withRepick) {
    el.workspace.classList.toggle('no-folder', !S.folders.length);
    setNarrowView('viewer');
    showStage(
      '<div class="card stage-card"><div class="stage-icon" data-icon="alert"></div>' +
      '<div class="stage-title">' + esc(title) + '</div><div class="stage-text">' + esc(text) + '</div>' +
      '<div class="stage-actions">' + (withRepick ? '<button class="btn-primary" id="st-pick"><span data-icon="folder-plus"></span>בחירת תיקייה</button>' : '') + '</div></div>', 'error');
    if (withRepick) $('st-pick').onclick = addFolder;
  }

  /* ═════════════════════ סריקת תיקייה ═════════════════════ */
  async function scanFolder(token, onProgress, ctl) {
    const files = [], queue = [''], truncated = [], failed = [];
    let inflight = 0, scanned = 0, rootErr = null, nextAt = 0;
    const worker = async () => {
      while (!ctl.cancelled) {
        const dir = queue.shift();
        if (dir === undefined) {
          if (inflight === 0) return;
          await sleep(4);
          continue;
        }
        inflight++;
        try {
          const now0 = performance.now();
          nextAt = Math.max(nextAt, now0) + 12;   // פיזור קריאות: ~80 לשנייה, מתחת למגביל של 100
          if (nextAt - now0 > 12) await sleep(nextAt - now0 - 12);
          const r = await call('fs.listUserFolder', { folderToken: token, path: dir, extensions: ['pdf'] });
          if (!r.success) {
            if (dir === '') rootErr = r; else failed.push(dir);
          } else {
            for (const e of r.data.entries) {
              if (e.type === 'dir') queue.push(e.path);
              else files.push([e.path, e.size || 0, e.modified || null]);
            }
            if (r.data.truncated) truncated.push(dir || '(שורש)');
          }
        } finally {
          inflight--; scanned++;
          onProgress({ scanned, found: files.length, dir });
        }
      }
    };
    await Promise.all([worker(), worker(), worker(), worker()]);
    return { files, truncated, failed, rootErr };
  }

  function pruneTabs() {
    T.tabs = T.tabs.filter((t) => !t.path || S.byPath.has(t.path));
    if (!T.tabs.length) T.tabs = [newTabObj()];
    if (!T.tabs.some((t) => t.id === T.active)) T.active = T.tabs[0].id;
  }

  // targets: מערך תיקיות לסריקה. opts.isNew — תיקייה חדשה שעוד לא נוספה לספרייה
  async function startScan(targets, opts) {
    opts = opts || {};
    const ctl = { cancelled: false };
    S.scan = ctl;
    setNarrowView('viewer');
    // סריקה ראשונה ללא ספרייה קיימת: הספרייה מוסתרת
    if (!S.entries.length) el.workspace.classList.add('no-folder');
    closeDoc(true);
    showStage(
      '<div class="card stage-card"><div class="spinner"></div>' +
      '<div class="stage-title">סורק את ' + (targets.length > 1 ? 'התיקיות' : 'התיקייה') + '…</div>' +
      '<div class="stage-stat" id="scan-stat">מתחיל…</div>' +
      '<div class="stage-sub" id="scan-dir"></div>' +
      '<div class="stage-text">הסריקה נעשית פעם אחת בלבד, ואפשר לסגור את החלון ולחזור.</div>' +
      '<div class="stage-actions"><button class="btn-secondary" id="scan-cancel">ביטול</button></div></div>');
    $('scan-cancel').onclick = () => { ctl.cancelled = true; };

    const results = [];
    let last = 0;
    for (let ti = 0; ti < targets.length && !ctl.cancelled; ti++) {
      const folder = targets[ti];
      const pre = targets.length > 1 ? folder.name + ' · ' : '';
      const result = await scanFolder(folder.token, (p) => {
        const now = performance.now();
        if (now - last < 120) return;
        last = now;
        const st = $('scan-stat'), dr = $('scan-dir');
        if (st) st.textContent = pre + 'נסרקו ' + p.scanned.toLocaleString('he-IL') + ' תיקיות · נמצאו ' + p.found.toLocaleString('he-IL') + ' מסמכים';
        if (dr) dr.textContent = p.dir || '/';
      }, ctl);
      results.push({ folder, result });
      if (opts.isNew && result.rootErr) break;
    }
    S.scan = null;

    const revokeNew = async () => { if (opts.isNew) for (const f of targets) await call('fs.revokeFolder', { folderToken: f.token }); };
    if (ctl.cancelled) {
      await revokeNew();
      if (S.entries.length) { renderAll(); showActiveTab(); } else { await resetFolderState(); stageOnboard(); }
      return false;
    }
    const bad = results.filter((r) => r.result.rootErr);
    if (opts.isNew && bad.length) {
      const text = errText(bad[0].result.rootErr);
      await revokeNew();
      S.folderIssue = '';
      if (S.entries.length) { renderAll(); showActiveTab(); toast.err(text); }
      else stageError('הסריקה נכשלה', text, true);
      return false;
    }

    const notes = [];
    for (const { folder, result } of results) {
      if (result.rootErr) { notes.push('הסריקה של "' + folder.name + '" נכשלה: ' + errText(result.rootErr)); continue; }
      result.files.sort((a, b) => collator.compare(a[0], b[0]));
      S.files[folder.id] = result.files;
      const meta = { id: folder.id, token: folder.token, name: folder.name, path: folder.path || '', scannedAt: Date.now(), count: result.files.length };
      const idx = S.folders.findIndex((f) => f.id === folder.id);
      if (idx >= 0) S.folders[idx] = meta; else S.folders.push(meta);
      if (result.truncated.length) notes.push('ב־' + folder.name + ': בתיקיות ' + result.truncated.length + ' יש יותר מ־2,000 פריטים — חלקם לא נכללו');
      if (result.failed.length) notes.push('ב־' + folder.name + ': לא ניתן היה לקרוא ' + result.failed.length + ' תיקיות');
    }
    S.folderIssue = '';
    rebuildEntries();
    S.expanded.clear();
    await saveIndex();
    await store.set('folders', S.folders);

    // לשוניות של מסמכים שכבר לא קיימים נסגרות
    pruneTabs();
    renderAll();
    showActiveTab();
    saveTabs();
    el.search.focus();
    if (notes.length) toast.msg(notes.join(' · '));
    return true;
  }

  async function saveIndex() {
    const payload = JSON.stringify({ v: 2, files: S.files });
    const r = await call('fs.writeFile', { path: 'index.json', content: payload });
    if (!r.success) toast.err('האינדקס לא נשמר (' + errText(r) + '). התיקיות יסרקו שוב בפתיחה הבאה.');
    return r.success;
  }
  async function loadIndex() {
    const r = await call('fs.readFile', { path: 'index.json' });
    if (!r.success) return null;
    try {
      const j = JSON.parse(r.data.content);
      if (j && j.v === 2 && j.files && typeof j.files === 'object') return j.files;
      if (j && j.v === 1 && Array.isArray(j.files)) return { '': j.files };   // מהגרסאות הקודמות
      return null;
    } catch (e) { return null; }
  }

  // הוספת תיקייה (גם הראשונה)
  async function addFolder() {
    const r = await call('fs.pickUserFolder', { title: 'בחירת תיקייה' });
    if (!r.success) { toast.err(errText(r)); return; }
    if (r.data.cancelled) return;
    const tok = r.data.folderToken;
    const dup = S.folders.find((f) => f.token === tok || (f.path && r.data.path && f.path === r.data.path));
    if (dup) {
      if (dup.token !== tok) await call('fs.revokeFolder', { folderToken: tok });
      toast.msg('התיקייה כבר בספרייה — מבצע סריקה מחדש');
      await startScan([dup], { isNew: false });
      return;
    }
    await startScan([{ id: 'f' + Date.now().toString(36), token: tok, name: r.data.name, path: r.data.path }], { isNew: true });
  }
  // id לא מוגדר = כל התיקיות
  async function rescan(id) {
    if (!S.folders.length) return addFolder();
    closeSettings();
    const targets = id == null ? S.folders.slice() : S.folders.filter((f) => f.id === id);
    if (targets.length) await startScan(targets, { isNew: false });
  }
  async function resetFolderState() {
    S.folders = []; S.files = {}; S.entries = []; S.byPath = new Map(); restoreExtra(); S.tree = null; S.expanded.clear(); S.query = ''; S.folderIssue = ''; scheduleProviderSync();
    el.search.value = '';
    resetTabs();
    renderLibrary();
  }
  async function removeFolder(id) {
    const f = S.folders.find((x) => x.id === id);
    if (!f) return;
    const c = await call('ui.showWarning', { title: 'הסרת התיקייה', content: 'הרשימה השמורה והגישה לתיקייה "' + f.name + '" יוסרו מהתוסף. הקבצים עצמם לא יימחקו.' });
    if (!c.success || !c.data || !c.data.confirmed) return;
    closeDoc(true);
    await call('fs.revokeFolder', { folderToken: f.token });
    S.folders = S.folders.filter((x) => x.id !== id);
    delete S.files[id];
    if (!S.folders.length) {
      await call('fs.deleteEntry', { path: 'index.json' });
      await store.remove('folders'); await store.remove('folder'); await store.remove('last'); await store.remove('tabs');
      await resetFolderState();
      closeSettings();
      S.current = null;
      stageOnboard();
      return;
    }
    rebuildEntries();
    S.expanded.clear();
    await saveIndex();
    await store.set('folders', S.folders);
    pruneTabs();
    renderAll();
    showActiveTab();
    saveTabs();
    refreshSettingsUi();
  }

  async function checkFolderAvailable() {
    if (!S.folders.length) return;
    const issues = [];
    for (const f of S.folders) {
      const r = await call('fs.listUserFolder', { folderToken: f.token, path: '', extensions: ['pdf'] });
      if (!r.success) {
        const why = /unknown folder token/.test(r.error && r.error.message || '') ? 'הגישה לתיקייה בוטלה' : 'התיקייה אינה זמינה כרגע';
        issues.push((S.folders.length > 1 ? f.name + ': ' : '') + why);
      }
    }
    S.folderIssue = issues.join(' · ');
    renderLibrary();
  }

  /* ═════════════════════ צופה PDF ═════════════════════ */
  const ZOOM_STEPS = [0.25, 0.33, 0.5, 0.67, 0.75, 0.9, 1, 1.1, 1.25, 1.5, 1.75, 2, 2.5, 3, 4, 5, 6];
  const PRESETS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];
  const V = {
    seq: 0, gen: 0, pdf: null, worker: null, token: null, path: null, numPages: 0,
    pages: [], base: [], scale: 1, mode: 'width', current: 1,
    active: 0, queue: new Set(), outline: null, destroyed: false
  };
  const WORKER_URL = new URL('vendor/pdf.worker.js', document.baseURI).href;
  const FONT_URL = new URL('vendor/standard_fonts/', document.baseURI).href;
  let workerBlobUrl = null, workerBlobTried = false;

  function setupPdfJs() {
    if (typeof pdfjsLib === 'undefined') return false;
    pdfjsLib.GlobalWorkerOptions.workerSrc = WORKER_URL;
    return true;
  }
  async function ensureWorkerBlob() {
    if (workerBlobTried) return workerBlobUrl;
    workerBlobTried = true;
    try {
      const ctl = new AbortController();
      const t = setTimeout(() => ctl.abort(), 4000);
      const r = await fetch(WORKER_URL, { signal: ctl.signal });
      clearTimeout(t);
      if (!r.ok) throw new Error('worker fetch failed');
      const txt = await r.text();
      workerBlobUrl = URL.createObjectURL(new Blob([txt], { type: 'text/javascript' }));
    } catch (e) { workerBlobUrl = null; }
    return workerBlobUrl;
  }
  function makeWorker() {
    if (!workerBlobUrl) return null;
    try { return new pdfjsLib.PDFWorker({ port: new Worker(workerBlobUrl) }); }
    catch (e) { workerBlobUrl = null; return null; }
  }

  function docStatus(html, cls) {
    el['doc-status'].className = 'doc-status' + (cls ? ' ' + cls : '');
    el['doc-status'].innerHTML = html;
    el['doc-status'].hidden = false;
    hydrateIcons(el['doc-status']);
  }
  function hideDocStatus() { el['doc-status'].hidden = true; el['doc-status'].innerHTML = ''; }

  function closeDoc(silent) {
    V.seq++; V.gen++;
    V.queue.clear();
    for (const p of V.pages) { try { p.task && p.task.cancel(); } catch (e) { /* */ } }
    const oldPdf = V.pdf, oldWorker = V.worker, oldToken = V.token;
    V.pdf = null; V.worker = null; V.token = null; V.pages = []; V.base = []; V.outline = null; V.path = null;
    el.pages.innerHTML = '';
    el['toc-list'].innerHTML = '';
    if (oldPdf) { try { oldPdf.destroy(); } catch (e) { /* */ } }
    if (oldWorker) { try { oldWorker.destroy(); } catch (e) { /* */ } }
    if (oldToken) call('fs.revokeFile', { token: oldToken });
    resetFind();
    setCrop(false);
    el['viewer-toolbar'].hidden = true;
    el['viewer-body'].hidden = true;
    el['btn-toc'].hidden = true;
    el['toc-panel'].hidden = true;
    el['btn-toc'].classList.remove('active');
    hideDocStatus();
    if (!silent) { S.current = null; markSelected(); stageEmpty(); }
  }

  const savePos = debounce(() => {
    if (!V.path || !V.numPages) return;
    S.positions[V.path] = V.current;
    const tb = activeTab();
    if (tb && tb.path === V.path) { tb.page = V.current; saveTabs(); }
    const keys = Object.keys(S.positions);
    if (keys.length > 150) delete S.positions[keys[0]];
    store.set('positions', S.positions);
    store.set('last', { path: V.path, page: V.current });
  }, 700);

  function askPassword(reason) {
    return new Promise((resolve) => {
      docStatus(
        '<div class="stage-icon" data-icon="alert"></div>' +
        '<div>' + (reason === 2 ? 'הסיסמה שגויה — נסו שוב' : 'המסמך מוגן בסיסמה') + '</div>' +
        '<div style="display:flex;gap:.5em;align-items:center"><input class="input" id="pw-input" type="password" style="width:14em" autofocus />' +
        '<button class="btn-primary" id="pw-ok">פתיחה</button></div>');
      const inp = $('pw-input');
      const done = () => resolve(inp.value);
      $('pw-ok').onclick = done;
      inp.onkeydown = (e) => { if (e.key === 'Enter') done(); };
      setTimeout(() => inp.focus(), 30);
    });
  }

  async function openDoc(path, opts) {
    opts = opts || {};
    const entry = S.byPath.get(path);
    if (!entry || (!entry.lib && !S.folders.length)) return;
    if (!setupPdfJs()) { toast.err('רכיב התצוגה לא נטען'); return; }
    if (V.path === path && V.pdf && !opts.force) { setNarrowView('viewer'); goToPage(opts.page || V.current); return; }
    const tab = activeTab();
    tab.path = path; tab.page = opts.page || null;
    if (!opts.norecord) recordOpen(path);
    renderTabs(); saveTabs();

    closeDoc(true);
    const seq = V.seq;
    V.path = path;
    S.current = path;
    markSelected();
    hideStage();
    setNarrowView('viewer');
    el['viewer-body'].hidden = false;
    docStatus('<div class="spinner"></div><div>פותח את המסמך…</div>');

    const r = await resolveSource(entry);
    if (seq !== V.seq) { if (r.success && !entry.lib) call('fs.revokeFile', { token: r.data.token }); return; }
    if (!r.success) {
      docStatus('<div class="stage-icon" data-icon="alert"></div><div>' + esc(errText(r)) + '</div>' +
        (entry.lib ? '' : '<button class="btn-secondary" id="ds-rescan"><span data-icon="refresh"></span>סריקה מחדש של התיקייה</button>'), 'error');
      if (entry.lib) dropExtra(path); else $('ds-rescan').onclick = () => rescan();
      V.path = null; S.current = null;
      return;
    }
    V.token = entry.lib ? null : r.data.token;
    const url = r.data.url;

    await ensureWorkerBlob();
    if (seq !== V.seq) return;

    let pdf = null, lastErr = null;
    for (let attempt = 0; attempt < 2 && !pdf; attempt++) {
      const worker = attempt === 0 ? makeWorker() : null;
      let workerDied = false;
      if (worker) worker.port.addEventListener('error', () => { workerDied = true; task.destroy(); });
      const params = { url, standardFontDataUrl: FONT_URL, isEvalSupported: false, enableXfa: false };
      if (worker) params.worker = worker;
      const task = pdfjsLib.getDocument(params);
      task.onProgress = (p) => {
        if (seq !== V.seq || !p.total) return;
        const pc = Math.min(100, Math.round(p.loaded / p.total * 100));
        const box = el['doc-status'];
        if (!box.hidden && box.querySelector('.spinner')) {
          box.lastElementChild.textContent = 'טוען… ' + pc + '%';
        }
      };
      task.onPassword = async (cb, reason) => {
        const pw = await askPassword(reason);
        docStatus('<div class="spinner"></div><div>פותח את המסמך…</div>');
        cb(pw);
      };
      try {
        pdf = await task.promise;
        V.worker = worker;
      } catch (e) {
        lastErr = e;
        if (worker) { try { worker.destroy(); } catch (x) { /* */ } }
        if (!workerDied) break; // כשל אמיתי בקובץ — אין טעם לנסות שוב
      }
      if (seq !== V.seq) { if (pdf) { pdf.destroy(); } return; }
    }
    if (seq !== V.seq) { if (pdf) pdf.destroy(); return; }
    if (!pdf) {
      const n = lastErr && lastErr.name;
      let msg = 'לא ניתן לפתוח את המסמך.';
      if (n === 'InvalidPDFException') msg = 'הקובץ אינו תקין או שהוא פגום.';
      else if (n === 'MissingPDFException') msg = 'הקובץ לא נמצא.';
      else if (n === 'PasswordException') msg = 'נדרשת סיסמה תקינה כדי לפתוח את המסמך.';
      docStatus('<div class="stage-icon" data-icon="alert"></div><div>' + esc(msg) + '</div>' +
        '<div class="stage-sub">' + esc(String(lastErr && lastErr.message || '')) + '</div>', 'error');
      V.path = null; S.current = null; markSelected();
      return;
    }

    V.pdf = pdf;
    V.numPages = pdf.numPages;
    const first = await pdf.getPage(1);
    if (seq !== V.seq) return;
    const vp = first.getViewport({ scale: 1 });
    V.base = new Array(V.numPages).fill(null).map(() => ({ w: vp.width, h: vp.height }));
    V.queue.clear();
    el['viewer-toolbar'].hidden = false;
    el['btn-toc'].hidden = false;
    buildPages();

    const z = S.settings.zoom;
    V.mode = z === 'page' ? 'page' : z === 'width' ? 'width' : 'custom';
    if (V.mode === 'custom') setScale(parseFloat(z) || 1, 'custom', true); else applyZoomMode(true);
    hideDocStatus();

    const startPage = Math.min(V.numPages, Math.max(1, opts.page || S.positions[path] || 1));
    V.current = startPage;
    el['page-total'].textContent = '/ ' + V.numPages.toLocaleString('he-IL');
    goToPage(startPage, null, true);
    updateVisible();
    updateToolbarState();
    el['pages-scroll'].focus({ preventScroll: true });
    savePos();
    loadOutline(pdf, seq);
  }

  /* ─── עמודים ─── */
  function buildPages() {
    const frag = document.createDocumentFragment();
    V.pages = [];
    for (let i = 1; i <= V.numPages; i++) {
      const d = document.createElement('div');
      d.className = 'page';
      d.setAttribute('data-page', String(i));
      frag.appendChild(d);
      V.pages.push({ num: i, el: d, rendered: false, rendering: false, hasContent: false, task: null, noText: null });
    }
    el.pages.innerHTML = '';
    el.pages.appendChild(frag);
  }
  function layoutPages() {
    const s = V.scale;
    for (let i = 0; i < V.pages.length; i++) {
      const p = V.pages[i], b = V.base[i], st = p.el.style;
      st.width = Math.floor(b.w * s) + 'px';
      st.height = Math.floor(b.h * s) + 'px';
      st.setProperty('--scale-factor', String(s));
    }
  }
  function pageAtY(y) {
    let lo = 0, hi = V.pages.length - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (V.pages[mid].el.offsetTop <= y) lo = mid; else hi = mid - 1;
    }
    return lo;
  }
  function goToPage(n, yPdf, instant) {
    if (!V.pages.length) return;
    n = Math.max(1, Math.min(V.numPages, n | 0));
    const p = V.pages[n - 1];
    let top = p.el.offsetTop - 8;
    if (yPdf != null && isFinite(yPdf)) top += Math.max(0, (V.base[n - 1].h - yPdf) * V.scale) - 4;
    el['pages-scroll'].scrollTop = Math.max(0, top);
    V.current = n;
    updateToolbarState();
    updateVisible();
  }

  function updateVisible() {
    if (!V.pdf || !V.pages.length) return;
    const sc = el['pages-scroll'];
    const st = sc.scrollTop, ch = sc.clientHeight, m = ch * 0.75;
    const a = pageAtY(Math.max(0, st - m)), b = pageAtY(st + ch + m);
    for (let i = a; i <= b; i++) {
      const p = V.pages[i];
      if (!p.rendered && !p.rendering) V.queue.add(p.num);
    }
    // מיקום נוכחי
    let cur = pageAtY(st + ch * 0.35) + 1;
    if (st + ch >= sc.scrollHeight - 2) cur = V.numPages;
    if (cur !== V.current) { V.current = cur; updateToolbarState(); savePos(); markTocCurrent(); }
    // פינוי זיכרון
    for (let i = 0; i < V.pages.length; i++) {
      if ((i < a - 4 || i > b + 4) && V.pages[i].hasContent) clearPage(V.pages[i]);
    }
    pump();
  }
  function clearPage(p) {
    const c = p.el.querySelector('canvas');
    if (c) { c.width = 0; c.height = 0; }
    p.el.textContent = '';
    p.el.classList.remove('rendered');
    p.hasContent = false; p.rendered = false; p.divs = null; p.strs = null;
  }
  function pump() {
    while (V.active < 2 && V.queue.size) {
      let best = null, bd = Infinity;
      V.queue.forEach((n) => { const d = Math.abs(n - V.current); if (d < bd) { bd = d; best = n; } });
      V.queue.delete(best);
      const p = V.pages[best - 1];
      if (!p || p.rendered || p.rendering) continue;
      V.active++;
      renderPage(p).finally(() => { V.active--; pump(); });
    }
  }

  async function renderPage(p) {
    p.rendering = true;
    const gen = V.gen, pdf = V.pdf;
    try {
      const page = await pdf.getPage(p.num);
      if (gen !== V.gen) return;
      const vp1 = page.getViewport({ scale: 1 });
      const b = V.base[p.num - 1];
      if (Math.abs(b.w - vp1.width) > 0.5 || Math.abs(b.h - vp1.height) > 0.5) {
        const sc = el['pages-scroll'];
        const above = p.el.offsetTop < sc.scrollTop;
        const oldH = p.el.offsetHeight;
        b.w = vp1.width; b.h = vp1.height;
        p.el.style.width = Math.floor(b.w * V.scale) + 'px';
        p.el.style.height = Math.floor(b.h * V.scale) + 'px';
        if (above) sc.scrollTop += p.el.offsetHeight - oldH;
        if (V.mode !== 'custom' && V.numPages <= 2) applyZoomMode(true);
      }
      const scale = V.scale;
      const viewport = page.getViewport({ scale });
      let dpr = Math.min(window.devicePixelRatio || 1, 3);
      const area = viewport.width * viewport.height * dpr * dpr;
      if (area > 16777216) dpr = Math.max(1, Math.sqrt(16777216 / (viewport.width * viewport.height)));

      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width * dpr));
      canvas.height = Math.max(1, Math.floor(viewport.height * dpr));
      const ctx = canvas.getContext('2d', { alpha: false });
      p.task = page.render({ canvasContext: ctx, viewport, transform: dpr !== 1 ? [dpr, 0, 0, dpr, 0, 0] : null });
      await p.task.promise;
      if (gen !== V.gen) return;

      let noText = false;
      const textDiv = document.createElement('div');
      textDiv.className = 'textLayer';
      try {
        const tc = await page.getTextContent();
        if (gen !== V.gen) return;
        noText = !tc.items.some((it) => it.str && it.str.trim());
        if (!noText) {
          const divs = [], strs = [];
          const tt = pdfjsLib.renderTextLayer({ textContentSource: tc, container: textDiv, viewport, textDivs: divs, textContentItemsStr: strs });
          p.divs = divs; p.strs = strs;
          await tt.promise;
          const end = document.createElement('div');
          end.className = 'endOfContent';
          textDiv.appendChild(end);
        }
      } catch (e) { /* שכבת הטקסט אופציונלית */ }
      if (gen !== V.gen) return;

      p.noText = noText;
      if (noText) { p.divs = null; p.strs = null; }
      p.el.textContent = '';
      p.el.appendChild(canvas);
      p.el.appendChild(textDiv);
      p.el.style.setProperty('--scale-factor', String(scale));
      p.el.classList.add('rendered');
      p.rendered = true; p.hasContent = true;
      applyHighlights(p);
      page.cleanup();
      if (p.num === V.current) updateToolbarState();
    } catch (e) {
      if (!(e && e.name === 'RenderingCancelledException')) { /* עמוד שנכשל — נשאר ריק */ }
    } finally {
      p.rendering = false; p.task = null;
      if (gen !== V.gen && V.pdf) scheduleVisible();
    }
  }
  const scheduleVisible = debounce(() => updateVisible(), 60);

  /* ─── זום ─── */
  function fitScale(mode) {
    const sc = el['pages-scroll'];
    const b = V.base[Math.max(0, V.current - 1)] || V.base[0];
    if (!b) return 1;
    const availW = Math.max(120, sc.clientWidth - 32);
    const availH = Math.max(120, sc.clientHeight - 24);
    const sw = availW / b.w;
    return mode === 'page' ? Math.min(sw, availH / b.h) : sw;
  }
  function applyZoomMode(noAnchor) {
    if (V.mode === 'width' || V.mode === 'page') setScale(fitScale(V.mode), V.mode, noAnchor);
    else updateZoomUi();
  }
  function setScale(ns, mode, noAnchor) {
    if (!V.pdf) return;
    ns = Math.max(0.2, Math.min(6, ns));
    if (mode) V.mode = mode;
    const sc = el['pages-scroll'];
    let anchor = null;
    if (!noAnchor && V.pages.length) {
      const cy = sc.scrollTop + sc.clientHeight / 2;
      const i = pageAtY(cy), pe = V.pages[i].el;
      anchor = { i, frac: (cy - pe.offsetTop) / Math.max(1, pe.offsetHeight), cx: sc.scrollLeft + sc.clientWidth / 2, old: V.scale };
    }
    V.scale = ns;
    V.gen++;                                  // מבטל רינדורים בטיסה
    V.pages.forEach((p) => { try { p.task && p.task.cancel(); } catch (e) { /* */ } p.rendered = false; });
    layoutPages();
    if (anchor) {
      const pe = V.pages[anchor.i].el;
      sc.scrollTop = pe.offsetTop + anchor.frac * pe.offsetHeight - sc.clientHeight / 2;
      sc.scrollLeft = anchor.cx * (ns / anchor.old) - sc.clientWidth / 2;
    }
    updateZoomUi();
    scheduleVisible();
  }
  function zoomStep(dir) {
    const cur = V.scale;
    let target = cur;
    if (dir > 0) target = ZOOM_STEPS.find((z) => z > cur * 1.01) || ZOOM_STEPS[ZOOM_STEPS.length - 1];
    else target = [...ZOOM_STEPS].reverse().find((z) => z < cur / 1.01) || ZOOM_STEPS[0];
    setScale(target, 'custom');
  }
  function buildZoomSelect() {
    const s = el['zoom-select'];
    s.innerHTML = '<option value="width">התאמה לרוחב</option><option value="page">התאמה לגובה</option>' +
      PRESETS.map((z) => '<option value="' + z + '">' + Math.round(z * 100) + '%</option>').join('') +
      '<option value="custom" hidden></option>';
    s.onchange = () => {
      const v = s.value;
      if (v === 'width' || v === 'page') { V.mode = v; applyZoomMode(); }
      else setScale(parseFloat(v), 'custom');
    };
  }
  function updateZoomUi() {
    const s = el['zoom-select'];
    const pct = Math.round(V.scale * 100) + '%';
    const opts = s.options;
    opts[0].textContent = 'התאמה לרוחב' + (V.mode === 'width' ? ' · ' + pct : '');
    opts[1].textContent = 'התאמה לגובה' + (V.mode === 'page' ? ' · ' + pct : '');
    const custom = opts[opts.length - 1];
    if (V.mode === 'width' || V.mode === 'page') s.value = V.mode;
    else {
      const preset = PRESETS.find((z) => Math.abs(z - V.scale) < 0.005);
      if (preset) s.value = String(preset);
      else { custom.textContent = pct; custom.hidden = false; s.value = 'custom'; }
    }
    el['tb-fit-width'].classList.toggle('active', V.mode === 'width');
    el['tb-fit-page'].classList.toggle('active', V.mode === 'page');
  }
  function updateToolbarState() {
    if (!V.pdf) return;
    const inp = el['page-input'];
    if (document.activeElement !== inp) inp.value = String(V.current);
    el['tb-prev'].disabled = V.current <= 1;
    el['tb-next'].disabled = V.current >= V.numPages;
    const p = V.pages[V.current - 1];
    el['no-text-chip'].hidden = !(p && p.noText === true);
  }

  /* ─── העתקה ─── */
  function selectionText() {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) return '';
    const n = sel.anchorNode;
    if (!n || !el['pages'].contains(n.nodeType === 1 ? n : n.parentNode)) return '';
    return sel.toString();
  }
  /* ─── תוכן עניינים ─── */
  async function loadOutline(pdf, seq) {
    let outline = null;
    try { outline = await pdf.getOutline(); } catch (e) { outline = null; }
    if (seq !== V.seq) return;
    V.outline = outline && outline.length ? outline : null;
    const list = el['toc-list'];
    list.innerHTML = '';
    if (!V.outline) {
      list.innerHTML = '<div class="empty-note">אין תוכן עניינים במסמך הזה.</div>';
      return;
    }
    let total = 0;
    (function count(a) { a.forEach((x) => { total++; x.items && count(x.items); }); })(V.outline);
    const openAll = total <= 40;
    list.appendChild(tocNodes(V.outline, 0, openAll));
  }
  function tocNodes(items, depth, openAll) {
    const frag = document.createDocumentFragment();
    items.forEach((it) => {
      const row = document.createElement('div');
      row.className = 'toc-item' + (it.bold ? ' bold' : '') + (openAll && it.items && it.items.length ? ' open' : '');
      row.style.setProperty('--depth', String(depth));
      const has = it.items && it.items.length;
      const tg = document.createElement('button');
      tg.className = 'toc-toggle' + (has ? '' : ' placeholder');
      tg.innerHTML = svg('chevron-left');
      tg.setAttribute('aria-label', 'הרחבה');
      const title = document.createElement('div');
      title.className = 'toc-title';
      title.textContent = it.title || '—';
      row.appendChild(tg); row.appendChild(title);
      frag.appendChild(row);
      let kids = null;
      if (has) {
        kids = document.createElement('div');
        kids.appendChild(tocNodes(it.items, depth + 1, openAll));
        kids.hidden = !openAll;
        frag.appendChild(kids);
        tg.onclick = (e) => {
          e.stopPropagation();
          const open = kids.hidden;
          kids.hidden = !open;
          row.classList.toggle('open', open);
        };
      }
      row._dest = it.dest;
      row.onclick = () => gotoDest(it.dest, row);
    });
    return frag;
  }
  async function resolveDest(dest) {
    if (!V.pdf || dest == null) return null;
    try {
      let d = dest;
      if (typeof d === 'string') d = await V.pdf.getDestination(d);
      if (!Array.isArray(d)) return null;
      const ref = d[0];
      let index;
      if (ref && typeof ref === 'object') index = await V.pdf.getPageIndex(ref);
      else if (Number.isInteger(ref)) index = ref;
      else return null;
      const type = d[1] && d[1].name;
      let y = null;
      if (type === 'XYZ') y = d[3]; else if (type === 'FitH' || type === 'FitBH') y = d[2];
      return { index, y };
    } catch (e) { return null; }
  }
  let tocCurrent = null;
  async function gotoDest(dest, row) {
    const r = await resolveDest(dest);
    if (!r) return;
    goToPage(r.index + 1, r.y);
    if (tocCurrent) tocCurrent.classList.remove('current');
    tocCurrent = row || null;
    if (row) row.classList.add('current');
    if (window.matchMedia('(max-width: 700px)').matches) toggleToc(false);
  }
  function markTocCurrent() { /* סימון הסעיף הנוכחי נעשה בלחיצה בלבד */ }
  function toggleToc(force) {
    const open = force == null ? el['toc-panel'].hidden : force;
    el['toc-panel'].hidden = !open;
    el['btn-toc'].classList.toggle('active', open);
  }


  /* ═════════════════════ חיפוש בתוך המסמך (שכבת הטקסט) ═════════════════════ */
  const F = { q: '', matches: [], cur: -1, ptext: new Map(), run: 0, open: false };
  function foldWithMap(str) {
    let out = '';
    const map = [];
    let prevSpace = true;
    for (let i = 0; i < str.length; i++) {
      let ch = str[i];
      if (/[֑-ׇ׳״"'`´‘’“”­]/.test(ch)) continue;
      if (/\s/.test(ch)) { if (prevSpace) continue; ch = ' '; prevSpace = true; }
      else prevSpace = false;
      if (FINALS[ch]) ch = FINALS[ch];
      out += ch.toLowerCase();
      map.push(i);
    }
    return { out, map };
  }
  async function pageText(n) {
    if (F.ptext.has(n)) return F.ptext.get(n);
    const pdf = V.pdf;
    const page = await pdf.getPage(n);
    const tc = await page.getTextContent();
    let orig = '';
    const ref = [];          // לכל תו במחרוזת: [פריט, היסט] או null לרווח וירטואלי
    tc.items.forEach((it, idx) => {
      const s = it.str || '';
      for (let k = 0; k < s.length; k++) ref.push([idx, k]);
      orig += s;
      if (it.hasEOL) { orig += ' '; ref.push(null); }
    });
    page.cleanup();
    const folded = foldWithMap(orig);
    const rec = { orig, ref, folded };
    F.ptext.set(n, rec);
    return rec;
  }
  function resetFind() {
    F.run++; F.q = ''; F.matches = []; F.cur = -1; F.ptext = new Map();
    const fb = $('findbar'); if (fb) fb.hidden = true;
    const fi = $('find-input'); if (fi) fi.value = '';
    const fc = $('find-count'); if (fc) { fc.textContent = ''; fc.classList.remove('none'); }
    const b = $('tb-find'); if (b) b.classList.remove('active');
    F.open = false;
  }
  function openFind() {
    if (!V.pdf) return;
    F.open = true;
    $('findbar').hidden = false;
    $('tb-find').classList.add('active');
    const inp = $('find-input');
    const sel = window.getSelection && window.getSelection().toString().trim();
    if (sel && sel.length < 80 && !sel.includes('\n') && selectionText()) { inp.value = sel; runFind(); }
    inp.focus(); inp.select();
  }
  function closeFind() {
    F.run++; F.q = ''; F.matches = []; F.cur = -1;
    $('findbar').hidden = true; $('tb-find').classList.remove('active'); F.open = false;
    $('find-count').textContent = '';
    V.pages.forEach((p) => clearHighlights(p));
    el['pages-scroll'].focus({ preventScroll: true });
  }
  function clearHighlights(p) {
    if (!p.divs || !p.hl) return;
    p.hl.forEach((i) => { if (p.divs[i]) p.divs[i].textContent = p.strs[i]; });
    p.hl = null;
  }
  function applyHighlights(p) {
    clearHighlights(p);
    if (!F.q || !p.divs || !p.strs || p.divs.length !== p.strs.length) return;
    const rec = F.ptext.get(p.num);
    if (!rec) return;
    // טווחים לפי פריט
    const perItem = new Map();
    F.matches.forEach((m, mi) => {
      if (m.page !== p.num) return;
      for (let o = m.start; o < m.end; o++) {
        const r = rec.ref[o];
        if (!r) continue;
        let a = perItem.get(r[0]);
        if (!a) { a = []; perItem.set(r[0], a); }
        const last = a[a.length - 1];
        if (last && last.mi === mi && last.e === r[1]) last.e = r[1] + 1;
        else a.push({ s: r[1], e: r[1] + 1, mi });
      }
    });
    p.hl = [];
    perItem.forEach((ranges, idx) => {
      const div = p.divs[idx], str = p.strs[idx];
      if (!div) return;
      const frag = document.createDocumentFragment();
      let pos = 0;
      ranges.forEach((r) => {
        if (r.s > pos) frag.appendChild(document.createTextNode(str.slice(pos, r.s)));
        const m = document.createElement('span');
        m.className = 'hl' + (r.mi === F.cur ? ' current' : '');
        m.textContent = str.slice(r.s, r.e);
        frag.appendChild(m);
        pos = r.e;
      });
      if (pos < str.length) frag.appendChild(document.createTextNode(str.slice(pos)));
      div.textContent = '';
      div.appendChild(frag);
      p.hl.push(idx);
    });
  }
  function scrollToCurrent() {
    const m = F.matches[F.cur];
    if (!m) return;
    const p = V.pages[m.page - 1];
    const node = p && p.el.querySelector('.hl.current');
    if (node) {
      const sc = el['pages-scroll'], r = node.getBoundingClientRect(), s = sc.getBoundingClientRect();
      if (r.top < s.top + 40 || r.bottom > s.bottom - 40) sc.scrollTop += (r.top - s.top) - sc.clientHeight / 2;
    } else if (V.current !== m.page) goToPage(m.page);
  }
  function updateFindCount(done, total) {
    const c = $('find-count');
    const n = F.matches.length;
    c.classList.toggle('none', !n && done && !!F.q);
    if (!F.q) c.textContent = '';
    else if (!n) c.textContent = done ? 'לא נמצא' : 'מחפש…';
    else c.textContent = (F.cur + 1) + ' / ' + n.toLocaleString('he-IL') + (done ? '' : '+');
  }
  function refreshAllHighlights() { V.pages.forEach((p) => { if (p.rendered) applyHighlights(p); else clearHighlights(p); }); }
  async function runFind() {
    const run = ++F.run;
    const q = foldWithMap($('find-input').value.trim()).out;
    F.q = q; F.matches = []; F.cur = -1;
    V.pages.forEach((p) => clearHighlights(p));
    if (!q) { updateFindCount(true); return; }
    const rq = Array.from(q).reverse().join('');
    const queries = rq === q ? [q] : [q, rq];
    const pdf = V.pdf, total = V.numPages;
    // מתחילים מהעמוד הנוכחי כדי שהתוצאה הראשונה תגיע מהר
    const order = [];
    for (let i = 0; i < total; i++) order.push(((V.current - 1 + i) % total) + 1);
    const byPage = new Map();
    let firstSet = false;
    for (let i = 0; i < order.length; i++) {
      const n = order[i];
      let rec;
      try { rec = await pageText(n); } catch (e) { continue; }
      if (run !== F.run || pdf !== V.pdf) return;
      const found = [];
      // חלק מקובצי ה-PDF שומרים עברית בסדר חזותי (הפוך): "מצה" נשמר כ-"הצמ", וגם סדר המילים מתהפך.
      // לכן מחפשים גם את השאילתה כמות שהיא וגם את ההיפוך המלא שלה.
      for (const needle of queries) {
        let from = 0, at;
        while ((at = rec.folded.out.indexOf(needle, from)) >= 0) {
          const a = rec.folded.map[at], b = rec.folded.map[at + needle.length - 1] + 1;
          found.push({ page: n, start: a, end: b });
          from = at + needle.length;
        }
      }
      found.sort((x, y) => x.start - y.start);
      for (let k = found.length - 1; k > 0; k--) {
        if (found[k].start < found[k - 1].end) found.splice(k, 1);   // מניעת כפילות/חפיפה
      }
      if (found.length) {
        const curM = F.matches[F.cur];
        byPage.set(n, found);
        // מיזוג לפי סדר עמודים
        F.matches = Array.from(byPage.keys()).sort((x, y) => x - y).flatMap((k) => byPage.get(k));
        if (curM) F.cur = F.matches.indexOf(curM);
        if (!firstSet) {
          firstSet = true;
          const startIdx = F.matches.findIndex((m) => m.page >= V.current);
          F.cur = startIdx >= 0 ? startIdx : 0;
          refreshAllHighlights(); scrollToCurrent();
        }
        updateFindCount(false, total);
        if (i % 6 === 0) refreshAllHighlights();
      }
      if (i % 4 === 3) { await sleep(0); $('find-count').title = Math.round((i + 1) / total * 100) + '%'; }
    }
    if (run !== F.run) return;
    // ה-cur עשוי להשתנות בגלל מיון — נמצא מחדש את התוצאה שנבחרה
    refreshAllHighlights();
    updateFindCount(true, total);
  }
  function stepFind(d) {
    const n = F.matches.length;
    if (!n) return;
    F.cur = (F.cur + d + n) % n;
    const m = F.matches[F.cur];
    updateFindCount(true, 0);
    refreshAllHighlights();
    if (!V.pages[m.page - 1].rendered) goToPage(m.page);
    scrollToCurrent();
    // אחרי רינדור העמוד ההדגשה מוחלת ב-renderPage; נגלול שוב
    setTimeout(scrollToCurrent, 250);
  }
  function wireFind() {
    const inp = $('find-input');
    const deb = debounce(runFind, 220);
    inp.addEventListener('input', deb);
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); if (deb.flush && F.q !== foldWithMap(inp.value.trim()).out) runFind(); else stepFind(e.shiftKey ? -1 : 1); }
      else if (e.key === 'Escape') { e.preventDefault(); closeFind(); }
    });
    $('find-next').onclick = () => stepFind(1);
    $('find-prev').onclick = () => stepFind(-1);
    $('find-close').onclick = closeFind;
    $('tb-find').onclick = () => (F.open ? closeFind() : openFind());
  }

  /* ═════════════════════ חלון דיאלוג ═════════════════════ */
  let modalOnClose = null;
  function openModal(html, onClose) {
    closeModal();
    modalOnClose = onClose || null;
    el.modal.innerHTML = html;
    el['modal-scrim'].hidden = false;
    hydrateIcons(el.modal);
  }
  function closeModal() {
    if (el['modal-scrim'].hidden) return;
    el['modal-scrim'].hidden = true;
    el.modal.innerHTML = '';
    const f = modalOnClose;
    modalOnClose = null;
    if (f) f();
  }

  // רינדור עמוד שלם ל-canvas (לחיתוך ולהדפסה). maxArea — תקרת פיקסלים
  async function renderToCanvas(pdf, n, scale, maxArea) {
    const page = await pdf.getPage(n);
    let vp = page.getViewport({ scale });
    const area = vp.width * vp.height;
    if (area > maxArea) { scale *= Math.sqrt(maxArea / area); vp = page.getViewport({ scale }); }
    const c = document.createElement('canvas');
    c.width = Math.max(1, Math.floor(vp.width));
    c.height = Math.max(1, Math.floor(vp.height));
    const ctx = c.getContext('2d', { alpha: false });
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, c.width, c.height);
    await page.render({ canvasContext: ctx, viewport: vp }).promise;
    page.cleanup();
    return { canvas: c, scale };
  }
  function canvasBlob(canvas, type, q) {
    return new Promise((res) => canvas.toBlob(res, type, q));
  }

  /* ═════════════════════ חיתוך אזור כתמונה ═════════════════════ */
  function setCrop(on, ocr) {
    V.crop = !!on && !!V.pdf;
    V.cropOcr = V.crop && !!ocr;
    el['crop-hint'].textContent = V.cropOcr ? 'גררו על העמוד לזיהוי טקסט באזור · Esc לביטול' : 'גררו על העמוד לבחירת אזור · Esc לביטול';
    el['pages-scroll'].classList.toggle('cropping', V.crop);
    el['tb-crop'].classList.toggle('active', V.crop);
    el['crop-hint'].hidden = !V.crop;
  }
  function wireCrop() {
    const sc = el['pages-scroll'];
    let drag = null, ov = null;
    const clamp = (v, a, b) => Math.min(Math.max(v, a), b);
    function paint() {
      const x = Math.min(drag.x0, drag.x1), y = Math.min(drag.y0, drag.y1);
      ov.style.left = (drag.pe.offsetLeft + x) + 'px';
      ov.style.top = (drag.pe.offsetTop + y) + 'px';
      ov.style.width = Math.abs(drag.x1 - drag.x0) + 'px';
      ov.style.height = Math.abs(drag.y1 - drag.y0) + 'px';
    }
    sc.addEventListener('pointerdown', (e) => {
      if (!V.crop || e.button !== 0) return;
      const pe = e.target.closest && e.target.closest('.page');
      if (!pe) return;
      e.preventDefault();
      const b = pe.getBoundingClientRect();
      const x = clamp(e.clientX - b.left, 0, b.width), y = clamp(e.clientY - b.top, 0, b.height);
      drag = { pe, x0: x, y0: y, x1: x, y1: y };
      ov = document.createElement('div');
      ov.className = 'crop-rect';
      el.pages.appendChild(ov);
      try { sc.setPointerCapture(e.pointerId); } catch (x2) { /* */ }
      paint();
    });
    sc.addEventListener('pointermove', (e) => {
      if (!drag) return;
      const b = drag.pe.getBoundingClientRect();
      drag.x1 = clamp(e.clientX - b.left, 0, b.width);
      drag.y1 = clamp(e.clientY - b.top, 0, b.height);
      paint();
    });
    const end = (e, cancel) => {
      if (!drag) return;
      const d = drag;
      drag = null;
      if (ov) { ov.remove(); ov = null; }
      try { sc.releasePointerCapture(e.pointerId); } catch (x) { /* */ }
      if (cancel) return;
      if (Math.abs(d.x1 - d.x0) < 6 || Math.abs(d.y1 - d.y0) < 6) return;
      const b = d.pe.getBoundingClientRect();
      finishCrop(+d.pe.getAttribute('data-page'),
        Math.min(d.x0, d.x1) / b.width, Math.min(d.y0, d.y1) / b.height,
        Math.max(d.x0, d.x1) / b.width, Math.max(d.y0, d.y1) / b.height);
    };
    sc.addEventListener('pointerup', (e) => end(e, false));
    sc.addEventListener('pointercancel', (e) => end(e, true));
  }
  async function finishCrop(n, x0, y0, x1, y1) {
    const pdf = V.pdf;
    if (!pdf) return;
    const forOcr = !!V.cropOcr;
    setCrop(false);
    if (forOcr) { ocrRegion(n, x0, y0, x1, y1); return; }
    openModal('<div class="modal-title">מכין תמונה…</div><div class="modal-body center"><div class="spinner"></div></div>');
    try {
      const scale = Math.max(2, Math.min(4, V.scale * 2));
      const { canvas } = await renderToCanvas(pdf, n, scale, 32e6);
      if (pdf !== V.pdf) { closeModal(); return; }
      const sx = Math.round(x0 * canvas.width), sy = Math.round(y0 * canvas.height);
      const sw = Math.max(1, Math.round((x1 - x0) * canvas.width)), sh = Math.max(1, Math.round((y1 - y0) * canvas.height));
      const out = document.createElement('canvas');
      out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.width = 0; canvas.height = 0;
      const blob = await canvasBlob(out, 'image/png');
      if (!blob) throw new Error('toBlob');
      showCropDialog(blob, sw, sh, n, out);
    } catch (e) {
      closeModal();
      toast.err('יצירת התמונה נכשלה');
    }
  }
  function showCropDialog(blob, w, h, n, srcCanvas) {
    const url = URL.createObjectURL(blob);
    const en = S.byPath.get(V.path);
    const fname = ((en ? en.disp : 'מסמך') + ' - עמוד ' + n).replace(/[\\/:*?"<>|]+/g, ' ').trim() + '.png';
    openModal(
      '<div class="modal-title">תמונה מהחיתוך</div>' +
      '<div class="modal-body center"><div class="crop-preview"><img id="crop-img" alt="תצוגה מקדימה"></div>' +
      '<div class="modal-meta">עמוד ' + n + ' · ' + w.toLocaleString('he-IL') + '×' + h.toLocaleString('he-IL') + ' פיקסלים · ' + fmtSize(blob.size) + '</div></div>' +
      '<div class="modal-actions"><button class="btn-primary" id="crop-copy"><span data-icon="copy"></span>העתקה ללוח</button>' +
      '<button class="btn-secondary" id="crop-save"><span data-icon="download"></span>שמירה כקובץ</button>' +
      '<button class="btn-secondary" id="crop-ocr"><span data-icon="scan"></span>זיהוי טקסט</button>' +
      '<button class="btn-secondary" id="crop-again"><span data-icon="crop"></span>חיתוך נוסף</button>' +
      '<button class="btn-secondary" id="crop-close">סגירה</button></div>',
      () => URL.revokeObjectURL(url));
    $('crop-img').src = url;
    $('crop-copy').onclick = async () => {
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
        toast.ok('התמונה הועתקה');
      } catch (e) { toast.err('ההעתקה ללוח אינה נתמכת כאן — אפשר לשמור כקובץ'); }
    };
    $('crop-save').onclick = () => {
      const a = document.createElement('a');
      a.href = url; a.download = fname;
      document.body.appendChild(a); a.click(); a.remove();
      toast.msg('שמירת התמונה התחילה');
    };
    $('crop-ocr').onclick = () => { const c = srcCanvas; closeModal(); if (c) ocrCanvasToPanel(c, 'זיהוי טקסט: אזור בעמוד ' + n); };
    $('crop-again').onclick = () => { closeModal(); setCrop(true); };
    $('crop-close').onclick = closeModal;
  }

  /* ═════════════════════ הדפסה (רק עמודי ה-PDF, בלי הממשק) ═════════════════════ */
  function parsePageRange(str, max) {
    const norm = String(str || '').replace(/[‎‏]/g, '').replace(/\s*[-–־]\s*/g, '-');
    const parts = norm.split(/[,;،\s]+/).filter(Boolean);
    if (!parts.length) return { error: 'הזינו טווח עמודים, למשל 1-3, 5' };
    const out = [], seen = new Set();
    for (const p of parts) {
      const m = /^(\d+)(?:-(\d+))?$/.exec(p);
      if (!m) return { error: 'טווח לא תקין: ' + p };
      let a = +m[1], b = m[2] ? +m[2] : a;
      if (a > b) { const t = a; a = b; b = t; }
      if (a < 1 || b > max) return { error: 'מספרי העמודים חייבים להיות בין 1 ל־' + max };
      for (let i = a; i <= b; i++) if (!seen.has(i)) { seen.add(i); out.push(i); }
    }
    return { pages: out };
  }
  function clearPrintArea() {
    const a = $('print-area');
    if (!a) return;
    a.querySelectorAll('img').forEach((im) => { try { URL.revokeObjectURL(im.src); } catch (e) { /* */ } });
    a.remove();
  }
  function openPrintDialog() {
    if (!V.pdf) return;
    setCrop(false);
    const N = V.numPages;
    openModal(
      '<div class="modal-title">הדפסה</div><div class="modal-body">' +
      '<label class="radio-row"><input type="radio" name="pr-scope" value="all" checked><span>כל המסמך (' + N.toLocaleString('he-IL') + ' עמודים)</span></label>' +
      '<label class="radio-row"><input type="radio" name="pr-scope" value="cur"><span>העמוד הנוכחי (' + V.current + ')</span></label>' +
      '<label class="radio-row"><input type="radio" name="pr-scope" value="range"><span>עמודים:</span>' +
      '<input class="input" id="pr-range" type="text" autocomplete="off" placeholder="למשל 1-3, 5, 8-10" style="flex:1"></label>' +
      '<div class="modal-error" id="pr-err"></div>' +
      '<div class="modal-meta">יודפסו עמודי המסמך בלבד — בלי סרגלים וכפתורים.</div></div>' +
      '<div class="modal-actions"><button class="btn-primary" id="pr-go"><span data-icon="printer"></span>הדפסה</button><button class="btn-secondary" id="pr-cancel">ביטול</button></div>');
    const range = $('pr-range'), err = $('pr-err');
    const radios = () => Array.from(el.modal.querySelectorAll('input[name="pr-scope"]'));
    range.addEventListener('focus', () => { radios().forEach((r) => { r.checked = r.value === 'range'; }); });
    const go = () => {
      const scope = (radios().find((r) => r.checked) || {}).value;
      let pages;
      if (scope === 'all') pages = Array.from({ length: N }, (_, i) => i + 1);
      else if (scope === 'cur') pages = [V.current];
      else {
        const r = parsePageRange(range.value, N);
        if (r.error) { err.textContent = r.error; range.focus(); return; }
        pages = r.pages;
      }
      runPrint(pages);
    };
    range.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); go(); } });
    $('pr-go').onclick = go;
    $('pr-cancel').onclick = closeModal;
  }
  async function runPrint(pages) {
    const pdf = V.pdf, ctl = { cancelled: false };
    openModal(
      '<div class="modal-title">מכין להדפסה…</div><div class="modal-body center"><div class="spinner"></div>' +
      '<div class="stage-stat" id="pr-prog">0 / ' + pages.length.toLocaleString('he-IL') + '</div></div>' +
      '<div class="modal-actions"><button class="btn-secondary" id="pr-stop">ביטול</button></div>',
      () => { ctl.cancelled = true; });
    $('pr-stop').onclick = closeModal;
    clearPrintArea();
    const area = document.createElement('div');
    area.id = 'print-area';
    document.body.appendChild(area);
    try {
      for (let i = 0; i < pages.length; i++) {
        if (ctl.cancelled || pdf !== V.pdf) { clearPrintArea(); return; }
        const { canvas } = await renderToCanvas(pdf, pages[i], 3, 24e6);
        const blob = await canvasBlob(canvas, 'image/jpeg', 0.92);
        canvas.width = 0; canvas.height = 0;
        if (!blob) throw new Error('toBlob');
        const img = new Image();
        img.src = URL.createObjectURL(blob);
        const wrap = document.createElement('div');
        wrap.className = 'print-page';
        wrap.appendChild(img);
        area.appendChild(wrap);
        const pg = $('pr-prog');
        if (pg) pg.textContent = (i + 1).toLocaleString('he-IL') + ' / ' + pages.length.toLocaleString('he-IL');
      }
    } catch (e) {
      clearPrintArea();
      modalOnClose = null; closeModal();
      toast.err('ההכנה להדפסה נכשלה');
      return;
    }
    if (ctl.cancelled || pdf !== V.pdf) { clearPrintArea(); return; }
    await Promise.all(Array.from(area.querySelectorAll('img')).map((im) => (im.decode ? im.decode().catch(() => {}) : Promise.resolve())));
    modalOnClose = null; closeModal();
    try { window.print(); } catch (e) { clearPrintArea(); toast.err('ההדפסה אינה זמינה בסביבה הזו'); }
  }

  /* ═════════════════════ סרגל צד (סגירה/פתיחה) ═════════════════════ */
  function isNarrow() { return window.matchMedia('(max-width: 700px)').matches; }
  function applyLibState() { el.workspace.classList.toggle('lib-collapsed', !!S.settings.libClosed); }
  function toggleLibrary() {
    if (isNarrow()) { setNarrowView(el.workspace.classList.contains('show-viewer') ? 'library' : 'viewer'); return; }
    S.settings.libClosed = !S.settings.libClosed;
    saveSettings();
    applyLibState();
  }
  function showLibrary() {
    if (isNarrow()) { setNarrowView('library'); return; }
    if (S.settings.libClosed) { S.settings.libClosed = false; saveSettings(); applyLibState(); }
  }

  /* ═════════════════════ מסך מלא ═════════════════════ */
  function applyFsFloat() { document.body.classList.toggle('fs-float', !!S.settings.fsFloatBtn); }
  function isFs() { return document.body.classList.contains('is-fullscreen'); }
  function updateFsBtn() {
    const on = isFs(), b = el['btn-fullscreen'];
    b.innerHTML = svg(on ? 'minimize' : 'maximize');
    b.title = on ? 'יציאה ממסך מלא' : 'מסך מלא';
    b.setAttribute('aria-label', b.title);
    b.classList.toggle('active', on);
  }
  async function setFullscreen(on) {
    document.body.classList.toggle('is-fullscreen', on);
    updateFsBtn();
    try {
      if (on) { if (!document.fullscreenElement && document.documentElement.requestFullscreen) await document.documentElement.requestFullscreen(); }
      else if (document.fullscreenElement && document.exitFullscreen) await document.exitFullscreen();
    } catch (e) { /* אם החלון לא מאפשר מסך מלא אמיתי — נשארים במצב מסך מלא בתוך התוסף */ }
  }

  /* ═════════════════════ קבצים אחרונים / נעוצים + דף ראשי ═════════════════════ */
  const RECENT_MAX = 20;
  function recordOpen(key) {
    S.recentFiles = [key].concat(S.recentFiles.filter((k) => k !== key)).slice(0, RECENT_MAX);
    store.set('recentFiles', S.recentFiles);
  }
  function togglePin(key) {
    const i = S.pinned.indexOf(key);
    if (i >= 0) S.pinned.splice(i, 1); else S.pinned.unshift(key);
    store.set('pinned', S.pinned);
    if (S.homeShown) renderHome();
  }
  function removeRecentFile(key) {
    S.recentFiles = S.recentFiles.filter((k) => k !== key);
    store.set('recentFiles', S.recentFiles);
    if (S.homeShown) renderHome();
  }
  function clearRecentFiles() {
    S.recentFiles = [];
    store.set('recentFiles', S.recentFiles);
    if (S.homeShown) renderHome();
  }
  function showHome() {
    closeDoc(true);
    S.current = null; markSelected();
    el.workspace.classList.remove('no-folder');
    setNarrowView('viewer');
    renderHome();
  }
  function homeRow(e, pinned) {
    return '<div class="recent-row"><button class="recent-item" data-open="' + esc(e.key) + '" title="' + esc(e.tp) + '">' + svg('file') +
      '<span class="recent-q">' + esc(e.disp) + '</span>' + (e.dir ? '<span class="recent-dir">' + esc(e.dir) + '</span>' : '') + '</button>' +
      '<button class="recent-x pin' + (pinned ? ' on' : '') + '" data-pin="' + esc(e.key) + '" title="' + (pinned ? 'ביטול נעיצה' : 'נעיצה') + '" aria-label="' + (pinned ? 'ביטול נעיצה' : 'נעיצה') + '">' + svg('pin') + '</button>' +
      (pinned ? '' : '<button class="recent-x" data-recent-x="' + esc(e.key) + '" title="הסרה מהרשימה" aria-label="הסרה מהרשימה">' + svg('x') + '</button>') + '</div>';
  }
  function renderHome() {
    const n = S.entries.length;
    const pinned = S.pinned.map((k) => S.byPath.get(k)).filter(Boolean);
    const pset = new Set(S.pinned);
    const recent = S.recentFiles.filter((k) => !pset.has(k)).map((k) => S.byPath.get(k)).filter(Boolean);
    let box = '';
    if (pinned.length) {
      box += '<div class="recent-head"><span>נעוצים</span></div><div class="recent-list">' + pinned.map((e) => homeRow(e, true)).join('') + '</div>';
    }
    box += '<div class="recent-head"' + (pinned.length ? ' style="margin-top:0.9em"' : '') + '><span>קבצים אחרונים</span>' +
      (recent.length ? '<button class="link-btn" id="recent-clear">ניקוי</button>' : '') + '</div>';
    box += recent.length
      ? '<div class="recent-list">' + recent.map((e) => homeRow(e, false)).join('') + '</div>'
      : '<div class="recent-empty">קבצים שתפתחו יופיעו כאן.</div>';
    showStage(
      '<div class="home-page"><div class="home-title"><span data-icon="home"></span>דף ראשי</div>' +
      '<div class="recent-box">' + box + '</div></div>', 'home');
    S.homeShown = true;
  }

  /* ═════════════════════ לשוניות ═════════════════════ */
  function activeTab() { return T.tabs.find((t) => t.id === T.active) || T.tabs[0]; }
  function newTabObj(path) { return { id: T.nextId++, path: path || null, page: null }; }
  function syncActiveTabPage() {
    const t = activeTab();
    if (t && V.pdf && V.path && t.path === V.path) t.page = V.current;
  }
  const saveTabs = debounce(() => {
    store.set('tabs', {
      list: T.tabs.map((t) => ({ path: t.path, page: t.page || null })),
      active: Math.max(0, T.tabs.findIndex((t) => t.id === T.active))
    });
  }, 400);
  function renderTabs() {
    const has = S.folders.length > 0 || T.tabs.some((t) => t.path);
    el.tabs.hidden = !has; el['tab-add'].hidden = !has;
    el.tabs.innerHTML = T.tabs.map((t) => {
      const e = t.path && S.byPath.get(t.path);
      const title = e ? e.disp : 'דף ראשי';
      const on = t.id === T.active;
      return '<div class="tab' + (on ? ' active' : '') + '" role="tab" tabindex="0" aria-selected="' + on + '" data-id="' + t.id + '" title="' + esc(e ? e.tp : 'דף ראשי') + '">' +
        svg(e ? 'file' : 'home') + '<span class="tab-title">' + esc(title) + '</span>' +
        '<button class="tab-close" data-close="' + t.id + '" title="סגירת לשונית" aria-label="סגירת לשונית" tabindex="-1">' + svg('x') + '</button></div>';
    }).join('');
    const a = el.tabs.querySelector('.tab.active');
    if (a && a.scrollIntoView) a.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  function showActiveTab() {
    const t = activeTab();
    if (t.path && S.byPath.has(t.path)) openDoc(t.path, { page: t.page || undefined, force: true, norecord: true });
    else { t.path = null; t.page = null; if (S.entries.length) showHome(); else stageEmpty(); }
    renderTabs();
  }
  function activateTab(id) {
    if (id === T.active || !T.tabs.some((t) => t.id === id)) return;
    syncActiveTabPage();
    T.active = id;
    showActiveTab();
    saveTabs();
  }
  // אם המסמך כבר פתוח בלשונית — עוברים אליה; אחרת פותחים (בלשונית הנוכחית או בחדשה)
  function openOrSwitch(key, inNewTab) {
    const t = T.tabs.find((x) => x.path === key);
    if (t) { activateTab(t.id); return; }
    if (inNewTab) addTab(key); else openDoc(key);
  }
  function addTab(path) {
    syncActiveTabPage();
    const t = newTabObj();
    T.tabs.push(t);
    T.active = t.id;
    if (path) { renderTabs(); openDoc(path, { force: true }); }
    else {
      showActiveTab();
      if (!isNarrow() && !S.settings.libClosed) el.search.focus();
    }
    saveTabs();
  }
  function closeTab(id) {
    const i = T.tabs.findIndex((t) => t.id === id);
    if (i < 0) return;
    const wasActive = id === T.active;
    T.tabs.splice(i, 1);
    if (!T.tabs.length) {
      T.tabs.push(newTabObj());
      T.active = T.tabs[0].id;
      showActiveTab();
    } else if (wasActive) {
      T.active = T.tabs[Math.min(i, T.tabs.length - 1)].id;
      showActiveTab();
    } else renderTabs();
    saveTabs();
  }
  function resetTabs() {
    T.tabs = [newTabObj()];
    T.active = T.tabs[0].id;
    renderTabs();
  }
  function wireTabs() {
    el.tabs.addEventListener('click', (e) => {
      const c = e.target.closest('[data-close]');
      if (c) { e.stopPropagation(); closeTab(+c.getAttribute('data-close')); return; }
      const t = e.target.closest('.tab');
      if (t) activateTab(+t.getAttribute('data-id'));
    });
    el.tabs.addEventListener('keydown', (e) => {
      if (e.key !== 'Enter' && e.key !== ' ') return;
      const t = e.target.closest && e.target.closest('.tab');
      if (t) { e.preventDefault(); activateTab(+t.getAttribute('data-id')); }
    });
    el.tabs.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
    el.tabs.addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const t = e.target.closest('.tab');
      if (t) { e.preventDefault(); closeTab(+t.getAttribute('data-id')); }
    });
    el['tab-add'].onclick = () => addTab();
    el['btn-fullscreen'].onclick = () => setFullscreen(!isFs());
    updateFsBtn();
    document.addEventListener('fullscreenchange', () => {
      if (!document.fullscreenElement && isFs()) { document.body.classList.remove('is-fullscreen'); updateFsBtn(); }
    });
    el['fs-exit'].onclick = () => setFullscreen(false);
    // דף ראשי: פתיחה / נעיצה / הסרה / ניקוי
    el.stage.addEventListener('click', (e) => {
      const x = e.target.closest('[data-recent-x]');
      if (x) { removeRecentFile(x.getAttribute('data-recent-x')); return; }
      const pn = e.target.closest('[data-pin]');
      if (pn) { togglePin(pn.getAttribute('data-pin')); return; }
      const o = e.target.closest('[data-open]');
      if (o) { const k = o.getAttribute('data-open'); openOrSwitch(k, e.ctrlKey || e.metaKey); return; }
      if (e.target.closest('#recent-clear')) clearRecentFiles();
    });
  }

  /* ═════════════════════ הגדרות ═════════════════════ */
  function openSettings() {
    refreshSettingsUi();
    el['settings-panel'].classList.add('open');
    el['settings-scrim'].classList.add('open');
  }
  function closeSettings() {
    el['settings-panel'].classList.remove('open');
    el['settings-scrim'].classList.remove('open');
  }
  function saveSettings() { return store.set('settings', S.settings); }

  function buildSegmented(id, options, key, onChange) {
    const box = $(id);
    box.innerHTML = options.map((o) =>
      '<button class="' + (String(S.settings[key]) === o.id ? 'active' : '') + '" data-id="' + o.id + '">' + o.label + '</button>').join('');
    box.querySelectorAll('[data-id]').forEach((b) => {
      b.onclick = () => {
        S.settings[key] = b.getAttribute('data-id');
        saveSettings();
        buildSegmented(id, options, key, onChange);
        onChange && onChange();
      };
    });
  }
  function setToggle(id, on, onChange) {
    const sw = $(id);
    sw.classList.toggle('on', !!on);
    sw.setAttribute('aria-checked', on ? 'true' : 'false');
    sw.onclick = () => {
      const v = !sw.classList.contains('on');
      sw.classList.toggle('on', v);
      sw.setAttribute('aria-checked', v ? 'true' : 'false');
      onChange(v);
    };
  }
  function refreshSettingsUi() {
    $('folder-list').innerHTML = S.folders.length ? S.folders.map((f) =>
      '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">' + esc(f.name) + '</div>' +
      '<div class="settings-row-subtitle">' + plural(f.count, 'מסמך אחד', 'מסמכים') + ' · נסרקה ב־' + fmtDate(f.scannedAt) + '</div></div>' +
      '<button class="icon-btn" data-rescan="' + esc(f.id) + '" title="סריקה מחדש" aria-label="סריקה מחדש">' + svg('refresh') + '</button>' +
      '<button class="icon-btn danger" data-remove="' + esc(f.id) + '" title="הסרת התיקייה" aria-label="הסרת התיקייה">' + svg('trash') + '</button></div>').join('')
      : '<div class="settings-row"><div class="settings-row-text"><div class="settings-row-title">לא נבחרה תיקייה</div><div class="settings-row-subtitle">הוסיפו תיקייה כדי להתחיל</div></div></div>';
    $('set-rescan').disabled = !S.folders.length;
    buildSegmented('seg-zoom', [{ id: 'width', label: 'לרוחב' }, { id: 'page', label: 'התאמה לגובה' }, { id: '1', label: '100%' }], 'zoom');
    buildSegmented('seg-view', [{ id: 'tree', label: 'עץ תיקיות' }, { id: 'flat', label: 'רשימה' }], 'view', () => { S.limit = 200; renderLibrary(); });
    setToggle('set-restore', S.settings.restoreLast, (v) => { S.settings.restoreLast = v; saveSettings(); });
    setToggle('set-fsfloat', S.settings.fsFloatBtn, (v) => { S.settings.fsFloatBtn = v; saveSettings(); applyFsFloat(); });
    buildSegmented('seg-ocr-engine', [{ id: 'tesseract', label: 'Tesseract' }, { id: 'windows', label: 'Windows' }], 'ocrEngine', () => { ocrApplySettings(); if (S.settings.ocrEngine === 'windows') refreshBridgeStatus(false); });
    buildSegmented('seg-ocr-quality', [{ id: '1.5', label: 'מהירה' }, { id: '2', label: 'רגילה' }, { id: '3', label: 'גבוהה' }], 'ocrQuality');
    setToggle('set-ocr-lines', S.settings.ocrLines, (v) => { S.settings.ocrLines = v; saveSettings(); ocrApplySettings(); });
    setToggle('set-fshidetb', S.settings.fsHideToolbar, (v) => { S.settings.fsHideToolbar = v; saveSettings(); applyFsHide(); });
    setToggle('set-fshidetabs', S.settings.fsHideTabs, (v) => { S.settings.fsHideTabs = v; saveSettings(); applyFsHide(); });
    setToggle('set-showlib', S.settings.showInLibrary !== false, (v) => { S.settings.showInLibrary = v; saveSettings(); store.set('showInLibrary', v); syncProvider(true); });
    setToggle('set-tbopen', S.settings.tbOpen !== false, (v) => { S.settings.tbOpen = v; saveSettings(); store.set('tbOpen', v); });
    setToggle('set-tbextract', S.settings.tbExtract !== false, (v) => { S.settings.tbExtract = v; saveSettings(); store.set('tbExtract', v); });
    setToggle('set-invert', S.settings.invert, (v) => { S.settings.invert = v; saveSettings(); document.body.classList.toggle('invert-pages', v); });
    $('about-version').textContent = 'גרסה ' + PLUGIN_VERSION;
  }

  /* ═════════════════════ חיווט אירועים ═════════════════════ */
  function wireEvents() {
    // חיפוש
    const onSearch = debounce(() => { S.query = el.search.value; S.limit = 200; renderLibrary(); }, 60);
    el.search.addEventListener('input', () => { el['search-clear'].hidden = !el.search.value; onSearch(); });
    el['search-clear'].onclick = () => { el.search.value = ''; S.query = ''; renderLibrary(); el.search.focus(); };
    el.search.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        if (!S.flatItems.length) return;
        e.preventDefault();
        const d = e.key === 'ArrowDown' ? 1 : -1;
        S.kbIndex = Math.max(0, Math.min(S.flatItems.length - 1, (S.kbIndex < 0 ? (d > 0 ? -1 : 1) : S.kbIndex) + d));
        markKb();
      } else if (e.key === 'Enter') {
        const e0 = S.flatItems[Math.max(0, S.kbIndex)];
        if (e0) { e.preventDefault(); openOrSwitch(e0.key); }
      } else if (e.key === 'Escape') {
        if (el.search.value) { el.search.value = ''; S.query = ''; renderLibrary(); }
      }
    });
    el['lib-list'].addEventListener('click', (e) => {
      const row = e.target.closest('[data-kind]');
      if (!row) return;
      const k = row.getAttribute('data-kind');
      if (k === 'file') {
        const p = row.getAttribute('data-path');
        openOrSwitch(p, e.ctrlKey || e.metaKey);
      } else if (k === 'dir') toggleDir(row.getAttribute('data-path'));
      else if (k === 'more') { S.limit += 300; renderLibrary(); }
    });

    el['lib-list'].addEventListener('auxclick', (e) => {
      if (e.button !== 1) return;
      const row = e.target.closest('[data-kind="file"]');
      if (row) { e.preventDefault(); openOrSwitch(row.getAttribute('data-path'), true); }
    });

    // סרגל עליון
    el['btn-settings'].onclick = openSettings;
    el['settings-scrim'].onclick = closeSettings;
    el['btn-toc'].onclick = () => toggleToc();
    el['btn-library'].onclick = toggleLibrary;
    $('set-rescan').onclick = () => rescan();
    $('set-add').onclick = () => { closeSettings(); addFolder(); };
    $('folder-list').addEventListener('click', (e) => {
      const rs = e.target.closest('[data-rescan]');
      if (rs) { rescan(rs.getAttribute('data-rescan')); return; }
      const rm = e.target.closest('[data-remove]');
      if (rm) removeFolder(rm.getAttribute('data-remove'));
    });

    // סרגל הצופה
    el['tb-prev'].onclick = () => goToPage(V.current - 1);
    el['tb-next'].onclick = () => goToPage(V.current + 1);
    const pi = el['page-input'];
    pi.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { const n = parseInt(pi.value.replace(/\D/g, ''), 10); if (n) goToPage(n); pi.blur(); el['pages-scroll'].focus(); }
      else if (e.key === 'Escape') { pi.value = String(V.current); pi.blur(); }
    });
    pi.addEventListener('focus', () => pi.select());
    pi.addEventListener('blur', () => { pi.value = String(V.current); });
    el['tb-zoom-in'].onclick = () => zoomStep(1);
    el['tb-zoom-out'].onclick = () => zoomStep(-1);
    el['tb-fit-width'].onclick = () => { V.mode = 'width'; applyZoomMode(); };
    el['tb-fit-page'].onclick = () => { V.mode = 'page'; applyZoomMode(); };
    buildZoomSelect();
    wireFind();
    wireTabs();
    wireCrop();
    wireLibResizer();
    wireHand();
    wireOcr();
    el['tb-crop'].onclick = () => setCrop(!V.crop);
    el['tb-print'].onclick = openPrintDialog;
    el['modal-scrim'].addEventListener('mousedown', (e) => { if (e.target === el['modal-scrim']) closeModal(); });
    window.addEventListener('afterprint', clearPrintArea);

    // גלילה, זום בגלגלת ובצביטה
    const sc = el['pages-scroll'];
    let raf = 0;
    sc.addEventListener('scroll', () => { if (raf) return; raf = requestAnimationFrame(() => { raf = 0; updateVisible(); }); }, { passive: true });
    sc.addEventListener('wheel', (e) => {
      if (!e.ctrlKey || !V.pdf) return;
      e.preventDefault();
      setScale(V.scale * Math.exp(-e.deltaY * 0.0022), 'custom');
    }, { passive: false });
    let pinch = null;
    sc.addEventListener('touchstart', (e) => {
      if (e.touches.length === 2) pinch = { d: Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY), s: V.scale };
    }, { passive: true });
    sc.addEventListener('touchmove', (e) => {
      if (!pinch || e.touches.length !== 2) return;
      e.preventDefault();
      const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      setScale(pinch.s * d / pinch.d, 'custom');
    }, { passive: false });
    sc.addEventListener('touchend', () => { pinch = null; }, { passive: true });
    // מניעת קפיצת בחירה בין שורות בשכבת הטקסט (כמו ב-viewer של pdf.js)
    sc.addEventListener('mousedown', (e) => {
      const tl = e.target.closest && e.target.closest('.textLayer');
      if (tl) { tl.classList.add('selecting'); }
    });
    document.addEventListener('mouseup', () => {
      el.pages.querySelectorAll('.textLayer.selecting').forEach((n) => n.classList.remove('selecting'));
    });

    // התאמה לשינוי גודל חלון / פתיחת פאנלים
    let lastW = 0, lastH = 0;
    const onResize = debounce(() => {
      if (!V.pdf) return;
      const w = sc.clientWidth, h = sc.clientHeight;
      if (V.mode === 'width' || V.mode === 'page') { if (Math.abs(w - lastW) > 1 || (V.mode === 'page' && Math.abs(h - lastH) > 1)) applyZoomMode(); }
      lastW = w; lastH = h;
      updateVisible();
    }, 120);
    if (window.ResizeObserver) new ResizeObserver(onResize).observe(sc);
    window.addEventListener('resize', onResize);

    // מקלדת
    document.addEventListener('keydown', (e) => {
      const mod = e.ctrlKey || e.metaKey;
      const tag = document.activeElement && document.activeElement.tagName;
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(tag || '') || (document.activeElement && document.activeElement.isContentEditable);
      const modalOpen = !el['modal-scrim'].hidden;
      if (mod && !e.shiftKey && !e.altKey && V.pdf && !modalOpen && (e.key === 'e' || e.key === 'E')) { e.preventDefault(); extractPage(); return; }
      if (mod && !e.shiftKey && !e.altKey && V.pdf && !modalOpen && (e.key === 'r' || e.key === 'R')) { e.preventDefault(); startRegionOcr(); return; }
      if (mod && e.shiftKey && (e.key === 'a' || e.key === 'A')) { e.preventDefault(); if (!modalOpen) openTabSearch(); return; }
      if (mod && (e.key === 'Tab' || e.key === 'PageDown' || e.key === 'PageUp')) {
        e.preventDefault();
        cycleTab((e.key === 'PageUp' || (e.key === 'Tab' && e.shiftKey)) ? -1 : 1);
        return;
      }
      if (mod && !e.shiftKey && (e.key === 'w' || e.key === 'W') && !modalOpen) { e.preventDefault(); closeTab(T.active); return; }
      if (mod && !e.shiftKey && (e.key === 't' || e.key === 'T') && !modalOpen) { e.preventDefault(); addTab(); return; }
      if (e.altKey && !mod && (e.key === 't' || e.key === 'T')) { e.preventDefault(); S.settings.fsHideTabs = !S.settings.fsHideTabs; saveSettings(); applyFsHide(); return; }
      if (e.altKey && !mod && (e.key === 'b' || e.key === 'B')) { e.preventDefault(); S.settings.fsHideToolbar = !S.settings.fsHideToolbar; saveSettings(); applyFsHide(); return; }
      if (e.altKey && !mod && /^[1-9]$/.test(e.key)) { e.preventDefault(); const t = e.key === '9' ? T.tabs[T.tabs.length - 1] : T.tabs[+e.key - 1]; if (t) activateTab(t.id); return; }
      if (!mod && !e.altKey && !typing && !modalOpen && V.pdf && (e.key === 'h' || e.key === 'H' || e.key === 'י')) { e.preventDefault(); toggleHand(); return; }
      // חיצים: ימינה = עמוד קודם, שמאלה = עמוד הבא (בממשק מימין לשמאל). PageUp/PageDown נשארים כרגיל.
      if (!mod && !e.altKey && !e.shiftKey && !typing && !modalOpen && V.pdf && (e.key === 'ArrowRight' || e.key === 'ArrowLeft') &&
          !el['settings-panel'].classList.contains('open') && !V.crop) {
        const sc = el['pages-scroll'];
        if (sc.scrollWidth <= sc.clientWidth + 2) {
          e.preventDefault();
          goToPage(V.current + (e.key === 'ArrowRight' ? -1 : 1));
          return;
        }
      }
      if (mod && (e.key === 'p' || e.key === 'P')) { e.preventDefault(); if (V.pdf) openPrintDialog(); }
      else if (mod && V.pdf && (e.key === 'f' || e.key === 'F')) { e.preventDefault(); openFind(); }
      else if (mod && V.pdf && (e.key === '+' || e.key === '=')) { e.preventDefault(); zoomStep(1); }
      else if (mod && V.pdf && (e.key === '-' || e.key === '_')) { e.preventDefault(); zoomStep(-1); }
      else if (mod && V.pdf && e.key === '0') { e.preventDefault(); V.mode = 'width'; applyZoomMode(); }
      else if ((mod && (e.key === 'k' || e.key === 'K')) ||
        (e.key === '/' && !/^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement && document.activeElement.tagName))) {
        e.preventDefault();
        showLibrary();
        el.search.focus(); el.search.select();
      } else if (e.key === 'Escape') {
        if (!el['ocr-menu'].hidden) closeOcrMenu(); else if (!el['modal-scrim'].hidden) closeModal(); else if (el['settings-panel'].classList.contains('open')) closeSettings(); else if (V.crop) setCrop(false); else if (F.open) closeFind(); else if (isFs()) setFullscreen(false);
      }
    });
  }

  /* ═════════════════════ חילוץ טקסט וזיהוי טקסט (OCR) ═════════════════════ */
  const OCR = { busy: false, source: '' };
  function ocrApplySettings() {
    if (!window.OcrEngine) return;
    window.OcrEngine.opts.engine = S.settings.ocrEngine === 'windows' ? 'windows' : 'tesseract';
    window.OcrEngine.opts.lines = !!S.settings.ocrLines;
  }
  function docName() { const en = V.path && S.byPath.get(V.path); return en ? en.disp : ''; }
  function ocrQuality() { const q = parseFloat(S.settings.ocrQuality); return q > 0 ? q : 2; }

  const prog = {
    cancel: null,
    show(label, onCancel) {
      el['ocr-progress'].hidden = false; el['op-label'].textContent = label || '';
      el['op-bar'].classList.add('indeterminate'); el['op-fill'].style.width = '';
      prog.cancel = onCancel || null; el['op-cancel'].hidden = !onCancel;
    },
    update(label, p) {
      if (label) el['op-label'].textContent = label;
      if (typeof p === 'number') { el['op-bar'].classList.remove('indeterminate'); el['op-fill'].style.width = Math.round(Math.max(0, Math.min(1, p)) * 100) + '%'; }
    },
    hide() { el['ocr-progress'].hidden = true; prog.cancel = null; }
  };

  function showText(text, o) {
    o = o || {};
    el['text-panel'].hidden = false;
    el['tb-ocr'].classList.add('active');
    el['tp-output'].textContent = text || '';
    el['tp-output'].setAttribute('contenteditable', 'false');
    const ed = el['text-panel'].querySelector('[data-tact="edit"]'); if (ed) ed.classList.remove('active');
    el['tp-title'].textContent = o.title || 'טקסט';
    el['tp-sub'].textContent = o.sub || '';
    OCR.source = o.source || '';
    updateTextFooter();
  }
  function getText() { const o = el['tp-output']; return String(o.innerText != null ? o.innerText : o.textContent).replace(/\u00a0/g, ' ').trim(); }
  function updateTextFooter() {
    const t = getText();
    const words = t ? t.split(/\s+/).filter(Boolean).length : 0;
    el['tp-footer'].textContent = t ? words.toLocaleString('he-IL') + ' מילים · ' + t.length.toLocaleString('he-IL') + ' תווים' + (OCR.source === 'ocr' ? ' · זיהוי טקסט' : '') : '';
  }
  function selectedTextIn(node) {
    const s = window.getSelection();
    if (!s || s.isCollapsed || !node.contains(s.anchorNode)) return '';
    return String(s).trim();
  }
  async function copyOutText() {
    const t = selectedTextIn(el['tp-output']) || getText();
    if (!t) { toast.msg('אין טקסט להעתקה'); return; }
    try { await navigator.clipboard.writeText(t); toast.ok('הטקסט הועתק'); }
    catch (e) {
      const r = document.createRange(); r.selectNodeContents(el['tp-output']);
      const s = window.getSelection(); s.removeAllRanges(); s.addRange(r);
      try { document.execCommand('copy'); toast.ok('הטקסט הועתק'); } catch (e2) { toast.err('ההעתקה נכשלה'); }
    }
  }
  async function saveOutText() {
    const text = getText();
    if (!text) { toast.msg('אין טקסט לשמירה'); return; }
    const base = ((docName() || 'טקסט').replace(/\.[^.]+$/, '') + (OCR.source === 'ocr' ? ' - זיהוי טקסט' : '')).replace(/[\\/:*?"<>|]+/g, ' ').trim();
    const blob = new Blob(['\ufeff' + text.replace(/\n/g, '\r\n')], { type: 'text/plain;charset=utf-8' });
    const up = await call('fs.beginBinaryWrite', { purpose: 'user-file', expectedSize: blob.size }, 2);
    if (up.success && up.data && up.data.uploadUrl) {
      try {
        const res = await fetch(up.data.uploadUrl, { method: 'PUT', headers: { 'Content-Type': 'text/plain' }, body: blob });
        if (!res.ok) throw new Error('HTTP ' + res.status);
        const done = await call('fs.commitUserFileWrite', { writeToken: up.data.writeToken, suggestedName: base, extension: 'txt', title: 'שמירת הטקסט' }, 2);
        if (done.success) { if (!(done.data && done.data.cancelled)) toast.ok('נשמר' + (done.data && done.data.name ? ': ' + done.data.name : '')); return; }
        toast.err(errText(done)); return;
      } catch (e) { toast.err('השמירה נכשלה'); return; }
    }
    if (up.error && /permission/.test(up.error.code || '')) { toast.err('אין הרשאה לשמירת קבצים. אפשר לאשר אותה בהגדרות התוסף.'); return; }
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = base + '.txt';
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
  }

  function needDoc() {
    if (V.pdf) return true;
    toast.msg('יש לפתוח מסמך קודם');
    return false;
  }
  async function embeddedPageText(n) {
    const page = await V.pdf.getPage(n);
    const tc = await page.getTextContent();
    let out = '';
    for (const it of tc.items) {
      if (typeof it.str !== 'string') continue;
      out += it.str;
      if (it.hasEOL) out += '\n';
    }
    return out.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  }
  async function embeddedRegionText(n, x0, y0, x1, y1) {
    const page = await V.pdf.getPage(n);
    const tc = await page.getTextContent();
    if (!tc.items.length) return '';
    const vp = page.getViewport({ scale: 1 });
    let out = '';
    tc.items.forEach((it) => {
      if (typeof it.str !== 'string' || !it.transform) return;
      const pt = vp.convertToViewportPoint(it.transform[4], it.transform[5]);
      const cx = (pt[0] + (it.width || 0) / 2) / vp.width, cy = (pt[1] - (it.height || 0) / 2) / vp.height;
      if (cx >= x0 && cx <= x1 && cy >= y0 && cy <= y1) out += it.str + (it.hasEOL ? '\n' : '');
      else if (it.hasEOL && out && !out.endsWith('\n')) out += '\n';
    });
    return out.replace(/\n{3,}/g, '\n\n').trim();
  }

  async function ocrFailure(e) {
    toast.err('שגיאה בזיהוי הטקסט: ' + ((e && e.message) || 'לא ידועה'));
  }
  async function ocrCanvasToPanel(canvas, title) {
    if (OCR.busy) return;
    if (!window.OcrEngine) { toast.err('מנוע הזיהוי לא נטען'); return; }
    ocrApplySettings();
    OCR.busy = true;
    prog.show('טוען את מנוע הזיהוי…');
    try {
      const text = await window.OcrEngine.recognize(canvas, (p) => prog.update('מזהה טקסט…', p));
      showText(text, { title, sub: docName(), source: 'ocr' });
      if (!text) toast.msg('לא זוהה טקסט');
    } catch (e) { ocrFailure(e); } finally { OCR.busy = false; prog.hide(); }
  }
  async function extractPage(n) {
    if (!needDoc() || OCR.busy) return;
    n = n || V.current;
    try {
      const text = await embeddedPageText(n);
      if (text) { showText(text, { title: 'טקסט מוטבע: עמוד ' + n, sub: docName(), source: 'embedded' }); return; }
    } catch (e) { /* ממשיכים לזיהוי */ }
    toast.msg('אין טקסט מוטבע בעמוד. מריץ זיהוי טקסט…');
    await ocrPage(n);
  }
  async function ocrPage(n) {
    if (!needDoc() || OCR.busy) return;
    n = n || V.current;
    const pdf = V.pdf;
    try {
      const { canvas } = await renderToCanvas(pdf, n, ocrQuality() * 1.5, 24e6);
      await ocrCanvasToPanel(canvas, 'זיהוי טקסט: עמוד ' + n);
      canvas.width = 0; canvas.height = 0;
    } catch (e) { ocrFailure(e); }
  }
  async function ocrRegion(n, x0, y0, x1, y1) {
    const pdf = V.pdf;
    if (!pdf || OCR.busy) return;
    try {
      const emb = await embeddedRegionText(n, x0, y0, x1, y1);
      if (emb) { showText(emb, { title: 'טקסט מוטבע: אזור בעמוד ' + n, sub: docName(), source: 'embedded' }); return; }
      const { canvas } = await renderToCanvas(pdf, n, Math.max(2.5, ocrQuality() * 1.5), 32e6);
      const sx = Math.round(x0 * canvas.width), sy = Math.round(y0 * canvas.height);
      const sw = Math.max(1, Math.round((x1 - x0) * canvas.width)), sh = Math.max(1, Math.round((y1 - y0) * canvas.height));
      const out = document.createElement('canvas');
      out.width = sw; out.height = sh;
      out.getContext('2d').drawImage(canvas, sx, sy, sw, sh, 0, 0, sw, sh);
      canvas.width = 0; canvas.height = 0;
      await ocrCanvasToPanel(out, 'זיהוי טקסט: אזור בעמוד ' + n);
      out.width = 0; out.height = 0;
    } catch (e) { ocrFailure(e); }
  }
  async function processAll(useOcr) {
    if (!needDoc() || OCR.busy) return;
    const pdf = V.pdf, total = V.numPages;
    if (useOcr) {
      if (total > 30) {
        const r = await call('ui.showConfirm', { title: 'זיהוי טקסט לכל המסמך', content: 'במסמך ' + total.toLocaleString('he-IL') + ' עמודים, והזיהוי עשוי לקחת כמה דקות. להמשיך? אפשר לעצור בכל רגע.' }, 2);
        if (r.success && r.data && r.data.confirmed === false) return;
      }
      if (!window.OcrEngine) { toast.err('מנוע הזיהוי לא נטען'); return; }
      ocrApplySettings();
    }
    OCR.busy = true;
    let cancelled = false;
    prog.show('מכין…', () => { cancelled = true; });
    if (useOcr) call('ui.setUnsavedChanges', { hasChanges: true, message: 'זיהוי הטקסט במסמך עדיין רץ' }, 1);
    const parts = [];
    const title = useOcr ? 'זיהוי טקסט: כל המסמך' : 'הטקסט המוטבע: כל המסמך';
    const src = useOcr ? 'ocr' : 'embedded';
    try {
      for (let n = 1; n <= total; n++) {
        if (cancelled || pdf !== V.pdf) break;
        prog.update('עמוד ' + n + ' מתוך ' + total + '…', (n - 1) / total);
        let text = '';
        try { text = await embeddedPageText(n); } catch (e) { text = ''; }
        if (useOcr && !text) {
          const { canvas } = await renderToCanvas(pdf, n, ocrQuality() * 1.5, 24e6);
          text = await window.OcrEngine.recognize(canvas, (p) => prog.update(null, (n - 1 + p) / total));
          canvas.width = 0; canvas.height = 0;
        }
        parts.push('— עמוד ' + n + ' —\n' + (text || '(אין טקסט)'));
        if (n % 3 === 0 || n === total) showText(parts.join('\n\n'), { title, sub: docName() + ' · ' + n + '/' + total, source: src });
      }
      showText(parts.join('\n\n'), { title, sub: docName(), source: src });
      toast.msg(cancelled ? 'הופסק אחרי ' + parts.length + ' עמודים' : 'הושלם: ' + parts.length + ' עמודים');
    } catch (e) { ocrFailure(e); } finally {
      OCR.busy = false; prog.hide();
      if (useOcr) call('ui.setUnsavedChanges', { hasChanges: false }, 1);
    }
  }
  function startRegionOcr() {
    if (!needDoc()) return;
    setCrop(true, true);
  }
  function closeOcrMenu() { el['ocr-menu'].hidden = true; el['tb-ocr'].setAttribute('aria-expanded', 'false'); }
  function toggleOcrMenu() {
    if (!el['ocr-menu'].hidden) { closeOcrMenu(); return; }
    if (!needDoc()) return;
    const r = el['tb-ocr'].getBoundingClientRect();
    const m = el['ocr-menu'];
    m.hidden = false;
    const w = m.offsetWidth;
    m.style.top = (r.bottom + 4) + 'px';
    m.style.left = Math.max(8, Math.min(window.innerWidth - w - 8, r.right - w)) + 'px';
    el['tb-ocr'].setAttribute('aria-expanded', 'true');
    const f = m.querySelector('button'); if (f) f.focus();
  }
  function runOcrAction(act) {
    closeOcrMenu();
    if (act === 'extract-page') extractPage();
    else if (act === 'ocr-page') ocrPage();
    else if (act === 'ocr-region') startRegionOcr();
    else if (act === 'ocr-all') processAll(true);
    else if (act === 'extract-all') processAll(false);
  }
  async function refreshBridgeStatus(manual) {
    const box = $('win-ocr-status');
    if (!window.OcrBridge) { box.textContent = 'לא זמין'; return; }
    box.textContent = 'בודק…';
    const st = await window.OcrBridge.checkOcr();
    let msg;
    if (!st.bridge) msg = 'הגשר לא פועל או לא נמצא. הורידו אותו והפעילו אותו (הוא רץ ברקע).';
    else if (!st.available) msg = 'הגשר פועל, אבל גרסתו ישנה או שאין בו OCR. יש להוריד את הגרסה האחרונה.';
    else if (!st.hebrew) msg = 'הגשר פועל, אבל חבילת השפה העברית ל-OCR לא מותקנת ב-Windows.';
    else msg = 'מוכן: הגשר פועל וחבילת השפה העברית מותקנת.';
    box.textContent = msg;
    box.classList.toggle('ok', window.OcrBridge.ocrReady());
    if (manual && window.OcrBridge.ocrReady() && S.settings.ocrEngine !== 'windows') toast.msg('אפשר לבחור עכשיו \u201eOCR של Windows\u201c במנוע הזיהוי');
  }
  function wireOcr() {
    ocrApplySettings();
    el['tb-ocr'].onclick = (e) => { e.stopPropagation(); toggleOcrMenu(); };
    el['ocr-menu'].addEventListener('click', (e) => { const b = e.target.closest('[data-act]'); if (b) runOcrAction(b.getAttribute('data-act')); });
    el['ocr-menu'].addEventListener('keydown', (e) => {
      if (e.key === 'Escape') { e.preventDefault(); closeOcrMenu(); el['tb-ocr'].focus(); }
      else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        const items = Array.from(el['ocr-menu'].querySelectorAll('button')), i = items.indexOf(document.activeElement);
        items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
      }
    });
    document.addEventListener('mousedown', (e) => { if (!el['ocr-menu'].hidden && !e.target.closest('#ocr-menu') && !e.target.closest('#tb-ocr')) closeOcrMenu(); });
    el['op-cancel'].onclick = () => { if (prog.cancel) { prog.cancel(); el['op-label'].textContent = 'עוצר…'; } };
    el['tp-close'].onclick = () => { el['text-panel'].hidden = true; el['tb-ocr'].classList.remove('active'); };
    el['tp-output'].addEventListener('input', updateTextFooter);
    el['text-panel'].querySelectorAll('[data-tact]').forEach((b) => b.addEventListener('click', () => {
      const act = b.getAttribute('data-tact');
      if (act === 'copy') copyOutText();
      else if (act === 'save') saveOutText();
      else if (act === 'edit') {
        const on = el['tp-output'].getAttribute('contenteditable') !== 'true';
        el['tp-output'].setAttribute('contenteditable', on ? 'true' : 'false');
        b.classList.toggle('active', on);
        if (on) { el['tp-output'].focus(); toast.msg('מצב עריכה: אפשר לתקן את הטקסט'); }
      } else if (act === 'clear') { el['tp-output'].textContent = ''; el['tp-sub'].textContent = ''; updateTextFooter(); }
    }));
    $('btn-bridge-dl').onclick = async () => {
      const r = await call('app.openUrl', { url: window.OcrBridge ? window.OcrBridge.DOWNLOAD_URL : '' }, 2);
      if (!r.success) toast.err('לא ניתן לפתוח את הקישור. אפשר להעתיק אותו ידנית: ' + (window.OcrBridge ? window.OcrBridge.DOWNLOAD_URL : ''));
    };
    $('btn-bridge-check').onclick = () => refreshBridgeStatus(true);
    $('btn-ocr-test').onclick = async () => {
      if (!window.OcrEngine) { toast.err('מנוע הזיהוי לא נטען'); return; }
      ocrApplySettings();
      const b = $('btn-ocr-test'); b.disabled = true;
      try {
        const t = await window.OcrEngine.selfTest();
        const engine = window.OcrEngine.usingWindows() ? 'OCR של Windows' : 'Tesseract';
        toast[/שלום/.test(t) ? 'ok' : 'msg'](engine + ' החזיר: ' + (t || '(ריק)'));
      } catch (e) { toast.err('בדיקת המנוע נכשלה: ' + ((e && e.message) || '')); }
      b.disabled = false;
    };
  }

  /* ═════════════════════ רוחב הספרייה (גרירה) ═════════════════════ */
  const LIB_MIN = 200, LIB_MAX_FRAC = 0.5;
  function applyLibWidth() {
    const w = S.settings.libW | 0;
    if (w > 0) el.library.style.width = Math.max(LIB_MIN, Math.min(w, Math.round(window.innerWidth * LIB_MAX_FRAC))) + 'px';
    else el.library.style.width = '';
  }
  function wireLibResizer() {
    const rz = el['lib-resizer'];
    let start = null;
    const sign = () => (getComputedStyle(document.documentElement).direction === 'rtl' || document.dir === 'rtl' ? -1 : 1);
    rz.addEventListener('pointerdown', (e) => {
      if (e.button !== 0) return;
      start = { x: e.clientX, w: el.library.getBoundingClientRect().width, s: sign() };
      rz.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing-lib');
      e.preventDefault();
    });
    rz.addEventListener('pointermove', (e) => {
      if (!start) return;
      const w = start.w + start.s * (e.clientX - start.x);
      S.settings.libW = Math.round(Math.max(LIB_MIN, Math.min(w, window.innerWidth * LIB_MAX_FRAC)));
      applyLibWidth();
    });
    const end = () => { if (!start) return; start = null; document.body.classList.remove('resizing-lib'); saveSettings(); };
    rz.addEventListener('pointerup', end);
    rz.addEventListener('pointercancel', end);
    rz.addEventListener('dblclick', () => { S.settings.libW = 0; applyLibWidth(); saveSettings(); });
    rz.addEventListener('keydown', (e) => {
      if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
      e.preventDefault(); e.stopPropagation();
      const cur = el.library.getBoundingClientRect().width;
      const grow = (e.key === 'ArrowLeft') === (sign() === -1);
      S.settings.libW = Math.round(Math.max(LIB_MIN, Math.min(cur + (grow ? 24 : -24), window.innerWidth * LIB_MAX_FRAC)));
      applyLibWidth(); saveSettings();
    });
  }

  /* ═════════════════════ יד (גרירת המסמך) ═════════════════════ */
  function applyHand() {
    const on = !!S.settings.hand;
    el['pages-scroll'].classList.toggle('hand-mode', on);
    el['tb-hand'].classList.toggle('active', on);
    el['tb-hand'].setAttribute('aria-pressed', on ? 'true' : 'false');
  }
  function toggleHand(force) {
    S.settings.hand = typeof force === 'boolean' ? force : !S.settings.hand;
    if (S.settings.hand && V.crop) setCrop(false);
    applyHand(); saveSettings();
  }
  function wireHand() {
    const sc = el['pages-scroll'];
    let d = null;
    sc.addEventListener('pointerdown', (e) => {
      if (!S.settings.hand || V.crop || e.button !== 0 || e.pointerType === 'touch') return;
      d = { x: e.clientX, y: e.clientY, l: sc.scrollLeft, t: sc.scrollTop };
      sc.setPointerCapture(e.pointerId);
      sc.classList.add('grabbing');
      e.preventDefault();
    });
    sc.addEventListener('pointermove', (e) => {
      if (!d) return;
      sc.scrollLeft = d.l - (e.clientX - d.x);
      sc.scrollTop = d.t - (e.clientY - d.y);
    });
    const end = () => { d = null; sc.classList.remove('grabbing'); };
    sc.addEventListener('pointerup', end);
    sc.addEventListener('pointercancel', end);
    el['tb-hand'].onclick = () => toggleHand();
    applyHand();
  }

  /* ═════════════════════ מסך מלא: מה להסתיר ═════════════════════ */
  function applyFsHide() {
    document.body.classList.toggle('fs-no-toolbar', !!S.settings.fsHideToolbar);
    document.body.classList.toggle('fs-no-tabs', !!S.settings.fsHideTabs);
  }

  /* ═════════════════════ חיפוש בלשוניות ═════════════════════ */
  function openTabSearch() {
    if (!S.folders.length) return;
    syncActiveTabPage();
    openModal(
      '<div class="modal-title">מעבר ללשונית</div><div class="modal-body">' +
      '<input class="input" id="ts-input" type="text" autocomplete="off" spellcheck="false" placeholder="חיפוש בלשוניות הפתוחות…" aria-label="חיפוש בלשוניות">' +
      '<div class="ts-list" id="ts-list" role="listbox"></div></div>');
    const inp = $('ts-input'), list = $('ts-list');
    let items = [], idx = 0;
    const render = () => {
      const q = inp.value.trim().toLowerCase();
      items = T.tabs.map((t) => {
        const e = t.path && S.byPath.get(t.path);
        return { id: t.id, title: e ? e.disp : 'דף ראשי', dir: e ? e.tp : '' };
      }).filter((x) => !q || (x.title + ' ' + x.dir).toLowerCase().includes(q));
      if (idx >= items.length) idx = Math.max(0, items.length - 1);
      list.innerHTML = items.length ? items.map((x, i) =>
        '<div class="ts-row' + (i === idx ? ' kb' : '') + (x.id === T.active ? ' cur' : '') + '" role="option" data-i="' + i + '"><span class="ts-title">' + esc(x.title) + '</span><span class="ts-dir">' + esc(x.dir) + '</span></div>').join('')
        : '<div class="empty-note">אין לשונית תואמת.</div>';
      const k = list.querySelector('.kb'); if (k && k.scrollIntoView) k.scrollIntoView({ block: 'nearest' });
    };
    const go = (i) => { const x = items[i]; if (!x) return; closeModal(); activateTab(x.id); };
    inp.addEventListener('input', () => { idx = 0; render(); });
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown') { e.preventDefault(); idx = Math.min(items.length - 1, idx + 1); render(); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); idx = Math.max(0, idx - 1); render(); }
      else if (e.key === 'Enter') { e.preventDefault(); go(idx); }
    });
    list.addEventListener('click', (e) => { const r = e.target.closest('[data-i]'); if (r) go(+r.getAttribute('data-i')); });
    render();
    inp.focus();
  }
  function cycleTab(dir) {
    if (T.tabs.length < 2) return;
    const i = T.tabs.findIndex((t) => t.id === T.active);
    activateTab(T.tabs[(i + dir + T.tabs.length) % T.tabs.length].id);
  }

  /* ═════════════════════ אתחול ═════════════════════ */
  /* ═════════════════════ שילוב עם ספריית אוצריא (שלב 7.4) ═════════════════════ */
  // רשומות שאינן מתיקיות המשתמש: ספרי ספרייה (נשמרות), וקבצים שנשלחו מתוספים אחרים (זמניות).
  const PROVIDER = 'pdfocr';
  const TB_EXTRACT = 'chadbedera-extract-text-toolbar';
  const TB_OPEN = 'chadbedera-open-book-file';
  const CM_EXTRACT = 'chadbedera-extract-text';
  const EXTRA_MAX = 60;
  S.extra = new Map();
  let readyRes = null;
  const ready = new Promise((r) => { readyRes = r; });

  function restoreExtra() { S.extra.forEach((e, k) => S.byPath.set(k, e)); }
  function saveExtra() {
    const list = Array.from(S.extra.values()).filter((e) => e.persist).map((e) => ({ key: e.key, name: e.disp, lib: e.lib }));
    return store.set('libBooks', list);
  }
  function registerExtra(key, lib, name, persist) {
    const disp = String(name || 'מסמך').replace(/\.pdf$/i, '');
    const e = { key, path: key, ft: null, lib, persist: !!persist, tp: disp, name: disp, dir: '', disp, size: 0, mtime: null, nk: normalize(disp), dk: '' };
    S.extra.delete(key);
    S.extra.set(key, e);
    S.byPath.set(key, e);
    if (persist) {
      const open = new Set(T.tabs.map((t) => t.path));
      for (const k of Array.from(S.extra.keys())) {
        if (Array.from(S.extra.values()).filter((x) => x.persist).length <= EXTRA_MAX) break;
        const x = S.extra.get(k);
        if (x.persist && k !== key && !open.has(k) && S.pinned.indexOf(k) < 0) { S.extra.delete(k); S.byPath.delete(k); }
      }
      saveExtra();
    }
    return e;
  }
  function dropExtra(key) {
    const e = S.extra.get(key);
    S.extra.delete(key); S.byPath.delete(key);
    S.recentFiles = S.recentFiles.filter((k) => k !== key); store.set('recentFiles', S.recentFiles);
    if (e && e.persist) saveExtra();
  }
  async function loadExtra() {
    const list = await store.get('libBooks');
    if (!Array.isArray(list)) return;
    for (const b of list) {
      if (!b || typeof b.key !== 'string' || !b.lib || b.lib.kind !== 'book') continue;
      registerExtra(b.key, b.lib, b.name, false);
      S.extra.get(b.key).persist = true;
    }
  }
  async function resolveSource(entry) {
    const L = entry.lib;
    if (!L) return call('fs.openFolderFile', { folderToken: entry.ft, path: entry.path });
    if (L.kind === 'book') {
      const q = L.bookUid ? { bookUid: L.bookUid } : L.id != null ? { id: L.id, type: L.type || 'pdf' } : { bookId: L.bookId, type: L.type || 'pdf' };
      const r = await call('library.openBookFile', q);
      if (r.success && !(r.data && r.data.url)) return { success: false, error: { code: 'error.not_found', message: 'לספר אין קובץ' } };
      return r;
    }
    if (L.kind === 'token') return call('fs.resolveFileUrl', { token: L.token });
    return { success: true, data: { url: L.url } };
  }
  // פותח רשומה בלשונית הקיימת, או בלשונית חדשה אם בנוכחית כבר יש מסמך אחר
  async function openExtra(e, page) {
    const opts = { page: page || undefined, norecord: !e.persist };
    const t = T.tabs.find((x) => x.path === e.key);
    if (t && t.id !== T.active) { if (page) t.page = page; activateTab(t.id); return; }
    if (t) { await openDoc(e.key, opts); return; }
    const cur = activeTab();
    if (cur.path && cur.path !== e.key) {
      syncActiveTabPage();
      const nt = newTabObj(); T.tabs.push(nt); T.active = nt.id;
      renderTabs();
      await openDoc(e.key, Object.assign({ force: true }, opts));
      saveTabs();
      return;
    }
    await openDoc(e.key, opts);
  }
  /** q: { bookUid?, id?, bookId?, type?, name? } */
  async function openLibraryBook(q, page) {
    const key = 'b:' + (q.bookUid || (q.id != null ? 'i' + q.id : q.bookId));
    const lib = { kind: 'book', bookUid: q.bookUid || null, id: q.id != null ? q.id : null, bookId: q.bookId || null, type: q.type || 'pdf' };
    await openExtra(registerExtra(key, lib, q.name || 'ספר', true), page);
  }

  // ── ספק ספרים: קבצי התיקיות מופיעים בחיפוש הספרייה של אוצריא ──
  let provSig = null, provBusy = false, provAgain = false;
  async function syncProvider(force) {
    if (provBusy) { provAgain = true; return; }
    provBusy = true;
    try {
      const on = S.settings.showInLibrary !== false;
      const map = (await store.get('libmap2')) || { next: 1, items: {} };
      const items = {}, books = [], fname = {}, fpath = {}, seen = new Set();
      S.folders.forEach((f) => { fname[f.token] = f.name; fpath[f.token] = f.path ? String(f.path).replace(/\\/g, '/').replace(/\/+$/, '') : ''; });
      if (on) {
        for (const e of S.entries) {
          if (books.length >= 20000) break;
          // תיקיות מקוננות או חופפות: אותו קובץ פיזי לא נרשם פעמיים בחיפוש הספרייה
          if (fpath[e.ft]) { const abs = (fpath[e.ft] + '/' + e.path).toLowerCase(); if (seen.has(abs)) continue; seen.add(abs); }
          let id = map.items && map.items[e.key];
          if (!id) id = map.next++;
          items[e.key] = id;
          const parts = e.path.split('/'); parts.pop();
          books.push({ id, title: e.disp.slice(0, 300), categoryPath: ('/' + [fname[e.ft] || ''].concat(parts).filter(Boolean).join('/')).slice(0, 300) });
        }
      }
      let h = 5381;
      for (const b of books) { const str = b.id + '|' + b.title + '|' + b.categoryPath; for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0; }
      const sig = books.length + ':' + h;
      if (force || sig !== provSig) {
        await store.set('libmap2', { next: map.next, items });
        const r = await call('library.setProviderBooks', { provider: PROVIDER, books });
        if (r.success) provSig = sig;
      }
    } catch (e) { /* הסנכרון לספרייה אינו קריטי */ }
    finally {
      provBusy = false;
      if (provAgain) { provAgain = false; scheduleProviderSync(); }
    }
  }
  const scheduleProviderSync = debounce(() => { syncProvider(false); }, 1500);
  async function onProviderOpen(ev) {
    if (!ev || ev.provider !== PROVIDER) return;
    await ready;
    const map = await store.get('libmap2');
    const key = map && map.items ? Object.keys(map.items).find((k) => map.items[k] === ev.id) : null;
    if (!key || !S.byPath.has(key)) { toast.err('הקובץ \u201e' + (ev.title || '') + '\u201c לא נמצא. נסו סריקה מחדש של התיקיות'); return; }
    openOrSwitch(key, !!activeTab().path);
  }

  // ── תרומות הקורא של אוצריא: פתיחת ספר בעמוד הנוכחי, חלץ טקסט, קיצור מקשים ──
  async function openBookFromReader(data) {
    await ready;
    const page = Number(data.currentIndex) > 0 ? Number(data.currentIndex) : 1;
    const q = data.currentBookUid ? { bookUid: data.currentBookUid } : data.currentId != null ? { id: data.currentId } : { bookId: data.currentBookId };
    q.type = data.currentType || 'pdf';
    q.name = data.currentBook;
    await openLibraryBook(q, q.type === 'pdf' ? page : undefined);
    return page;
  }
  // טקסט שאוצריא אינדקסה; ואם אין (PDF סרוק) — הקובץ נפתח בעמוד הנוכחי לחילוץ או OCR
  async function extractFromReader(data) {
    await ready;
    const label = [data.currentBook, data.currentRef].filter(Boolean).join(' · ');
    let text = (data.selectedText || '').trim();
    if (!text && data.currentType !== 'pdf') {
      const r = await call('library.getBookContent', { bookId: data.currentBookId, section: data.currentRef || '', limit: 5000 });
      text = r.success && typeof r.data === 'string' ? r.data : '';
    }
    if (text) {
      showText(text, { title: 'טקסט מהספרייה', sub: label, source: 'library' });
      let copied = false;
      try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* אין גישה ללוח */ }
      toast.ok(copied ? 'הטקסט חולץ והועתק ללוח (' + label + ')' : 'הטקסט חולץ');
      return;
    }
    if (data.context === 'reader-pdf' || data.currentType === 'pdf') {
      const page = await openBookFromReader(data);
      if (V.pdf) await extractPage(page);
      return;
    }
    toast.err('לא נמצא טקסט לחילוץ במיקום הזה');
  }
  function onToolbar(data) {
    if (!data) return;
    if (data.itemId === TB_OPEN) openBookFromReader(data);
    else if (data.itemId === TB_EXTRACT) extractFromReader(data);
  }
  function onContextMenu(data) { if (data && data.itemId === CM_EXTRACT) extractFromReader(data); }
  // קובץ שנשלח מתוסף אחר (למשל סייר הקבצים): { name, url | dataUrl | token, page } או ספר ספרייה
  async function onPageOpened(data) {
    const p = data && data.param;
    if (!p || typeof p !== 'object') return;
    await ready;
    if (p.bookUid || p.bookId) { await openLibraryBook({ bookUid: p.bookUid, bookId: p.bookId, type: p.type || 'pdf', name: p.name }, p.page); return; }
    let lib, key;
    if (p.token) { lib = { kind: 'token', token: p.token }; key = 't:' + p.token; }
    else if (p.url || p.dataUrl) { lib = { kind: 'url', url: p.url || p.dataUrl }; key = 'u:' + Date.now().toString(36); }
    else return;
    await openExtra(registerExtra(key, lib, p.name || 'מסמך', false), p.page);
  }
  // קיצור המקשים (ctrl+alt+o): פותח את ספר ה-PDF הנוכחי בקורא, או האחרון שפתוח
  async function onCommand(payload) {
    if (!payload || payload.command !== 'openCurrentPdf') return;
    const r = await call('reader.getCurrentState', {});
    const st = r.success ? r.data : null;
    if (!st) return;
    let target = null;
    if (st.currentType === 'pdf') target = { currentBookUid: st.currentBookUid, currentId: st.currentId, currentBookId: st.currentBookId, currentIndex: st.currentIndex, currentBook: st.currentBook, currentType: 'pdf' };
    else {
      const tabs = (st.openTabs || []).filter((t) => t.type === 'pdf' && !t.isSelf);
      const t = tabs[tabs.length - 1];
      if (t) target = { currentId: t.id, currentBookId: t.bookId, currentIndex: t.index, currentBook: t.book, currentType: 'pdf' };
    }
    if (!target) { toast.msg('אין בקורא ספר פתוח שאפשר לפתוח כאן'); return; }
    openBookFromReader(target);
  }
  function safe(fn) { return (d) => { Promise.resolve().then(() => fn(d)).catch((e) => toast.err('הפעולה נכשלה: ' + (e && e.message || e))); }; }

  function renderAll() {
    el.workspace.classList.remove('no-folder');
    renderLibrary();
  }

  async function init() {
    try { await initMain(); } finally { readyRes(); }
  }
  async function initMain() {
    hydrateIcons();
    cacheEls();
    wireEvents();

    const [settings, foldersSaved, legacyFolder, positions, recentFiles, pinned] = await Promise.all([store.get('settings'), store.get('folders'), store.get('folder'), store.get('positions'), store.get('recentFiles'), store.get('pinned')]);
    if (settings && typeof settings === 'object') S.settings = Object.assign({}, DEFAULT_SETTINGS, settings);
    if (!settings || settings.showInLibrary === undefined) {        // מפתחות מהצופה הישן (when.storage במניפסט)
      for (const k of ['showInLibrary', 'tbOpen', 'tbExtract']) { const v = await store.get(k); if (typeof v === 'boolean') S.settings[k] = v; }
    }
    await loadExtra();
    if (positions && typeof positions === 'object') S.positions = positions;
    if (Array.isArray(recentFiles)) S.recentFiles = recentFiles.filter((x) => typeof x === 'string').slice(0, RECENT_MAX);
    if (Array.isArray(pinned)) S.pinned = pinned.filter((x) => typeof x === 'string');
    applyLibState();
    document.body.classList.toggle('invert-pages', !!S.settings.invert);
    applyFsFloat();
    applyFsHide();
    applyLibWidth();
    applyHand();
    ocrApplySettings();

    // מיגרציה מהצופה 3.2.0 (אותו מזהה תוסף ואותו אחסון): { folderToken, name, path } -> { id, token, name, path }
    let migrated = false;
    let folders = Array.isArray(foldersSaved)
      ? foldersSaved.map((f, i) => (f && !f.token && f.folderToken ? (migrated = true, { id: 'o' + i, token: f.folderToken, name: f.name || 'תיקייה', path: f.path || '' }) : f)).filter((f) => f && f.token)
      : [];
    if (migrated && folders.length) store.set('folders', folders);
    if (!folders.length && legacyFolder && legacyFolder.token) {          // מהגרסאות הקודמות: תיקייה אחת
      folders = [Object.assign({}, legacyFolder, { id: '' })];
      store.set('folders', folders);
    }
    folders.forEach((f) => { if (f.id == null) f.id = ''; });
    if (!folders.length) { stageOnboard(); renderLibrary(); el.search.focus(); return; }
    S.folders = folders;
    const idxMap = (await loadIndex()) || {};
    S.files = {};
    folders.forEach((f) => { if (Array.isArray(idxMap[f.id])) S.files[f.id] = idxMap[f.id]; });
    rebuildEntries();
    const missing = folders.filter((f) => !S.files[f.id]);
    if (missing.length) {
      // אינדקס חסר — סריקה אוטומטית אחת
      await startScan(missing, { isNew: false });
      el.search.focus();
      return;
    }

    if (S.settings.restoreLast) {
      const saved = await store.get('tabs');
      const list = saved && Array.isArray(saved.list) ? saved.list.filter((t) => t && (t.path == null || S.byPath.has(t.path))) : [];
      if (list.length) {
        T.tabs = list.map((t) => ({ id: T.nextId++, path: t.path || null, page: t.page || null }));
        T.active = T.tabs[Math.min(Math.max(0, saved.active | 0), T.tabs.length - 1)].id;
      } else {
        const last = await store.get('last');
        if (last && last.path && S.byPath.has(last.path)) { T.tabs[0].path = last.path; T.tabs[0].page = last.page || null; }
      }
      const a = activeTab();
      if (a.path) expandTo(a.path);
    }

    renderAll();
    renderTabs();
    showActiveTab();
    el.search.focus();
    checkFolderAvailable();
  }

  window.addEventListener('error', (e) => { /* שגיאות לא צפויות לא מפילות את הממשק */ if (window.console) console.error(e.error || e.message); });

  Otzaria.on('plugin.boot', (payload) => {
    applyTheme(payload.theme);
    init();
  });
  Otzaria.on('theme.changed', applyTheme);
  Otzaria.on('reader.toolbar_item_clicked', safe(onToolbar));
  Otzaria.on('reader.context_menu_item_clicked', safe(onContextMenu));
  Otzaria.on('plugin.page_opened', safe(onPageOpened));
  Otzaria.on('app.command', safe(onCommand));
  Otzaria.on('library.providerBook.openRequested', safe(onProviderOpen));
})();
