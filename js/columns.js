/* Column-gutter finder for scanned Rashi/Hebrew pages. Pure JS, no dependencies.
   findGutter(gray, W, H, thr=140) -> [cutX] or []   (gray = Uint8Array of W*H, 0=black)
   Port of columns.py; handles 1-3px gutters, thin printed rules, spanning headings, unequal columns. */
function findGutter(gray, W, H, thr) {
  thr = thr || 140;
  const N = W * H, ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) ink[i] = gray[i] < thr ? 1 : 0;
  // 8-connected components
  const lab = new Int32Array(N), stack = new Int32Array(N);
  const comps = []; // {x0,x1,y0,y1,n}
  for (let s = 0; s < N; s++) {
    if (!ink[s] || lab[s]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = s; lab[s] = id;
    let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx; if (ink[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; } } }
    }
    comps.push({ x0, x1, y0, y1, n });
  }
  // drop long thin vertical rules and tiny specks
  const keep = [];
  comps.forEach((c, i) => {
    const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
    const rule = (h > 0.25 * H && w <= Math.max(6, 0.01 * W)) || h > 0.6 * H;   // קווי הפרדה מודפסים ושולי סריקה (עצמים בגובה העמוד)
    const speck = h * w <= 4 && c.n <= 2;
    if (rule || speck) c.drop = true; else keep.push(c);
  });
  if (!keep.length) return [];
  let X0 = W, X1 = 0, Y0 = H, Y1 = 0;
  for (const c of keep) { X0 = Math.min(X0, c.x0); X1 = Math.max(X1, c.x1); Y0 = Math.min(Y0, c.y0); Y1 = Math.max(Y1, c.y1); }
  const tw = X1 - X0;
  const hs = keep.map(c => c.y1 - c.y0 + 1).filter(h => h >= 3).sort((a, b) => a - b);
  const medh = hs.length ? (hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2) : 1;
  if ((Y1 - Y0 + 1) < 12 * medh) return []; // too few text lines to trust a column split
  // ink map after removal, per row/col
  const keepId = new Uint8Array(comps.length + 1); comps.forEach((c, i) => { keepId[i + 1] = c.drop ? 0 : 1; });
  const rowAny = new Uint8Array(H), colCnt = new Float64Array(tw + 1);
  for (let y = Y0; y <= Y1; y++) for (let x = X0; x <= X1; x++) {
    const l = lab[y * W + x]; if (l && keepId[l]) { rowAny[y] = 1; }
  }
  let R = 0; for (let y = Y0; y <= Y1; y++) R += rowAny[y]; R = Math.max(1, R);
  for (let y = Y0; y <= Y1; y++) { if (!rowAny[y]) continue;
    for (let x = X0; x <= X1; x++) { const l = lab[y * W + x]; if (l && keepId[l]) colCnt[x - X0]++; } }
  const frac = Array.from(colCnt, v => v / R);
  const fs = frac.map((v, i) => 0.5 * (v + (i ? frac[i - 1] : 0)));
  const lo = Math.floor(0.2 * tw), hi = Math.floor(0.8 * tw);
  let xm = lo, vmin = Infinity;
  for (let i = lo; i < hi; i++) if (fs[i] < vmin) { vmin = fs[i]; xm = i; }
  const meanTop = (arr, k) => { const s = arr.slice().sort((a, b) => a - b); const t = s.slice(Math.max(0, s.length - k)); return t.reduce((a, b) => a + b, 0) / t.length; };
  const peakL = xm > 5 ? meanTop(fs.slice(0, xm), Math.max(1, Math.floor(xm / 5))) : 0;
  const peakR = meanTop(fs.slice(xm), Math.max(1, Math.floor((tw - xm) / 5)));
  const nz = frac.filter(v => v > 0).sort((a, b) => a - b);
  const ref = nz.length ? (nz.length % 2 ? nz[(nz.length - 1) / 2] : (nz[nz.length / 2 - 1] + nz[nz.length / 2]) / 2) : 1;
  if (vmin > 0.12 * ref || peakL < 0.6 * ref || peakR < 0.6 * ref) return [];
  const band = fs.slice(lo, hi);
  const runs = mask => { const out = []; let i = 0; while (i < mask.length) { if (mask[i]) { let j = i; while (j < mask.length && mask[j]) j++; out.push([i, j]); i = j; } else i++; } return out; };
  const near = runs(band.map(v => v <= 0.03 * ref)); if (!near.length) return [];
  const [i0, j0] = near.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  const seg = band.slice(i0, j0), m = Math.min(...seg);
  const zr = runs(seg.map(v => v <= m + 1e-9)); const [k0, k1] = zr.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  return [Math.floor(X0 + lo + i0 + (k0 + k1 - 1) / 2 + 0.5)];
}

