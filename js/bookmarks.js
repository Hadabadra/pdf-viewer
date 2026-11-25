/* סימניות (#92): שמירת כמה מקומות בקובץ וחזרה אליהם. נשמר באחסון התוסף לפי שם הקובץ ומספר העמודים. */
(function () {
  'use strict';
  const $ = (id) => document.getElementById(id);
  const V = PV.viewer;
  const btn = $('btn-bookmarks'), menu = $('bookmarks-menu');
  if (!btn || !V) return;

  const docKey = () => {
    const t = PV.tabs && PV.tabs.list.find((x) => x.id === PV.tabs.active);
    return t && t.hasDoc && t.name ? t.name + '|' + (V.count || 0) : '';
  };
  const loadAll = async () => (await PV.store.get('bookmarks', null)) || {};

  async function render() {
    const key = docKey(), all = await loadAll(), list = (all[key] || []).slice().sort((a, b) => a.p - b.p);
    const ul = $('bm-list'); ul.textContent = '';
    $('bm-empty').hidden = list.length > 0;
    list.forEach((bm) => {
      const li = document.createElement('li');
      li.className = 'list-item'; li.tabIndex = 0;
      li.appendChild(PV.icon('bookmark'));
      const txt = document.createElement('span'); txt.className = 'li-text';
      const t = document.createElement('span'); t.className = 'li-title'; t.textContent = PV.t('עמוד {n}', { n: bm.p });
      txt.appendChild(t); li.appendChild(txt);
      const box = document.createElement('span'); box.className = 'li-actions';
      const del = document.createElement('button'); del.className = 'icon-btn small'; del.title = PV.t('מחיקת הסימנייה');
      del.appendChild(PV.icon('delete'));
      del.addEventListener('click', async (e) => { e.stopPropagation(); await save(key, (all[key] || []).filter((x) => x.p !== bm.p)); render(); });
      box.appendChild(del); li.appendChild(box);
      const go = () => { V.goTo(bm.p); menu.classList.remove('open'); btn.classList.remove('active'); };
      li.addEventListener('click', go);
      li.addEventListener('keydown', (e) => { if (e.key === 'Enter') go(); });
      ul.appendChild(li);
    });
  }
  async function save(key, list) {
    const all = await loadAll();
    if (list.length) all[key] = list; else delete all[key];
    await PV.store.set('bookmarks', all);
  }

  PV.bindPopover(btn, menu);
  btn.addEventListener('click', () => { const open = menu.classList.contains('open'); btn.classList.toggle('active', open); if (open) render(); });
  $('bm-add').addEventListener('click', async (e) => {
    e.stopPropagation();
    const key = docKey(); if (!key) return;
    const all = await loadAll(), list = all[key] || [];
    if (!list.some((x) => x.p === V.page)) list.push({ p: V.page, at: Date.now() });
    await save(key, list); render();
  });
})();
