# צופה PDF+OCR 3.3.3 (עודכן 2026-10-12)

ענף: viewer-3.3.3 (מבוסס על התג v3.2.0). מזהה: com.chadbedera.pdfviewer. התוסף המאוחד נמצא ב-main כתוסף נפרד (com.chadbedera.pdfocrlibrary, גרסה 4.0.1, פורסם 2026-10-12, ממתין לאישור מנהל החנות).

## שונה ב-3.3.3
* vendor/cmaps (pdfjs-dist 3.11.174) + cMapUrl/cMapPacked ב-getDocument: פותר כתב לא ברור/משובש בגופני CID ובגופנים לא מוטבעים.
* רינדור בדגימת־יתר: max(dpr, 2) עם תקרת 24 מגה-פיקסל לקנבס.
* לא נבדק על אוצריא אמיתית, רק תחביר.

## פרסום
* ה-workflow מפרסם אוטומטית רק מ-main. לענף הזה: Actions ← publish ← Run workflow על viewer-3.3.3 עם publish=true.
* אחרי כל פרסום: לבדוק שנוצר Release.

## 3.4.0 (2026-10-12)
* התאמה לגובה, חיצים מעבירים עמוד בכל מצבי ההתאמה, סרגל חיפוש צר יותר.
* לא נעשה בצופה הישן: לשוניות, זיכרון לשוניות, מסך מלא מורחב, קיצורי לשוניות, הסרת "PDF" מהממשק, מצב יד, גודל חלונית. אלה קיימים בתוסף המאוחד ב-main (4.0.1). הפורום (post/43255) המליץ לבנות על המאוחד.
* פרסום: Actions ← publish ← Run workflow על viewer-3.3.3, publish=true.

## 3.5.0 (2026-10-12) — הערות פורום post/43381
* ידיות שינוי רוחב לסרגל הצד ולחלונית הטקסט (נשמר ב-localStorage, dblclick מאפס).
* Ctrl+E / Ctrl+R: מאזין בשלב הלכידה (window, capture) עם stopImmediatePropagation.
* תפריט החילוץ: שמות ברורים, "OCR לאזור מסומן" ראשון.
* מתג "מסמך בשני טורים" (settings.ocrCols): חיתוך הקנבס לשני חצאים, ימין ואז שמאל.
* שאלת "מה להוריד ל-OCR של Windows": גשר אוצריא 1.5+ (בהגדרות ← OCR יש כפתור הורדה) וחבילת OCR לעברית ב-Windows.
* לא נבדק באוצריא אמיתית, רק תחביר JS.
* נשאר בתוסף המאוחד (main, 4.0.1): לשוניות, זיכרון לשוניות, מסך מלא מורחב, מצב יד, הסרת "PDF" מכל הממשק.

## 3.5.1
* מה חדש בתוך התוסף (אודות) עודכן, עם קישורי פורום. Releases לגרסאות 3.3.3–3.5.1 נוצרו ידנית (ה-workflow יוצר Release רק מ-main).

## 3.5.2
* אותיות משובשות עדיין ב-3.5.1 (צילום משתמשת). תיקון: getDocument עם useSystemFonts:false + disableFontFace:true. אם עדיין משובש — להשוות לטעינת pdf.js בתוסף המאוחד (worker מ-blob, js/app.js ensureWorkerBlob).

## 4.5.0
* שולבו תיקוני השותף (קובץ .otzplugin שסומן 3.7.0, בסיסו 3.6.0) על 4.4.5 בענף viewer-3.3.3.
* OCR דרך הגשר: B.snipRecognizeCanvas → /oneocr/recognize (JPEG 0.95, מהיר מ-PNG), נפילה ל-/snip/ocr. B.directAvailable → /oneocr/status. בצד הגשר: OneOcrApi.cs ו-Server.cs ב-otzaria-system-tools/bridge — **לא לשנות את OneOcrApi.cs בלי מדידת מהירות** (קריטי לזמן ~1 שנ׳ לעמוד).
* באג שתוקן: processAll השתמש ב-getPageText גם כש-useOcr=true.
* לא נבדק באוצריא אמיתית, רק תחביר JS ובדיקת מזהי DOM.