/** מעריך זווית סיבוב של עמוד סרוק, במעלות (חיובי = יש לסובב נגד כיוון השעון כדי ליישר), לפי חדות פרופיל השורות. null אם אין עדות. */
function estimateSkew(gray, W, H, thr) {
  thr = thr || 140;
  const ink = []; let cnt = 0;
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (gray[y * W + x] < thr) { ink.push(x, y); cnt++; }
  if (cnt < 200) return null;
  const cx = W / 2, cy = H / 2, off = Math.ceil(Math.hypot(W, H) / 2) + 2, size = off * 2 + 3;
  const score = (deg) => {
    const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r), p = new Float64Array(size);
    for (let i = 0; i < ink.length; i += 2) { const yy = Math.round((ink[i + 1] - cy) * c - (ink[i] - cx) * s) + off; p[yy]++; }
    let t = 0; for (let i = 1; i < size; i++) { const d = p[i] - p[i - 1]; t += d * d; } return t;
  };
  let best = 0, bs = -1;
  for (let d = -5; d <= 5.0001; d += 0.25) { const v = score(d); if (v > bs) { bs = v; best = d; } }
  const c0 = best; bs = -1;
  for (let d = c0 - 0.25; d <= c0 + 0.25001; d += 0.05) { const v = score(d); if (v > bs) { bs = v; best = d; } }
  const base = score(0);
  return { deg: best, gain: base > 0 ? bs / base : 1 };
}
const SKEW_MIN_DEG = 0.8;   // מתחת לזה Tesseract מתמודד לבד, ובבדיקות היישור בזוויות כאלה לפעמים הזיק
/** מיישר עמוד מסובב: מחזיר { canvas, deg } עם קנבס מיושר, או null אם אין צורך (כמעט ישר / אין עדות). */
function deskewCanvas(src) {
  const W = src.width, H = src.height;
  if (W < 400 || H < 400) return null;
  const k = Math.max(1, Math.round(Math.max(W, H) / 900)), w = Math.max(1, Math.round(W / k)), h = Math.max(1, Math.round(H / k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, gray = new Uint8Array(w * h);
  for (let i = 0; i < w * h; i++) gray[i] = (0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]) | 0;
  c.width = 0;
  const est = estimateSkew(gray, w, h);
  if (!est || Math.abs(est.deg) < SKEW_MIN_DEG || est.gain < 2) return null;
  const rad = est.deg * Math.PI / 180, cs = Math.abs(Math.cos(rad)), sn = Math.abs(Math.sin(rad));
  const w2 = Math.ceil(W * cs + H * sn), h2 = Math.ceil(W * sn + H * cs);
  const out = document.createElement('canvas'); out.width = w2; out.height = h2;
  const og = out.getContext('2d'); og.fillStyle = '#fff'; og.fillRect(0, 0, w2, h2);
  og.translate(w2 / 2, h2 / 2); og.rotate(-rad); og.drawImage(src, -W / 2, -H / 2);   // canvas מסובב עם כיוון השעון, ולכן סימן מינוס
  return { canvas: out, deg: est.deg };
}

/** מוצא את מקום החיתוך בין טורים בקנבס: x בפיקסלים של הקנבס, או null (טור אחד / אין עדות מספקת).
 *  עובד על עותק מוקטן (עד 2400px) ומשתמש בסף מותאם לרקע, כך שגם סריקות אפורות נתמכות. */
function findGutterCanvas(src) {
  const W = src.width, H = src.height;
  if (W < 200 || H < 200) return null;
  const k = Math.min(1, 2400 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true });
  g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, n = w * h, gray = new Uint8Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const v = (0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]) | 0; gray[i] = v; hist[v]++; }
  c.width = 0;
  let acc = 0, bg = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) { bg = v; break; } }
  const cuts = findGutter(gray, w, h, Math.min(140, Math.round(bg * 0.6)));
  return cuts.length ? Math.round(cuts[0] / k) : null;
}

