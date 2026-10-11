# פרומפט להמשך העבודה בשיחה חדשה

המשך עבודה על איחוד "צופה PDF+OCR" (חד בדרא) עם "ספריית PDF" (מעמע) לתוסף אחד: **ספריית PDF+OCR**, גרסה 4.0.0, מחברים "חד בדרא ומעמע".

**קרא רק:**
1. https://github.com/e0548433917-gif/pdf-viewer/blob/unified-pdf-library/docs/UNIFY-PLAN.md (תכנית, החלטות, שלבים, טבלת הערות הפורום)
2. docs/PROGRESS.md ו-docs/ROADMAP.md בריפו e0548433917-gif/otzaria-system-tools (ענף main), שכפול עם --depth 1.

**ריפואים:** e0548433917-gif/pdf-viewer (עבודה בענף `unified-pdf-library`) ו-e0548433917-gif/otzaria-system-tools (main, לתיעוד). אם אין הרשאת דחיפה, בקש אותה עם add_repo (access: push) לשני הריפואים.

**מצב:** שלב 7.1 בוצע (בסיס = קוד מעמע 1.5.0 + manifest, מזהה `com.chadbedera.pdfviewer`). ממשיכים מהשלב הראשון שאינו "בוצע" ב-UNIFY-PLAN: 7.2 הערות הפורום, 7.3 OCR (Tesseract + גשר Windows, מקור ב-commit `479fbe0` של pdf-viewer), 7.4 חיפוש בספרייה/אחרונים/פתיחה בעמוד הנוכחי/גשר, 7.5 כפילות אינדוקס מול אוצריא, 7.6 CHANGELOG ובדיקות.

**קבצי ייחוס:** קוד הצופה הישן (3.2.0): `git show 479fbe0:js/ocr.js` (וכן bridge.js, capture.js, files.js, find.js, core.js, viewer.js, manifest.json). קובץ התוסף של מעמע: .otzplugin (zip). ב-1.5.0 כבר יש אחרונים/נעוצים, אייקון התאמה לגובה וכפתור מסך מלא צף.

**כללים:**
- עבוד ישירות על הגיט, קומיט ופוש אחרי כל שלב ועדכון docs/PROGRESS.md (ו-UNIFY-PLAN).
- קומיטים בשם Claude <noreply@anthropic.com>.
- חיפוש בקבצים רק עם grep ו-sed.
- בלי שינויים מחוץ לתחום המשימה.
- ⚠️ דחיפה ל-main (או upgrade-998) ב-pdf-viewer שנוגעת ב-manifest/index.html/vendor/CHANGELOG מפעילה פרסום אוטומטי לחנות. עובדים רק בענף `unified-pdf-library`; מיזוג ל-main רק באישור מפורש.
- שם התוסף "ספריית PDF+OCR" נשאר; מסירים את המילה "PDF" משאר הממשק.

**שאלות פתוחות לברר (כבר רשומות ב-ROADMAP של כלי המערכת, מחוץ למשימה):** קישורים אוטומטיים לאוצר החכמה/בר אילן/כתבי הקודש בהגדרות הנעילה; מעבר אוטומטי למסך מלא בנעילה; באג "יומן שינויים" בסייר ("לא ניתן לפתוח את הקישור").
