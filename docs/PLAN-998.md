# תוכנית: צופה PDF+OCR לאוצריא 0.9.98

מקור הידע: `docs/plugin-sdk/spec.json` ו-`API_REFERENCE.md` בענף `dev` של Otzaria/otzaria; סיכום מלא ב-`docs/SDK-998-OPPORTUNITIES.md` בענף `כלי-מערכת` של madaei-hatanach.

## שלב 1 — 2.7.0 (בוצע)
- [x] `minAppVersion: 0.9.98`, הסרת `app.run_on_startup`.
- [x] כפתור "פתח ב-PDF+OCR" בקורא PDF → `library.openBookFile` → טעינת הקובץ עצמו (בלי העתקה).
- [x] `plugin.page_opened` עם `param: { name, url | dataUrl }` — קבלת קבצים מ"סייר קבצים".
- [x] משוב דרך `feedback.report`, ודוא״ל כגיבוי.
- [x] ‏CI: ענף `upgrade-998` = ולידציה בלבד, בלי פרסום ובלי Release; מיזוג ל-main = פרסום אוטומטי.

## שלב 2 — 2.8.0
- [ ] מעבר לעמוד הנוכחי של הספר כשנפתח מהקורא (אם `currentRef` הוא מספר עמוד).
- [ ] `ui.exportPdf` / `ui.print` לתוצאת OCR (דף טקסט נקי).
- [ ] `app.registerShortcut` + `app.command`: ‏OCR לעמוד הנוכחי מהמקלדת.
- [ ] "אחרונים" עם tokens יציבים של `fs.pickUserFile` במקום IndexedDB של handles.
- [ ] `app.getLocale` + `settings.changed`: ממשק באנגלית (כמו בכלי המערכת: `i18n.js` + `lang-en.js`).

## שלב 3 — עיצוב ונוחות
- [ ] `fonts.resolveFamilies`: גופן הקריאה של המשתמש בחלונית הטקסט.
- [ ] `app.getConnectivity`: להסתיר הורדת שפות OCR כשאין רשת.
- [ ] `app.getGrantedPermissions` + `plugin.permissions_changed`: הודעה ברורה כשהרשאה כובתה.
