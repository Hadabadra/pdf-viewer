# צופה PDF+OCR

תוסף לאוצריא (`com.chadbedera.pdfviewer`) לפתיחת קבצי PDF, תמונה או טקסט ישירות בתוך אוצריא, ללא צורך להוסיף אותם לספרייה. לתמונות ולעמודי PDF סרוקים ללא שכבת טקסט — ניתן להריץ זיהוי טקסט (OCR) בעברית לפי דרישה.

מפתח: חד בדרא

## פיתוח ואריזה

```
.\build\pack.ps1                # אריזת patch (bump גרסה + CHANGELOG + dist\*.otzplugin)
.\build\pack.ps1 -Minor          # bump מינורי
.\build\pack.ps1 -Release        # + commit, tag, push, GitHub Release
```

פוש ל-`main` שנוגע ב-`manifest.json`/`index.html`/`vendor/**` מפעיל את `.github/workflows/publish.yml`, שמוודא, אורז ומפרסם אוטומטית לחנות אוצריא.
