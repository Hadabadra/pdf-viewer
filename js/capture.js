/* צופה PDF+OCR — טקסט מכל מה שעל המסך: הדבקת גזרת מסך (Ctrl+V). */
(function () {
  'use strict';
  const PV = window.PV;
  const C = (PV.capture = {});

  /** תמונה מהלוח (או מגרירה) — נפתחת ומזוהה מיד. */
  C.openImageAndExtract = async function (blob, name) {
    const ok = await PV.files.openBlob(blob, name || PV.t('גזרת מסך.png'), { source: null, zoom: 1, snip: true });
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
})();
