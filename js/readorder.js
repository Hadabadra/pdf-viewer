/* סדר קריאה, שורות ורווחים לטקסט מוטבע בעברית (פריטי pdf.js).
 *
 * pdf.js מחזיר את פריטי הטקסט בסדר שבו הם כתובים בקובץ, ומסמן "סוף שורה" לפי הנחות של כתיבה משמאל לימין.
 * בקבצים עבריים זה מייצר: מילים בסדר הפוך (טקסט שנכתב בסדר חזותי), טורים שמעורבבים (שורה מטור אחד ושורה מהשני לסירוגין),
 * מילים מחוברות (אין תו רווח בין פריטים), סוגריים הפוכים, ובשכבות OCR — "סוף שורה" אחרי כל מילה.
 * המודול הזה לא נוגע בקובץ: הוא רק מחשב מחדש את סדר הקריאה, השורות והרווחים לפי המיקום של הפריטים.
 *
 * sequence(items) → null אם אי אפשר/לא צריך (עמוד לא עברי, מעט טקסט, טקסט מסובב) — ואז הקוד הקיים נשאר כמו קודם.
 *                → [{ i, eol, sp }] בסדר קריאה: i = אינדקס הפריט המקורי, eol = לשבור שורה אחריו, sp = רווח לפניו,
 *                  ועליו המאפיינים: mirror (להפוך סוגריים), reordered (הסדר שונה מהקובץ).
 */
