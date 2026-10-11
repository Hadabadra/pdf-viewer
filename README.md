# ספריית PDF+OCR

תוסף לאוצריא (`com.chadbedera.pdfviewer`) שמאחד את „צופה PDF+OCR“ (חד בדרא) ואת „ספריית PDF“ (מעמע). טוען תיקייה (או כמה) פעם אחת, מאתר מסמך לפי חלק מהשם, וקורא אותו בלשוניות עם זום, תוכן עניינים וחיפוש בתוך המסמך. לעמודים סרוקים ללא שכבת טקסט אפשר להריץ זיהוי טקסט (OCR) בעברית. התוסף משתלב עם הספרייה של אוצריא: הקבצים שלכם מופיעים בחיפוש הספרייה, וספרי PDF מהספרייה נפתחים כאן בעמוד הנוכחי.

מחברים: חד בדרא ומעמע

תכנית האיחוד והסטטוס: [`docs/UNIFY-PLAN.md`](docs/UNIFY-PLAN.md)

## בדיקות

בדיקות עשן (jsdom עם אוצריא מדומה; בודקות חיווט וזרימות, לא רינדור ולא OCR):

```
cd docs/tests && npm i jsdom && node smoke.js
```

## פיתוח ואריזה

```
.\build\pack.ps1                # אריזת patch (bump גרסה + CHANGELOG + dist\*.otzplugin)
.\build\pack.ps1 -Minor          # bump מינורי
.\build\pack.ps1 -Release        # + commit, tag, push, GitHub Release
```

פוש ל-`main` שנוגע ב-`manifest.json`/`index.html`/`vendor/**` מפעיל את `.github/workflows/publish.yml`, שמוודא, אורז ומפרסם אוטומטית לחנות אוצריא. עובדים בענף `unified-pdf-library`; מיזוג ל-`main` רק באישור מפורש.
