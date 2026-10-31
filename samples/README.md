# Samples

[日本語](README.ja.md)

Ready-made testbook files. The links below open them right in the browser (opening a file from the GitHub file list shows its HTML source instead). To keep a copy, press `Ctrl+S` on the opened page and save it as a file. Nothing to install.

| File | What it shows |
| --- | --- |
| [shop-ja.html](https://gyuro-dev.github.io/testbook-html/samples/shop-ja.html) / [shop-en.html](https://gyuro-dev.github.io/testbook-html/samples/shop-en.html) | The same sample as "Try the sample" in the app: two case sheets, a free sheet with the description and a metrics card, two runs, an evidence board with a screenshot, frame, arrow and log, a result history and an open comment. |
| [api-ja.html](https://gyuro-dev.github.io/testbook-html/samples/api-ja.html) / [api-en.html](https://gyuro-dev.github.io/testbook-html/samples/api-en.html) | A second, smaller test (API) with two runs and a log on an evidence board. Use it to try importing a different test file (its sheets are added) into the shop file. |
| [dashboard-ja.html](https://gyuro-dev.github.io/testbook-html/samples/dashboard-ja.html) / [dashboard-en.html](https://gyuro-dev.github.io/testbook-html/samples/dashboard-en.html) | A free sheet only: the metrics cards of the two files above and a "grand total" card. Drop `shop-*.html` or `api-*.html` on it again to refresh the numbers. |

`-ja` files have Japanese content, `-en` files English content; the UI language follows the browser and can be switched from the ⋯ menu.

These files are generated from `testbook.html` by `test/tests/samples.js`, and a test fails when they differ from the current app. Do not edit them by hand; run the tests with `-Update` (`--update`) instead.