(function (root) {
  'use strict';

  const RTL_RE = /[\u0590-\u08FF]/;
  const median = (a) => { const s = a.slice().sort((p, q) => p - q); return s.length ? s[Math.floor(s.length / 2)] : 0; };

  // ── הכנה: רשומות גיאומטריות לפריטים ────────────────────────────────
  function prepare(items) {
    if (!Array.isArray(items)) return null;
    const rec = [];
    items.forEach((it, i) => {
      if (!it || typeof it.str !== 'string' || !it.transform || !it.str.length) return;   // פריטי EOL ריקים נבנים מחדש
      const tr = it.transform;
      rec.push({
        i, s: it.str, x: tr[4], y: tr[5], w: Math.max(0, it.width || 0),
        h: it.height || Math.hypot(tr[2], tr[3]) || 0, content: /\S/.test(it.str),
        horiz: Math.abs(tr[1]) <= 0.2 * Math.abs(tr[0]) && Math.abs(tr[2]) <= 0.2 * Math.abs(tr[3]) && tr[0] > 0,   // הטיה קלה (עד ~11°) מותרת: שכבות OCR נותנות לכל מילה שיפוע קטן
      });
    });
    const real = rec.filter((r) => r.content);
    if (real.length < 3) return null;
    if (real.filter((r) => !r.horiz).length > 0.02 * real.length) return null;           // טקסט מסובב/אנכי — לא נוגעים
    if (real.filter((r) => RTL_RE.test(r.s)).length < 0.5 * real.length) return null;    // לא עברי/ערבי
    rec.forEach((r) => { r.x1 = r.x + r.w; });
    const medH = median(real.map((r) => r.h).filter((h) => h > 0)) || 10;
    rec.forEach((r) => { if (!(r.h > 0)) r.h = medH; });
    return { rec, real, medH };
  }

  const sameBase = (a, b) => Math.abs(a.y - b.y) <= 0.4 * Math.min(a.h, b.h);

  // ── מרווח טורים אנכי (gutter) ───────────────────────────────────────
  function findGutter(lines, real) {
    if (real.length < 10) return null;
    const minX = Math.min.apply(null, real.map((r) => r.x)), maxX = Math.max.apply(null, real.map((r) => r.x1));
    const rng = maxX - minX;
    const lr = lines.map((L) => L.filter((r) => r.content)).filter((L) => L.length);
    let best = null;
    for (let x = minX + rng * 0.25; x <= minX + rng * 0.75; x += 0.5) {
      let cross = 0, both = 0;
      lr.forEach((L) => {
        let cr = false, l = false, r2 = false;
        L.forEach((u) => { if (u.x < x && u.x1 > x) cr = true; else if (u.x1 <= x) l = true; else r2 = true; });
        if (cr) cross++; else if (l && r2) both++;
      });
      if (!best || cross < best.cross || (cross === best.cross && both > best.both)) best = { cross, both, xs: [x] };
      else if (cross === best.cross && both === best.both) best.xs.push(x);
    }
    if (best && best.both >= 3 && best.cross <= 0.25 * lr.length) return best.xs[Math.floor(best.xs.length / 2)];
    return null;
  }

  function gutterGap(L, g) {
    let le = -Infinity, rs = Infinity;
    L.forEach((u) => { if (!u.content) return; if (u.x1 <= g) le = Math.max(le, u.x1); else if (u.x >= g) rs = Math.min(rs, u.x); else le = Infinity; });
    return le === -Infinity || rs === Infinity ? null : rs - le;
  }

  // שורה "רחבה" = חוצה את המרווח, או כותרת על פני שני הטורים
  function makeCrosses(lines, g) {
    if (g === null) return () => false;
    const medGap = median(lines.map((L) => gutterGap(L, g)).filter((v) => v !== null && v > 0));
    const fn = (L) => {
      if (L.some((u) => u.content && u.x < g && u.x1 > g)) return true;
      const gp = gutterGap(L, g);
      return gp !== null && medGap > 0 && gp < 0.5 * medGap;
    };
    fn.medGap = medGap;
    return fn;
  }

  // ── שורות לפי בסיס (לטקסט שכתוב בסדר חזותי) ─────────────────────────
  function baselineLines(arr, medH) {
    const lines = []; let ref = null;
    arr.slice().sort((p, q) => q.y - p.y || p.i - q.i).forEach((r) => {
      if (ref === null || ref - r.y > Math.max(0.4 * Math.min(r.h, medH), 1.5)) { lines.push([r]); ref = r.y; } else lines[lines.length - 1].push(r);
    });
    return lines;
  }

  // ── רווחים בתוך שורה (בסדר שהפריטים ניתנים) ─────────────────────────
  function withSpaces(L, medH, out) {
    L.forEach((r, k) => {
      const prev = k ? L[k - 1] : null;
      let sp = false;
      if (prev && prev.content && r.content && !/\s$/.test(prev.s) && !/^\s/.test(r.s)) {
        const gap = Math.max(r.x - (prev.x + prev.w), prev.x - (r.x + r.w));     // המרווח בין שני הפריטים, בכל כיוון כתיבה
        sp = gap > 0.1 * medH;
      }
      out.push({ i: r.i, eol: k === L.length - 1, sp });
    });
  }

  // ── מצב א': טקסט בסדר חזותי (משמאל לימין) — ממיינים מחדש מילים וטורים ──
  function visualMode(P, g, crosses, lines) {
    const { rec, medH } = P;
    const rtlSort = (L) => L.slice().sort((p, q) => q.x - p.x || p.i - q.i);
    const outLines = []; let block = [];
    const flush = () => {
      if (!block.length) return;
      if (g === null) block.forEach((L) => outLines.push(rtlSort(L)));
      else {
        const all = [].concat.apply([], block);
        const side = (u) => ((u.x + u.x1) / 2 >= g ? 1 : 0);
        [1, 0].forEach((sd) => baselineLines(all.filter((u) => side(u) === sd), medH).forEach((L) => outLines.push(rtlSort(L))));   // טור ימין ואז שמאל
      }
      block = [];
    };
    lines.forEach((L) => { if (crosses(L)) { flush(); outLines.push(rtlSort(L)); } else block.push(L); });
    flush();
    const res = [];
    outLines.forEach((L) => withSpaces(L, medH, res));
    return res;
  }

  // ── מצב ב': הסדר כבר לוגי (ימין→שמאל) — לא נוגעים בסדר המילים, רק בשורות ובטורים ──
  function logicalMode(P, g, crosses, spurious, items) {
    const { rec, medH } = P;
    // חיתוך לשורות לפי גיאומטריה (ולא לפי סימון ה-EOL של pdf.js): אותו בסיס וממשיכים שמאלה
    const sl = []; let cur = null;
    rec.forEach((r) => {
      if (cur && !r.content) { cur.items.push(r); return; }                                       // פריט רווח — נשאר עם השורה הנוכחית
      const colBreak = cur && cur.last && g !== null && cur.last.x >= g && r.x1 <= g && (cur.last.x - r.x1) >= 0.5 * (crosses.medGap || 0);   // מעבר בין טורים באותו בסיס — שורה חדשה
      if (cur && cur.last && !colBreak && sameBase(cur.last, r) && r.x <= cur.last.x + 0.5 * medH) { cur.items.push(r); cur.last = r; return; }
      cur = { items: [r], last: r.content ? r : null }; sl.push(cur);
    });
    const lines = sl.map((L) => { L.c = L.items.filter((u) => u.content); L.y = L.last ? L.last.y : 0; return L; }).filter((L) => L.c.length);
    let reordered = false, ordered = lines;
    if (g !== null) {
      lines.forEach((L) => {
        L.side = crosses(L.c) ? 2 : ((Math.min.apply(null, L.c.map((u) => u.x)) + Math.max.apply(null, L.c.map((u) => u.x1))) / 2 >= g ? 1 : 0);
      });
      let sw = 0, pairs = 0;
      for (let k = 1; k < lines.length; k++) {
        const a = lines[k - 1].side, b = lines[k].side;
        if (a === 2 || b === 2) continue;
        pairs++; if (a !== b) sw++;
      }
      // טורים משולבים לסירוגין (שורה מטור אחד, שורה מהשני): כמעט כל שורה עוברת לצד השני ברצף. סף גבוה בכוונה — סדר שה-OCR קבע (אינדקסים, טבלאות, הערות שוליים) לא נוגעים בו
      if (pairs >= 10 && sw >= 0.6 * pairs && median(lines.map((L) => L.c.length)) >= 5) {
        reordered = true; ordered = []; let block = [];
        const flush = () => {
          if (!block.length) return;
          [1, 0].forEach((sd) => block.filter((L) => L.side === sd).sort((p, q) => q.y - p.y).forEach((L) => ordered.push(L)));
          block = [];
        };
        lines.forEach((L) => { if (L.side === 2) { flush(); ordered.push(L); } else block.push(L); });
        flush();
      }
    }
    // חיתוך שורות לפי גיאומטריה רק כשהסימון של pdf.js משובש (סוף שורה אחרי רוב המילים) או כשהטורים משולבים;
    // אחרת (למשל אינדקסים עם נקודות מילוי) השורות נשארות כפי ש-pdf.js סימן, ורק מתווספים רווחים.
    if (!reordered && !spurious) return { res: originalSeq(items, P.rec), reordered: false };
    const res = [];
    ordered.forEach((L) => withSpaces(L.items, medH, res));
    return { res, reordered };
  }

  // הסדר והשורות כפי שבקובץ (סימון EOL של pdf.js), עם רווחים לפי מרווחים
  function originalSeq(items, rec) {
    const sp = spacesFlags(items);
    const eolAfter = new Map(); let lastReal = -1;
    items.forEach((it, i) => {
      if (!it || typeof it.str !== 'string') return;
      if (it.str.length) { lastReal = i; if (it.hasEOL) eolAfter.set(i, true); }
      else if (it.hasEOL && lastReal >= 0) eolAfter.set(lastReal, true);
    });
    return rec.map((r) => ({ i: r.i, eol: !!eolAfter.get(r.i), sp: !!sp[r.i] }));
  }

  // ── כניסה ראשית ─────────────────────────────────────────────────────
  function sequence(items) {
    const P = prepare(items);
    if (!P) return null;
    const { rec, real, medH } = P;
    // כיוון הכתיבה בקובץ: האם המילים באותה שורה מופיעות משמאל לימין (חזותי) או ימין→שמאל (לוגי)
    let ltr = 0, rtl = 0;
    for (let k = 1; k < real.length; k++) {
      const a = real[k - 1], b = real[k];
      if (!sameBase(a, b)) continue;
      if (b.x > a.x + 0.5) ltr++; else if (b.x < a.x - 0.5) rtl++;
    }
    const visual = ltr >= 3 && ltr >= 3 * rtl;
    // סימון EOL משובש: סוף שורה אחרי רוב המילים (שכבת OCR שבה לכל מילה גודל/בסיס מעט שונה)
    const eolCount = items.filter((it) => it && it.hasEOL).length;
    const spurious = eolCount > 0.5 * real.length;
    const lines = baselineLines(rec, medH);
    const g = findGutter(lines, real);
    const crosses = makeCrosses(lines, g);
    let res, reordered, mirrorFlag;
    if (visual) { res = visualMode(P, g, crosses, lines); reordered = true; mirrorFlag = true; }
    else { const r = logicalMode(P, g, crosses, spurious, items); res = r.res; reordered = r.reordered; mirrorFlag = true; }   // pdf.js לא הופך סוגריים (mirroring) גם בשכבות OCR בסדר לוגי
    if (res.length !== rec.length) return null;
    if (reordered && res.every((e, k) => e.i === rec[k].i)) reordered = false;
    res.mirror = mirrorFlag;
    res.reordered = reordered;
    return res;
  }

  // ── סוגריים ─────────────────────────────────────────────────────────
  // בעמוד עברי pdf.js מחזיר סוגריים כצורת הגליף החזותית ולא מבצע היפוך (mirroring) כמו PDFium, ולכן כולם יוצאים הפוכים (נמדד: 12%–13% בכיוון נכון בקבצי OCR, מול 95%–100% ב-PDFium).
  // הופכים בפריטים בלי אותיות לטיניות (עברית, ספרות, פיסוק); פריט עם לטינית — סוגריו כבר נכונים.
  const MIRROR = { '(': ')', ')': '(', '[': ']', ']': '[', '{': '}', '}': '{', '<': '>', '>': '<', '\u00AB': '\u00BB', '\u00BB': '\u00AB', '\u2039': '\u203A', '\u203A': '\u2039' };
  const mirror = (s) => (/[A-Za-z]/.test(s) ? s : s.replace(/[()\[\]{}<>\u00AB\u00BB\u2039\u203A]/g, (c) => MIRROR[c]));

  /** רווחים בלבד, בלי לשנות סדר (לעמודים שאינם עבריים/שלא נותחו): flags[i] = true אם צריך רווח לפני הפריט i. */
  function spacesFlags(items) {
    const flags = new Array(items ? items.length : 0).fill(false);
    if (!Array.isArray(items)) return flags;
    const hs = [];
    items.forEach((it) => { if (it && typeof it.str === 'string' && it.str.trim() && it.height > 0) hs.push(it.height); });
    const mh = median(hs) || 10;
    let prev = null, brk = false;
    items.forEach((it, i) => {
      if (!it || typeof it.str !== 'string' || !it.transform) return;
      if (!it.str.length) { if (it.hasEOL) brk = true; return; }
      const cur = { s: it.str, x: it.transform[4], y: it.transform[5], w: Math.max(0, it.width || 0), h: it.height || mh };
      if (prev && !brk && /\S/.test(prev.s) && /\S/.test(cur.s) && !/\s$/.test(prev.s) && !/^\s/.test(cur.s)) {
        if (Math.abs(prev.y - cur.y) <= 0.4 * Math.min(prev.h, cur.h)) {
          const gap = Math.max(cur.x - (prev.x + prev.w), prev.x - (cur.x + cur.w));
          if (gap > 0.1 * mh) flags[i] = true;
        } else flags[i] = true;
      }
      brk = !!it.hasEOL;
      prev = cur;
    });
    return flags;
  }

  const api = { sequence, mirror, spaces: spacesFlags };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.ReadOrder = api;
})(typeof window !== 'undefined' ? window : globalThis);
