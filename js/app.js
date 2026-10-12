/* צופה PDF+OCR — חיבור הממשק, קיצורי מקשים, הגדרות ושילוב עם אוצריא. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer, O = PV.ocr, Fs = PV.files;

  PV.hydrateIcons();

  // ── סרגל עליון ────────────────────────────────────────────────────────
  function updateNav() {
    const paged = V.isPaged();
    $('btn-prev').disabled = !paged || V.page <= 1;
    $('btn-next').disabled = !paged || V.page >= V.count;
    $('page-input').disabled = !paged;
    if (document.activeElement !== $('page-input')) $('page-input').value = paged ? V.page : '';
    $('page-total').textContent = paged ? '/ ' + V.count : '/ –';
    const zoomable = !!(V.doc && (paged || V.doc.kind === 'text'));
    ['btn-zoom-in', 'btn-zoom-out', 'btn-zoom-menu'].forEach((id) => { $(id).disabled = !zoomable; });
    $('btn-zoom-menu').textContent = zoomable ? Math.round(V.scale * 100) + '%' : '100%';
    document.querySelectorAll('#zoom-menu .menu-item').forEach((b) => {
      const z = b.getAttribute('data-zoom');
      b.classList.toggle('checked', String(V.zoomMode) === z);
    });
    $('btn-find').disabled = !(V.doc && V.doc.kind === 'pdf');
    document.querySelectorAll('#more-menu .doc-only').forEach((b) => { b.disabled = !paged; });
    document.querySelector('#more-menu [data-act="close-doc"]').disabled = !V.doc;
    document.querySelector('#more-menu [data-act="find"]').disabled = !(V.doc && V.doc.kind === 'pdf');
    document.querySelector('#more-menu [data-act="night"]').classList.toggle('checked', V.night);
    document.querySelectorAll('#ocr-menu [data-act]').forEach((b) => {
      const a = b.getAttribute('data-act');
      if (a === 'paste' || a === 'capture') return;
      b.disabled = !paged || (a === 'extract-all' && V.doc.kind !== 'pdf');
    });
  }
  PV.on('page', (n) => { updateNav(); V.markThumb(n); });
  PV.on('zoom', updateNav);
  PV.on('night', updateNav);
  PV.on('doc', async (doc) => {
    $('doc-name').textContent = doc ? doc.name : PV.t('לא נפתח קובץ');
    $('doc-name').title = doc ? doc.name : '';
    if (PV.find) $('findbar').hidden = true;
    updateNav();
    if (!doc) { V.buildThumbs(); V.buildToc(); return; }
    V.buildThumbs();
    const hasToc = await V.buildToc();
    if (V.isPaged() && PV.settings.sidebar && window.innerWidth > 900) setSidebar(true);
    if (hasToc && !sidebarTab.touched) showTab('toc'); else if (!sidebarTab.touched) showTab('pages');
  });

  $('btn-prev').addEventListener('click', V.prev);
  $('btn-next').addEventListener('click', V.next);
  $('page-input').addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const n = parseInt($('page-input').value, 10); if (n) V.goTo(n); $('viewer').focus({ preventScroll: true }); }
    if (e.key === 'Escape') { $('page-input').value = V.page; $('viewer').focus({ preventScroll: true }); }
  });
  $('page-input').addEventListener('focus', () => $('page-input').select());
  $('page-input').addEventListener('blur', () => { $('page-input').value = V.isPaged() ? V.page : ''; });
  $('btn-zoom-in').addEventListener('click', () => V.zoomBy(1));
  $('btn-zoom-out').addEventListener('click', () => V.zoomBy(-1));
  PV.bindPopover($('btn-zoom-menu'), $('zoom-menu'));
  document.querySelectorAll('#zoom-menu [data-zoom]').forEach((b) => b.addEventListener('click', () => {
    const z = b.getAttribute('data-zoom');
    V.setZoom(isNaN(Number(z)) ? z : Number(z));
  }));
  $('btn-open').addEventListener('click', Fs.pick);
  $('btn-find').addEventListener('click', () => PV.find.open());
  PV.bindPopover($('btn-ocr-menu'), $('ocr-menu'));
  PV.bindPopover($('btn-more'), $('more-menu'));
  $('btn-textpanel').addEventListener('click', () => {
    const tp = $('textpanel');
    tp.hidden = !tp.hidden;
    $('btn-textpanel').classList.toggle('active', !tp.hidden);
  });

  function act(a) {
    switch (a) {
      case 'open': return Fs.pick();
      case 'add-folder': return Fs.addFolder();
      case 'find': return PV.find.open();
      case 'rotate': return V.rotate();
      case 'night': return V.setNight(!V.night);
      case 'fit-width': return V.setZoom('fit-width');
      case 'print-pages': return printPages();
      case 'close-doc': return V.close();
      case 'settings': return openOverlay('settings');
      case 'about': return openOverlay('about');
      case 'extract-page': return O.extractPage();
      case 'ocr-page': return O.ocrPage();
      case 'ocr-region': return O.startRegion();
      case 'ocr-all': return O.processAll(true);
      case 'extract-all': return O.processAll(false);
      case 'paste': return PV.capture.pasteFromClipboard();
      case 'capture': return PV.capture.start();
    }
  }
  document.querySelectorAll('[data-act]').forEach((b) => b.addEventListener('click', () => act(b.getAttribute('data-act'))));

  // ── חלונית הצד ────────────────────────────────────────────────────────
  const sidebarTab = { current: 'pages', touched: false };
  function setSidebar(open) {
    $('sidebar').classList.toggle('collapsed', !open);
    $('btn-sidebar').classList.toggle('active', open);
    if (open) setTimeout(() => V.markThumb(V.page), 50);
  }
  function showTab(name) {
    sidebarTab.current = name;
    document.querySelectorAll('#sidebar .tab').forEach((t) => t.classList.toggle('active', t.dataset.tab === name));
    document.querySelectorAll('#sidebar .tab-panel').forEach((p) => { p.hidden = p.dataset.panel !== name; });
    if (name === 'files') Fs.refreshOpenBooks();
    if (name === 'pages') V.markThumb(V.page);
  }
  $('btn-sidebar').addEventListener('click', () => setSidebar($('sidebar').classList.contains('collapsed')));
  document.querySelectorAll('#sidebar .tab').forEach((t) => t.addEventListener('click', () => { sidebarTab.touched = true; showTab(t.dataset.tab); }));
  $('btn-refresh-tabs').addEventListener('click', Fs.refreshOpenBooks);
  $('btn-add-folder').addEventListener('click', Fs.addFolder);
  PV.on('show-files', () => { setSidebar(true); sidebarTab.touched = true; showTab('files'); });

  // מסך פתיחה
  $('welcome-open').addEventListener('click', Fs.pick);
  $('welcome-paste').addEventListener('click', () => PV.capture.pasteFromClipboard());
  $('welcome-folder').addEventListener('click', Fs.addFolder);

  // גרירת קבצים
  const viewerEl = $('viewer');
  ['dragenter', 'dragover'].forEach((ev) => viewerEl.addEventListener(ev, (e) => {
    if (!e.dataTransfer || !Array.from(e.dataTransfer.types || []).includes('Files')) return;
    e.preventDefault();
    $('welcome').classList.add('dragover');
  }));
  viewerEl.addEventListener('dragleave', () => $('welcome').classList.remove('dragover'));
  viewerEl.addEventListener('drop', (e) => {
    e.preventDefault();
    $('welcome').classList.remove('dragover');
    const f = e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files[0];
    if (f) Fs.openBlob(f, f.name, { source: null });
  });

  // תפריט לחיצה ימנית על העמוד
  const ctx = $('ctx-menu');
  let ctxPage = 1;
  viewerEl.addEventListener('contextmenu', (e) => {
    const pageEl = e.target.closest('.page');
    if (!pageEl) return;
    e.preventDefault();
    ctxPage = Number(pageEl.dataset.page);
    const hasSel = !!String(window.getSelection() || '').trim();
    ctx.querySelector('[data-cact="copy"]').hidden = !hasSel;
    ctx.querySelector('[data-cact="search"]').hidden = !hasSel;
    ctx.hidden = false;
    const w = ctx.offsetWidth, h = ctx.offsetHeight;
    ctx.style.left = Math.min(e.clientX, window.innerWidth - w - 6) + 'px';
    ctx.style.top = Math.min(e.clientY, window.innerHeight - h - 6) + 'px';
  });
  document.addEventListener('click', () => { ctx.hidden = true; });
  ctx.querySelectorAll('[data-cact]').forEach((b) => b.addEventListener('click', () => {
    ctx.hidden = true;
    const a = b.getAttribute('data-cact'), sel = String(window.getSelection() || '').trim();
    if (a === 'copy') navigator.clipboard.writeText(sel).then(() => PV.toast(PV.t('הועתק')), () => document.execCommand('copy'));
    else if (a === 'search') O.searchLibrary(sel);
    else if (a === 'extract') O.extractPage(ctxPage);
    else if (a === 'ocr') O.ocrPage(ctxPage);
    else if (a === 'region') O.startRegion();
  }));

  // ── קיצורי מקשים ──────────────────────────────────────────────────────
  document.addEventListener('keydown', (e) => {
    const inField = e.target && (e.target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName));
    const mod = e.ctrlKey || e.metaKey;
    if (e.key === 'Escape') {
      if (PV.capture.isOpen()) { PV.capture.close(); return; }
      if ($('viewer').classList.contains('region-mode')) { O.cancelRegion(); return; }
      if (!$('overlay').classList.contains('open') && !$('findbar').hidden) { PV.find.close(); return; }
      if ($('overlay').classList.contains('open')) { closeOverlay(); return; }
      PV.closePopovers();
      return;
    }
    if (mod && !e.altKey) {
      const k = e.key.toLowerCase();
      if (k === 'o') { e.preventDefault(); Fs.pick(); return; }
      if (k === 'f' && e.shiftKey) { e.preventDefault(); PV.bridge.searchDialog(); return; }
      if (k === 'f') { e.preventDefault(); PV.find.open(); return; }
      if (k === 'e' && !inField) { e.preventDefault(); O.extractPage(); return; }
      if (k === 'r' && !inField) { e.preventDefault(); O.startRegion(); return; }
      if (k === 'g') { e.preventDefault(); if (V.isPaged()) $('page-input').focus(); return; }
      if (k === ']' ) { e.preventDefault(); V.rotate(); return; }
      if (k === '=' || k === '+') { e.preventDefault(); V.zoomBy(1); return; }
      if (k === '-') { e.preventDefault(); V.zoomBy(-1); return; }
      if (k === '0') { e.preventDefault(); V.setZoom('fit-width'); return; }
    }
    if (inField || !V.isPaged()) return;
    if (e.key === 'PageDown' || (e.key === ' ' && !e.shiftKey && atPageEdge(1))) { e.preventDefault(); V.next(); }
    else if (e.key === 'PageUp' || (e.key === ' ' && e.shiftKey && atPageEdge(-1))) { e.preventDefault(); V.prev(); }
    else if (e.key === 'Home' && mod) { e.preventDefault(); V.goTo(1); }
    else if (e.key === 'End' && mod) { e.preventDefault(); V.goTo(V.count); }
    else if (e.key === 'Home' && typeof V.zoomMode === 'string' && V.zoomMode === 'fit-page') { e.preventDefault(); V.goTo(1); }
    else if (e.key === 'End' && typeof V.zoomMode === 'string' && V.zoomMode === 'fit-page') { e.preventDefault(); V.goTo(V.count); }
    else if ((e.key === 'ArrowLeft' || e.key === 'ArrowRight') && typeof V.zoomMode === 'string') {
      e.preventDefault();
      const forward = (e.key === 'ArrowLeft') === (document.documentElement.dir === 'rtl');
      forward ? V.next() : V.prev();
    }
  });
  function atPageEdge() { return V.zoomMode === 'fit-page'; }

  // ── הדפסת המסמך (עמודים כתמונות) ──────────────────────────────────────
  async function printPages() {
    if (!V.isPaged()) return;
    const total = Math.min(V.count, 400);
    let cancelled = false;
    PV.progress.show(PV.t('מכין להדפסה…'), () => { cancelled = true; });
    const root = $('print-root');
    root.innerHTML = '';
    root.className = 'print-root pages-print';
    try {
      for (let n = 1; n <= total && !cancelled; n++) {
        PV.progress.update(PV.t('מכין עמוד {n} מתוך {t}…', { n, t: total }), n / total);
        const c = await V.renderOffscreen(n, 1.6);
        const img = document.createElement('img');
        img.src = c.toDataURL('image/jpeg', 0.9);
        c.width = 0;
        root.appendChild(img);
      }
    } finally { PV.progress.hide(); }
    if (cancelled) { root.innerHTML = ''; return; }
    if (V.count > total) PV.toast(PV.t('הוכנו {n} העמודים הראשונים', { n: total }));
    // הדפסה דורשת לחיצה טרייה של המשתמש — לכן כפתור אישור
    showSnackAction(PV.t('המסמך מוכן להדפסה'), PV.t('הדפסה'), () => {
      if (PV.hasOtz()) PV.call('ui.print', { jobName: V.doc.name || 'PDF' }).catch((e) => { if (e && e.code === 'error.unknown_method') window.print(); else PV.error(PV.errMsg(e)); });
      else window.print();
    });
  }
  function showSnackAction(text, label, fn) {
    const bar = $('snackbar');
    $('snackbar-text').textContent = text;
    let btn = bar.querySelector('.btn');
    if (btn) btn.remove();
    btn = document.createElement('button');
    btn.className = 'btn compact filled';
    btn.textContent = label;
    btn.addEventListener('click', () => { bar.classList.remove('show'); btn.remove(); fn(); });
    bar.appendChild(btn);
    bar.classList.remove('error');
    bar.classList.add('show');
    setTimeout(() => { if (btn.isConnected) { bar.classList.remove('show'); btn.remove(); } }, 20000);
  }

  // ── שכבת הגדרות / OCR / אודות ─────────────────────────────────────────
  function openOverlay(tab) {
    $('overlay-scrim').classList.add('open');
    $('overlay').classList.add('open');
    showOverlayTab(tab || 'settings');
  }
  function closeOverlay() {
    $('overlay-scrim').classList.remove('open');
    $('overlay').classList.remove('open');
  }
  function showOverlayTab(name) {
    document.querySelectorAll('[data-otab]').forEach((t) => t.classList.toggle('active', t.dataset.otab === name));
    document.querySelectorAll('[data-opanel]').forEach((p) => { p.hidden = p.dataset.opanel !== name; });
    $('overlay-title').textContent = PV.t({ settings: 'הגדרות', ocr: 'זיהוי טקסט (OCR)', about: 'אודות' }[name]);
    if (name === 'ocr') renderLangs();
  }
  $('overlay-scrim').addEventListener('click', closeOverlay);
  $('overlay-close').addEventListener('click', closeOverlay);
  document.querySelectorAll('[data-otab]').forEach((t) => t.addEventListener('click', () => showOverlayTab(t.dataset.otab)));

  // הגדרות
  function bindSetting(id, key, parse) {
    const el = $(id);
    const isBox = el.type === 'checkbox';
    if (isBox) el.checked = !!PV.settings[key]; else el.value = String(PV.settings[key]);
    el.addEventListener('change', () => {
      PV.settings[key] = isBox ? el.checked : (parse ? parse(el.value) : el.value);
      PV.saveSettings();
      PV.emit('settings', key);
    });
  }
  async function bindStoreSwitch(id, key, after) {
    const el = $(id);
    el.checked = (await PV.store.get(key, true)) !== false;
    el.addEventListener('change', async () => {
      await PV.store.set(key, el.checked);
      if (after) after(el.checked);
    });
  }
  PV.on('settings', (key) => {
    if (key === 'nightAuto') applyAutoNight();
    if (key === 'ocrQuality' || key === 'ocrLines') { /* חל בזיהוי הבא */ }
  });
  function applyAutoNight() {
    if (PV.settings.nightAuto) V.setNight(PV.theme.mode === 'dark');
  }
  PV.on('theme', applyAutoNight);

  // שפות OCR
  async function renderLangs() {
    const box = $('lang-list');
    box.innerHTML = '';
    const chip = (label, onRemove) => {
      const c = document.createElement('span');
      c.className = 'chip';
      c.appendChild(document.createTextNode(label));
      if (onRemove) {
        const b = document.createElement('button');
        b.className = 'icon-btn'; b.title = PV.t('הסרה');
        b.appendChild(PV.icon('dismiss'));
        b.addEventListener('click', onRemove);
        c.appendChild(b);
      } else c.style.paddingInlineEnd = '0.75em';
      box.appendChild(c);
    };
    chip(PV.t('עברית (מובנית)'));
    (await O.getLanguages()).forEach((l) => chip(l.code, async () => {
      await O.removeLanguage(l.code); await O.resetWorker();
      PV.toast(PV.t('השפה {n} הוסרה', { n: l.code })); renderLangs();
    }));
  }
  $('btn-add-lang').addEventListener('click', () => $('lang-file-input').click());
  $('lang-file-input').addEventListener('change', async () => {
    const f = $('lang-file-input').files && $('lang-file-input').files[0];
    $('lang-file-input').value = '';
    if (!f) return;
    const code = f.name.replace(/\.traineddata$/i, '');
    if (!/^[a-z_]+$/i.test(code)) { PV.error(PV.t('שם הקובץ צריך להיות קוד_שפה.traineddata (למשל eng.traineddata)')); return; }
    try {
      const bytes = new Uint8Array(await f.arrayBuffer());
      let bin = '';
      for (let i = 0; i < bytes.length; i += 8192) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 8192));
      await O.addLanguage(code, btoa(bin));
      await O.resetWorker();
      PV.toast(PV.t('השפה {n} נוספה', { n: code }));
      renderLangs();
    } catch (e) { PV.error(PV.t('הוספת השפה נכשלה: {e}', { e: PV.errMsg(e) })); }
  });
  $('btn-lang-page').addEventListener('click', () => {
    const url = 'https://github.com/tesseract-ocr/tessdata_fast';
    if (PV.hasOtz()) PV.call('app.openUrl', { url }).catch(() => PV.toast(url, { long: true }));
    else window.open(url, '_blank');
  });

  // OCR של Windows דרך הגשר
  async function refreshWinOcr() {
    const box = $('win-ocr-status');
    box.textContent = PV.t('בודק חיבור לגשר…');
    const st = await PV.bridge.checkOcr();
    let msg;
    if (!PV.hasOtz()) msg = PV.t('פועל מחוץ לאוצריא');
    else if (st.bridge && st.unpaired) msg = PV.t('הגשר פועל אבל התוסף לא מצומד אליו. לחצו „צימוד לגשר“ ואשרו בחלון שייפתח במחשב');
    else if (!st.bridge) msg = PV.t('הגשר לא זמין (לא מותקן, לא פועל, או שחסרה הרשאת רשת מקומית)');
    else if (!st.available || !st.hebrew) msg = PV.t('הגשר מחובר, אך חבילת OCR לעברית אינה מותקנת ב-Windows');
    else msg = PV.t('מחובר ומוכן: OCR של Windows בעברית');
    box.textContent = msg;
    $('opt-ocr-windows').disabled = !PV.bridge.ocrReady();
    if (!PV.bridge.ocrReady() && PV.settings.ocrEngine === 'windows') $('set-ocr-engine').value = 'tesseract';
  }
  $('btn-bridge-check').addEventListener('click', refreshWinOcr);
  $('btn-bridge-pair').addEventListener('click', async () => {
    try { await PV.bridge.probe(); PV.toast(PV.t('ממתין לאישור בחלון הגשר במחשב…'), { long: true }); await PV.bridge.pair(); PV.toast(PV.t('הצימוד הושלם')); }
    catch (e) { PV.error(PV.errMsg(e)); }
    refreshWinOcr();
  });
  $('btn-bridge-search').addEventListener('click', () => PV.bridge.searchDialog());
  $('btn-bridge-dl').addEventListener('click', () => {
    if (PV.hasOtz()) PV.call('app.openUrl', { url: PV.BRIDGE_URL }).catch(() => PV.toast(PV.BRIDGE_URL, { long: true }));
    else window.open(PV.BRIDGE_URL, '_blank');
  });

  // אבחון
  $('btn-diag').addEventListener('click', async () => {
    const box = $('diag-box');
    const lines = [
      'Otzaria API: ' + (PV.hasOtz() ? '✓' : '✗'),
      'WebAssembly: ' + (typeof WebAssembly !== 'undefined' ? '✓' : '✗'),
      'Worker: ' + (typeof Worker !== 'undefined' ? '✓' : '✗'),
      PV.t('גרסה') + ': ' + PV.version,
    ];
    box.textContent = lines.concat([PV.t('בודק את המנוע…')]).join('\n');
    const t0 = performance.now();
    try {
      const text = await Promise.race([O.selfTest(), new Promise((_, rej) => setTimeout(() => rej(new Error('timeout 45s')), 45000))]);
      lines.push('OCR: ✓ (' + Math.round(performance.now() - t0) + 'ms) "' + String(text).slice(0, 30) + '"');
    } catch (e) {
      lines.push('OCR: ✗ ' + PV.errMsg(e));
    }
    if (PV.granted) lines.push(PV.t('הרשאות') + ': ' + PV.granted.join(', '));
    box.textContent = lines.join('\n');
  });

  // משוב — ערוץ הדיווח הרשמי של אוצריא, ודוא״ל כגיבוי
  $('btn-feedback').addEventListener('click', async () => {
    const msg = $('feedback-text').value.trim();
    const st = $('feedback-status');
    if (!msg) { st.textContent = PV.t('נא לכתוב הודעה'); return; }
    if (!PV.hasOtz()) { st.textContent = PV.t('שליחת משוב זמינה בתוך אוצריא'); return; }
    $('btn-feedback').disabled = true;
    st.textContent = PV.t('שולח…');
    try {
      let r = null;
      try { r = await PV.call('feedback.report', { details: ('[צופה PDF+OCR ' + PV.version + ']\n' + msg).slice(0, 5000), reportType: 'other' }); }
      catch (e) { r = null; }
      if (r === 'cancelled') { st.textContent = PV.t('השליחה בוטלה'); return; }
      if (r !== 'sent' && r !== 'queued') {
        await PV.call('feedback.sendEmail', { to: 'E0548433917@outlook.com', subject: 'משוב על צופה PDF+OCR ' + PV.version, body: msg, includeSystemInfo: true });
      }
      $('feedback-text').value = '';
      st.textContent = r === 'queued' ? PV.t('המשוב נשמר ויישלח כשתהיה רשת. תודה!') : PV.t('המשוב נשלח, תודה!');
    } catch (e) {
      st.textContent = PV.t('השליחה נכשלה: {e}', { e: PV.errMsg(e) });
    } finally { $('btn-feedback').disabled = false; }
  });

  // ── שילוב עם אוצריא: אירועים מהקורא ומתוספים אחרים ────────────────────
  const TB_EXTRACT = 'chadbedera-extract-text-toolbar';
  const TB_OPEN = 'chadbedera-open-book-file';
  const CM_EXTRACT = 'chadbedera-extract-text';

  async function openBookFromReader(data) {
    const page = Number(data.currentIndex) > 0 ? Number(data.currentIndex) : 1;
    const q = data.currentBookUid ? { bookUid: data.currentBookUid } : data.currentId != null ? { id: data.currentId } : { bookId: data.currentBookId };
    q.type = data.currentType || 'pdf';
    q.name = data.currentBook;
    try { await Fs.openLibraryBook(q, data.context === 'reader-pdf' || q.type === 'pdf' ? page : undefined); }
    catch (e) {
      PV.error(e && e.code === 'error.unsupported'
        ? PV.t('לספר הזה אין קובץ מקומי (ספר טקסט מהמאגר) — אפשר לחלץ ממנו טקסט בכפתור "חלץ טקסט"')
        : PV.t('לא ניתן לפתוח את קובץ הספר: {e}', { e: PV.errMsg(e) }));
    }
  }

  /** "חלץ טקסט" מהקורא: טקסט שאוצריא אינדקסה, ואם אין (PDF סרוק) — הקובץ עצמו נפתח לחילוץ/OCR. */
  async function extractFromReader(data) {
    const label = [data.currentBook, data.currentRef].filter(Boolean).join(' · ');
    let text = (data.selectedText || '').trim();
    if (!text && data.currentType !== 'pdf') {
      const r = await PV.tryCall('library.getBookContent', { bookId: data.currentBookId, section: data.currentRef || '', limit: 5000 });
      text = (typeof r === 'string' ? r : '') || '';
    }
    if (text) {
      O.show(text, { title: PV.t('טקסט מהספרייה'), sub: label, source: 'library' });
      let copied = false;
      try { await navigator.clipboard.writeText(text); copied = true; } catch (e) { /* אין גישה ללוח */ }
      PV.notify(copied ? PV.t('הטקסט חולץ והועתק ללוח ({l})', { l: label }) : PV.t('הטקסט חולץ'), 'success');
      return;
    }
    // ספר PDF: פותחים את הקובץ בעמוד הנוכחי ומחלצים ממנו
    if (data.context === 'reader-pdf' || data.currentType === 'pdf') {
      await openBookFromReader(data);
      if (V.isPaged()) await O.extractPage(V.page);
      return;
    }
    PV.notify(PV.t('לא נמצא טקסט לחילוץ במיקום הזה'), 'error');
  }

  function onToolbar(data) {
    if (!data) return;
    if (data.itemId === TB_OPEN) openBookFromReader(data);
    else if (data.itemId === TB_EXTRACT) extractFromReader(data);
  }
  function onContextMenu(data) {
    if (data && data.itemId === CM_EXTRACT) extractFromReader(data);
  }
  /** קובץ שנשלח מתוסף אחר (plugin.openOther) או מ-openSelf: { name, url | dataUrl | token, page } */
  async function onPageOpened(data) {
    const p = data && data.param;
    if (!p || typeof p !== 'object') return;
    try {
      if (p.token) {
        const d = await PV.call('fs.resolveFileUrl', { token: p.token });
        await Fs.openUrl(d.url, p.name || d.name, { page: p.page, source: { type: 'token', token: p.token } });
      } else if (p.url || p.dataUrl) {
        await Fs.openUrl(p.url || p.dataUrl, p.name || 'file.pdf', { page: p.page, source: null });
      } else if (p.bookUid || p.bookId) {
        await Fs.openLibraryBook({ bookUid: p.bookUid, bookId: p.bookId, type: p.type || 'pdf', name: p.name }, p.page);
      }
    } catch (e) { PV.error(PV.t('לא ניתן לפתוח את הקובץ שנשלח: {e}', { e: PV.errMsg(e) })); }
  }
  /** קיצור המקשים מהקורא: פתיחת ספר ה-PDF הנוכחי (או האחרון שפתוח). */
  async function onCommand(payload) {
    if (!payload || payload.command !== 'openCurrentPdf') return;
    const st = await PV.tryCall('reader.getCurrentState', {});
    if (!st) return;
    let target = null;
    if (st.currentType === 'pdf') target = { bookUid: st.currentBookUid, currentId: st.currentId, currentBookId: st.currentBookId, currentIndex: st.currentIndex, currentBook: st.currentBook, currentType: 'pdf' };
    else {
      const tabs = (st.openTabs || []).filter((t) => t.type === 'pdf' && !t.isSelf);
      const t = tabs[tabs.length - 1];
      if (t) target = { currentId: t.id, currentBookId: t.bookId, currentIndex: t.index, currentBook: t.book, currentType: 'pdf' };
    }
    if (!target) { PV.toast(PV.t('אין ספר PDF פתוח בקורא')); return; }
    openBookFromReader(target);
  }

  const FEATURE_PERMS = [
    ['fs.user_files.read', 'פתיחת קבצים, אחרונים ותיקיות'], ['fs.user_files.write', 'שמירת טקסט כקובץ'],
    ['library.content.read', 'פתיחת ספרי PDF מהספרייה'], ['library.books.provide', 'הקבצים שלי בחיפוש הספרייה'],
    ['reader.open', 'ספרים פתוחים וחיפוש בספרייה'],
  ];
  function checkPermissions(changed) {
    if (!PV.granted) return;
    const off = FEATURE_PERMS.filter(([perm]) => !PV.can(perm)).map(([, label]) => PV.t(label));
    if (off.length) PV.toast(PV.t('כבויות כרגע (הרשאה לא אושרה): {l}. אפשר להפעיל בהגדרות התוסף.', { l: off.join(', ') }), { long: true });
    else if (changed) PV.toast(PV.t('ההרשאות עודכנו — כל היכולות זמינות'));
  }

  // ── עלייה ─────────────────────────────────────────────────────────────
  let booted = false;
  async function boot(payload) {
    if (booted) return;
    booted = true;
    const p = payload || {};
    if (p.theme) PV.applyTheme(p.theme);
    if (p.permissions) PV.granted = p.permissions;
    const lang = p.app && p.app.language;
    if (lang && lang !== 'he') PV.setLanguage(lang);
    await PV.loadSettings();
    bindSetting('set-zoom', 'zoom');
    bindSetting('set-resume', 'resume');
    bindSetting('set-night-auto', 'nightAuto');
    bindSetting('set-sidebar', 'sidebar');
    bindSetting('set-ocr-quality', 'ocrQuality', Number);
    bindSetting('set-ocr-lines', 'ocrLines');
    bindSetting('set-ocr-engine', 'ocrEngine');
    bindSetting('set-ocr-cols', 'ocrCols');
    refreshWinOcr();
    bindStoreSwitch('set-library', 'showInLibrary', (on) => { if (on) Fs.syncLibrary({ verbose: true }); else $('library-sync-status').textContent = PV.t('הקבצים הוסתרו מחיפוש הספרייה'); });
    bindStoreSwitch('set-tb-open', 'tbOpen');
    bindStoreSwitch('set-tb-extract', 'tbExtract');
    applyAutoNight();
    $('about-version').textContent = 'v' + PV.version;
    await Fs.loadRecents();
    await Fs.loadFolders();
    updateNav();
    if (PV.hasOtz()) {
      // שלב 3: קישוריות, הרשאות וגופן הקריאה
      let online = p.connectivity ? p.connectivity.isOnline : null;
      if (online === null || online === undefined) { const c = await PV.tryCall('app.getConnectivity', {}); online = c ? c.isOnline : true; }
      $('btn-lang-page').hidden = online === false;
      if (!PV.granted) { const g = await PV.tryCall('app.getGrantedPermissions', {}); if (g && g.permissions) PV.granted = g.permissions; }
      checkPermissions(false);
      const tf = PV.theme && PV.theme.typography && PV.theme.typography.fontFamily;
      const fr = await PV.tryCall('fonts.resolveFamilies', { families: [{ name: 'PV Reading', substitutes: [tf, 'FrankRuhlCLM', 'David'].filter(Boolean) }] });
      if (fr && fr.css) {
        const st = document.createElement('style'); st.textContent = fr.css; document.head.appendChild(st);
        document.documentElement.style.setProperty('--font-main', "'PV Reading', " + (tf ? "'" + tf + "', " : '') + "'David', serif");
      }
      Fs.refreshOpenBooks();
      setTimeout(() => Fs.syncLibrary(), 2500);
    }
  }

  if (PV.hasOtz() && typeof window.Otzaria.on === 'function') {
    const O2 = window.Otzaria;
    O2.on('plugin.boot', boot);
    O2.on('theme.changed', (t) => PV.applyTheme(t));
    O2.on('settings.changed', (d) => { if (d && d.key === 'key-settings-language') PV.setLanguage(d.newValue); });
    O2.on('plugin.permissions_changed', (d) => { if (d && d.permissions) { PV.granted = d.permissions; checkPermissions(true); } });
    O2.on('reader.toolbar_item_clicked', onToolbar);
    O2.on('reader.context_menu_item_clicked', onContextMenu);
    O2.on('plugin.page_opened', onPageOpened);
    O2.on('app.command', onCommand);
    O2.on('library.providerBook.openRequested', (ev) => Fs.openProviderBook(ev));
    O2.on('plugin.resumed', () => { if (sidebarTab.current === 'files') Fs.refreshOpenBooks(); });
    // גיבוי: אם ה-boot כבר עבר לפני שהסקריפט נרשם
    setTimeout(() => { if (!booted) PV.tryCall('app.getTheme', {}).then((t) => boot({ theme: t })); }, 1500);
  } else {
    // מחוץ לאוצריא (פיתוח/תצוגה מקדימה)
    if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) document.body.classList.add('dark-mode');
    boot({});
  }
  updateNav();
})();

