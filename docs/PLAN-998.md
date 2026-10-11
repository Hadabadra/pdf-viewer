# תוכנית: צופה PDF+OCR לאוצריא 0.9.98

מקור הידע: `docs/plugin-sdk/spec.json` ו-`API_REFERENCE.md` בענף `dev` של Otzaria/otzaria; סיכום מלא ב-`docs/SDK-998-OPPORTUNITIES.md` בענף `כלי-מערכת` של madaei-hatanach.

## שלב 1 — 2.7.0 (בוצע)
- [x] `minAppVersion: 0.9.98`, הסרת `app.run_on_startup`.
- [x] כפתור "פתח ב-PDF+OCR" בקורא PDF → `library.openBookFile` → טעינת הקובץ עצמו (בלי העתקה).
- [x] `plugin.page_opened` עם `param: { name, url | dataUrl }` — קבלת קבצים מ"סייר קבצים".
- [x] משוב דרך `feedback.report`, ודוא״ל כגיבוי.
- [x] ‏CI: ענף `upgrade-998` = ולידציה בלבד, בלי פרסום ובלי Release; מיזוג ל-main = פרסום אוטומטי.

## שלב 2 — 2.8.0
- [x] מעבר לעמוד הנוכחי של הספר כשנפתח מהקורא (אם `currentRef` הוא מספר עמוד).
- [x] `ui.exportPdf` / `ui.print` לתוצאת OCR (דף טקסט נקי).
- [x] `app.registerShortcut` + `app.command`: ‏OCR לעמוד הנוכחי מהמקלדת.
- [x] "אחרונים" עם tokens יציבים של `fs.pickUserFile` במקום IndexedDB של handles.
- [x] `app.getLocale` + `settings.changed`: ממשק באנגלית (כמו בכלי המערכת: `i18n.js` + `lang-en.js`).

## שלב 3 — עיצוב ונוחות
- [x] `fonts.resolveFamilies`: גופן הקריאה של המשתמש בחלונית הטקסט.
- [x] `app.getConnectivity`: להסתיר הורדת שפות OCR כשאין רשת.
- [x] `app.getGrantedPermissions` + `plugin.permissions_changed`: הודעה ברורה כשהרשאה כובתה.

## 3.0.0 (בוצע)
כל שלבי 2–3 נכנסו בעיצוב החדש. מבנה: `css/app.css`, `js/{core,viewer,find,ocr,files,capture,app,icons,lang-en}.js`. ספק ספרים `pdfocr` (מיפוי id→קובץ ב-storage `libmap`). APIs של 0.9.99 (`reader.printRange`, `feedback.submitBookCorrection`) ממתינים לגרסה רשמית — האורז חוסם API חדש מ-minAppVersion.
בדיקה מקומית: `node otzaria-plugin-validator/src/cli.js . --fail-on-warnings`.

## OCR של Windows דרך גשר אוצריא (תלוי בגשר)
**סטטוס: בוצע בגרסה 3.1.0 (קוד); נקודות הקצה בגשר הן `/ocr/status` ו-`/ocr/recognize` (גשר 1.5). מבחן השוואה על טקסטים תורניים נשאר לבדיקה על Windows אמיתי.**
**התנאי להתחלה (התקיים):** נקודת הקצה `POST /ocr` קיימת בגשר (ריפו e0548433917-gif/otzaria-system-tools, `docs/ROADMAP.md`).
משימות בצופה, אחרי שהגשר שוחרר:
1. הרשאה `network.localhost` ובדיקת זמינות הגשר והמנוע (חבילת שפה לעברית).
2. אפשרות חדשה בבחירת מנוע ה-OCR: "OCR של Windows (דרך הגשר)", מוצגת רק כשהגשר זמין.
3. שליחת תמונת עמוד לגשר וקבלת טקסט ומיקומי מילים, באותו מבנה שבו המנוע הנוכחי מחזיר תוצאות.
4. מבחן השוואה על טקסטים תורניים (ניקוד, רש"י, דפוסים ישנים) ואז החלטה על ברירת מחדל.
5. גרסה 2.8.0 או הבאה אחריה, פרסום לחנות באישור.
בלי הגשר או בלי חבילת השפה: חוזרים למנוע הקיים בלי הודעת שגיאה.
