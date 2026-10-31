/* 列の設定・シート・実施回を、画面の操作（ボタンとメニュー）で動かす試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep } = TB;
  const names = () => sheetCols(curSheet()).map(c => c.name);
  const tabNames = () => [...document.querySelectorAll('#tabs .tab:not(.add)')].map(t => t.textContent).filter(t => t !== '集計');
  const menuOf = name => { TB.click(`#grid th[data-cid="${col(name).id}"]`); return document.querySelector('#pop'); };

  test('列: 見出しをクリックするとメニューが出て、名前の変更・種類・移動・追加・削除ができる', async () => {
    snap(); const it = addItem(); setF(it, col('確認内容').id, 'x'); render();
    const pop = menuOf('確認内容');
    ok(!pop.hidden && pop.textContent.includes('名前を変更') && pop.textContent.includes('列を削除'), 'メニュー');
    window.dialog = async () => '観点';
    TB.click('#pop [data-act="colRename"]'); await sleep(0);
    ok(names().includes('観点') && !names().includes('確認内容'), '名前の変更: ' + names());
    menuOf('前提条件'); TB.click('#pop [data-act="colType"][data-t="check"]');
    eq(col('前提条件').type, 'check', '種類をチェックに');
    eq(document.querySelector(`#grid td[data-c="${cols().indexOf(col('前提条件'))}"] .ck`) != null, true, 'チェックの見た目');
    menuOf('観点'); TB.click('#pop [data-act="colMove"][data-d="1"]');
    eq(names().indexOf('観点'), names().indexOf('前提条件') + 1, '右へ移動');
    menuOf('観点'); TB.click('#pop [data-act="colAdd"][data-d="1"]');
    eq(names()[names().indexOf('観点') + 1], '列13', '右に列を追加');
    window.dialog = async () => true;
    menuOf('観点'); TB.click('#pop [data-act="colDel"]'); await sleep(0);
    ok(!names().includes('観点'), '削除'); ok(curSheet().columns.some(c => c.deleted), '消した列も印だけ残る');
    eq(it[sheetCols(curSheet()).find(c => c.name === '列13').id], undefined, '追加した列は空');
  });

  test('列: 選択肢の列にすると選択肢を聞き、セルのクリックで選べる', async () => {
    snap(); addItem(); render();
    window.dialog = async () => '高, 中、低';
    menuOf('前提条件'); TB.click('#pop [data-act="colType"][data-t="select"]'); await sleep(0);
    eq([col('前提条件').type, col('前提条件').options], ['select', ['高', '中', '低']], '選択肢');
    TB.clickCell(0, cols().indexOf(col('前提条件')));
    ok(!document.querySelector('#pop').hidden && document.querySelector('#pop [data-act="popSelect"][data-v="中"]'), '選ぶ窓');
    TB.click('#pop [data-act="popSelect"][data-v="中"]');
    eq(item(1)[col('前提条件').id], '中');
    eq(TB.cellText(0, cols().indexOf(col('前提条件'))), '中', '表に出る');
  });

  test('列: 「ここまでの列を固定」で固定する列が変わり、既定は No と先頭の階層の列', () => {
    snap(); addItem(); render();
    eq(freezeOf(curSheet()), 4, '既定: No + 階層3つ');
    eq(document.querySelectorAll('#grid tr[data-r="0"] td.fz').length, 4, '固定のセルに印');
    menuOf('確認内容'); TB.click('#pop [data-act="colFreeze"]');
    eq(freezeOf(curSheet()), 5, '確認内容まで固定');
    menuOf('確認内容'); TB.click('#pop [data-act="colFreeze"][data-n="1"]');
    eq([freezeOf(curSheet()), document.querySelectorAll('#grid tr[data-r="0"] td.fz').length], [1, 1], '固定をやめる');
  });

  test('列: 「＋ 列を追加」で右端に増え、最後の1列は消せない', async () => {
    snap(); addItem(); render();
    TB.click('[data-act="colAddEnd"]');
    eq(names().slice(-1)[0], '列13', '右端に増える');
    window.dialog = async () => true;
    for (const c of sheetCols(curSheet()).slice(0, -1)) { TB.click(`#grid th[data-cid="${c.id}"]`); TB.click('#pop [data-act="colDel"]'); await sleep(0); }
    eq(names().length, 1, '1列まで減る');
    menuOf(names()[0]); TB.click('#pop [data-act="colDel"]'); await sleep(0);
    eq(names().length, 1, '最後の列は残る'); ok(TB.toasts().some(t => t.includes('最後の列は削除できません')), 'お知らせ');
  });

  test('シート: ＋から試験項目のシートと自由シートを足し、タブに出て切り替わる', async () => {
    window.dialog = async o => o.input;  // 既定の名前のまま OK
    TB.click('[data-act="addSheetMenu"]'); TB.click('#pop [data-act="addSheet"][data-k="cases"]'); await sleep(0);
    eq(tabNames(), ['試験項目', 'シート2'], 'タブ'); eq(curSheet().name, 'シート2', '新しいシートに切り替わる');
    eq(sheetCols(curSheet()).length, 12, '既定の列が入る');
    TB.click('[data-act="addSheetMenu"]'); TB.click('#pop [data-act="addSheet"][data-k="free"]'); await sleep(0);
    eq([curSheet().kind, curSheet().name], ['free', '説明'], '自由シート');
    ok(!document.querySelector('#boardview').hidden && document.querySelector('#main').hidden, '自由シートはボードの画面');
    ok(document.querySelector('#toolbar').hidden, '自由シートでは表のツールバーが隠れる');
    TB.click('#tabs .tab[data-id="' + D.sheets[0].id + '"]');
    eq([S.sheet, S.view], [D.sheets[0].id, 'sheet'], 'タブで戻る');
  });

  test('シート: ダブルクリックで名前を変え、空にすると中身ごと削除する。最後の1枚は消せない', async () => {
    snap(); const it = addItem(); setF(it, col('確認内容').id, '消える行'); render();
    const tab = () => document.querySelector('#tabs .tab[data-act="sheet"]');
    window.dialog = async () => '新しい名前';
    TB.dblclick(tab()); await sleep(0);
    eq(curSheet().name, '新しい名前', '名前の変更');
    window.dialog = async () => '';
    TB.dblclick(tab()); await sleep(0);
    eq(sheets().length, 1, '最後のシートは消えない'); ok(TB.toasts().some(t => t.includes('最後のシートは削除できません')));
    window.dialog = async o => o.title === 'シートの名前' ? '' : true;
    const sid = S.sheet;
    snap(); const s2 = newSheet('2枚目', 'cases', 2); D.sheets.push(s2); created(s2); render();
    TB.dblclick(tab()); await sleep(0);
    eq(sheets().map(s => s.name), ['2枚目'], '削除'); ok(it.deleted, '中の行も削除の印'); eq(S.sheet, s2.id, '残ったシートに移る');
    ok(D.sheets.find(s => s.id === sid).deleted, 'シートは印だけ残る');
  });

  test('シート: 右クリックでタブに色を付けられる', () => {
    const tab = document.querySelector('#tabs .tab[data-act="sheet"]');
    tab.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    ok(!document.querySelector('#pop').hidden && document.querySelector('#pop [data-act="tabColor"][data-v="blue"]'), '色のメニュー');
    TB.click('#pop [data-act="tabColor"][data-v="blue"]');
    eq(curSheet().color, 'blue');
    ok(document.querySelector('#tabs .tab[data-act="sheet"]').classList.contains('colored'), 'タブに色の印');
  });

  test('実施回: 追加すると切り替わり、結果とエビデンス票は実施回ごとに別になる', async () => {
    snap(); addItem(); render();
    await setVerdict(item(1), 'ok');
    snap(); addEl(evOwner(item(1).id, S.run), 'text', { x: 0, y: 0, w: 100, text: '1回目の証跡' });
    const r1 = S.run;
    window.dialog = async o => o.inputs ? ['回帰', 'none'] : '回帰';
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="addRun"]'); await sleep(0);
    eq(runs().map(r => r.name), ['1回目', '回帰'], '実施回'); eq(runName(S.run), '回帰', '新しい回に切り替わる');
    eq(verdictOf(item(1).id, S.run), null, '回帰の結果はまだない');
    eq(TB.cellText(0, cols().findIndex(c => c.type === 'evidence')), '＋', '回帰の証跡はまだない');
    ok(document.querySelector('#progress').textContent.includes('消化 0/1'), '消化数も回ごと: ' + document.querySelector('#progress').textContent);
    await setVerdict(item(1), 'ng');
    TB.input('#runsel', r1, 'change');
    eq([S.run, verdictOf(item(1).id, S.run)], [r1, 'ok'], '1回目に戻すと 1回目の結果');
    eq(TB.cellText(0, cols().findIndex(c => c.type === 'evidence')), '1', '1回目の証跡');
    window.dialog = async () => '初回';
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="renameRun"]'); await sleep(0);
    eq(runName(r1), '初回', '名前の変更');
  });

  test('集計: タブで集計の画面になり、シート・大項目・実施回・実施者ごとの数が出る', async () => {
    snap(); addItem(); addItem(); render();
    setF(item(1), col('大項目').id, 'A'); setF(item(2), col('大項目').id, 'B');
    await setVerdict(item(1), 'ok');
    TB.click('[data-act="summary"]');
    eq(S.view, 'summary'); ok(!document.querySelector('#summary').hidden);
    const cards = [...document.querySelectorAll('#summary .card')].map(c => c.textContent.replace(/\s+/g, ''));
    eq(cards, ['項目数2', '消化率（1回目）50%', 'OK1', 'NG0', '保留0', '未実施1', '証跡あり0', 'OKなのに証跡なし1', '未解決のコメント0'], 'カード');
    const rows = [...document.querySelectorAll('#summary tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join('|'));
    ok(rows.some(r => r.startsWith('A|1|1|0')) && rows.some(r => r.startsWith('B|1|0|0')), '大項目ごと: ' + rows.join(' / '));
    ok(rows.some(r => r.startsWith('田中|1|0')), '実施者ごと');
    TB.click('#tabs .tab[data-act="sheet"]'); eq(S.view, 'sheet', '表に戻る');
  });
})();
