/* 5.7.0 — "פתיחה בתוכנה אחרת…" דרך הגשר (POST /pdf/handlers, /pdf/open; docs/PDF-INTEGRATION-SPEC.md בגשר).
   זמין רק לקובץ מתיקייה שנוספה (יש לו נתיב בדיסק) ורק כשהגשר מותקן ותומך ב-/pdf. */
(function () {
  const PV = window.PV, $ = PV.$, V = PV.viewer, B = PV.bridge, Fs = PV.files;
  const menu = $('more-menu');
  if (!menu || !B || !Fs) return;
  const item = document.createElement('button');
  item.className = 'menu-item doc-only'; item.id = 'mi-openwith'; item.setAttribute('data-keep-open', '');
  item.innerHTML = '<i data-icon="open"></i><span class="mi-text"></span>';
  item.querySelector('.mi-text').textContent = PV.t('פתיחה בתוכנה אחרת…');
  const list = document.createElement('div'); list.id = 'openwith-list'; list.hidden = true;
  const sep = menu.querySelector('.menu-sep:last-of-type');
  menu.insertBefore(item, sep); menu.insertBefore(list, sep);
  const close = () => { list.hidden = true; list.innerHTML = ''; };
  item.addEventListener('click', async () => {
    if (!list.hidden) { close(); return; }
    const path = Fs.diskPath && Fs.diskPath();
    if (!path) { PV.toast(PV.t('אפשר לפתוח בתוכנה אחרת רק קובץ מתיקייה שנוספה לצופה')); menu.classList.remove('open'); return; }
    let r;
    try { r = await B.call('/pdf/handlers', {}, 15000); }
    catch (e) { PV.toast(e && e.code === 'not_found' ? PV.t('הגשר המותקן ישן — נדרשת גרסה שתומכת בפתיחה בתוכנות PDF') : PV.t('הגשר אינו זמין: {e}', { e: PV.errMsg(e) })); menu.classList.remove('open'); return; }
    list.innerHTML = ''; list.hidden = false;
    (r.handlers || []).forEach((h) => {
      const b = document.createElement('button'); b.className = 'menu-item';
      b.innerHTML = '<span class="mi-text"></span>';
      b.querySelector('.mi-text').textContent = '  ' + h.name + (h.isDefault ? ' ★' : '');
      b.addEventListener('click', async () => {
        close(); menu.classList.remove('open');
        try {
          const o = await B.call('/pdf/open', { path, handlerId: h.id, page: V.page || 1 }, 15000);
          PV.toast(o && o.pageHonored ? PV.t('נפתח בעמוד {p}', { p: V.page || 1 }) : PV.t('נפתח'));
        } catch (e) { PV.toast(e && e.code === 'locked' ? PV.t('במצב נעילה אי אפשר לפתוח בתוכנה אחרת') : PV.t('הפתיחה נכשלה: {e}', { e: PV.errMsg(e) })); }
      });
      list.appendChild(b);
    });
  });
  document.addEventListener('click', (e) => { if (!menu.contains(e.target)) close(); });
})();
