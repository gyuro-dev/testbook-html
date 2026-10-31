/* ゴールデン試験。サンプルから作った「保存するデータ」「CSV」「表の見え方」「集計」を test\golden\ のファイルと比べる。
 * 時刻と乱数はハーネスが固定しているので、毎回同じものができる。
 * わざと変えたときは run.ps1 -Update で書き換え、git diff で変わり方を確かめる。 */
(() => {
  'use strict';
  const { test, golden, resetClock } = TB;
  const sample = () => { resetClock(); loadDoc(sampleDoc()); };
  const text = el => el.textContent.replace(/\s+/g, ' ').trim();
  const sheetNamed = name => sheets().find(s => s.name === name).id;

  test('ゴールデン: サンプルの保存データ（sample-data.json）', () => {
    sample();
    const d = JSON.parse(jsonParts().join(''));
    golden('sample-data.json', JSON.stringify(d, null, 1) + '\n');
  });

  test('ゴールデン: サンプルの CSV 書き出し（sample-order.csv）', async () => {
    sample();
    let got = null; window.download = (name, blob) => { got = { name, blob }; };
    S.sheet = sheetNamed('注文'); render();
    exportCsv();
    const csv = await got.blob.text(), head = [...new Uint8Array(await got.blob.slice(0, 3).arrayBuffer())];
    // Excel が読める形: 先頭に UTF-8 の BOM（text() は BOM を落とすのでバイトで見る）、行の区切りは CRLF（セルの中の改行は LF のまま）
    TB.eq(head, [0xEF, 0xBB, 0xBF], 'BOM');
    TB.ok(csv.split('\n')[0].endsWith('\r'), '行の区切りは CRLF');
    golden('sample-order.csv', `# ${got.name}\n` + csv);
  });

  test('ゴールデン: 表の見え方（sample-grid.txt）', () => {
    sample();
    S.sheet = sheetNamed('注文'); render();
    const rows = [...document.querySelectorAll('#grid tr')].map(tr =>
      [...tr.children].map(td => `[${(td.className || '').trim()}]${text(td)}`).join(' | '));
    golden('sample-grid.txt', rows.join('\n') + '\n');
  });

  test('ゴールデン: 集計の画面（sample-summary.txt）', () => {
    sample();
    renderSummary();
    const lines = [...document.querySelectorAll('#summary .card, #summary h3, #summary tr')].map(el =>
      el.tagName === 'TR' ? [...el.children].map(text).join(' | ') : (el.tagName === 'H3' ? '## ' : '') + text(el));
    golden('sample-summary.txt', lines.join('\n') + '\n');
  });

  test('ゴールデン: 競合の一覧の文言（sample-conflicts.txt）', () => {
    sample();
    const K = sheetCols(curSheet()).find(c => c.type === 'text').id;
    const base = TB.clone(D);
    const tanaka = TB.user(base, '田中', () => setF(TB.item(1), K, '田中の値'));
    const sato = TB.user(base, '佐藤', () => { setF(TB.item(1), K, '佐藤の値'); setF(TB.item(2), 'deleted', true); });
    loadDoc(TB.clone(sato)); S.me = '田中';
    mergeInto(D, tanaka);
    renderConflicts();
    const lines = [...document.querySelectorAll('#cfpanel h4, #cfpanel .cf-item')].map(el => text(el));
    resolveConflict('close');
    golden('sample-conflicts.txt', lines.join('\n') + '\n');
  });
})();
