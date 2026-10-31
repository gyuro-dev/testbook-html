# サンプル

[English](README.md)

testbook で作った、すぐに開けるサンプルのファイルです。\
下のリンクを押すと、ブラウザでそのまま開けます（GitHub の一覧からファイルを開くと、HTML のソースが表示されます）。\
手元に置きたいときは、開いたページで `Ctrl+S` を押すと、ファイルとして保存できます。

| ファイル | 内容 |
| --- | --- |
| [shop-ja.html](https://gyuro-dev.github.io/testbook-html/samples/shop-ja.html) / [shop-en.html](https://gyuro-dev.github.io/testbook-html/samples/shop-en.html) | アプリの「サンプルで試す」と同じ内容です。試験項目のシート2枚、試験の説明と集計カードを置いた自由シート、2つの実施回、スクリーンショット・枠・矢印・ログを置いたエビデンス票、結果の履歴、未解決のコメントが入っています。 |
| [api-ja.html](https://gyuro-dev.github.io/testbook-html/samples/api-ja.html) / [api-en.html](https://gyuro-dev.github.io/testbook-html/samples/api-en.html) | API を対象にした、小さな2つ目の試験です。2つの実施回と、ログを置いたエビデンス票が入っています。shop のファイルに別の試験ファイルとして取り込む（シートごと取り込む）操作を試すのにも使えます。 |
| [dashboard-ja.html](https://gyuro-dev.github.io/testbook-html/samples/dashboard-ja.html) / [dashboard-en.html](https://gyuro-dev.github.io/testbook-html/samples/dashboard-en.html) | 自由シートだけのファイルです。上の2つの試験の集計カードと、それらを合計した「全部の合計」のカードを置いています。`shop-*.html` や `api-*.html` をこのシートにもう一度ドラッグすると、数字が最新になります。 |

ファイル名が `-ja` のものは内容が日本語、`-en` のものは内容が英語です。\
画面の言葉はブラウザの言語設定に合わせて表示し、⋯ メニューで切り替えられます。

これらのファイルは、自動試験（`test/tests/samples.js`）が `testbook.html` から作ります。\
今のアプリから作ったものと内容が違うと、試験が失敗します。\
手で編集せず、試験を `-Update`（`--update`）付きで実行して作り直してください。
