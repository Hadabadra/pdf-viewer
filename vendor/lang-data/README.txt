Tesseract LSTM models bundled with the plugin, as scrambled (XOR) base64 split into <code>.<n>.js chunks of ~0.9MB;
js/ocr.js loads the chunks with script tags, joins and decodes them. (The plugin can only load scripts, not read arbitrary files,
and single big .js files made installing the plugin fail with "Stack Overflow".)
- heb_best: Hebrew, "best" (accurate). Source: https://github.com/tesseract-ocr/tessdata_best (Apache-2.0).
  The fast Hebrew model (tessdata_fast heb) is built into vendor/ocr-worker-loader.js.
- heb_rashi (accurate) = the plugin author's trained model "heb_rashi_plus" (float LSTM).
  heb_rashi_fast = the plugin author's trained model "heb_rashi_all" (as uploaded, float LSTM).
  Both were trained from the Hebrew Rashi model of the Pninim project (https://gitlab.com/pninim.org/tessdata_heb_rashi,
  Zeev Pekar, Apache-2.0, see LICENSE_heb_rashi).
