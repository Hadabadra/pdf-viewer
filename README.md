# ספריית PDF+OCR

> **⏸ הפיתוח מושהה (מ-16.11.2026 עד ~מאי 2027).** לא יוצאות גרסאות חדשות בתקופה הזו. אפשר להמשיך לשלוח דיווחים ובקשות לפיצ'רים — הם נשמרים ב-Issues ויטופלו בחזרה.
> **מחכים למי שרוצה להמשיך בפיתוח!** קוד המקור: https://github.com/Hadabadra/pdf-viewer · בקשת הצטרפות לפיתוח: https://github.com/Hadabadra/pdf-viewer/issues/new?title=%D7%91%D7%A7%D7%A9%D7%AA%20%D7%94%D7%A6%D7%98%D7%A8%D7%A4%D7%95%D7%AA%20%D7%9C%D7%A4%D7%99%D7%AA%D7%95%D7%97

תוסף לאוצריא (`com.chadbedera.pdfocrlibrary`) שמאחד את „צופה PDF+OCR“ (חד בדרא) ואת „ספריית PDF“ (מעמע). טוען תיקייה (או כמה) פעם אחת, מאתר מסמך לפי חלק מהשם, וקורא אותו בלשוניות עם זום, תוכן עניינים וחיפוש בתוך המסמך. לעמודים סרוקים ללא שכבת טקסט אפשר להריץ זיהוי טקסט (OCR) בעברית. התוסף משתלב עם הספרייה של אוצריא: הקבצים שלכם מופיעים בחיפוש הספרייה, וספרי PDF מהספרייה נפתחים כאן בעמוד הנוכחי.

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
