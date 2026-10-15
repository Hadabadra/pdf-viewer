/* צופה PDF+OCR — ליבת שכבת הטקסט: הסרת שכבת OCR ישנה והוספת שכבה חדשה (טקסט בלתי נראה) לפי מיקום מילים.
   קוד נקי בלי תלות בדפדפן: מקבל את ספריית pdf-lib כפרמטר, ולכן אפשר לבדוק אותו גם ב-Node. */
(function (root) {
  'use strict';

  // גופן "ריק" (GlyphLess): כל התווים ללא צורה, רק כדי שהטקסט יהיה ניתן לחיפוש/העתקה. 624 בתים.
  const FONT_B64 = 'AAEAAAAKAIAAAwAgT1MvMkT/RUAAAAEoAAAAYGNtYXAADABzAAABkAAAADRnbHlmAAAAAAAAAcwAAAABaGVhZCz/K24AAACsAAAANmhoZWED6QH2AAAA5AAAACRobXR4AfQAAAAAAYgAAAAGbG9jYQAAAAAAAAHEAAAABm1heHAAAwACAAABCAAAACBuYW1lGZ8ZNAAAAdAAAABycG9zdDIGAmcAAAJEAAAAKQABAAAAAQAAHnl/kV8PPPUAAwPoAAAAAOb0dUcAAAAA5vR1RwAAAAAAAAAAAAAAAwACAAAAAAAAAAEAAAPoAAAAAAH0AAAAAAAAAAEAAAAAAAAAAAAAAAAAAAABAAEAAAACAAAAAAAAAAAAAgAAAAAAAAAAAAAAAAAAAAAAAwH0AZAABQAEAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAABAAAAAAAAAAAAAAAAPz8/PwAAACAAIAPoAAAAAAPoAAAAAAAAAAAAAAAAAAAAAAAgAAAB9AAAAAAAAAAAAAIAAAADAAAAFAADAAEAAAAUAAQAIAAAAAQABAABAAAAIP//AAAAIP///+EAAQAAAAAAAAAAAAAAAAAAAAAAAAAEADYAAQAAAAAAAQANAAAAAQAAAAAAAgAHAA0AAwABBAkAAQAaABQAAwABBAkAAgAOAC5HbHlwaExlc3NGb250UmVndWxhcgBHAGwAeQBwAGgATABlAHMAcwBGAG8AbgB0AFIAZQBnAHUAbABhAHIAAAACAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAIAAAECAmcxAAAA';

  function b64ToBytes(b64) {
    const bin = (typeof atob === 'function') ? atob(b64) : Buffer.from(b64, 'base64').toString('binary');
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ── הסרת טקסט בלתי נראה (render mode 3) מזרם התוכן ─────────────────
  const isWs = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09 || c === 0x0c || c === 0x00;
  const isDelim = (c) => c === 0x28 || c === 0x29 || c === 0x3c || c === 0x3e || c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d || c === 0x2f || c === 0x25;

  /** מפרק זרם תוכן לאסימונים. cb(type, start, end, text) — type: 'op' | 'num' | 'other'. */
  function scan(buf, cb) {
    const n = buf.length;
    let i = 0;
    while (i < n) {
      const c = buf[i];
      if (isWs(c)) { i++; continue; }
      const s = i;
      if (c === 0x25) { while (i < n && buf[i] !== 0x0a && buf[i] !== 0x0d) i++; continue; } // הערה
      if (c === 0x28) { // מחרוזת (...)
        let depth = 1; i++;
        while (i < n && depth > 0) {
          const d = buf[i];
          if (d === 0x5c) i += 2;
          else { if (d === 0x28) depth++; else if (d === 0x29) depth--; i++; }
        }
        cb('other', s, i, '(');
        continue;
      }
      if (c === 0x3c) {
        if (buf[i + 1] === 0x3c) { i += 2; cb('other', s, i, '<<'); continue; }
        while (i < n && buf[i] !== 0x3e) i++;
        i++; cb('other', s, i, '<'); continue;
      }
      if (c === 0x3e) { i += (buf[i + 1] === 0x3e) ? 2 : 1; cb('other', s, i, '>>'); continue; }
      if (c === 0x5b || c === 0x5d || c === 0x7b || c === 0x7d) { i++; cb('other', s, i, String.fromCharCode(c)); continue; }
      if (c === 0x2f) { i++; while (i < n && !isWs(buf[i]) && !isDelim(buf[i])) i++; cb('other', s, i, '/'); continue; }
      if (c === 0x29) { i++; continue; }
      while (i < n && !isWs(buf[i]) && !isDelim(buf[i])) i++;
      let tok = '';
      for (let k = s; k < i; k++) tok += String.fromCharCode(buf[k]);
      if (/^[+-]?(\d+\.?\d*|\.\d+)$/.test(tok)) { cb('num', s, i, tok); continue; }
      if (tok === 'BI') { // תמונה משובצת: מדלגים על הנתונים הבינאריים עד EI
        cb('op', s, i, tok);
        let j = i, idAt = -1;
        while (j < n - 1) { if (isWs(buf[j]) && buf[j + 1] === 0x49 && buf[j + 2] === 0x44 && (j + 3 >= n || isWs(buf[j + 3]))) { idAt = j + 3; break; } j++; }
        if (idAt < 0) { i = n; continue; }
        j = idAt + 1;
        let eiAt = -1;
        while (j < n - 1) { if (isWs(buf[j - 1]) && buf[j] === 0x45 && buf[j + 1] === 0x49 && (j + 2 >= n || isWs(buf[j + 2]))) { eiAt = j; break; } j++; }
        i = eiAt < 0 ? n : eiAt + 2;
        cb('op', eiAt < 0 ? n : eiAt, i, 'EI');
        continue;
      }
      cb('op', s, i, tok);
    }
  }

  /** מסיר מזרם תוכן כל בלוק BT..ET שמכיל רק טקסט בלתי נראה (Tr 3). מחזיר גם אם נשאר טקסט גלוי ("טקסט דיגיטלי"). */
  function stripHiddenText(bytes) {
    const cuts = [];
    let lastNum = null, curTr = 0;
    const trStack = [];
    let inText = false, blockStart = 0, hidden = false, visible = false;
    let anyVisible = false, hiddenBlocks = 0;
    scan(bytes, (type, s, e, tok) => {
      if (type === 'num') { lastNum = parseFloat(tok); return; }
      if (type !== 'op') return;
      switch (tok) {
        case 'q': trStack.push(curTr); break;
        case 'Q': if (trStack.length) curTr = trStack.pop(); break;
        case 'Tr': if (lastNum != null) curTr = lastNum; break;
        case 'BT': inText = true; blockStart = s; hidden = false; visible = false; break;
        case 'Tj': case 'TJ': case "'": case '"':
          if (inText) { if (curTr === 3) hidden = true; else visible = true; }
          break;
        case 'ET':
          if (inText) {
            if (hidden && !visible) { cuts.push([blockStart, e]); hiddenBlocks++; }
            else if (visible) anyVisible = true;
          }
          inText = false;
          break;
        default: break;
      }
      lastNum = null;
    });
    if (!cuts.length) return { bytes, removed: 0, visibleText: anyVisible };
    let size = bytes.length;
    cuts.forEach(([a, b]) => { size -= (b - a); });
    const out = new Uint8Array(size + cuts.length);
    let o = 0, p = 0;
    cuts.forEach(([a, b]) => { out.set(bytes.subarray(p, a), o); o += a - p; out[o++] = 0x0a; p = b; });
    out.set(bytes.subarray(p), o); o += bytes.length - p;
    return { bytes: out.subarray(0, o), removed: hiddenBlocks, visibleText: anyVisible };
  }

  // ── קריאת תוכן עמוד / החלפתו ────────────────────────────────────────
  function streamBytes(L, s) {
    if (s instanceof L.PDFRawStream) return L.decodePDFRawStream(s).decode();
    return s.getContents();
  }
  /** כל זרמי התוכן של העמוד כרצף בייטים אחד (null אם אין תוכן או שאי אפשר לפענח). */
  function pageContentBytes(L, page) {
    const c = page.node.Contents();
    if (!c) return null;
    const parts = [];
    if (c instanceof L.PDFArray) {
      for (let i = 0; i < c.size(); i++) parts.push(streamBytes(L, c.lookup(i, L.PDFStream)));
    } else parts.push(streamBytes(L, c));
    let len = 0;
    parts.forEach((p) => { len += p.length + 1; });
    const out = new Uint8Array(len);
    let o = 0;
    parts.forEach((p) => { out.set(p, o); o += p.length; out[o++] = 0x0a; });
    return out;
  }

  // ── הטמעת הגופן הריק במסמך (פעם אחת) ─────────────────────────────────
  function embedFont(L, doc) {
    const ctx = doc.context;
    const ttf = b64ToBytes(FONT_B64);
    const fontFile = ctx.register(ctx.flateStream(ttf, { Length1: ttf.length }));
    const descriptor = ctx.register(ctx.obj({
      Type: 'FontDescriptor', FontName: 'GlyphLessFont', Flags: 4,
      FontBBox: [0, 0, 500, 1000], ItalicAngle: 0, Ascent: 1000, Descent: 0, CapHeight: 1000, StemV: 80, FontFile2: fontFile,
    }));
    const map = new Uint8Array(65536 * 2);
    for (let i = 0; i < 65536; i++) { map[i * 2] = 0; map[i * 2 + 1] = 1; } // כל קוד → גליף 1 (ריק)
    const cidToGid = ctx.register(ctx.flateStream(map));
    const cidFont = ctx.register(ctx.obj({
      Type: 'Font', Subtype: 'CIDFontType2', BaseFont: 'GlyphLessFont',
      CIDSystemInfo: { Registry: L.PDFString.of('Adobe'), Ordering: L.PDFString.of('Identity'), Supplement: 0 },
      FontDescriptor: descriptor, CIDToGIDMap: cidToGid, DW: 500,
    }));
    const cmap = '/CIDInit /ProcSet findresource begin\n12 dict begin\nbegincmap\n/CIDSystemInfo << /Registry (Adobe) /Ordering (UCS) /Supplement 0 >> def\n' +
      '/CMapName /Adobe-Identity-UCS def\n/CMapType 2 def\n1 begincodespacerange\n<0000> <FFFF>\nendcodespacerange\n1 beginbfrange\n<0000> <FFFF> <0000>\nendbfrange\nendcmap\nCMapName currentdict /CMap defineresource pop\nend\nend';
    const toUnicode = ctx.register(ctx.flateStream(new TextEncoder().encode(cmap)));
    return ctx.register(ctx.obj({
      Type: 'Font', Subtype: 'Type0', BaseFont: 'GlyphLessFont', Encoding: 'Identity-H',
      DescendantFonts: [cidFont], ToUnicode: toUnicode,
    }));
  }

  // ── בניית פעולות הטקסט ───────────────────────────────────────────────
  const hex4 = (n) => ('0000' + n.toString(16)).slice(-4);

  // PDF שומר טקסט בסדר חזותי (משמאל לימין) וקוראי PDF הופכים אותו חזרה בחילוץ/חיפוש — לכן מילים בעברית נכתבות הפוך.
  const RTL_RE = /[\u0590-\u05FF\uFB1D-\uFB4F\u0600-\u06FF\u0750-\u077F\uFB50-\uFDFF\uFE70-\uFEFF]/;
  const LTR_RE = /[A-Za-z0-9\u00C0-\u024F]/;
  const MARK_RE = /[\u0591-\u05BD\u05BF\u05C1\u05C2\u05C4\u05C5\u05C7\u064B-\u065F]/;
  // סוגריים וסימנים "מראתיים": בטקסט ימין-לשמאל הצורה (הגליף) מתהפכת, ולכן בסדר החזותי נשמר התו ההפוך.
  // בלי זה, קוראי PDF שמחזירים את הסדר הלוגי (כמו Chrome/Edge) מציגים "(שלום)" בתור ")שלום(".
  const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '«': '»', '»': '«', '‹': '›', '›': '‹' };
  function visualOrder(text) {
    if (!RTL_RE.test(text)) return text;
    // אשכולות: אות בסיס + סימני ניקוד/טעמים שאחריה
    const clusters = [];
    for (const ch of Array.from(text)) {
      if (MARK_RE.test(ch) && clusters.length) clusters[clusters.length - 1].t += ch;
      else clusters.push({ t: ch, c: RTL_RE.test(ch) ? 'R' : LTR_RE.test(ch) ? 'L' : 'N' });
    }
    // סימנים ניטרליים: בין שני תווים באותו כיוון — כיוון זה; אחרת (בקצה או בין כיוונים שונים) — כיוון הבסיס (ימין-לשמאל)
    for (let i = 0; i < clusters.length; i++) {
      if (clusters[i].c !== 'N') continue;
      let j = i;
      while (j < clusters.length && clusters[j].c === 'N') j++;
      const before = i > 0 ? clusters[i - 1].c : 'R', after = j < clusters.length ? clusters[j].c : 'R';
      const dir = before === after ? before : 'R';
      for (let k = i; k < j; k++) clusters[k].c = dir;
      i = j - 1;
    }
    const runs = [];
    clusters.forEach((k) => {
      const last = runs[runs.length - 1];
      if (last && last.c === k.c) last.items.push(k.t); else runs.push({ c: k.c, items: [k.t] });
    });
    return runs.reverse().map((r) => {
      if (r.c !== 'R') return r.items.join('');
      return r.items.reverse().map((t) => (t.length === 1 && MIRROR[t]) || t).join('');
    }).join('');
  }

  function toHex(text) {
    text = visualOrder(text);
    let h = '', n = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c < 0x20 || c === 0x7f) continue;
      h += hex4(c); n++;
    }
    return { hex: h, n };
  }
  const f3 = (x) => (Math.round(x * 1000) / 1000).toString();

  /** words: [{ text, bl:[x,y], br:[x,y], tl:[x,y] }] — פינות המילה במרחב המשתמש של ה-PDF (שמאל-תחתון, ימין-תחתון, שמאל-עליון של התיבה). */
  function layerOps(words, fontName) {
    const out = ['q', '3 Tr'];
    let count = 0;
    for (const w of words) {
      const { hex, n } = toHex(String(w.text || ''));
      if (!n) continue;
      const ux = w.br[0] - w.bl[0], uy = w.br[1] - w.bl[1];
      const vx = w.tl[0] - w.bl[0], vy = w.tl[1] - w.bl[1];
      const width = Math.hypot(ux, uy), fs = Math.hypot(vx, vy);
      if (!(width > 0.01) || !(fs > 0.01)) continue;
      const cos = ux / width, sin = uy / width;
      const tz = Math.min(5000, Math.max(1, width / (n * fs * 0.5) * 100));
      out.push('BT /' + fontName + ' ' + f3(fs) + ' Tf ' + f3(tz) + ' Tz ' + [cos, sin, -sin, cos, w.bl[0], w.bl[1]].map(f3).join(' ') + ' Tm <' + hex + '> Tj ET');
      count++;
    }
    out.push('Q');
    return { ops: out.join('\n'), count };
  }

  /** מחליף את תוכן העמוד (אם יש בו שכבה ישנה) ומוסיף שכבת טקסט חדשה. מחזיר { removedBlocks, visibleText, words }. */
  function applyLayer(L, doc, page, fontRef, words, opts) {
    const o = opts || {};
    const ctx = doc.context;
    let removed = 0, visible = false;
    if (o.replace !== false) {
      const orig = pageContentBytes(L, page);
      if (orig) {
        const r = stripHiddenText(orig);
        removed = r.removed; visible = r.visibleText;
        if (r.removed > 0) page.node.set(L.PDFName.of('Contents'), ctx.register(ctx.flateStream(r.bytes)));
      }
    }
    const { ops, count } = layerOps(words, 'OcrF1');
    const q = ctx.register(ctx.stream('q\n')), Q = ctx.register(ctx.stream('\nQ\n'));
    page.node.wrapContentStreams(q, Q);
    page.node.setFontDictionary(L.PDFName.of('OcrF1'), fontRef);
    page.node.addContentStream(ctx.register(ctx.flateStream(new TextEncoder().encode(ops))));
    return { removedBlocks: removed, visibleText: visible, words: count };
  }

  /** בדיקה בלבד: האם בעמוד יש טקסט (בלתי נראה = שכבת OCR קיימת, גלוי = טקסט דיגיטלי). */
  function inspectPage(L, page) {
    try {
      const orig = pageContentBytes(L, page);
      if (!orig) return { hidden: 0, visible: false };
      const r = stripHiddenText(orig);
      return { hidden: r.removed, visible: r.visibleText };
    } catch (e) { return { hidden: 0, visible: false, error: String(e && e.message || e) }; }
  }

  /** ממיר מרובע במילה (פיקסלים בקנבס: TL,TR,BR,BL כ-8 מספרים) לפינות במרחב ה-PDF.
   *  vp = viewport של pdf.js בקנה מידה 1 (כולל סיבוב העמוד); sx,sy = יחס פיקסלים בקנבס ליחידות ה-viewport. */
  function wordToUser(vp, sx, sy, q) {
    const pt = (x, y) => vp.convertToPdfPoint(x / sx, y / sy);
    return { tl: pt(q[0], q[1]), br: pt(q[4], q[5]), bl: pt(q[6], q[7]) };
  }

  const api = { FONT_B64, wordToUser, visualOrder, stripHiddenText, pageContentBytes, embedFont, layerOps, applyLayer, inspectPage };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.PdfText = api;
})(typeof self !== 'undefined' ? self : this);
