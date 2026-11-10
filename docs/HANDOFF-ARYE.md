# העברה לאריה (@arye000001-boop) — צופה PDF+OCR

עודכן: 10.11.2026. הפיתוח של חד בדרא מושהה עד ~מאי 2027. הקוד של הצופה נמצא בטיפולו של אריה, ולכן בסבב הסיום לא שונה בו קוד.
**הגרסה בחנות: 5.8.0.** כל הפניות שלהלן נבדקו מול 5.8.0. מה שתוקן נסגר, והשאר הועבר לכאן עם תיוג ואז נסגר, כדי שהרשימה כולה תהיה במקום אחד.

## תוקן כבר ב-5.8.0 או בגשר (נסגר)
- [#3](https://github.com/Hadabadra/pdf-viewer/issues/3) — "פתח באמצעות" של Windows ישירות בתוסף: ב-5.8.0 (דורש גשר 1.0.2 ומעלה).
- [#81](https://github.com/Hadabadra/pdf-viewer/issues/81) — גשר 1.0.x זוהה בטעות כ"ישן": תוקן ב-5.8.0.
- [#83](https://github.com/Hadabadra/pdf-viewer/issues/83) — שגיאה בהורדת עדכון הגשר: תוקן בגשר אחת שאלתי 1.0.4/1.0.5 (העדכון לקח Release בלי OtzariaBridge.exe).

## לטיפול אריה
- [#84](https://github.com/Hadabadra/pdf-viewer/issues/84) — OCR של התוסף כברירת מחדל גם בקורא ה-PDF המובנה של אוצריא, בלי לפתוח את התוסף.
- [#82](https://github.com/Hadabadra/pdf-viewer/issues/82) — לא מזהה טורים: מסמך עם כמה טורים נקרא כטור אחד.
- [#80](https://github.com/Hadabadra/pdf-viewer/issues/80) — ייצוא הטקסט לתוסף "וורד לאוצריא" (מקבל { name, dataUrl }); מנוע רש"י המובנה לא נפתח אצל המשתמש.
- [#2](https://github.com/Hadabadra/pdf-viewer/issues/2) — הטקסט שחולץ מחולק לשורות כל כמה מילים; לאפשר העתקת טקסט רציף ושליחה לוורד.
- [#1](https://github.com/Hadabadra/pdf-viewer/issues/1) — מנוע כתב רש"י חלש; כפתור הגדרות לבחירת מנוע ליד "חילוץ"; חלונית הטקסט זהה בכל הלשוניות ולא תלויה במסמך; Ctrl+V לא עובד; להוסיף מידע לחלונית "אודות".
- [#85](https://github.com/Hadabadra/pdf-viewer/issues/85) — (מייל) OCR לכתב יד עברי? סעיפי STT ו-AI מקומי אינם בתחום הצופה, ונשמרו כרעיון בלבד.
- [PR #4](https://github.com/Hadabadra/pdf-viewer/pull/4) — מסמך תכנון (docs/PDF-HANDLER-PLAN.md): פתיחה במטפל PDF, תוכנות חיצוניות ופעולות על קבצים. נשאר פתוח לבדיקה ולמיזוג.
