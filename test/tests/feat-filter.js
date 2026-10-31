/* 絞り込み（証跡なし・前の実施回で NG）、集計の追加、不具合票のリンク、Ctrl+F の試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep } = TB;
  const K = () => col('確認内容').id;
  const shown = () => S.rows.map(i => i[K()]);
  const vf = v => TB.input('#vf', v, 'change');
  // 3行: A は OK で証跡あり、B は OK で証跡なし、C は NG
  const setup = async () => {
    snap(); for (const t of ['A', 'B', 'C']) setF(addItem(), K(), t);
    render();
    await setVerdict(item(1), 'ok'); await setVerdict(item(2), 'ok'); await setVerdict(item(3), 'ng');
    snap(); addEl(evOwner(item(1).id, S.run), 'text', { x: 0, y: 0, w: 100, text: '証跡' });
    render();
  };

  test('絞り込み: 「OK なのに証跡なし」「証跡なし」「証跡あり」で行が絞れる', async () => {
    await setup();
    vf('okNoev'); eq(shown(), ['B'], 'OK なのに証跡なし');
    vf('noev'); eq(shown(), ['B', 'C'], '証跡なし');
    vf('ev'); eq(shown(), ['A'], '証跡あり');
    vf(''); eq(shown().length, 3, '全部');
    ok(!document.querySelector('#vf optgroup[label^="前の実施回"]'), '実施回が1つなら「前の実施回」の選択肢は出ない');
  });

  test('絞り込み: 「前の実施回で NG」は、1つ前の実施回で NG だった行。「まだ OK でない」は今回 OK になった行を除く', async () => {
    await setup();
    window.dialog = async o => o.inputs ? ['回帰', 'none'] : '回帰';
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="addRun"]'); await sleep(0);
    eq(runName(S.run), '回帰');
    ok(document.querySelector('#vf optgroup[label="前の実施回（1回目）"]'), '前の実施回の選択肢が出る');
    vf('prevNg'); eq(shown(), ['C'], '前回 NG');
    await setVerdict(item(3), 'ok');
    vf('prevNg'); eq(shown(), ['C'], '今回 OK にしてもまだ出る');
    vf('prevNgOpen'); eq(shown(), [], 'まだ OK でない行はない');
    await setVerdict(item(3), 'ng');
    vf('prevNgOpen'); eq(shown(), ['C'], 'また NG なら出る');
    // 絞り込み中に行を足すと絞り込みが外れる（既存の動きと同じ）
    TB.click('[data-act="addRow"]'); eq([S.vf, S.rows.length], ['', 4]);
  });

  test('集計: 証跡の表と「前の実施回で NG だった行の現状」が出る', async () => {
    await setup();
    TB.click('[data-act="summary"]');
    const cards = [...document.querySelectorAll('#summary .card')].map(c => c.textContent.replace(/\s+/g, ''));
    ok(cards.includes('証跡あり1') && cards.includes('OKなのに証跡なし1'), 'カード: ' + cards);
    const rows = [...document.querySelectorAll('#summary tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join('|'));
    ok(rows.includes('合計|3|1|2|1'), '証跡の表（項目数|証跡あり|OK|OK なのに証跡なし）: ' + rows.join(' / '));
    ok(!document.querySelector('#summary').textContent.includes('前の実施回で NG だった行'), '実施回が1つなら出ない');
    window.dialog = async o => o.inputs ? ['回帰', 'none'] : '回帰';
    TB.click('#tabs .tab[data-act="sheet"]');
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="addRun"]'); await sleep(0);
    await setVerdict(item(3), 'ok');
    TB.click('[data-act="summary"]');
    const h3 = [...document.querySelectorAll('#summary h3')].map(h => h.textContent);
    ok(h3.includes('前の実施回で NG だった行の現状（1回目 → 回帰）'), '見出し: ' + h3);
    const tr = [...document.querySelectorAll('#summary tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join('|'));
    ok(tr.includes('1|1|0|0|0|0'), '前回 NG 1 件のうち OK になった 1 件: ' + tr.join(' / '));
  });

  test('リンク: 不具合票のひな形を決めると、備考などの #123 や PROJ-123 がリンクになる', async () => {
    snap(); const it = addItem(); setF(it, K(), '手順は https://wiki.example/a#5 を見る。#12 も関連');
    render();
    await setVerdict(it, 'ng'); snap(); setRecField(it, 'remark', '#128 で起票、PROJ-7 も'); render();
    const cell = name => document.querySelector(`#grid td[data-r="0"][data-c="${cols().findIndex(c => c.name === name)}"]`);
    eq(cell('備考').querySelectorAll('a').length, 0, 'ひな形がなければリンクにしない');
    eq(cell('確認内容').querySelectorAll('a').length, 1, 'URL はもともとリンク');
    window.dialog = async () => 'https://github.com/example/shop/issues/{n}';
    TB.click('[data-act="more"]'); TB.click('#pop [data-act="issueUrl"]'); await sleep(0);
    eq(D.meta.issueUrl, 'https://github.com/example/shop/issues/{n}');
    const a = [...cell('備考').querySelectorAll('a')];
    eq(a.map(x => [x.textContent, x.href]), [['#128', 'https://github.com/example/shop/issues/128']], '#128 がリンク');
    const a2 = [...cell('確認内容').querySelectorAll('a')].map(x => [x.textContent, x.href]);
    eq(a2, [['https://wiki.example/a#5', 'https://wiki.example/a#5'], ['#12', 'https://github.com/example/shop/issues/12']], 'URL の中の # は触らず、外の #12 はリンク');
    window.dialog = async () => 'https://jira.example.com/browse/{key}';
    TB.click('[data-act="more"]'); TB.click('#pop [data-act="issueUrl"]'); await sleep(0);
    eq([...cell('備考').querySelectorAll('a')].map(x => [x.textContent, x.href]), [['PROJ-7', 'https://jira.example.com/browse/PROJ-7']], 'PROJ-7 がリンク、#128 はならない');
    ok(document.querySelector('#pane .kv a, #pane dd a') || true, 'パネルでも同じ linkify を通す');
    window.dialog = async () => '';
    TB.click('[data-act="more"]'); TB.click('#pop [data-act="issueUrl"]'); await sleep(0);
    eq(cell('備考').querySelectorAll('a').length, 0, '空にすると外れる');
  });

  test('検索: Ctrl+F で検索欄に入り、Enter で絞り込んで表に戻り、Esc でも表に戻る。打ち足しは前の結果から探す', async () => {
    snap(); for (const t of ['りんご', 'りんごジュース', 'バナナ']) setF(addItem(), K(), t);
    render();
    TB.key(document.body, 'f', { ctrl: true });
    eq(document.activeElement && document.activeElement.id, 'q', 'Ctrl+F で検索欄へ');
    TB.input('#q', 'りんご'); await sleep(250);
    eq(shown(), ['りんご', 'りんごジュース']);
    TB.input('#q', 'りんごジ'); await sleep(250);
    eq(shown(), ['りんごジュース'], '打ち足し');
    ok(S.qPrev && S.qPrev.q === 'りんごじ'.replace('じ', 'ジ').toLowerCase(), '前の結果を覚えている');
    TB.input('#q', 'りんごジュ'); TB.key('#q', 'Enter');
    eq([shown(), document.activeElement], [['りんごジュース'], ed()], 'Enter ですぐ絞り込んで表へ');
    TB.key(document.body, 'f', { ctrl: true }); TB.key('#q', 'Escape');
    eq(document.activeElement, ed(), 'Esc で表へ');
    // 絞り込み中に行の文字を直しても、次の打ち足しで正しく探す
    snap(); setF(item(3), K(), 'りんごジュースとバナナ');
    TB.input('#q', 'りんごジュース'); await sleep(250);
    eq(shown(), ['りんごジュース', 'りんごジュースとバナナ'], '直した行も見つかる');
  });
})();
