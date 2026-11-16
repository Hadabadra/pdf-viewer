/* צופה PDF+OCR — צבע העמוד (הגדרות ← תצוגה ← צבע העמוד). נוסף ב-5.15.0.
   הבורר זהה לבורר הצבע שבתוסף "שני טורים" (צבעים מוכנים + התאמה אישית: ריבוע רוויה/בהירות, גוון, RGB, HEX).
   הצבע נשמר ב-PV.settings.pageColor (null = ברירת מחדל: בלי שינוי) ומוחל רק דרך CSS:
   • משתנה --user-page-color על ה-root, ומחלקה body.page-tint — פעילה רק כשנבחר צבע וגם מצב לילה כבוי;
   • בעמודי PDF ותמונות קנבס העמוד מצויר ב-multiply מעל רקע העמוד (לבן ← צבע העמוד, והכתב השחור נשאר שחור);
   • מסמכי טקסט ומסגרת HTML מקבלים את הצבע כרקע, ותמונות העמודים הממוזערות — דרך מסנן SVG (#pv-page-tint).
   שום דבר לא נוגע בבתים של הקובץ, ב-OCR, בחילוץ טקסט או בהדפסה, ובמצב לילה ההתנהגות הקודמת נשארת בדיוק כמו שהיא. */
(function () {
  'use strict';
  const PV = window.PV;
  const $ = (id) => document.getElementById(id);

  const FALLBACK = '#ffffff';   // לתצוגת המדגם כשלא נבחר צבע
  // צבעים בהירים בלבד: הכתב נשאר שחור, ולכן צבע כהה יקשה על הקריאה
  const PRESETS = ['#fdf6e3', '#f4ecd8', '#f0e6cf', '#eef2e6', '#e7eef5', '#f2ecf4', '#e8e4dc', '#fbf3e7'];
  const PRESET_NAMES = ['קרם עתיק', 'בז\' ספיה', 'בז\' חם', 'ירוק בהיר', 'כחול בהיר', 'סגול לבנדר בהיר', 'אפור חמים בהיר', 'שנהב'];
  const st = { h: 0, s: 0, v: 0 };   // מצב ה-HSV של הבורר המורחב (בזיכרון בלבד, לגרירה חלקה)
  let inited = false;

  const isHex = (v) => typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v.trim());
  const current = () => (isHex(PV.settings.pageColor) ? PV.settings.pageColor.trim().toLowerCase() : null);

  // ── המרות צבע ──────────────────────────────────────────────────────────
  function hexToRgb(hex) {
    if (!hex) return null;
    let h = String(hex).trim().replace(/^#/, '');
    if (h.length === 3) h = h.split('').map((c) => c + c).join('');
    if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
    return { r: parseInt(h.substring(0, 2), 16), g: parseInt(h.substring(2, 4), 16), b: parseInt(h.substring(4, 6), 16) };
  }
  function rgbToHex(r, g, b) {
    const x = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return '#' + x(r) + x(g) + x(b);
  }
  function rgbToHsv(r, g, b) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min;
    let h = 0;
    if (d !== 0) {
      if (max === r) h = ((g - b) / d) % 6;
      else if (max === g) h = (b - r) / d + 2;
      else h = (r - g) / d + 4;
      h = Math.round(h * 60);
      if (h < 0) h += 360;
    }
    return { h, s: max === 0 ? 0 : d / max, v: max };
  }
  function hsvToRgb(h, s, v) {
    const c = v * s, x = c * (1 - Math.abs(((h / 60) % 2) - 1)), m = v - c;
    let r1 = 0, g1 = 0, b1 = 0;
    if (h < 60) { r1 = c; g1 = x; } else if (h < 120) { r1 = x; g1 = c; } else if (h < 180) { g1 = c; b1 = x; }
    else if (h < 240) { g1 = x; b1 = c; } else if (h < 300) { r1 = x; b1 = c; } else { r1 = c; b1 = x; }
    return { r: Math.round((r1 + m) * 255), g: Math.round((g1 + m) * 255), b: Math.round((b1 + m) * 255) };
  }

  // ── החלת הצבע על התצוגה ─────────────────────────────────────────────────
  function applyCss() {
    const c = current();
    const root = document.documentElement.style;
    if (c) root.setProperty('--user-page-color', c); else root.removeProperty('--user-page-color');
    // מסנן הצביעה של התמונות הממוזערות: הכפלה בצבע העמוד (כמו multiply), במרחב sRGB
    const fm = $('pv-page-tint-matrix');
    const rgb = hexToRgb(c || FALLBACK);
    if (fm && rgb) fm.setAttribute('values', [rgb.r / 255, 0, 0, 0, 0, 0, rgb.g / 255, 0, 0, 0, 0, 0, rgb.b / 255, 0, 0, 0, 0, 0, 1, 0].join(' '));
    // מצב לילה: הצבע לא חל בכלל (העמודים נשארים בדיוק כמו במצב לילה עד היום)
    const night = !!(PV.viewer && PV.viewer.night);
    document.body.classList.toggle('page-tint', !!c && !night);
  }

  function setColor(hexOrNull) {
    PV.settings.pageColor = hexOrNull;
    PV.saveSettings();
    PV.emit('settings', 'pageColor');
    applyCss();
    updateUi();
  }

  // ── ממשק הבורר ──────────────────────────────────────────────────────────
  function buildPresets() {
    const box = $('color-picker-presets-page');
    if (!box) return;
    box.innerHTML = '';
    const none = document.createElement('button');
    none.type = 'button';
    none.className = 'color-picker-preset-swatch none-swatch';
    none.title = PV.t('ברירת מחדל');
    none.addEventListener('click', () => setColor(null));
    box.appendChild(none);
    PRESETS.forEach((hex, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'color-picker-preset-swatch';
      b.style.backgroundColor = hex;
      b.setAttribute('data-preset-hex', hex);
      b.title = PV.t(PRESET_NAMES[i]);
      b.addEventListener('click', () => setColor(hex));
      box.appendChild(b);
    });
  }

  function redrawCustom() {
    const { r, g, b } = hsvToRgb(st.h, st.s, st.v);
    const sv = $('color-picker-sv-page'), svc = $('color-picker-sv-cursor-page'), hc = $('color-picker-hue-cursor-page');
    if (sv) sv.style.backgroundColor = 'hsl(' + st.h + ', 100%, 50%)';
    if (svc) { svc.style.left = (st.s * 100) + '%'; svc.style.top = ((1 - st.v) * 100) + '%'; }
    if (hc) hc.style.left = (st.h / 360 * 100) + '%';
    const set = (id, v) => { const el = $(id); if (el) el.value = v; };
    set('color-picker-r-page', r); set('color-picker-g-page', g); set('color-picker-b-page', b);
    set('color-picker-hex-page', rgbToHex(r, g, b));
  }

  function updateUi() {
    const val = current();
    const sw = $('color-picker-swatch-page'), label = $('color-picker-label-page');
    if (sw) {
      if (val) { sw.style.backgroundImage = 'none'; sw.style.backgroundColor = val; }
      else { sw.style.backgroundImage = ''; sw.style.backgroundColor = FALLBACK; }
    }
    if (label) label.textContent = val ? val.toUpperCase() : PV.t('ברירת מחדל');
    const box = $('color-picker-presets-page');
    if (box) {
      box.querySelectorAll('.color-picker-preset-swatch').forEach((btn) => {
        const isNone = btn.classList.contains('none-swatch');
        btn.classList.toggle('selected', isNone ? !val : val === btn.getAttribute('data-preset-hex'));
      });
    }
    const custom = $('color-picker-custom-page');
    if (custom && custom.classList.contains('open')) {
      const rgb = hexToRgb(val || FALLBACK);
      if (rgb) { Object.assign(st, rgbToHsv(rgb.r, rgb.g, rgb.b)); redrawCustom(); }
    }
  }

  function toggleInline() {
    const inline = $('color-picker-inline-page'), trig = $('color-picker-trigger-page');
    if (!inline || !trig) return;
    const open = !inline.classList.contains('open');
    inline.classList.toggle('open', open);
    trig.classList.toggle('open', open);
  }
  function toggleCustom() {
    const custom = $('color-picker-custom-page');
    if (!custom) return;
    const willOpen = !custom.classList.contains('open');
    custom.classList.toggle('open', willOpen);
    if (willOpen) {
      const rgb = hexToRgb(current() || FALLBACK);
      if (rgb) { Object.assign(st, rgbToHsv(rgb.r, rgb.g, rgb.b)); redrawCustom(); }
    }
  }

  function onHexChange() {
    const el = $('color-picker-hex-page');
    const rgb = el && hexToRgb(el.value);
    if (!rgb) { redrawCustom(); return; }   // ערך לא תקין — חוזרים לתצוגה התקינה האחרונה
    Object.assign(st, rgbToHsv(rgb.r, rgb.g, rgb.b));
    redrawCustom();
    setColor(rgbToHex(rgb.r, rgb.g, rgb.b));
  }
  function onRgbChange() {
    const cl = (v) => Math.max(0, Math.min(255, isNaN(v) ? 0 : v));
    const r = cl(parseInt(($('color-picker-r-page') || {}).value, 10));
    const g = cl(parseInt(($('color-picker-g-page') || {}).value, 10));
    const b = cl(parseInt(($('color-picker-b-page') || {}).value, 10));
    Object.assign(st, rgbToHsv(r, g, b));
    redrawCustom();
    setColor(rgbToHex(r, g, b));
  }

  // גרירה (עכבר/מגע) בריבוע הרוויה/בהירות וברצועת הגוון
  function drag(el, onPoint) {
    if (!el) return;
    el.addEventListener('pointerdown', (evt) => {
      el.setPointerCapture(evt.pointerId);
      onPoint(evt);
      const move = (e) => onPoint(e);
      const up = () => { el.removeEventListener('pointermove', move); el.removeEventListener('pointerup', up); };
      el.addEventListener('pointermove', move);
      el.addEventListener('pointerup', up);
    });
  }
  function bindDrag() {
    const sv = $('color-picker-sv-page'), hue = $('color-picker-hue-page');
    drag(sv, (e) => {
      const r = sv.getBoundingClientRect();
      st.s = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width));
      st.v = 1 - Math.max(0, Math.min(1, (e.clientY - r.top) / r.height));
      redrawCustom();
      const c = hsvToRgb(st.h, st.s, st.v);
      setColor(rgbToHex(c.r, c.g, c.b));
    });
    drag(hue, (e) => {
      const r = hue.getBoundingClientRect();
      st.h = Math.round(Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)) * 360);
      redrawCustom();
      const c = hsvToRgb(st.h, st.s, st.v);
      setColor(rgbToHex(c.r, c.g, c.b));
    });
  }

  PV.pageColor = {
    /** נקרא פעם אחת בעלייה, אחרי טעינת ההגדרות. */
    init() {
      if (!inited) {
        inited = true;
        buildPresets();
        bindDrag();
        const trig = $('color-picker-trigger-page'), tog = $('color-picker-custom-toggle-page'), rst = $('color-picker-reset-page');
        if (trig) trig.addEventListener('click', toggleInline);
        if (tog) tog.addEventListener('click', toggleCustom);
        if (rst) rst.addEventListener('click', () => setColor(null));
        const hex = $('color-picker-hex-page');
        if (hex) hex.addEventListener('change', onHexChange);
        ['r', 'g', 'b'].forEach((k) => { const el = $('color-picker-' + k + '-page'); if (el) el.addEventListener('change', onRgbChange); });
        PV.on('night', applyCss);                                   // מצב לילה נדלק/כבה — הצבע חל רק כשהוא כבוי
        PV.on('language', () => { buildPresets(); updateUi(); });   // תוויות מתורגמות
      }
      if (!isHex(PV.settings.pageColor)) PV.settings.pageColor = null;   // ערך שמור לא תקין — ברירת מחדל
      applyCss();
      updateUi();
    },
  };
})();