/* ── פריסה לפי רצועות (XY-cut): כותרת עמוד / טורים / כותרת פנימית / טורים — בסדר קריאה ──────────────────────────────
   מחלקים את הדף לרצועות אופקיות לפי רווחים גדולים, בכל רצועה מחפשים רווח אנכי בין טורים, ורצועות עוקבות עם אותו רווח
   מתמזגות לאזור טורים אחד. הסדר: אזורים מלמעלה למטה, ובתוך אזור טורים — ימין ואז שמאל. אם הפריסה לא ברורה
   (כמה טורים בגבהים שונים, דף גמרא) מחזירים null וממשיכים כמו קודם. */
function prepInk(gray, W, H, thr) {
  const N = W * H, ink = new Uint8Array(N);
  for (let i = 0; i < N; i++) ink[i] = gray[i] < thr ? 1 : 0;
  const lab = new Int32Array(N), stack = new Int32Array(N), comps = [];
  for (let s0 = 0; s0 < N; s0++) {
    if (!ink[s0] || lab[s0]) continue;
    const id = comps.length + 1; let sp = 0; stack[sp++] = s0; lab[s0] = id;
    let x0 = W, x1 = 0, y0 = H, y1 = 0, n = 0;
    while (sp) {
      const p = stack[--sp], x = p % W, y = (p - x) / W; n++;
      if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      for (let dy = -1; dy <= 1; dy++) { const yy = y + dy; if (yy < 0 || yy >= H) continue;
        for (let dx = -1; dx <= 1; dx++) { const xx = x + dx; if (xx < 0 || xx >= W) continue;
          const q = yy * W + xx; if (ink[q] && !lab[q]) { lab[q] = id; stack[sp++] = q; } } }
    }
    comps.push({ x0, x1, y0, y1, n });
  }
  const drop = new Uint8Array(comps.length + 1), hs = [];
  comps.forEach((c, i) => {
    const h = c.y1 - c.y0 + 1, w = c.x1 - c.x0 + 1;
    if ((h > 0.25 * H && w <= Math.max(6, 0.01 * W)) || h > 0.6 * H) drop[i + 1] = 1;                 // קווים אנכיים ושולי סריקה
    else if (w > 0.15 * W && h <= Math.max(8, 0.012 * H)) drop[i + 1] = 1;                            // קווי הפרדה אופקיים
    else if (h * w <= 4 && c.n <= 2) drop[i + 1] = 1;                                                 // אבק
    else if (h >= 3 && w >= 2) hs.push(h);
  });
  for (let i = 0; i < N; i++) if (ink[i] && drop[lab[i]]) ink[i] = 0;
  hs.sort((a, b) => a - b);
  const medh = hs.length ? (hs.length % 2 ? hs[(hs.length - 1) / 2] : (hs[hs.length / 2 - 1] + hs[hs.length / 2]) / 2) : 12;
  return { ink, medh };
}
function rowBands(ink, W, H, medh) {
  const T = Math.max(10, 1.3 * medh), out = [];
  const has = new Uint8Array(H); for (let y = 0; y < H; y++) { const o = y * W; for (let x = 0; x < W; x++) if (ink[o + x]) { has[y] = 1; break; } }
  let i = 0; while (i < H && !has[i]) i++;
  let start = i, last = i;
  while (i < H) {
    if (has[i]) { last = i; i++; continue; }
    let j = i; while (j < H && !has[j]) j++;
    if (j - i >= T && j < H) { out.push([start, last + 1]); start = j; }
    i = j;
  }
  out.push([start, last + 1]); return out;
}
/** רווח אנכי בתוך מלבן [xA,xB)×[yA,yB). מחזיר {cut,width} או null (אותו אלגוריתם כמו findGutter). */
function gutterInRect(ink, W, xA, xB, yA, yB, medh, minHMult, minGapMult) {
  let x0 = xB, x1 = xA - 1, y0 = yB, y1 = yA - 1;
  for (let y = yA; y < yB; y++) { const o = y * W; for (let x = xA; x < xB; x++) if (ink[o + x]) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; } }
  if (x1 < x0) return null;
  const tw = x1 - x0;
  if ((y1 - y0 + 1) < minHMult * medh || tw < 8 * medh) return null;
  const colCnt = new Float64Array(tw + 1); let R = 0;
  for (let y = y0; y <= y1; y++) { const o = y * W; let any = 0; for (let x = x0; x <= x1; x++) if (ink[o + x]) { colCnt[x - x0]++; any = 1; } R += any; }
  R = Math.max(1, R);
  const frac = Array.from(colCnt, v => v / R), fs = frac.map((v, i) => 0.5 * (v + (i ? frac[i - 1] : 0)));
  const lo = Math.floor(0.2 * tw), hi = Math.floor(0.8 * tw);
  let xm = lo, vmin = Infinity; for (let i = lo; i < hi; i++) if (fs[i] < vmin) { vmin = fs[i]; xm = i; }
  const meanTop = (arr, k) => { const s = arr.slice().sort((a, b) => a - b); const t = s.slice(Math.max(0, s.length - k)); return t.reduce((a, b) => a + b, 0) / t.length; };
  const peakL = xm > 5 ? meanTop(fs.slice(0, xm), Math.max(1, Math.floor(xm / 5))) : 0, peakR = meanTop(fs.slice(xm), Math.max(1, Math.floor((tw - xm) / 5)));
  const nz = frac.filter(v => v > 0).sort((a, b) => a - b);
  const ref = nz.length ? (nz.length % 2 ? nz[(nz.length - 1) / 2] : (nz[nz.length / 2 - 1] + nz[nz.length / 2]) / 2) : 1;
  if (vmin > 0.12 * ref || peakL < 0.6 * ref || peakR < 0.6 * ref) return null;
  const band = fs.slice(lo, hi);
  const runs = mask => { const out = []; let i = 0; while (i < mask.length) { if (mask[i]) { let j = i; while (j < mask.length && mask[j]) j++; out.push([i, j]); i = j; } else i++; } return out; };
  const near = runs(band.map(v => v <= 0.03 * ref)); if (!near.length) return null;
  const [i0, j0] = near.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  if (j0 - i0 < minGapMult * medh) return null;
  const seg = band.slice(i0, j0), m = Math.min(...seg), zr = runs(seg.map(v => v <= m + 1e-9));
  const [k0, k1] = zr.reduce((a, b) => (b[1] - b[0] > a[1] - a[0] ? b : a));
  return { cut: Math.floor(x0 + lo + i0 + (k0 + k1 - 1) / 2 + 0.5), width: j0 - i0 };
}
/** אזורי קריאה לפי סדר: [{ kind: 'block'|'right'|'left', x0, y0, x1, y1 }] או null (דף בלי טורים ברורים / פריסה לא חד-משמעית). */
function readingRegions(gray, W, H, thr) {
  const { ink, medh } = prepInk(gray, W, H, thr || 140);
  const bands = rowBands(ink, W, H, medh), info = [];
  for (const [y0, y1] of bands) {
    const g = gutterInRect(ink, W, 0, W, y0, y1, medh, 12, 0) || gutterInRect(ink, W, 0, W, y0, y1, medh, 3.5, 1.5);
    info.push({ y0, y1, cut: g ? g.cut : null });
  }
  if (!info.some(b => b.cut !== null)) return null;
  const groups = [];
  for (const b of info) {
    const last = groups[groups.length - 1];
    if (b.cut !== null) {
      if (last && last.kind === 'zone' && Math.abs(last.cuts[last.cuts.length - 1] - b.cut) <= 0.06 * W) { last.y1 = b.y1; last.cuts.push(b.cut); }
      else groups.push({ kind: 'zone', y0: b.y0, y1: b.y1, cuts: [b.cut] });
    } else if (last && last.kind === 'block') last.y1 = b.y1;
    else groups.push({ kind: 'block', y0: b.y0, y1: b.y1, cuts: [] });
  }
  const out = [], pad = Math.floor(0.5 * medh);
  for (const gp of groups) {
    const y0 = Math.max(0, gp.y0 - pad), y1 = Math.min(H, gp.y1 + pad);
    if (gp.kind === 'block') { out.push({ kind: 'block', x0: 0, y0, x1: W, y1 }); continue; }
    const cs = gp.cuts.slice().sort((a, b) => a - b), n = cs.length, c = Math.floor(n % 2 ? cs[(n - 1) / 2] : (cs[n / 2 - 1] + cs[n / 2]) / 2);
    for (const [name, xa, xb] of [['right', c, W], ['left', 0, c]]) {
      // אם בחלק עצמו יש עוד רווח — 3 טורים ומעלה / פריסה משולבת: לא מנחשים, חוזרים להתנהגות הקודמת
      if (gutterInRect(ink, W, xa, xb, gp.y0, gp.y1, medh, 12, 0) || gutterInRect(ink, W, xa, xb, gp.y0, gp.y1, medh, 3.5, 1.5)) return null;
      out.push({ kind: name, x0: xa, y0, x1: xb, y1 });
    }
  }
  return out;
}
/** כמו readingRegions, על קנבס. הקואורדינטות בפיקסלים של הקנבס המקורי. */
function readingRegionsCanvas(src) {
  const W = src.width, H = src.height;
  if (W < 400 || H < 300) return null;
  const k = Math.min(1, 2400 / Math.max(W, H)), w = Math.max(1, Math.round(W * k)), h = Math.max(1, Math.round(H * k));
  const c = document.createElement('canvas'); c.width = w; c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true }); g.fillStyle = '#fff'; g.fillRect(0, 0, w, h); g.drawImage(src, 0, 0, w, h);
  const d = g.getImageData(0, 0, w, h).data, n = w * h, gray = new Uint8Array(n), hist = new Uint32Array(256);
  for (let i = 0; i < n; i++) { const v = (0.299 * d[4 * i] + 0.587 * d[4 * i + 1] + 0.114 * d[4 * i + 2]) | 0; gray[i] = v; hist[v]++; }
  c.width = 0;
  let acc = 0, bg = 255; for (let v = 0; v < 256; v++) { acc += hist[v]; if (acc >= n * 0.9) { bg = v; break; } }
  const regs = readingRegions(gray, w, h, Math.min(140, Math.round(bg * 0.6)));
  if (!regs) return null;
  return regs.map(r => ({ kind: r.kind, x0: Math.max(0, Math.floor(r.x0 / k)), y0: Math.max(0, Math.floor(r.y0 / k)), x1: Math.min(W, Math.ceil(r.x1 / k)), y1: Math.min(H, Math.ceil(r.y1 / k)) }));
}
if (typeof window !== 'undefined' && window.PV) window.PV.columns = { findGutter, findGutterCanvas, estimateSkew, deskewCanvas, readingRegions, readingRegionsCanvas };
if (typeof module !== 'undefined') module.exports = { findGutter, findGutterCanvas, estimateSkew, deskewCanvas, readingRegions, readingRegionsCanvas };