/* ── 3.5.0: Ctrl+E / Ctrl+R בשלב הלכידה, וידיות לשינוי רוחב החלוניות ── */
(function () {
  const $ = (id) => document.getElementById(id);
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey || e.shiftKey) return;
    const t = e.target, inField = t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName));
    const k = (e.key || '').toLowerCase();
    if (inField || (k !== 'e' && k !== 'r') || !window.PV) return;
    if (!PV.viewer || !PV.viewer.isPaged || !PV.viewer.isPaged()) return;
    e.preventDefault(); e.stopImmediatePropagation();
    if (k === 'e') PV.ocr.extractPage(); else PV.ocr.startRegion();
  }, true);

  function save(k, v) { try { localStorage.setItem(k, String(v)); } catch (e) { /* */ } }
  function load(k) { try { return localStorage.getItem(k); } catch (e) { return null; } }
  function mk(panelId, cssVar, isStart) {
    const panel = $(panelId); if (!panel) return;
    const key = 'pv-w-' + cssVar;
    const saved = parseInt(load(key), 10);
    if (saved > 0) document.documentElement.style.setProperty(cssVar, saved + 'px');
    const h = document.createElement('div');
    h.className = 'panel-resizer'; h.setAttribute('role', 'separator'); h.title = 'גרירה לשינוי הרוחב · לחיצה כפולה לאיפוס';
    panel.appendChild(h);
    h.addEventListener('dblclick', () => { document.documentElement.style.removeProperty(cssVar); save(key, 0); });
    h.addEventListener('pointerdown', (ev) => {
      ev.preventDefault(); h.setPointerCapture(ev.pointerId);
      const rtl = getComputedStyle(document.documentElement).direction === 'rtl';
      const move = (m) => {
        const r = panel.getBoundingClientRect();
        const w = (isStart === rtl) ? r.right - m.clientX : m.clientX - r.left;
        const v = Math.round(Math.max(160, Math.min(w, window.innerWidth * 0.6)));
        document.documentElement.style.setProperty(cssVar, v + 'px'); save(key, v);
      };
      const up = () => { h.removeEventListener('pointermove', move); h.removeEventListener('pointerup', up); };
      h.addEventListener('pointermove', move); h.addEventListener('pointerup', up);
    });
  }
  mk('sidebar', '--sidebar-width', true);
  mk('textpanel', '--panel-width', false);
})();

/* קישורי „מה חדש“ נפתחים בדפדפן */
document.addEventListener('click', (e) => {
  const a = e.target.closest && e.target.closest('a[data-url]'); if (!a) return;
  e.preventDefault();
  const url = a.getAttribute('data-url');
  if (PV.hasOtz()) PV.call('app.openUrl', { url }).catch(() => PV.toast(url, { long: true })); else window.open(url, '_blank');
});
