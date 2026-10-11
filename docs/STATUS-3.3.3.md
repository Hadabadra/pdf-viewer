# צופה PDF+OCR 3.3.3 (עודכן 2026-10-12)

ענף: viewer-3.3.3 (מבוסס על התג v3.2.0). מזהה: com.chadbedera.pdfviewer. התוסף המאוחד נמצא ב-main כתוסף נפרד (com.chadbedera.pdfocrlibrary, גרסה 4.0.1, פורסם 2026-10-12, ממתין לאישור מנהל החנות).

## שונה ב-3.3.3
* vendor/cmaps (pdfjs-dist 3.11.174) + cMapUrl/cMapPacked ב-getDocument: פותר כתב לא ברור/משובש בגופני CID ובגופנים לא מוטבעים.
* רינדור בדגימת־יתר: max(dpr, 2) עם תקרת 24 מגה-פיקסל לקנבס.
* לא נבדק על אוצריא אמיתית, רק תחביר.

## פרסום
* ה-workflow מפרסם אוטומטית רק מ-main. לענף הזה: Actions ← publish ← Run workflow על viewer-3.3.3 עם publish=true.
* אחרי כל פרסום: לבדוק שנוצר Release.
