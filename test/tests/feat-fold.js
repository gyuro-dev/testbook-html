/* 大項目の折りたたみと目次、列の値での絞り込み（オートフィルタ）の試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep } = TB;
  const K = () => col('確認内容').id;
  const shown = () => S.rows.map(i => i[K()]);
  // 大項目 A が3行、B が2行、C が1行
  const setup = () => {
    snap();
    for (const [g, t] of [['A', 'a1'], ['A', 'a2'], ['A', 'a3'], ['B', 'b1'], ['B', 'b2'], ['C', 'c1']]) { const it = addItem(); setF(it, col('大項目').id, g); setF(it, K(), t); }
    render();
  };
  const foldBtn = k => document.querySelector(`#grid .fold[data-k="${k}"]`);

  test('折りたたみ: 大項目の最初の行の ▾ で畳むと、その大項目は最初の行だけになり (件数) が出る', () => {
    setup();
    ok(foldBtn('A') && foldBtn('B') && !foldBtn('C'), '2行以上のグループにだけ印が出る');
    TB.click(foldBtn('A'));
    eq(shown(), ['a1', 'b1', 'b2', 'c1'], 'A が畳まれる');
    const cell = document.querySelector(`#grid td[data-r="0"][data-c="${cols().indexOf(col('大項目'))}"]`);
    ok(cell.textContent.includes('▸') && cell.textContent.includes('(3)'), '印と件数: ' + cell.textContent);
    ok(!cell.classList.contains('nb'), '畳んだ行の下に線が出る');
    TB.click(foldBtn('A'));
    eq(shown().length, 6, '開く');
    // 畳んだ状態は、描き直しても・編集しても保たれ、並びが変わるまで全行を見直さない
    TB.click(foldBtn('B')); render();
    eq(shown(), ['a1', 'a2', 'a3', 'b1', 'c1'], '描き直しても畳んだまま');
    snap(); setF(item(1), K(), 'a1 を直した'); renderGrid();
    eq(shown()[0], 'a1 を直した', '編集は見えている行だけ描き直す');
  });

  test('折りたたみ: 畳んだ状態はこのブラウザに覚え、開き直しても同じ。別の試験ファイルには持ち越さない', () => {
    setup();
    TB.click(foldBtn('A'));
    const key = `testbook.fold.${D.meta.id}.${S.sheet}`;
    eq(JSON.parse(localStorage.getItem(key)), ['A'], '覚える');
    S.fold = {}; S.foldVer++; render();
    eq(shown(), ['a1', 'b1', 'b2', 'c1'], '読み直しても畳んだまま');
    localStorage.removeItem(key);
  });

  test('目次: 大項目の一覧が出て、クリックでその行へ飛ぶ。全部畳む・全部開くもある', async () => {
    setup();
    await setVerdict(item(4), 'ng');
    TB.click('[data-act="toc"]');
    const pop = document.querySelector('#pop');
    ok(!pop.hidden, '目次が出る');
    const rows = [...pop.querySelectorAll('[data-act="tocGo"]')].map(b => b.textContent.replace(/\s+/g, ' ').trim());
    eq(rows.length, 3, '3つの大項目');
    ok(rows[1].includes('B') && rows[1].includes('1/2') && rows[1].includes('NG 1'), 'B の消化と NG: ' + rows[1]);
    TB.click(pop.querySelector('[data-act="tocGo"][data-k="C"]'));
    eq([curItem()[K()], pop.hidden], ['c1', true], 'C の最初の行へ');
    TB.click('[data-act="toc"]'); TB.click('#pop [data-act="foldAll"][data-on="1"]');
    eq(shown(), ['a1', 'b1', 'c1'], '全部畳む');
    TB.click('[data-act="toc"]'); TB.click('#pop [data-act="foldAll"][data-on="0"]');
    eq(shown().length, 6, '全部開く');
  });

  test('折りたたみ: 大項目の値を直すとグループが変わり、目次と印に反映される', () => {
    setup();
    S.r = 5; S.c = cols().indexOf(col('大項目')); collapse(); paintCursor();
    TB.typeText('B'); TB.gridKey('Enter');
    eq(groupsOf(curSheet()).get('B'), 3, 'B が3行になる');
    ok(!foldBtn('C'), 'C は消える');
    TB.click(foldBtn('B'));
    eq(shown(), ['a1', 'a2', 'a3', 'b1'], '3行のまま畳める');
  });

  test('列の値で絞り込み: 列のメニューから値を選ぶと、その値の行だけになる。見出しに印、ツールバーに解除ボタン', async () => {
    setup();
    snap(); for (const [i, v] of [[1, '画面'], [2, 'API'], [3, '画面'], [4, 'API'], [5, '画面'], [6, '帳票']]) setF(item(i), col('小項目').id, v);
    render();
    const th = `#grid th[data-cid="${col('小項目').id}"]`;
    TB.click(th); TB.click('#pop [data-act="colFilter"]');
    const pop = document.querySelector('#pop');
    const labels = [...pop.querySelectorAll('.cfl label')].map(l => l.textContent.replace(/\s+/g, ' ').trim());
    eq(labels, ['画面 (3)', 'API (2)', '帳票 (1)'], '値と件数（出てくる順）');
    pop.querySelector('input[data-v="API"]').checked = false;
    TB.click('#pop [data-act="cfApply"]');
    eq(shown(), ['a1', 'a3', 'b2', 'c1'], 'API を外す');
    ok(document.querySelector(th + ' .cfmark'), '見出しに印');
    ok(document.querySelector('[data-act="cfClearAll"]') && document.querySelector('[data-act="cfClearAll"]').textContent.includes('1 列'), 'ツールバーに解除');
    // ほかの絞り込みや検索と組み合わさる
    await setVerdict(item(1), 'ok');
    TB.input('#vf', 'none', 'change');
    eq(shown(), ['a3', 'b2', 'c1'], '結果の絞り込みと同時');
    TB.input('#q', 'b'); await sleep(250);
    eq(shown(), ['b2'], '検索とも同時');
    TB.input('#q', ''); TB.input('#vf', '', 'change'); await sleep(250);
    // 開き直すとチェックの状態が残っている。「なし」→「全部」
    TB.click(th); TB.click('#pop [data-act="colFilter"]');
    eq([...pop.querySelectorAll('input')].map(i => i.checked), [true, false, true], 'チェックの状態');
    TB.click('#pop [data-act="cfAll"][data-on="0"]');
    eq([...pop.querySelectorAll('input')].map(i => i.checked), [false, false, false], '「なし」');
    TB.click('#pop [data-act="cfAll"][data-on="1"]'); TB.click('#pop [data-act="cfApply"]');
    eq([shown().length, S.cf[col('小項目').id]], [6, undefined], '全部にすると絞り込みが外れる');
    pop.hidden = true;
    TB.click(th); TB.click('#pop [data-act="colFilter"]');
    pop.querySelector('input[data-v="帳票"]').checked = false; TB.click('#pop [data-act="cfApply"]');
    eq(shown().length, 5);
    TB.click('[data-act="cfClearAll"]');
    eq([shown().length, document.querySelector('[data-act="cfClearAll"]')], [6, null], '解除');
  });

  test('列の値で絞り込み: 結果・チェック・証跡の列も値で絞れる', async () => {
    setup();
    await setVerdict(item(1), 'ok'); await setVerdict(item(2), 'ng');
    const th = `#grid th[data-cid="${col('結果').id}"]`;
    TB.click(th); TB.click('#pop [data-act="colFilter"]');
    const pop = document.querySelector('#pop');
    eq([...pop.querySelectorAll('.cfl label')].map(l => l.textContent.replace(/\s+/g, ' ').trim()), ['OK (1)', 'NG (1)', '（空） (4)'], '結果の値');
    pop.querySelector('input[data-v=""]').checked = false; pop.querySelector('input[data-v="OK"]').checked = false;
    TB.click('#pop [data-act="cfApply"]');
    eq(shown(), ['a2'], 'NG だけ');
    TB.click('[data-act="cfClearAll"]');
    eq(shown().length, 6);
  });
})();
