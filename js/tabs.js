/* צופה PDF+OCR — לשוניות: כמה מסמכים פתוחים במקביל, ושחזור שלהם בפתיחה הבאה.
   כל לשונית מחזיקה את המסמך שלה בזיכרון (V.suspend / V.resume), כך שהמעבר בין לשוניות מיידי. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer;
  const T = (PV.tabs = { list: [], active: null, nextId: 1 });
  const tabsEl = $('tabs');

  const byId = (id) => T.list.find((t) => t.id === id);
  const activeTab = () => byId(T.active);
  function newTab(extra) {
    const t = Object.assign({ id: T.nextId++, name: '', kind: null, source: null, state: null, pending: null, snip: false, hasDoc: false }, extra || {});
    T.list.push(t);
    return t;
  }
  const srcKey = (s) => !s ? '' : s.type === 'token' ? 't:' + s.token : s.type === 'book' ? 'b:' + (s.bookUid || s.bookId) : s.type === 'folder' ? 'f:' + s.folderToken + ':' + s.path : '';
  T.findBySource = (src) => { const k = srcKey(src); return k ? T.list.find((t) => t.hasDoc && srcKey(t.source) === k) : null; };
  T.existingFor = (meta) => (meta && meta.tabId == null && meta.source ? T.findBySource(meta.source) : null);

  // ── תצוגת הלשוניות ────────────────────────────────────────────────────
  function iconFor(t) {
    if (!t.hasDoc) return 'folder_open';
    return t.kind === 'pdf' ? 'document_pdf' : (t.kind === 'image' || t.kind === 'tiff' || t.kind === 'images') ? 'image' : 'document';
  }
  function renderTabs() {
    tabsEl.innerHTML = '';
    T.list.forEach((t) => {
      const el = document.createElement('div');
      el.className = 'tab' + (t.id === T.active ? ' active' : '');
      el.setAttribute('role', 'tab');
      el.setAttribute('aria-selected', t.id === T.active ? 'true' : 'false');
      el.tabIndex = 0;
      const title = t.hasDoc ? (t.name || '') : PV.t('לשונית חדשה');
      el.title = title;
      el.appendChild(PV.icon(iconFor(t)));
      const tt = document.createElement('span');
      tt.className = 'tab-title';
      tt.textContent = PV.dispName(title);
      el.appendChild(tt);
      const x = document.createElement('button');
      x.className = 'tab-close';
      x.title = PV.t('סגירת לשונית');
      x.appendChild(PV.icon('s_x'));
      x.addEventListener('click', (e) => { e.stopPropagation(); T.close(t.id); });
      el.appendChild(x);
      el.addEventListener('click', () => T.activate(t.id));
      el.addEventListener('auxclick', (e) => { if (e.button === 1) { e.preventDefault(); T.close(t.id); } });
      el.addEventListener('mousedown', (e) => { if (e.button === 1) e.preventDefault(); });
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); T.activate(t.id); } });
      tabsEl.appendChild(el);
    });
    const cur = tabsEl.querySelector('.tab.active');
    if (cur && cur.scrollIntoView) cur.scrollIntoView({ block: 'nearest', inline: 'nearest' });
  }
  T.render = renderTabs;

  // ── הצגת לשונית ───────────────────────────────────────────────────────
  async function show(tab) {
    if (tab.state) { const st = tab.state; tab.state = null; V.resume(st, { origin: 'resume' }); return; }
    if (tab.pending) { await loadPending(tab); return; }
    V.showEmpty();
  }
  async function loadPending(tab) {
    const p = tab.pending;
    V.showEmpty();
    let ok = false;
    try {
      ok = await PV.files.openSource(p.source, { page: p.page, frac: p.frac, zoom: p.zoom, rotation: p.rotation, name: p.name, tabId: tab.id, noRecent: true, origin: 'restore' });
    } catch (e) { ok = false; }
    if (!ok && tab.pending === p) {
      // הקובץ לא זמין (הוזז/נמחק/אין הרשאה) — הלשונית הופכת ללשונית ריקה
      tab.pending = null; tab.hasDoc = false; tab.name = ''; tab.kind = null; tab.source = null;
      renderTabs(); scheduleSave();
    }
  }

  T.activate = async function (id) {
    if (id === T.active) return;
    const next = byId(id);
    if (!next) return;
    const cur = activeTab();
    if (cur && V.doc) cur.state = V.suspend();
    T.active = id;
    renderTabs();
    await show(next);
    scheduleSave();
  };

  T.add = function () {
    const cur = activeTab();
    if (cur && !cur.hasDoc) return;
    if (cur && V.doc) cur.state = V.suspend();
    const t = newTab();
    T.active = t.id;
    renderTabs();
    V.showEmpty();
    scheduleSave();
  };

  T.close = function (id) {
    const i = T.list.findIndex((t) => t.id === id);
    if (i < 0) return;
    const t = T.list[i], wasActive = T.active === id;
    const closing = wasActive ? V.doc : (t.state && t.state.doc);
    if (closing && closing.busyOcr) PV.toast(PV.t('הלשונית נסגרה, אבל ה-OCR של «{n}» ממשיך לפעול עד שיסתיים', { n: closing.name || '' }), { long: true });
    if (wasActive) { const d = V.doc; V.unmount(); V.destroyDoc(d); }
    else if (t.state) V.destroyDoc(t.state.doc);
    T.list.splice(i, 1);
    if (!T.list.length) {
      const e = newTab();
      T.active = e.id;
      renderTabs(); V.showEmpty(); scheduleSave();
      return;
    }
    if (wasActive) {
      const nb = T.list[Math.min(i, T.list.length - 1)];
      T.active = nb.id;
      renderTabs();
      show(nb);
    } else renderTabs();
    scheduleSave();
  };

  // ── חיבור לפתיחת קבצים (files.js) ─────────────────────────────────────
  /** מחליט באיזו לשונית ייפתח המסמך. אם הוא כבר פתוח בלשונית — עוברים אליה. */
  T.begin = function (m) {
    const ex = m.tabId == null && m.source ? T.findBySource(m.source) : null;
    if (ex) return { existing: ex };
    let target = null, replace = false;
    const cur = activeTab();
    if (m.tabId != null) target = byId(m.tabId);
    else if (m.snip && cur && cur.snip && V.doc) { target = cur; replace = true; }
    else if (cur && !cur.hasDoc) target = cur;
    const ctx = { target, created: false, prev: null, snip: !!m.snip, openMeta: {} };
    ctx.openMeta.beforeMount = () => beforeMount(ctx);
    if (replace) ctx.openMeta.destroyPrev = true;
    return ctx;
  };
  function beforeMount(ctx) {
    if (ctx.target) {
      if (ctx.target.id !== T.active) { const e = new Error('tab switched'); e.code = 'tab.stale'; throw e; }
      return;
    }
    const cur = activeTab();
    ctx.prev = cur;
    if (cur && V.doc) cur.state = V.suspend();
    const t = newTab();
    ctx.target = t; ctx.created = true;
    T.active = t.id;
    renderTabs();
  }
  T.commit = function (ctx, doc) {
    const t = ctx.target;
    if (!t || !doc) return;
    t.hasDoc = true; t.pending = null; t.state = null;
    t.name = doc.name || ''; t.kind = doc.kind; t.source = doc.source || null; t.snip = ctx.snip;
    renderTabs(); scheduleSave();
  };
  T.rollback = function (ctx) {
    if (!ctx || !ctx.created || V.doc) return;
    const t = ctx.target, i = T.list.indexOf(t);
    if (i >= 0) T.list.splice(i, 1);
    const prev = ctx.prev && T.list.indexOf(ctx.prev) >= 0 ? ctx.prev : T.list[0];
    if (prev) { T.active = prev.id; renderTabs(); show(prev); }
  };
  T.focusExisting = async function (tab, page) {
    await T.activate(tab.id);
    if (page && V.isPaged() && page !== V.page) V.goTo(page);
  };

  // ── שמירה ושחזור ──────────────────────────────────────────────────────
  function snapshot(t) {
    let v = {};
    if (t.id === T.active && V.doc) v = { page: V.page, frac: V.pageFrac(), zoom: V.zoomMode, rotation: V.rotation };
    else if (t.state) v = { page: t.state.page, frac: t.state.frac, zoom: t.state.zoomMode, rotation: t.state.rotation };
    else if (t.pending) v = { page: t.pending.page, frac: t.pending.frac, zoom: t.pending.zoom, rotation: t.pending.rotation };
    return Object.assign({ name: t.name, kind: t.kind, source: t.source }, v);
  }
  function save() {
    // מסמכים בלי מקור (נגררו / הודבקו) אי אפשר לפתוח שוב — לא נשמרים
    const keep = T.list.filter((t) => !t.hasDoc || t.source);
    if (!keep.length) return;
    let idx = keep.findIndex((t) => t.id === T.active);
    if (idx < 0) idx = 0;
    PV.store.set('tabs', { v: 1, active: idx, list: keep.map((t) => (t.hasDoc ? snapshot(t) : { empty: true })) });
  }
  const scheduleSave = PV.debounce(save, 500);
  T.save = save;
  ['page', 'zoom', 'rotate', 'doc'].forEach((ev) => PV.on(ev, scheduleSave));

  /** שחזור הלשוניות מהפעם הקודמת. רק הלשונית הפעילה נטענת מיד; האחרות — כשלוחצים עליהן. */
  T.restore = async function () {
    if (PV.settings.restoreTabs === false || !PV.hasOtz()) return false;
    const saved = await PV.store.get('tabs', null);
    if (!saved || !Array.isArray(saved.list) || !saved.list.length) return false;
    if (saved.list.every((x) => x.empty)) return false;
    if (V.doc || T.list.some((t) => t.hasDoc)) return false; // כבר נפתח משהו בזמן העלייה
    T.list.length = 0;
    saved.list.forEach((x) => {
      if (x.empty || !x.source) { newTab(); return; }
      newTab({ hasDoc: true, name: x.name || '', kind: x.kind || null, source: x.source,
        pending: { source: x.source, name: x.name, page: x.page || 1, frac: x.frac || 0, zoom: x.zoom, rotation: x.rotation || 0 } });
    });
    const idx = Math.max(0, Math.min(Number(saved.active) || 0, T.list.length - 1));
    T.active = T.list[idx].id;
    renderTabs();
    await show(T.list[idx]);
    return true;
  };

  // ── קיצורי מקשים ללשוניות ─────────────────────────────────────────────
  /** מעבר ללשונית הבאה (dir=1) או הקודמת (dir=-1), במעגל. */
  T.cycle = function (dir) {
    if (T.list.length < 2) return;
    const i = T.list.findIndex((t) => t.id === T.active);
    T.activate(T.list[(i + dir + T.list.length) % T.list.length].id);
  };
  // Ctrl+Tab / Ctrl+Shift+Tab — לשונית הבאה / הקודמת · Ctrl+Shift+N — לשונית חדשה (בשלב הלכידה, גם כשהמיקוד בשדה)
  window.addEventListener('keydown', (e) => {
    if (!(e.ctrlKey || e.metaKey) || e.altKey) return;
    if (e.key === 'Tab') {
      e.preventDefault(); e.stopImmediatePropagation();
      T.cycle(e.shiftKey ? -1 : 1);
    } else if (e.shiftKey && e.code === 'KeyN') {
      e.preventDefault(); e.stopImmediatePropagation();
      T.add();
    }
  }, true);

  // ── התחלה ─────────────────────────────────────────────────────────────
  const first = newTab();
  T.active = first.id;
  renderTabs();
  $('tab-add').addEventListener('click', T.add);
  PV.on('language', renderTabs);
})();
