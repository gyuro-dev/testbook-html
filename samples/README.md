# Samples

[日本語](README.ja.md)

Ready-made testbook files. Open any of them in Edge or Chrome. Nothing to install.

| File | What it shows |
| --- | --- |
| `shop-ja.html` / `shop-en.html` | The same sample as "try the sample" in the app: two case sheets, a free sheet with the description and a metrics card, two runs, an evidence board with a screenshot, frame, arrow and log, a result history and an open comment. |
| `api-ja.html` / `api-en.html` | A second, smaller test (API) with two runs and a log on an evidence board. Use it to try "import" or "merge" against the shop file. |
| `dashboard-ja.html` / `dashboard-en.html` | A free sheet only: the metrics cards of the two files above and a "grand total" card. Drop `shop-*.html` or `api-*.html` on it again to refresh the numbers. |

`-ja` files have Japanese content, `-en` files English content; the UI language follows the browser and can be switched from the ⋯ menu.

These files are generated from `testbook.html` by `test/tests/samples.js`, and a test fails when they differ from the current app. Do not edit them by hand; run the tests with `-Update` (`--update`) instead.
