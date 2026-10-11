/*
 * בדיקות עשן לתוסף "ספריית PDF+OCR" (jsdom + Otzaria מדומה). לא נארז לתוסף (docs/ ב-.otzignore).
 * הרצה:  cd docs/tests && npm i jsdom && node smoke.js
 * בודק חיווט וזרימות בלבד. לא מרנדר PDF ולא מריץ OCR; אין בו תחליף לבדיקה באוצריא אמיתית.
 */
const fs = require('fs');
const path = require('path');
const assert = require('assert');
const { JSDOM, VirtualConsole } = require('jsdom');

const root = path.resolve(__dirname, '..', '..');
const results = [];
function check(name, fn) {
  try { fn(); results.push([true, name]); } catch (e) { results.push([false, name + ' — ' + e.message]); }
}

// ── בדיקות סטטיות ──
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
check('manifest: שם, מחבר וגרסה', () => {
  assert.strictEqual(manifest.name, 'ספריית PDF+OCR');
  assert.strictEqual(manifest.author, 'חד בדרא ומעמע');
  assert.strictEqual(manifest.version, '4.0.0');
  assert.strictEqual(manifest.id, 'com.chadbedera.pdfviewer');
});
check('manifest: הרשאות לכל התרומות', () => {
  const need = ['reader.context_menu', 'reader.toolbar', 'reader.open', 'library.content.read', 'library.books.provide', 'app.startup_contributions', 'app.shortcuts', 'network.localhost', 'fs.user_files.read', 'fs.user_files.write'];
  need.forEach((p) => assert(manifest.permissions.includes(p), 'חסרה ' + p));
});
check('manifest: מפתחות when.storage תואמים למתגי ההגדרות', () => {
  const st = manifest.contributes.startup;
  const keys = [...st.toolbarItems, ...st.libraryBooks].map((x) => x.when.storage.key).sort();
  assert.deepStrictEqual(keys, ['showInLibrary', 'tbExtract', 'tbOpen']);
  ['set-showlib', 'set-tbopen', 'set-tbextract'].forEach((id) => assert(html.includes('id="' + id + '"'), id));
});
check('סרגל כלי הקורא נפרד משורת הלשוניות', () => {
  const dom = new JSDOM(html);
  const bar = dom.window.document.getElementById('viewer-toolbar');
  assert(bar && !bar.closest('#tabbar'), 'viewer-toolbar בתוך tabbar');
  assert(dom.window.document.querySelector('#viewer #viewer-toolbar'), 'סרגל הכלים לא בתוך הצופה');
});
check('ממשק: אין את המילה PDF מחוץ לשם התוסף', () => {
  const dom = new JSDOM(html);
  const doc = dom.window.document;
  doc.querySelectorAll('script,style').forEach((n) => n.remove());
  const txt = [doc.body.textContent].concat([...doc.querySelectorAll('[title],[aria-label],[placeholder]')].map((n) => (n.title || '') + ' ' + (n.getAttribute('aria-label') || '') + ' ' + (n.getAttribute('placeholder') || ''))).join(' ');
  const hits = (txt.replace(/ספריית PDF\+OCR/g, '').match(/PDF/g) || []);
  assert.strictEqual(hits.length, 0, 'נמצאו ' + hits.length + ' הופעות');
});

// ── Otzaria מדומה ──
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function boot(initStore, idx) {
  const store = Object.assign({}, initStore), handlers = {}, calls = [], jsErrors = [];
  const stub = {
    on(ev, fn) { handlers[ev] = fn; },
    async call(m, p) {
      calls.push([m, p]);
      if (m === 'storage.get') return { success: true, data: store[p.key] === undefined ? null : store[p.key] };
      if (m === 'storage.set') { store[p.key] = p.value; return { success: true, data: {} }; }
      if (m === 'storage.remove') { delete store[p.key]; return { success: true }; }
      if (m === 'fs.readFile') return idx ? { success: true, data: { content: idx } } : { success: false, error: { code: 'error.not_found', message: '' } };
      if (m === 'fs.listUserFolder') return { success: true, data: { entries: [{ type: 'file', path: 'ישן.pdf', name: 'ישן.pdf', size: 5 }] } };
      if (m === 'fs.writeFile') return { success: true, data: {} };
      if (m === 'library.setProviderBooks') return { success: true, data: {} };
      if (m === 'library.openBookFile') return p.bookUid === 'BAD' ? { success: false, error: { code: 'error.unsupported', message: 'x' } } : { success: true, data: { url: 'blob:fake' } };
      if (m === 'fs.resolveFileUrl') return { success: true, data: { url: 'blob:tok', name: 'x.pdf' } };
      if (m === 'reader.getCurrentState') return { success: true, data: { currentType: 'pdf', currentBookUid: 'U9', currentIndex: 7, currentBook: 'ספר ט' } };
      return { success: false, error: { code: 'error.unknown_method', message: '' } };
    }
  };
  const vc = new VirtualConsole();
  vc.on('jsdomError', (e) => { if (!/structuredClone/.test(String(e.message))) jsErrors.push(String(e.message).slice(0, 160)); });
  const dom = await JSDOM.fromFile(path.join(root, 'index.html'), {
    runScripts: 'dangerously', resources: 'usable', pretendToBeVisual: true, virtualConsole: vc,
    beforeParse(w) {
      w.Otzaria = stub;
      w.matchMedia = w.matchMedia || (() => ({ matches: false, addEventListener() {}, addListener() {} }));
      w.HTMLElement.prototype.scrollIntoView = function () {};
    }
  });
  await wait(800);
  await handlers['plugin.boot']({ theme: { mode: 'light', colorScheme: {} } });
  return { dom, store, handlers, calls, jsErrors };
}

