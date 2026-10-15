/* צופה PDF+OCR — תשתית משותפת: גשר אוצריא, תרגום, ערכת צבעים, הודעות והגדרות. */
(function () {
  'use strict';

  const PV = (window.PV = window.PV || {});
  PV.version = '4.6.2';
  const $ = (PV.$ = (id) => document.getElementById(id));

  // ── אייקונים ──────────────────────────────────────────────────────────
  PV.icon = function (name, extraClass) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const stroke = name.indexOf('s_') === 0; // סמלי קו (24x24) לסרגל הכלים והלשוניות
    svg.setAttribute('viewBox', stroke ? '0 0 24 24' : '0 0 20 20');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('class', 'ic' + (stroke ? ' ic-stroke' : '') + (extraClass ? ' ' + extraClass : ''));
    svg.innerHTML = (window.PV_ICONS && window.PV_ICONS[name]) || '';
    return svg;
  };
  PV.hydrateIcons = function (root) {
    (root || document).querySelectorAll('i[data-icon]').forEach((el) => {
      el.replaceWith(PV.icon(el.getAttribute('data-icon'), el.className));
    });
  };

  // ── תרגום (עברית היא שפת המקור; מילון לפי מחרוזת עברית) ────────────────
  let dict = null;
  PV.lang = 'he';
  PV.t = function (s, vars) {
    let out = (dict && dict[s]) || s;
    if (vars) for (const k in vars) out = out.split('{' + k + '}').join(vars[k]);
    return out;
  };
  const ATTRS = ['title', 'placeholder', 'aria-label', 'data-empty'];
  PV.applyI18n = function (root) {
    const scope = root || document.body;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT, {
      acceptNode(n) {
        if (!n.nodeValue.trim()) return NodeFilter.FILTER_REJECT;
        const p = n.parentElement;
        if (!p || p.closest('[data-t-skip],script,style,code,kbd,.text-output,.doc-text,.list')) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      },
    });
    const nodes = [];
    while (walker.nextNode()) nodes.push(walker.currentNode);
    nodes.forEach((n) => {
      if (n.__he === undefined) n.__he = n.nodeValue.trim();
      const lead = n.nodeValue.match(/^\s*/)[0], trail = n.nodeValue.match(/\s*$/)[0];
      n.nodeValue = lead + PV.t(n.__he) + trail;
    });
    scope.querySelectorAll('*').forEach((el) => {
      if (el.closest('[data-t-skip]')) return;
      ATTRS.forEach((a) => {
        if (!el.hasAttribute(a)) return;
        const key = 'he' + a.replace(/[^a-z]/g, '');
        if (el.dataset[key] === undefined) el.dataset[key] = el.getAttribute(a);
        el.setAttribute(a, PV.t(el.dataset[key]));
      });
    });
    if (scope === document.body) document.title = PV.t('צופה PDF+OCR');
  };
  PV.setLanguage = function (lang) {
    const next = lang === 'en' && window.PV_LANG_EN ? 'en' : 'he';
    dict = next === 'en' ? window.PV_LANG_EN : null;
    PV.lang = next;
    document.documentElement.dir = next === 'he' ? 'rtl' : 'ltr';
    PV.applyI18n();
    PV.emit('language');
  };

  // ── אירועים פנימיים ───────────────────────────────────────────────────
  const listeners = {};
  PV.on = (name, fn) => (listeners[name] = listeners[name] || []).push(fn);
  PV.emit = (name, data) => (listeners[name] || []).forEach((fn) => { try { fn(data); } catch (e) { console.error(e); } });

  // ── גשר אוצריא ────────────────────────────────────────────────────────
  PV.hasOtz = () => !!(window.Otzaria && typeof window.Otzaria.call === 'function');
  PV.granted = null; // רשימת הרשאות מאושרות (null = לא ידוע)
  PV.can = (perm) => !PV.granted || PV.granted.indexOf(perm) >= 0;

  /** קריאה ל-API: מחזירה את data, או זורקת Error עם code. */
  PV.call = async function (method, params) {
    if (!PV.hasOtz()) { const e = new Error(PV.t('פועל מחוץ לאוצריא')); e.code = 'error.unavailable'; throw e; }
    const res = await window.Otzaria.call(method, params || {});
    if (res && res.success === false) {
      const er = res.error || {};
      const e = new Error(er.message || er.code || 'error');
      e.code = er.code; e.retryable = !!er.retryable;
      throw e;
    }
    return res && Object.prototype.hasOwnProperty.call(res, 'data') ? res.data : res;
  };
  /** כמו call, אבל מחזירה fallback במקום לזרוק. */
  PV.tryCall = async function (method, params, fallback) {
    try { return await PV.call(method, params); } catch (e) { return fallback === undefined ? null : fallback; }
  };

  // ── אחסון: storage של אוצריא, ו-localStorage מחוץ לה ────────────────
  PV.store = {
    async get(key, def) {
      if (PV.hasOtz()) {
        const v = await PV.tryCall('storage.get', { key });
        return v === null || v === undefined ? def : v;
      }
      try { const raw = localStorage.getItem('pv:' + key); return raw === null ? def : JSON.parse(raw); } catch (e) { return def; }
    },
    async set(key, value) {
      if (PV.hasOtz()) return PV.tryCall('storage.set', { key, value });
      try { localStorage.setItem('pv:' + key, JSON.stringify(value)); } catch (e) { /* פרטי */ }
    },
  };

  // ── הגדרות ────────────────────────────────────────────────────────────
  PV.settings = {
    zoom: 'fit-width',
    resume: true,
    restoreTabs: true,
    searchShowPath: true, // הצגת הנתיב מתחת לשם בתוצאות החיפוש  // שחזור לשוניות בפתיחה
    nightAuto: true,
    sidebar: true,
    ocrQuality: 2,
    ocrLines: true,
    ocrCols: false,
    renderQuality: 2,   // דגימת־יתר מינימלית לעמודים: 2 חדה (ברירת מחדל) · 1.5 מאוזנת · 1 מהירה
    ocrMode: 'ocr',     // 'ocr' | 'extract' — מצב כפתורי תפריט החילוץ/זיהוי
    ocrEngine: 'tesseract', // 'tesseract' | 'windows' (דרך גשר אוצריא)
  };
  PV.loadSettings = async function () {
    const saved = await PV.store.get('settings', null);
    if (saved && typeof saved === 'object') Object.assign(PV.settings, saved);
  };
  PV.saveSettings = () => PV.store.set('settings', PV.settings);

  // ── ערכת צבעים (DESIGN_GUIDE) ─────────────────────────────────────────
  const ROLE_MAP = {
    primary: 'primary', onPrimary: 'on-primary', primaryContainer: 'primary-container', onPrimaryContainer: 'on-primary-container',
    secondary: 'secondary', onSecondary: 'on-secondary', secondaryContainer: 'secondary-container', onSecondaryContainer: 'on-secondary-container',
    tertiary: 'tertiary', surface: 'surface', onSurface: 'on-surface', onSurfaceVariant: 'on-surface-variant',
    surfaceContainerLowest: 'surface-container-lowest', surfaceContainerLow: 'surface-container-low',
    surfaceContainer: 'surface-container', surfaceContainerHigh: 'surface-container-high', surfaceContainerHighest: 'surface-container-highest',
    inverseSurface: 'inverse-surface', onInverseSurface: 'on-inverse-surface',
    error: 'error', onError: 'on-error', errorContainer: 'error-container', onErrorContainer: 'on-error-container',
    outline: 'outline', outlineVariant: 'outline-variant',
  };
  function toRgba(hex, a) {
    const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(String(hex || '').trim());
    if (!m) return null;
    const n = parseInt(m[1], 16);
    return 'rgba(' + ((n >> 16) & 255) + ', ' + ((n >> 8) & 255) + ', ' + (n & 255) + ', ' + a + ')';
  }
  PV.theme = { mode: 'light' };
  PV.applyTheme = function (theme) {
    if (!theme || !theme.colorScheme) return;
    PV.theme = theme;
    const cs = theme.colorScheme, r = document.documentElement.style;
    for (const k in ROLE_MAP) if (cs[k]) r.setProperty('--color-' + ROLE_MAP[k], cs[k]);
    const ps = toRgba(cs.primary, 0.12), ss = toRgba(cs.secondary, 0.12), sel = toRgba(cs.primary, 0.22);
    if (ps) r.setProperty('--color-primary-subtle', ps);
    if (ss) r.setProperty('--color-secondary-subtle', ss);
    if (sel) r.setProperty('--color-selection', sel);
    document.body.classList.toggle('dark-mode', theme.mode === 'dark');
    const t = theme.typography;
    if (t) {
      if (t.uiFontFamily) r.setProperty('--font-ui', "'" + t.uiFontFamily + "', system-ui, sans-serif");
      if (t.fontFamily) r.setProperty('--font-main', "'" + t.fontFamily + "', 'David', serif");
      if (t.fontSize) r.setProperty('--reading-size', Math.max(14, Math.min(40, t.fontSize)) + 'px');
      if (t.lineHeight) r.setProperty('--line-height', String(Math.min(1.6, Math.max(1.3, t.lineHeight))));
    }
    PV.emit('theme', theme);
  };

  // ── הודעות ────────────────────────────────────────────────────────────
  let snackTimer = null;
  PV.toast = function (msg, opts) {
    const o = opts || {};
    const bar = $('snackbar');
    $('snackbar-text').textContent = msg;
    bar.classList.toggle('error', !!o.error);
    bar.classList.toggle('info', !!o.info && !o.error);
    bar.classList.add('show');
    clearTimeout(snackTimer);
    snackTimer = setTimeout(() => bar.classList.remove('show'), o.long ? 6000 : 3000);
  };
  PV.error = (msg) => PV.toast(msg, { error: true, long: true });
  /** הודעה באוצריא עצמה (כשהדף לא בהכרח מוצג למשתמש). */
  PV.notify = async function (message, type, extra) {
    if (!PV.hasOtz()) { PV.toast(message, { error: type === 'error' }); return; }
    const ok = await PV.call('notifications.showInApp', Object.assign({ message, type: type || 'info' }, extra || {})).then(() => true, () => false);
    if (!ok) PV.toast(message, { error: type === 'error' });
  };

  // ── התקדמות ───────────────────────────────────────────────────────────
  let progressCancel = null;
  PV.progress = {
    show(text, onCancel) {
      $('progress-text').textContent = text;
      $('progress-bar').classList.add('indeterminate');
      $('progress-bar').firstElementChild.style.width = '';
      progressCancel = onCancel || null;
      $('progress-cancel').hidden = !onCancel;
      $('progress').hidden = false;
    },
    update(text, fraction) {
      if (text) $('progress-text').textContent = text;
      if (typeof fraction === 'number') {
        $('progress-bar').classList.remove('indeterminate');
        $('progress-bar').firstElementChild.style.width = Math.round(Math.max(0, Math.min(1, fraction)) * 100) + '%';
      }
    },
    hide() { $('progress').hidden = true; progressCancel = null; },
  };
  document.addEventListener('DOMContentLoaded', () => {
    $('progress-cancel').addEventListener('click', () => { if (progressCancel) progressCancel(); });
  });

  // ── עזרים ─────────────────────────────────────────────────────────────
  PV.formatSize = function (bytes) {
    if (!bytes) return '';
    if (bytes < 1024 * 1024) return Math.max(1, Math.round(bytes / 1024)) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };
  PV.relTime = function (ts) {
    if (!ts) return '';
    const d = (Date.now() - ts) / 1000;
    if (d < 60) return PV.t('עכשיו');
    if (d < 3600) return PV.t('לפני {n} דק׳', { n: Math.round(d / 60) });
    if (d < 86400) return PV.t('לפני {n} שע׳', { n: Math.round(d / 3600) });
    const days = Math.round(d / 86400);
    return days === 1 ? PV.t('אתמול') : PV.t('לפני {n} ימים', { n: days });
  };
  PV.debounce = function (fn, ms) {
    let t = null;
    return function () { const a = arguments; clearTimeout(t); t = setTimeout(() => fn.apply(null, a), ms); };
  };
  /** שם לתצוגה: בלי הסיומת ‎.pdf (סיומות אחרות נשארות) */
  PV.dispName = (n) => String(n == null ? '' : n).replace(/\.pdf$/i, '');

  /** ניווט בחיצים ברשימה בזמן שהמיקוד נשאר בתיבה (aria-activedescendant). Enter פותח, Esc — o.onEscape */
  let lnSeq = 0;
  PV.listNav = function (input, list, o) {
    o = o || {};
    if (!list.id) list.id = 'pvln' + (++lnSeq);
    list.setAttribute('role', 'listbox');
    input.setAttribute('aria-controls', list.id);
    input.setAttribute('aria-autocomplete', 'list');
    let cur = null;
    const items = () => Array.from(list.querySelectorAll('.list-item')).filter((el) => el.offsetParent !== null);
    function set(el) {
      if (cur) cur.classList.remove('active');
      cur = el;
      if (el) {
        if (!el.id) el.id = 'pvlo' + (++lnSeq);
        el.setAttribute('role', 'option');
        el.classList.add('active');
        input.setAttribute('aria-activedescendant', el.id);
        el.scrollIntoView({ block: 'nearest' });
      } else input.removeAttribute('aria-activedescendant');
    }
    new MutationObserver(() => { if (cur && !list.contains(cur)) set(null); }).observe(list, { childList: true, subtree: true });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        const it = items(); if (!it.length) return;
        e.preventDefault(); e.stopPropagation();
        let i = it.indexOf(cur);
        i = e.key === 'ArrowDown' ? (i + 1) % it.length : (i <= 0 ? it.length - 1 : i - 1);
        set(it[i]);
      } else if (e.key === 'Enter') {
        const el = cur && list.contains(cur) ? cur : items()[0];
        if (el) { e.preventDefault(); e.stopPropagation(); el.click(); }
      } else if (e.key === 'Escape') {
        set(null);
        if (o.onEscape) o.onEscape(e);
      }
    });
    return { reset: () => set(null) };
  };
  PV.errMsg = (e) => (e && (e.message || e.code)) || String(e);

  // ── תפריטים צפים: סגירה בלחיצה מחוץ / Esc ──────────────────────────────
  PV.closePopovers = function (except) {
    document.querySelectorAll('.popover.open').forEach((p) => { if (p !== except) p.classList.remove('open'); });
  };
  PV.bindPopover = function (button, popover) {
    button.addEventListener('click', (e) => {
      e.stopPropagation();
      const open = !popover.classList.contains('open');
      PV.closePopovers(popover);
      popover.classList.toggle('open', open);
    });
    popover.addEventListener('click', (e) => {
      e.stopPropagation();
      const mi = e.target.closest('.menu-item');
      if (mi && !mi.hasAttribute('data-keep-open')) popover.classList.remove('open');
    });
  };
  document.addEventListener('click', () => PV.closePopovers());
})();
