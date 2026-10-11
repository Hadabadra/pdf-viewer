/* צופה PDF+OCR — טקסט מכל מה שעל המסך: הדבקת גזרת מסך, וצילום מסך עם בחירת אזור. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$;
  const C = (PV.capture = {});

  /** תמונה מהלוח (או מגרירה) — נפתחת ומזוהה מיד. */
  C.openImageAndExtract = async function (blob, name) {
    const ok = await PV.files.openBlob(blob, name || PV.t('גזרת מסך.png'), { source: null, zoom: 1 });
    if (ok) await PV.ocr.ocrPage(1);
  };

  C.pasteFromClipboard = async function () {
    if (!navigator.clipboard || !navigator.clipboard.read) {
      PV.toast(PV.t('הדביקו עם Ctrl+V בתוך התוסף'));
      return;
    }
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const type = item.types.find((t) => t.startsWith('image/'));
        if (type) { await C.openImageAndExtract(await item.getType(type)); return; }
      }
      PV.toast(PV.t('אין תמונה בלוח — גזרו קודם אזור מהמסך (Win+Shift+S) ואז נסו שוב'), { long: true });
    } catch (e) {
      PV.toast(PV.t('לא ניתן לקרוא את הלוח — הדביקו עם Ctrl+V בתוך התוסף'), { long: true });
    }
  };

  document.addEventListener('paste', (e) => {
    const t = e.target;
    if (t && (t.isContentEditable || /^(INPUT|TEXTAREA)$/.test(t.tagName))) return;
    const items = (e.clipboardData && e.clipboardData.items) || [];
    for (const item of items) {
      if (item.type && item.type.startsWith('image/')) {
        const blob = item.getAsFile();
        if (blob) { e.preventDefault(); C.openImageAndExtract(blob); }
        return;
      }
    }
  });

  // ── צילום מסך עם ספירה לאחור, כדי שאפשר לעבור לעמוד אחר באוצריא בינתיים ──
  let stream = null, video = null, timer = null, left = 0, chip = null, source = null, drag = null;

  C.start = async function () {
    if (stream) return;
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      PV.toast(PV.t('צילום מסך אינו נתמך כאן — השתמשו בגזירה (Win+Shift+S) והדבקה'), { long: true });
      return;
    }
    try { stream = await navigator.mediaDevices.getDisplayMedia({ video: { displaySurface: 'monitor', cursor: 'never' } }); }
    catch (e) { stream = null; return; }
    video = document.createElement('video');
    video.srcObject = stream; video.muted = true;
    try { await video.play(); } catch (e) { /* מתחיל בכל זאת */ }
    const track = stream.getVideoTracks()[0];
    if (track) track.addEventListener('ended', C.cancel);
    showChip();
    countdown(5);
  };

  function showChip() {
    chip = document.createElement('span');
    chip.className = 'armed-chip';
    chip.title = PV.t('עברו לעמוד הרצוי — הצילום יתבצע אוטומטית');
    const label = document.createElement('span');
    label.id = 'armed-count';
    chip.appendChild(label);
    [['add', PV.t('עוד 5 שניות'), () => countdown(left + 5)], ['screenshot', PV.t('צלם עכשיו'), grab], ['dismiss', PV.t('ביטול'), C.cancel]]
      .forEach(([icon, t, fn]) => {
        const b = document.createElement('button');
        b.className = 'icon-btn'; b.title = t;
        b.appendChild(PV.icon(icon));
        b.addEventListener('click', fn);
        chip.appendChild(b);
      });
    $('armed-slot').appendChild(chip);
  }
  function countdown(sec) {
    left = sec;
    clearInterval(timer);
    const label = $('armed-count');
    if (label) label.textContent = PV.t('צילום בעוד {n}', { n: left });
    timer = setInterval(() => {
      left -= 1;
      if (left <= 0) { clearInterval(timer); grab(); return; }
      const l = $('armed-count');
      if (l) l.textContent = PV.t('צילום בעוד {n}', { n: left });
    }, 1000);
  }
  C.cancel = function () {
    clearInterval(timer); timer = null;
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null; video = null;
    if (chip) chip.remove();
    chip = null;
  };
  function grab() {
    if (!video || !video.videoWidth) { PV.toast(PV.t('השיתוף נעצר — נסו שוב')); C.cancel(); return; }
    const c = document.createElement('canvas');
    c.width = video.videoWidth; c.height = video.videoHeight;
    c.getContext('2d').drawImage(video, 0, 0);
    source = c;
    C.cancel();
    $('capture-img').src = c.toDataURL('image/png');
    $('capture-sel').hidden = true;
    $('capture-actions').hidden = true;
    $('capture-overlay').hidden = false;
  }
  function closeOverlay() { $('capture-overlay').hidden = true; source = null; drag = null; }
  C.isOpen = () => !$('capture-overlay').hidden;
  C.close = closeOverlay;

  const wrap = $('capture-wrap'), sel = $('capture-sel');
  wrap.addEventListener('mousedown', (e) => {
    const r = wrap.getBoundingClientRect();
    drag = { x0: e.clientX - r.left, y0: e.clientY - r.top, r };
    Object.assign(sel.style, { left: drag.x0 + 'px', top: drag.y0 + 'px', width: '0px', height: '0px' });
    sel.hidden = false;
    $('capture-actions').hidden = true;
  });
  wrap.addEventListener('mousemove', (e) => {
    if (!drag) return;
    const x1 = e.clientX - drag.r.left, y1 = e.clientY - drag.r.top;
    Object.assign(sel.style, {
      left: Math.min(drag.x0, x1) + 'px', top: Math.min(drag.y0, y1) + 'px',
      width: Math.abs(x1 - drag.x0) + 'px', height: Math.abs(y1 - drag.y0) + 'px',
    });
  });
  window.addEventListener('mouseup', () => {
    if (!drag) return;
    drag = null;
    if ((parseFloat(sel.style.width) || 0) > 5 && (parseFloat(sel.style.height) || 0) > 5) $('capture-actions').hidden = false;
  });
  $('capture-cancel').addEventListener('click', closeOverlay);
  $('capture-confirm').addEventListener('click', async () => {
    if (!source) return;
    const s = sel.getBoundingClientRect(), im = $('capture-img').getBoundingClientRect();
    const fx = source.width / im.width, fy = source.height / im.height;
    const out = document.createElement('canvas');
    out.width = Math.max(1, Math.round(s.width * fx));
    out.height = Math.max(1, Math.round(s.height * fy));
    out.getContext('2d').drawImage(source, (s.left - im.left) * fx, (s.top - im.top) * fy, s.width * fx, s.height * fy, 0, 0, out.width, out.height);
    closeOverlay();
    const blob = await new Promise((r) => out.toBlob(r, 'image/png'));
    if (blob) await C.openImageAndExtract(blob, PV.t('צילום מסך.png'));
  });
})();
