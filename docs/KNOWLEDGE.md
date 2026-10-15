
## צימוד לגשר וחיפוש קבצים (4.4.4)
- גשר 3.x דורש `X-Otzaria-Token` לכל נתיב חוץ מ-GET /health; בלי צימוד OCR נכשל עם קוד `unpaired` אף שהגשר נראה מחובר.
- `PV.bridge.pair()` (`/pair/request`, timeout עד 120000) שומר מפתח ב-storage (`bridgeToken`). צימוד רק ביוזמת המשתמשת, לא בבדיקת רקע.
- `PV.bridge.search` קורא NDJSON של `/fs/search`; `readFile` קורא `/fs/read` (עד 50MB) ופותח דרך `PV.files.openUrl`. לא נבדק על Windows אמיתי.

## 4.6.1 — בסיס השותף + חיפוש במחשב חי
- הענף viewer-3.3.3 מבוסס מ-4.6.0 על קובץ השותף „חד צורבא“; רישיונות vendor/cmaps ו-vendor/standard_fonts נשמרים מהמאגר (לא בקובץ שלו).
- חיפוש במחשב: `PV.bridge.initLiveSearch(input, ul, wrap)` (מאותחל ב-app.js על #pc-search במסך הפתיחה). אין חלון ואין קיצור; Ctrl+Shift+O שמור ל-OCR עמוד (capture handler בסוף app.js).
- `PV.listNav(input, list, {onEscape})` — ניווט חיצים לכל רשימת `.list-item`; להוסיף לכל שורת חיפוש חדשה.
- `PV.dispName` מסיר ‎.pdf בתצוגה בלבד (makeItem, לשוניות). `.search-results` = רשימה עם שבירת שורות ו-`body.hide-search-path`.
- DOCX: parts[0].blocks = [{h, runs:[{t,b}]}], ו-viewer.js מצייר אותם; `text` נשמר לחיפוש/העתקה.
