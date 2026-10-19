# ידע טכני — ספריית PDF+OCR

## פתיחת קובץ בודד (4.0.1)
* `openFile()` ב-js/app.js קורא ל-`fs.pickUserFile` (ראשית עם `extensions:['pdf']`, ואם נדחה בגלל פרמטרים — בלי).
* התוצאה נרשמת כרשומת extra עם `lib = {kind:'token', token}` ומפתח `t:<token>` ונפתחת דרך `openExtra`. אינה נשמרת בין הפעלות (persist=false).
* כפתורים: מסך הפתיחה, הדף הראשי, הגדרות ← תיקיות; קיצור Ctrl+O.
* שרשרת פתיחה: `openDoc` ← `resolveSource` ← `fs.resolveFileUrl` לטוקן.

## מזהה ועיצוב (4.0.1)
* מזהה התוסף: com.chadbedera.pdfocrlibrary (נפרד מהצופה com.chadbedera.pdfviewer 3.2.0, שיש בו גרירה/הדבקה/תמונות/DOCX/EPUB/הדפסה).
* חנות אוצריא דוחה תגית „מראה תואם“ אם ב-css יש hex/rgba/font-family/border-radius בפיקסלים מחוץ ל-:root. להשתמש ב-var(--color-*), var(--font-ui), var(--radius-*).

## 5.8.0 — "פתח באמצעות", כלי PDF, גרסת הגשר (20.10.2026)
- **גרסת הגשר:** אחת שאלתי התחיל מספור מחדש ב-1.0.0 (18.10.2026). `B.versionLt` ממפה 1.x/2.x מעל 3.x. `PV.BRIDGE_MIN=1.0.1`, `PV.BRIDGE_OPENWITH_MIN=1.0.2`, `PV.BRIDGE_WRITE_MIN=1.0.0`. קישור ההורדה: Hadabadra/achat-shaalti.
- **"פתח באמצעות":** הגשר (1.0.2, `PdfAssoc.cs`) נרשם ב-HKCU; `OtzariaBridge.exe --open-pdf` כותב לתור ופותח `otzaria://open/plugin/com.chadbedera.pdfviewer`. התוסף שולף `/pdf/inbox/list` ומאשר `/pdf/inbox/ack` (`B.startInbox` — בעלייה, כל 3 שנ' כשהמסך גלוי, וב-`plugin.resumed`). הקובץ נפתח ב-`B.openDiskFile` ומקבל `V.doc.diskPath`, ש-`Fs.diskPath` מחזיר — כך גם "פתיחה בתוכנה אחרת" עובדת.
- **כלי PDF (`js/pdftools.js`):** pdf-lib בתוסף לפעולות עמודים; פעולות מנוע דרך `/pdf/engines` (כל תוכנה מותקנת עם רשימת הפעולות שלה) ו-`/pdf/op/begin|chunk|run|read|end` (עם `engine` לבחירה) בגשר: Ghostscript (גם של PDF24), qpdf, MuPDF, PDFtk, Poppler, LibreOffice, Word (COM). בכל כלי ⚙ מוצגת בחירת "תוכנה במחשב" מבין המתאימות. שמירה: חלון Windows דרך הגשר, אחרת חלון אוצריא, אחרת הורדה. טקסט עברי (מספור/סימן מים) מצויר כתמונה כי לגופני pdf-lib אין עברית.
