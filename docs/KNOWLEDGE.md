
## צימוד לגשר וחיפוש קבצים (4.4.4)
- גשר 3.x דורש `X-Otzaria-Token` לכל נתיב חוץ מ-GET /health; בלי צימוד OCR נכשל עם קוד `unpaired` אף שהגשר נראה מחובר.
- `PV.bridge.pair()` (`/pair/request`, timeout עד 120000) שומר מפתח ב-storage (`bridgeToken`). צימוד רק ביוזמת המשתמשת, לא בבדיקת רקע.
- `PV.bridge.search` קורא NDJSON של `/fs/search`; `readFile` קורא `/fs/read` (עד 50MB) ופותח דרך `PV.files.openUrl`. לא נבדק על Windows אמיתי.
