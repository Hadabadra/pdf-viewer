# ידע טכני — ספריית PDF+OCR

## פתיחת קובץ בודד (4.0.1)
* `openFile()` ב-js/app.js קורא ל-`fs.pickUserFile` (ראשית עם `extensions:['pdf']`, ואם נדחה בגלל פרמטרים — בלי).
* התוצאה נרשמת כרשומת extra עם `lib = {kind:'token', token}` ומפתח `t:<token>` ונפתחת דרך `openExtra`. אינה נשמרת בין הפעלות (persist=false).
* כפתורים: מסך הפתיחה, הדף הראשי, הגדרות ← תיקיות; קיצור Ctrl+O.
* שרשרת פתיחה: `openDoc` ← `resolveSource` ← `fs.resolveFileUrl` לטוקן.

## מזהה ועיצוב (4.0.1)
* מזהה התוסף: com.chadbedera.pdfocrlibrary (נפרד מהצופה com.chadbedera.pdfviewer 3.2.0, שיש בו גרירה/הדבקה/תמונות/DOCX/EPUB/הדפסה).
* חנות אוצריא דוחה תגית „מראה תואם“ אם ב-css יש hex/rgba/font-family/border-radius בפיקסלים מחוץ ל-:root. להשתמש ב-var(--color-*), var(--font-ui), var(--radius-*).

## צימוד לגשר וחיפוש קבצים (4.1.0)
- גשר 3.x דורש `X-Otzaria-Token` לכל נתיב חוץ מ-GET /health. לכן /health "מחבר" גם בלי צימוד, ו-OCR נכשל עם קוד `unpaired`.
- `OcrBridge.pair()` שולח `/pair/request` (timeout מקסימלי 120000) ושומר את המפתח ב-`storage` (`bridgeToken`). צימוד אוטומטי רק בפעולה ביוזמת המשתמשת; `checkOcr` ברקע לא מצמיד.
- `OcrBridge.search` קורא את NDJSON של `/fs/search` בחתיכות; `readPdf` קורא `/fs/read` (עד 50MB) ופותח כ-data URL (kind 'url'). לא נבדק על Windows אמיתי.
