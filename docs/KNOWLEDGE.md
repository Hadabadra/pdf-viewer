# ידע טכני — ספריית PDF+OCR

## פתיחת קובץ בודד (4.0.1)
* `openFile()` ב-js/app.js קורא ל-`fs.pickUserFile` (ראשית עם `extensions:['pdf']`, ואם נדחה בגלל פרמטרים — בלי).
* התוצאה נרשמת כרשומת extra עם `lib = {kind:'token', token}` ומפתח `t:<token>` ונפתחת דרך `openExtra`. אינה נשמרת בין הפעלות (persist=false).
* כפתורים: מסך הפתיחה, הדף הראשי, הגדרות ← תיקיות; קיצור Ctrl+O.
* שרשרת פתיחה: `openDoc` ← `resolveSource` ← `fs.resolveFileUrl` לטוקן.