(async () => {
  // תרחיש א: תיקיות מקוננות, ספק ספרים, ספרי ספרייה, אחרונים, קבצים מתוספים אחרים
  const A = await boot({
    folders: [
      { id: 'f1', token: 'T1', name: 'ספרים', path: 'C:\\x', scannedAt: 1, count: 2 },
      { id: 'f2', token: 'T2', name: 'a', path: 'c:/X/a/', scannedAt: 1, count: 1 },       // מקוננת בתוך f1
      { id: 'f3', token: 'T3', name: 'other', path: 'D:\\y', scannedAt: 1, count: 1 }
    ],
    settings: { restoreLast: false }
  }, JSON.stringify({ v: 2, files: { f1: [['a/שולחן ערוך.pdf', 100, null], ['ב.pdf', 50, null]], f2: [['שולחן ערוך.pdf', 100, null]], f3: [['שולחן ערוך.pdf', 100, null]] } }));
  await wait(2300);
  const { store, handlers, calls } = A;
  const sp = calls.filter((c) => c[0] === 'library.setProviderBooks');
  check('ספק: סנכרון אחד, בלי כפילות בתיקיות מקוננות, ועם קובץ באותו שם בתיקייה לא קשורה', () => {
    assert.strictEqual(sp.length, 1);
    const b = sp[0][1].books;
    assert.strictEqual(sp[0][1].provider, 'pdfocr');
    assert.strictEqual(b.length, 3, 'צפוי 3, התקבלו ' + b.length);
    assert(b.some((x) => x.categoryPath === '/other'));
  });
  check('ספק: מזהים יציבים נשמרו ב-libmap2', () => { assert.strictEqual(Object.keys(store.libmap2.items).length, 3); });

  await handlers['library.providerBook.openRequested']({ provider: 'pdfocr', id: 2, title: 'שולחן ערוך' });
  await wait(300);
  check('פתיחה מחיפוש הספרייה נרשמת באחרונים', () => { assert(store.recentFiles && store.recentFiles[0] === 'f1:a/שולחן ערוך.pdf'); });

  await handlers['plugin.page_opened']({ param: { bookUid: 'U1', name: 'ספר א', page: 3 } });
  await wait(300);
  check('ספר ספרייה נשמר (libBooks) ונכנס לאחרונים', () => {
    assert(store.libBooks.some((b) => b.key === 'b:U1'));
    assert.strictEqual(store.recentFiles[0], 'b:U1');
  });
  await handlers['plugin.page_opened']({ param: { bookUid: 'BAD', name: 'טקסט' } });
  await wait(300);
  check('ספר בלי קובץ מקומי לא נשמר ולא נשאר באחרונים', () => {
    assert(!store.libBooks.some((b) => b.key === 'b:BAD'));
    assert(!store.recentFiles.includes('b:BAD'));
  });
  await handlers['plugin.page_opened']({ param: { token: 'TK1', name: 'מהסייר.pdf' } });
  await wait(300);
  check('קובץ זמני מתוסף אחר (token) לא נשמר באחרונים ולא ב-libBooks', () => {
    assert(!store.recentFiles.includes('t:TK1'));
    assert(!store.libBooks.some((b) => b.key === 't:TK1'));
    assert(calls.some((c) => c[0] === 'fs.resolveFileUrl' && c[1].token === 'TK1'));
  });
  await handlers['app.command']({ command: 'openCurrentPdf' });
  await wait(300);
  check('קיצור Ctrl+Alt+O פותח את ספר הקורא הנוכחי', () => { assert(store.libBooks.some((b) => b.key === 'b:U9')); });
  check('אין שגיאות JS לא צפויות (תרחיש א)', () => assert.deepStrictEqual(A.jsErrors, []));

  // תרחיש ב: מיגרציה מהצופה 3.2.0 (פורמט ישן של התיקיות, בלי אינדקס)
  const B = await boot({ folders: [{ folderToken: 'OLD1', name: 'ישן', path: 'C:\\old' }] }, null);
  await wait(1500);
  check('מיגרציה: תיקיות בפורמט הישן הומרו ונסרקו מחדש', () => {
    assert(Array.isArray(B.store.folders) && B.store.folders[0].token === 'OLD1' && B.store.folders[0].id, 'לא הומר');
    assert(B.calls.some((c) => c[0] === 'fs.listUserFolder' && c[1].folderToken === 'OLD1'), 'לא נסרקה');
  });
  check('אין שגיאות JS לא צפויות (תרחיש ב)', () => assert.deepStrictEqual(B.jsErrors, []));

  let fail = 0;
  results.forEach(([ok, n]) => { if (!ok) fail++; console.log((ok ? 'עבר   ' : 'נכשל  ') + n); });
  console.log('\n' + (results.length - fail) + '/' + results.length + ' עברו');
  process.exit(fail ? 1 : 0);
})().catch((e) => { console.error('כשל בהרצה', e); process.exit(2); });
