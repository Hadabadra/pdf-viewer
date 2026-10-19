/* 5.8.0 — "כלי PDF": הפעולות של PDF24 בתוך התוסף.
   בתוסף עצמו (pdf-lib, בלי גשר): חיבור, פיצול, חילוץ, מחיקה, סיבוב, סידור מחדש, הוספת עמוד ריק, תמונות ל-PDF,
   PDF לתמונות, מספור עמודים, סימן מים, מאפייני מסמך.
   במנוע המותקן במחשב דרך גשר אחת שאלתי 1.0.2 (Ghostscript של PDF24 / Ghostscript / qpdf): דחיסה, גווני אפור,
   PDF/A, תיקון, הגנה בסיסמה, הסרת סיסמה, אופטימיזציה לרשת. */
(function () {
  'use strict';
  const PV = window.PV, $ = PV.$, V = PV.viewer, B = PV.bridge, Fs = PV.files;
  const T = (s, o) => PV.t(s, o);
  const L = () => window.PDFLib;

  // ── עזר ──────────────────────────────────────────────────────────────
  const stem = () => String((V.doc && V.doc.name) || 'מסמך').replace(/\.[^.]+$/, '');
  async function curBytes() {
    if (!V.doc || V.doc.kind !== 'pdf') throw new Error(T('יש לפתוח קובץ PDF'));
    const blob = await Fs.docBlob(V.doc);
    if (!blob) throw new Error(T('לא ניתן לקרוא את המסמך הפתוח'));
    return new Uint8Array(await blob.arrayBuffer());
  }
  async function load(bytes) {
    try { return await L().PDFDocument.load(bytes, { ignoreEncryption: false }); }
    catch (e) { if (/encrypt/i.test(String(e && e.message))) throw new Error(T('המסמך מוגן בסיסמה — השתמשו קודם ב"הסרת סיסמה"')); throw e; }
  }
  /** "1-3, 5, 8-" → [0,1,2,4,7,…] (אינדקסים מ-0). ריק = כל העמודים */
  function parsePages(str, count) {
    const s = String(str || '').replace(/\s+/g, '');
    if (!s) return Array.from({ length: count }, (_, i) => i);
    const out = [];
    for (const part of s.split(/[,،;]/)) {
      if (!part) continue;
      const m = part.match(/^(\d*)-(\d*)$/);
      let a, b;
      if (m) { a = m[1] ? +m[1] : 1; b = m[2] ? +m[2] : count; } else if (/^\d+$/.test(part)) { a = b = +part; } else return null;
      if (a < 1 || b > count || a > b) return null;
      for (let i = a; i <= b; i++) out.push(i - 1);
    }
    return out;
  }
  async function pickFiles(exts, multiple) {
    if (PV.hasOtz()) {
      const res = [];
      do {
        let r;
        try { r = await PV.call('fs.pickUserFile', { title: T('בחירת קובץ'), extensions: exts }); } catch (e) { break; }
        if (!r || r.cancelled) break;
        const blob = await (await fetch(r.url)).blob();
        res.push({ name: r.name, bytes: new Uint8Array(await blob.arrayBuffer()), type: blob.type });
        if (!multiple) break;
      } while (window.confirm(T('נוסף: {n}. להוסיף קובץ נוסף?', { n: res[res.length - 1].name })));
      return res;
    }
    return new Promise((resolve) => {
      const inp = document.createElement('input');
      inp.type = 'file'; inp.multiple = !!multiple; inp.accept = exts.map((x) => '.' + x).join(',');
      inp.onchange = async () => resolve(await Promise.all(Array.from(inp.files || []).map(async (f) => ({ name: f.name, bytes: new Uint8Array(await f.arrayBuffer()), type: f.type }))));
      inp.click();
    });
  }
  /** שמירה: גשר (חלון "שמירה בשם" של Windows, בלי מגבלת גודל) → חלון השמירה של אוצריא → הורדה */
  async function save(bytes, name, ext, mime) {
    const file = name + '.' + ext;
    if (PV.hasOtz() && B) {
      try {
        if (B.port || (await B.probe())) {
          const r = await B.pickSaveFile({ suggestedName: file, title: T('שמירת התוצאה') });
          if (!r || r.cancelled) return null;
          return await B.writeBinary(r.path, bytes, { overwrite: true });
        }
      } catch (e) { /* בלי גשר — חלון אוצריא */ }
    }
    const blob = new Blob([bytes], { type: mime });
    if (PV.hasOtz()) {
      const up = await PV.call('fs.beginBinaryWrite', { purpose: 'user-file', expectedSize: blob.size });
      const res = await fetch(up.uploadUrl, { method: 'PUT', headers: { 'Content-Type': mime }, body: blob });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const done = await PV.call('fs.commitUserFileWrite', { writeToken: up.writeToken, suggestedName: name, extension: ext, title: T('שמירת התוצאה') });
      return done && !done.cancelled ? (done.name || file) : null;
    }
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = file; a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    return file;
  }
  async function finishPdf(bytes, name, openIt) {
    const where = await save(bytes, name, 'pdf', 'application/pdf');
    if (!where) return;
    PV.toast(T('נשמר: {p}', { p: where }), { long: true });
    if (openIt !== false) await Fs.openBlob(new Blob([bytes], { type: 'application/pdf' }), name + '.pdf', { source: null });
    if (typeof where === 'string' && /^[a-z]:\\/i.test(where) && V.doc) V.doc.diskPath = where;
  }
  /** טקסט (גם עברית) כתמונה — גופני pdf-lib הסטנדרטיים אינם תומכים בעברית */
  function textPng(text, px, color, opacity) {
    const c = document.createElement('canvas'), g = c.getContext('2d');
    const font = 'bold ' + px + 'px ' + (getComputedStyle(document.body).fontFamily || 'sans-serif');
    g.font = font; const w = Math.ceil(g.measureText(text).width) + px; c.width = w; c.height = Math.ceil(px * 1.5);
    g.font = font; g.direction = 'rtl'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.globalAlpha = opacity; g.fillStyle = color; g.fillText(text, w / 2, c.height / 2);
    return { url: c.toDataURL('image/png'), w: c.width, h: c.height };
  }
  async function engine(op, params, label, opt) {
    opt = opt || {};
    const bytes = opt.bytes || await curBytes();
    if (!B || !(B.port || (await B.probe()))) throw new Error(T('הפעולה דורשת את גשר אחת שאלתי 1.0.2 ומעלה'));
    if (B.versionLt(B.info && B.info.version, '1.0.2')) throw new Error(T('הפעולה דורשת את גשר אחת שאלתי 1.0.2 ומעלה'));
    const eng = await B.call('/pdf/engines', {}, 15000);
    if (!eng || !(eng.ops || []).includes(op)) throw new Error(T('לא נמצאה במחשב תוכנה שיודעת לבצע את הפעולה — למשל PDF24, Ghostscript, qpdf, PDFtk, MuPDF או LibreOffice'));
    let cancelled = false;
    PV.progress.show(label + '…', () => { cancelled = true; });
    const { id } = await B.call('/pdf/op/begin', {}, 15000);
    try {
      const CH = 1024 * 1024;
      for (let off = 0; off < bytes.length; off += CH) {
        if (cancelled) return null;
        const part = bytes.subarray(off, off + CH);
        const b64 = await new Promise((res) => { const fr = new FileReader(); fr.onload = () => res(String(fr.result).split(',')[1] || ''); fr.readAsDataURL(new Blob([part])); });
        await B.call('/pdf/op/chunk', { id, data: b64 }, 60000);
        PV.progress.update(T('מעלה למנוע… {p}%', { p: Math.round((off + part.length) / bytes.length * 100) }), (off + part.length) / bytes.length * 0.3);
      }
      PV.progress.update(label + '…', 0.4);
      const r = await B.call('/pdf/op/run', { id, op, engine: opt.engine || '', params: params || {} }, 600000);
      const out = new Uint8Array(r.size); let off = 0;
      while (off < r.size) {
        const c = await B.call('/pdf/op/read', { id, offset: off }, 60000);
        const bin = atob(c.data); for (let i = 0; i < bin.length; i++) out[off + i] = bin.charCodeAt(i);
        off = c.offset; PV.progress.update(T('מקבל את התוצאה…'), 0.7 + 0.3 * off / r.size);
        if (c.done) break;
      }
      return { bytes: out, inSize: r.inSize, engine: r.engine, engineName: r.engineName, kind: r.kind };
    } finally { PV.progress.hide(); B.call('/pdf/op/end', { id }, 10000).catch(() => {}); }
  }

  // ── הכלים ────────────────────────────────────────────────────────────
  // f: שדות בטופס. run(values) מבצע.
  const TOOLS = [
    { id: 'merge', name: 'חיבור קבצים', icon: 'add', desc: 'מחבר למסמך הפתוח קובצי PDF ותמונות נוספים, לפי סדר הבחירה', fields: [{ k: 'first', label: 'המסמך הפתוח', type: 'select', options: [['first', 'בהתחלה'], ['last', 'בסוף'], ['none', 'לא לכלול']] }],
      async run(v) {
        const files = await pickFiles(['pdf', 'png', 'jpg', 'jpeg'], true);
        if (!files.length) return;
        const out = await L().PDFDocument.create();
        const addPdf = async (bytes) => { const d = await load(bytes); (await out.copyPages(d, d.getPageIndices())).forEach((p) => out.addPage(p)); };
        const cur = V.doc && V.doc.kind === 'pdf' && v.first !== 'none' ? await curBytes() : null;
        if (cur && v.first === 'first') await addPdf(cur);
        for (const f of files) { if (/\.pdf$/i.test(f.name)) await addPdf(f.bytes); else await addImagePage(out, f); }
        if (cur && v.first === 'last') await addPdf(cur);
        await finishPdf(await out.save(), stem() + ' - מחובר');
      } },
    { id: 'split', name: 'פיצול', icon: 'cut', desc: 'מפצל לקבצים נפרדים (בקובץ ZIP)', fields: [{ k: 'mode', label: 'אופן', type: 'select', options: [['each', 'כל עמוד לקובץ'], ['n', 'כל N עמודים'], ['ranges', 'לפי טווחים']] }, { k: 'n', label: 'N / טווחים (למשל 1-3,4-10)', type: 'text', value: '2' }],
      async run(v) {
        const src = await load(await curBytes()), count = src.getPageCount(), groups = [];
        if (v.mode === 'each') for (let i = 0; i < count; i++) groups.push([i]);
        else if (v.mode === 'n') { const n = Math.max(1, parseInt(v.n, 10) || 1); for (let i = 0; i < count; i += n) groups.push(Array.from({ length: Math.min(n, count - i) }, (_, k) => i + k)); }
        else for (const r of String(v.n).split(/[,،;]/)) { const p = parsePages(r, count); if (!p || !p.length) throw new Error(T('טווח לא תקין: {r}', { r })); groups.push(p); }
        const zip = new window.JSZip();
        for (let g = 0; g < groups.length; g++) {
          PV.progress.update(T('מפצל… {n} מתוך {t}', { n: g + 1, t: groups.length }), g / groups.length);
          const d = await L().PDFDocument.create(); (await d.copyPages(src, groups[g])).forEach((p) => d.addPage(p));
          zip.file(stem() + ' - ' + (groups[g][0] + 1) + (groups[g].length > 1 ? '-' + (groups[g][groups[g].length - 1] + 1) : '') + '.pdf', await d.save());
        }
        const where = await save(await zip.generateAsync({ type: 'uint8array' }), stem() + ' - פיצול', 'zip', 'application/zip');
        if (where) PV.toast(T('נשמרו {n} קבצים: {p}', { n: groups.length, p: where }), { long: true });
      } },
    { id: 'extract', name: 'חילוץ עמודים', icon: 'copy', desc: 'יוצר PDF חדש מהעמודים שנבחרו', fields: [{ k: 'pages', label: 'עמודים (למשל 1-3,7)', type: 'text', cur: true }],
      async run(v) { await pagesOp(v.pages, (src, idx) => idx, ' - עמודים ' + v.pages); } },
    { id: 'delete', name: 'מחיקת עמודים', icon: 'delete', desc: 'מסיר את העמודים שנבחרו', fields: [{ k: 'pages', label: 'עמודים למחיקה', type: 'text', cur: true }],
      async run(v) { await pagesOp(v.pages, (src, idx) => src.getPageIndices().filter((i) => !idx.includes(i)), ' - בלי עמודים'); } },
    { id: 'rotate', name: 'סיבוב עמודים', icon: 'arrow_clockwise', desc: 'מסובב לצמיתות (נשמר בקובץ)', fields: [{ k: 'deg', label: 'זווית', type: 'select', options: [['90', '90° בכיוון השעון'], ['180', '180°'], ['270', '90° נגד כיוון השעון']] }, { k: 'pages', label: 'עמודים (ריק = כולם)', type: 'text' }],
      async run(v) {
        const d = await load(await curBytes()), idx = parsePages(v.pages, d.getPageCount()); if (!idx) throw new Error(T('טווח העמודים אינו תקין'));
        idx.forEach((i) => { const p = d.getPage(i); p.setRotation(L().degrees((p.getRotation().angle + (+v.deg)) % 360)); });
        await finishPdf(await d.save(), stem() + ' - מסובב');
      } },
    { id: 'reorder', name: 'סידור עמודים מחדש', icon: 'list', desc: 'סדר חדש (למשל 3,1,2,4-) או היפוך', fields: [{ k: 'order', label: 'סדר העמודים', type: 'text' }, { k: 'rev', label: 'הפוך את הסדר', type: 'check' }],
      async run(v) { await pagesOp(v.order, (src, idx) => (v.rev ? idx.slice().reverse() : idx), ' - סדר חדש', true); } },
    { id: 'blank', name: 'הוספת עמוד ריק', icon: 'add', desc: 'מוסיף עמוד ריק בגודל העמוד הסמוך', fields: [{ k: 'after', label: 'אחרי עמוד (0 = בהתחלה)', type: 'text', cur: true }],
      async run(v) {
        const d = await load(await curBytes()), n = Math.min(Math.max(0, parseInt(v.after, 10) || 0), d.getPageCount());
        const ref = d.getPage(Math.max(0, n - 1)).getSize(); d.insertPage(n, [ref.width, ref.height]);
        await finishPdf(await d.save(), stem() + ' - עם עמוד ריק');
      } },
    { id: 'img2pdf', name: 'תמונות ל-PDF', icon: 'image', desc: 'JPG/PNG לקובץ PDF אחד, עמוד לכל תמונה', fields: [],
      async run() {
        const files = await pickFiles(['png', 'jpg', 'jpeg'], true); if (!files.length) return;
        const d = await L().PDFDocument.create(); for (const f of files) await addImagePage(d, f);
        await finishPdf(await d.save(), files[0].name.replace(/\.[^.]+$/, '') + ' - תמונות');
      } },
    { id: 'pdf2img', name: 'PDF לתמונות', icon: 'image', desc: 'כל עמוד לתמונה (בקובץ ZIP)', fields: [{ k: 'fmt', label: 'פורמט', type: 'select', options: [['jpeg', 'JPG'], ['png', 'PNG']] }, { k: 'dpi', label: 'רזולוציה', type: 'select', options: [['1.5', 'רגילה'], ['2.5', 'גבוהה'], ['4', 'גבוהה מאוד']] }, { k: 'pages', label: 'עמודים (ריק = כולם)', type: 'text' }],
      async run(v) {
        if (!V.isPaged()) throw new Error(T('יש לפתוח קובץ PDF'));
        const idx = parsePages(v.pages, V.count); if (!idx) throw new Error(T('טווח העמודים אינו תקין'));
        const zip = new window.JSZip(), ext = v.fmt === 'png' ? 'png' : 'jpg';
        for (let k = 0; k < idx.length; k++) {
          PV.progress.update(T('ממיר עמוד {n} מתוך {t}…', { n: k + 1, t: idx.length }), k / idx.length);
          const c = await V.renderOffscreen(idx[k] + 1, +v.dpi);
          const blob = await new Promise((r) => c.toBlob(r, v.fmt === 'png' ? 'image/png' : 'image/jpeg', 0.92)); c.width = 0;
          zip.file(stem() + ' - ' + String(idx[k] + 1).padStart(3, '0') + '.' + ext, blob);
        }
        const where = await save(await zip.generateAsync({ type: 'uint8array' }), stem() + ' - תמונות', 'zip', 'application/zip');
        if (where) PV.toast(T('נשמר: {p}', { p: where }), { long: true });
      } },
    { id: 'numbers', name: 'מספור עמודים', icon: 'text_number_list_rtl', desc: 'מוסיף מספר בתחתית כל עמוד', fields: [{ k: 'pos', label: 'מיקום', type: 'select', options: [['center', 'במרכז'], ['left', 'שמאל'], ['right', 'ימין']] }, { k: 'start', label: 'מספר התחלה', type: 'text', value: '1' }, { k: 'fmt', label: 'תבנית ({n}, {t})', type: 'text', value: '{n}' }],
      async run(v) {
        const d = await load(await curBytes()), total = d.getPageCount(), st = parseInt(v.start, 10) || 1;
        for (let i = 0; i < total; i++) {
          const p = d.getPage(i), { width } = p.getSize();
          const t = textPng(String(v.fmt || '{n}').replace('{n}', st + i).replace('{t}', total + st - 1), 28, '#000', 1);
          const img = await d.embedPng(t.url), w = t.w / 3, h = t.h / 3;
          const x = v.pos === 'left' ? 30 : v.pos === 'right' ? width - 30 - w : (width - w) / 2;
          p.drawImage(img, { x, y: 18, width: w, height: h });
        }
        await finishPdf(await d.save(), stem() + ' - ממוספר');
      } },
    { id: 'watermark', name: 'סימן מים', icon: 'document_text', desc: 'טקסט שקוף באלכסון על כל עמוד', fields: [{ k: 'text', label: 'טקסט', type: 'text', value: 'טיוטה' }, { k: 'op', label: 'שקיפות', type: 'select', options: [['0.15', 'עדין'], ['0.3', 'בינוני'], ['0.5', 'בולט']] }],
      async run(v) {
        if (!String(v.text || '').trim()) throw new Error(T('יש להזין טקסט'));
        const d = await load(await curBytes()), t = textPng(v.text, 120, '#888', +v.op), img = await d.embedPng(t.url);
        for (const p of d.getPages()) {
          const { width, height } = p.getSize(), w = Math.min(width, height) * 0.8, h = w * t.h / t.w;
          p.drawImage(img, { x: width / 2 - w / 2 * 0.7, y: height / 2 - w / 2 * 0.7, width: w, height: h, rotate: L().degrees(45) });
        }
        await finishPdf(await d.save(), stem() + ' - סימן מים');
      } },
    { id: 'meta', name: 'מאפייני מסמך', icon: 'info', desc: 'כותרת, מחבר, נושא ומילות מפתח', fields: [{ k: 'title', label: 'כותרת', type: 'text', meta: 'getTitle' }, { k: 'author', label: 'מחבר', type: 'text', meta: 'getAuthor' }, { k: 'subject', label: 'נושא', type: 'text', meta: 'getSubject' }, { k: 'keywords', label: 'מילות מפתח', type: 'text', meta: 'getKeywords' }],
      async run(v) {
        const d = await load(await curBytes());
        d.setTitle(v.title || ''); d.setAuthor(v.author || ''); d.setSubject(v.subject || '');
        d.setKeywords(String(v.keywords || '').split(/[,،]/).map((s) => s.trim()).filter(Boolean)); d.setProducer('צופה PDF+OCR');
        await finishPdf(await d.save(), stem());
      } },
    // ── במנוע המותקן דרך הגשר ──
    { id: 'compress', op: 'compress', name: 'דחיסה', icon: 'document_arrow_down', engine: true, desc: 'מקטין את הקובץ (מנוע PDF24/Ghostscript דרך הגשר)', fields: [{ k: 'level', label: 'רמה', type: 'select', options: [['ebook', 'מאוזנת (150dpi)'], ['screen', 'חזקה (72dpi)'], ['printer', 'איכות הדפסה (300dpi)']] }],
      async run(v) { const r = await engine('compress', { level: v.level }, T('דוחס'), { engine: v.__engine }); if (!r) return; PV.toast(T('הגודל: {a} ← {b}', { a: PV.formatSize(r.inSize), b: PV.formatSize(r.bytes.length) }), { long: true }); await finishPdf(r.bytes, stem() + ' - דחוס'); } },
    { id: 'gray', op: 'grayscale', name: 'גווני אפור', icon: 'weather_moon', engine: true, desc: 'ממיר את כל המסמך לשחור-לבן', fields: [],
      async run(v) { const r = await engine('grayscale', {}, T('ממיר'), { engine: v.__engine }); if (r) await finishPdf(r.bytes, stem() + ' - אפור'); } },
    { id: 'pdfa', op: 'pdfa', name: 'המרה ל-PDF/A', icon: 'document_pdf', engine: true, desc: 'פורמט לשמירה ארוכת טווח', fields: [],
      async run(v) { const r = await engine('pdfa', {}, T('ממיר'), { engine: v.__engine }); if (r) await finishPdf(r.bytes, stem() + ' - PDFA'); } },
    { id: 'repair', op: 'repair', name: 'תיקון קובץ פגום', icon: 'settings', engine: true, desc: 'בונה מחדש קובץ שלא נפתח כראוי', fields: [],
      async run(v) { const r = await engine('repair', {}, T('מתקן'), { engine: v.__engine }); if (r) await finishPdf(r.bytes, stem() + ' - מתוקן'); } },
    { id: 'protect', op: 'protect', name: 'הגנה בסיסמה', icon: 'warning', engine: true, desc: 'סיסמה לפתיחת הקובץ', fields: [{ k: 'pw', label: 'סיסמה', type: 'password' }],
      async run(v) { if (!v.pw) throw new Error(T('יש להזין סיסמה')); const r = await engine('protect', { userPassword: v.pw }, T('מצפין'), { engine: v.__engine }); if (r) await finishPdf(r.bytes, stem() + ' - מוגן', false); } },
    { id: 'unlock', op: 'unlock', name: 'הסרת סיסמה', icon: 'open', engine: true, desc: 'שומר עותק בלי הסיסמה (נדרשת הסיסמה)', fields: [{ k: 'pw', label: 'הסיסמה הנוכחית', type: 'password' }],
      async run(v) { const r = await engine('unlock', { password: v.pw || '' }, T('מסיר סיסמה'), { engine: v.__engine }); if (r) await finishPdf(r.bytes, stem() + ' - ללא סיסמה'); } },
    { id: 'linearize', op: 'linearize', name: 'אופטימיזציה לרשת', icon: 'arrow_download', engine: true, desc: 'פתיחה מהירה מהאינטרנט (qpdf)', fields: [],
      async run(v) { const r = await engine('linearize', {}, T('מבצע אופטימיזציה'), { engine: v.__engine }); if (r) await finishPdf(r.bytes, stem() + ' - לרשת'); } },
    { id: 'office2pdf', op: 'office2pdf', name: 'Word/Excel/PowerPoint ל-PDF', icon: 'document_pdf', engine: true, desc: 'ממיר מסמך משרדי ל-PDF (LibreOffice או Word במחשב)', fields: [],
      async run(v) {
        const f = (await pickFiles(['doc', 'docx', 'odt', 'rtf', 'xls', 'xlsx', 'ods', 'ppt', 'pptx', 'odp'], false))[0]; if (!f) return;
        const r = await engine('office2pdf', { ext: f.name.split('.').pop().toLowerCase() }, T('ממיר'), { engine: v.__engine, bytes: f.bytes });
        if (r) await finishPdf(r.bytes, f.name.replace(/\.[^.]+$/, ''));
      } },
    { id: 'totext', op: 'totext', name: 'PDF לטקסט', icon: 'document_text', engine: true, desc: 'חילוץ הטקסט המוטבע לקובץ TXT (Poppler)', fields: [],
      async run(v) { const r = await engine('totext', {}, T('מחלץ טקסט'), { engine: v.__engine }); if (!r) return; const w = await save(r.bytes, stem(), 'txt', 'text/plain'); if (w) PV.toast(T('נשמר: {p}', { p: w }), { long: true }); } },
    { id: 'pdf2pngEng', op: 'pdf2png', name: 'PDF לתמונות במנוע המחשב', icon: 'image', engine: true, desc: 'כל העמודים ל-PNG (ZIP) — מהיר במסמכים גדולים', fields: [],
      async run(v) { const r = await engine('pdf2png', {}, T('ממיר'), { engine: v.__engine }); if (!r) return; const w = await save(r.bytes, stem() + ' - תמונות', 'zip', 'application/zip'); if (w) PV.toast(T('נשמר: {p}', { p: w }), { long: true }); } },
  ];

  async function pagesOp(str, pick, suffix, allowEmptyAll) {
    const src = await load(await curBytes());
    const idx = parsePages(str, src.getPageCount());
    if (!idx || (!idx.length && !allowEmptyAll)) throw new Error(T('טווח העמודים אינו תקין (המסמך כולל {n} עמודים)', { n: src.getPageCount() }));
    const keep = pick(src, idx);
    if (!keep.length) throw new Error(T('לא נשארו עמודים'));
    const d = await L().PDFDocument.create(); (await d.copyPages(src, keep)).forEach((p) => d.addPage(p));
    await finishPdf(await d.save(), stem() + suffix);
  }
  async function addImagePage(doc, f) {
    const png = /png$/i.test(f.name) || f.type === 'image/png';
    const img = png ? await doc.embedPng(f.bytes) : await doc.embedJpg(f.bytes);
    const p = doc.addPage([img.width, img.height]); p.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  // ── ממשק ─────────────────────────────────────────────────────────────
  const body = document.querySelector('#overlay .overlay-body');
  if (!body || !L()) return;
  const sec = document.createElement('section'); sec.dataset.opanel = 'pdftools'; sec.hidden = true;
  body.appendChild(sec);

  let engines = null;
  async function render() {
    sec.innerHTML = '';
    const intro = document.createElement('p'); intro.className = 'muted';
    intro.textContent = T('הפעולות פועלות על המסמך הפתוח ושומרות קובץ חדש — המקור לא משתנה. פעולות שמסומנות ⚙ משתמשות בתוכנות ה-PDF שמותקנות במחשב (PDF24, Ghostscript, qpdf, PDFtk, MuPDF, Poppler, LibreOffice, Word) דרך גשר אחת שאלתי — מה שמזוהה מופיע, ואפשר לבחור באיזו תוכנה.');
    sec.appendChild(intro);
    if (engines === null) {
      engines = [];
      try { if (B && (B.port || (await B.probe())) && !B.versionLt(B.info && B.info.version, '1.0.2')) engines = (await B.call('/pdf/engines', {}, 10000)).engines || []; } catch (e) { /* */ }
    }
    const st = document.createElement('p'); st.className = 'muted';
    st.textContent = engines.length ? T('תוכנות PDF שזוהו במחשב: {e}', { e: engines.map((x) => x.name).join(', ') }) : T('לא זוהתה במחשב תוכנה מתאימה (או שהגשר אינו 1.0.2) — הפעולות המסומנות ⚙ לא יעבדו. למשל PDF24 החינמי מוסיף אותן.');
    sec.appendChild(st);
    for (const t of TOOLS) {
      const card = document.createElement('details'); card.className = 'card pdftool';
      const sum = document.createElement('summary');
      sum.innerHTML = '<i data-icon="' + t.icon + '"></i><b></b><span class="muted"></span>';
      sum.querySelector('b').textContent = T(t.name) + (t.engine ? ' ⚙' : '');
      sum.querySelector('span').textContent = ' — ' + T(t.desc);
      card.appendChild(sum);
      const vals = {};
      for (const f of t.fields) {
        const row = document.createElement('div'); row.className = 'setting-row';
        const lab = document.createElement('div'); lab.className = 'sr-text'; lab.innerHTML = '<b></b>'; lab.querySelector('b').textContent = T(f.label); row.appendChild(lab);
        let el;
        if (f.type === 'select') { el = document.createElement('select'); el.className = 'select'; f.options.forEach(([v, l]) => { const o = document.createElement('option'); o.value = v; o.textContent = T(l); el.appendChild(o); }); }
        else if (f.type === 'check') { el = document.createElement('input'); el.type = 'checkbox'; }
        else { el = document.createElement('input'); el.type = f.type === 'password' ? 'password' : 'text'; el.className = 'input'; el.value = f.value || (f.cur && V.page ? String(V.page) : ''); el.dir = 'auto'; }
        if (f.meta) card.addEventListener('toggle', async () => { if (card.open) try { el.value = (await load(await curBytes()))[f.meta]() || ''; } catch (e) { /* */ } }, { once: true });
        vals[f.k] = el; row.appendChild(el); card.appendChild(row);
      }
      // מנוע: כל התוכנות שמותקנות במחשב ויודעות את הפעולה (הבחירה הראשונה = המועדפת)
      let engSel = null;
      if (t.engine) {
        const able = engines.filter((e) => (e.ops || []).includes(t.op));
        const row = document.createElement('div'); row.className = 'setting-row';
        const lab = document.createElement('div'); lab.className = 'sr-text'; lab.innerHTML = '<b></b><span></span>';
        lab.querySelector('b').textContent = T('תוכנה במחשב');
        lab.querySelector('span').textContent = able.length ? '' : T('לא נמצאה תוכנה מותקנת לפעולה הזו');
        row.appendChild(lab);
        if (able.length) {
          engSel = document.createElement('select'); engSel.className = 'select';
          able.forEach((e) => { const o = document.createElement('option'); o.value = e.id; o.textContent = e.name; engSel.appendChild(o); });
          row.appendChild(engSel);
        }
        card.appendChild(row);
        if (!able.length) card.classList.add('disabled');
      }
      const go = document.createElement('button'); go.className = 'btn primary'; go.textContent = T('ביצוע');
      go.addEventListener('click', async () => {
        const v = {}; for (const k in vals) v[k] = vals[k].type === 'checkbox' ? vals[k].checked : vals[k].value;
        if (engSel) v.__engine = engSel.value;
        go.disabled = true;
        try { if (!t.engine) PV.progress.show(T(t.name) + '…'); await t.run(v); }
        catch (e) { PV.error(PV.errMsg(e)); }
        finally { go.disabled = false; if (!t.engine) PV.progress.hide(); }
      });
      card.appendChild(go); sec.appendChild(card);
    }
    PV.hydrateIcons(sec);
  }

  // פריט בתפריט "פעולות נוספות"
  const menu = $('more-menu');
  if (menu) {
    const item = document.createElement('button'); item.className = 'menu-item'; item.id = 'mi-pdftools';
    item.innerHTML = '<i data-icon="settings"></i><span class="mi-text"></span>';
    item.querySelector('.mi-text').textContent = T('כלי PDF (חיבור, פיצול, דחיסה…)');
    menu.insertBefore(item, menu.firstChild);
    PV.hydrateIcons(item);
    item.addEventListener('click', async () => { PV.closePopovers(); await render(); if (PV.openOverlay) PV.openOverlay('pdftools'); });
  }
  PV.pdftools = { tools: TOOLS, parsePages, render };
})();
