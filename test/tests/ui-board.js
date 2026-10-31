/* エビデンス票と自由シート（ボード）を、画面の操作で動かす試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep } = TB;
  const board = () => document.querySelector('#board');
  const wrap = () => document.querySelector('#boardwrap');
  const els = () => elementsOf(boardOwner());
  const openBoard = () => { snap(); addItem(); addItem(); setF(item(1), col('確認内容').id, '項目A'); setF(item(1), col('手順').id, '1. 開く'); render(); openEvidence(item(1).id); };
  const bkey = (key, mods) => TB.key(wrap(), key, mods);

  test('エビデンス票: 項目の内容と結果が上に出て、ボタンで文字・枠・矢印・線・表を置ける', async () => {
    openBoard();
    const bar = document.querySelector('.boardbar').textContent;
    ok(bar.includes('No.1') && bar.includes('項目A') && bar.includes('1. 開く'), '上の欄: ' + bar.slice(0, 100));
    for (const t of ['frame', 'arrow', 'line', 'table']) { TB.click(`[data-act="tool"][data-t="${t}"]`); await sleep(0); }
    eq(els().map(e => e.type), ['frame', 'line', 'line', 'table'], '置いた物');
    eq([els()[1].arrow, els()[2].arrow], [true, false], '矢印と線');
    eq(els()[3].cells, [['項目', '内容'], ['', ''], ['', '']], '表の初期値');
    eq(board().querySelectorAll('.el').length, 4, '画面にも4つ');
    eq(S.bSel, els()[3].id, '最後に置いた物が選ばれている');
    ok(els().every((e, i) => i === 0 || e.y > els()[i - 1].y), '下に順に並ぶ');
  });

  test('エビデンス票: 「＋ 文字」で書き始め、Esc で確定。空のまま終えると消える', async () => {
    openBoard();
    TB.click('[data-act="tool"][data-t="text"]'); await sleep(0);
    const ta = board().querySelector('.tx-ed[contenteditable]');
    ok(ta && S.bEdit, '書き始めの状態');
    ta.textContent = '確認した内容'; TB.key(ta, 'Escape');
    eq([els().length, els()[0].text, S.bEdit], [1, '確認した内容', null], '確定');
    eq(S.bSel, els()[0].id, '確定した箱が選ばれている');
    TB.click('[data-act="tool"][data-t="log"]'); await sleep(0);
    TB.key(board().querySelector('.tx-ed[contenteditable]'), 'Escape');
    eq(els().length, 1, '空のまま終えた箱は残らない');
  });

  test('エビデンス票: 文字の編集中の Backspace・Delete・矢印・Ctrl+B は文字に効き、箱を消したり動かしたりしない', async () => {
    for (const where of ['エビデンス票', '自由シート']) {
      if (where === '自由シート') { snap(); const s = newSheet('説明', 'free', 2); D.sheets.push(s); created(s); S.sheet = s.id; S.view = 'sheet'; render(); }
      else openBoard();
      TB.click('[data-act="tool"][data-t="text"]'); await sleep(0);
      const ed = board().querySelector('.tx-ed[contenteditable]'), e = els()[0], x0 = [e.x, e.y];
      ed.textContent = 'abcdef';
      for (const [key, mods] of [['Backspace'], ['Delete'], ['ArrowLeft'], ['ArrowUp', { shift: true }], ['b', { ctrl: true }], ['d', { ctrl: true }]]) TB.key(ed, key, mods);
      eq([els().length, S.bEdit === e.id, getEl(e.id).deleted || false], [1, true, false], where + ': 編集中のまま、箱は残る');
      eq([getEl(e.id).x, getEl(e.id).y], x0, where + ': 矢印で箱は動かない');
      ok(!getEl(e.id).bold, where + ': Ctrl+B は箱全体の太字にしない');
      TB.key(ed, 'Escape');
      eq([S.bEdit, S.bSel], [null, e.id], where + ': Esc で確定して、箱が選ばれる');
      bkey('Backspace');
      eq(els().length, 0, where + ': 編集していないときの Backspace は、選んだ箱を消す');
    }
  });

  test('エビデンス票: 空いているところをダブルクリックすると、そこに文字の箱ができる', async () => {
    openBoard();
    const r = board().getBoundingClientRect();
    board().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + 200, clientY: r.top + 100 })); await sleep(0);
    eq(els().length, 1); eq([els()[0].type, els()[0].x, els()[0].y], ['text', 200, 100], '位置（4px 刻み）');
  });

  test('エビデンス票: 画像を Ctrl+V すると圧縮して置き、Excel の範囲は表に、ログらしい文字はログの枠になる', async () => {
    openBoard();
    TB.clip(wrap(), 'paste', TB.dt({ files: [await TB.png(2400, 1200)] })); await TB.until(() => els().length);
    eq([els()[0].type, els()[0].w, els()[0].nw, els()[0].nh], ['image', 720, 1920, 960], '長辺 1920 に縮めて、幅 720 で置く');
    ok(/^data:image\/(webp|jpeg)/.test(els()[0].data), '圧縮した形式');
    ok(els()[0].name.startsWith('スクリーンショット'), 'image.png は「スクリーンショット 日時」');
    TB.clip(wrap(), 'paste', TB.dt({ text: 'a\tb\nc\td\te' })); await sleep(0);
    eq([els()[1].type, els()[1].cells], ['table', [['a', 'b', ''], ['c', 'd', 'e']]], 'タブ区切りは表（足りないセルは空）');
    TB.clip(wrap(), 'paste', TB.dt({ text: '12:00:01 INFO start\n12:00:02 ERROR boom\n12:00:03 INFO end' })); await sleep(0);
    eq([els()[2].type, els()[2].style], ['text', 'log'], 'ログの枠');
    TB.clip(wrap(), 'paste', TB.dt({ text: 'ひとこと' })); await sleep(0);
    eq([els()[3].style, els()[3].text], ['normal', 'ひとこと'], 'ふつうの文字');
    ok(board().querySelector('img'), '画像が描かれる');
  });

  test('エビデンス票: 選んだ要素を Delete で消し、Ctrl+D で複製、矢印キーで動かす', async () => {
    openBoard();
    TB.click('[data-act="tool"][data-t="frame"]'); await sleep(0);
    const f = els()[0], [x, y] = [f.x, f.y];
    bkey('ArrowRight'); bkey('ArrowDown', { shift: true });
    eq([f.x, f.y], [x + 1, y + 16], '1px、Shift で 16px');
    bkey('d', { ctrl: true });
    eq(els().length, 2, '複製'); eq([els()[1].x, els()[1].y], [f.x + 16, f.y + 16], '少しずらして置く');
    bkey('Delete');
    eq([els().length, S.bSel], [1, null], '削除');
    bkey('z', { ctrl: true });
    eq(els().length, 2, 'Ctrl+Z で戻る');
  });

  test('エビデンス票: 要素を Ctrl+C して別の項目の票に Ctrl+V で貼れる。ほかのアプリには文字だけ渡る', async () => {
    openBoard();
    TB.click('[data-act="tool"][data-t="table"]'); await sleep(0);
    snap(); setF(els()[0], 'cells', [['環境', 'staging'], ['版', '1.2']]); renderBoard();
    const dt = TB.clip(wrap(), 'copy', TB.dt());
    eq(dt.getData('text/plain'), '環境\tstaging\n版\t1.2', 'ほかのアプリ向けの文字');
    ok(dt.getData(EL_MIME).includes('"cells"'), '要素そのもの');
    TB.click('[data-act="evNav"][data-d="1"]');
    eq(S.boardItem, item(2).id, '次の項目へ'); eq(els().length, 0);
    TB.clip(wrap(), 'paste', TB.dt({ extra: { [EL_MIME]: dt.getData(EL_MIME) } })); await sleep(0);
    eq([els().length, els()[0].type, els()[0].cells], [1, 'table', [['環境', 'staging'], ['版', '1.2']]], '貼れる');
    ok(els()[0].id !== elementsOf(evOwner(item(1).id, S.run))[0].id, '別の物として入る');
    TB.click('[data-act="evNav"][data-d="-1"]'); eq(S.boardItem, item(1).id, '前の項目へ');
  });

  test('エビデンス票: 文字の箱に太字・取り消し線・色・枠線を付けられ、表はセルを編集して行や列を増やせる', async () => {
    openBoard();
    snap(); const t = addEl(boardOwner(), 'text', { x: 0, y: 0, w: 200, text: 'メモ' }); renderBoard(); selectEl(t.id);
    TB.click('.seltb [data-act="elFmt"][data-k="bold"]'); eq(t.bold, true, '太字');
    TB.click('.seltb [data-act="elFmt"][data-k="strike"]'); eq(t.strike, true, '取り消し線');
    TB.click('.seltb [data-act="elFc"][data-v="red"]'); eq(t.fc, 'red', '色');
    ok(board().querySelector(`.el[data-eid="${t.id}"]`).className.includes('fc-red') || board().querySelector(`.el[data-eid="${t.id}"] .fc-red, .el[data-eid="${t.id}"][style*="--c-red"]`), '見た目に色');
    TB.click('[data-act="tool"][data-t="table"]'); await sleep(0);
    const tb = els().find(e => e.type === 'table');
    TB.click('.seltb [data-act="tblOp"][data-v="addRow"]'); eq(tb.cells.length, 4, '行を足す');
    TB.click('.seltb [data-act="tblOp"][data-v="addCol"]'); eq(tb.cells[0].length, 3, '列を足す');
    bkey('Enter');
    const ta = board().querySelector('textarea');
    ok(ta && S.bCell && S.bCell.join() === '0,0', '左上のセルの編集');
    ta.value = '項目名'; TB.key(ta, 'Tab');
    eq([tb.cells[0][0], S.bCell.join()], ['項目名', '0,1'], 'Tab で確定して右へ');
    board().querySelector('textarea').value = '内容'; TB.key(board().querySelector('textarea'), 'Enter');
    eq([tb.cells[0][1], S.bCell.join()], ['内容', '1,1'], 'Enter で確定して下へ');
    TB.key(board().querySelector('textarea'), 'Escape');
    eq(S.bEdit, null, 'Esc で終える');
  });

  test('エビデンス票: 上の欄で結果・実施者・備考を書け、Esc で表に戻る', async () => {
    openBoard();
    TB.click('.boardbar [data-act="verdict"][data-v="ng"]'); await sleep(0);
    eq(verdictOf(item(1).id, S.run), 'ng', '結果');
    TB.input('.boardbar [data-rf="remark"]', '要修正', 'change');
    eq(recOf(item(1).id, S.run).remark, '要修正', '備考');
    TB.click('[data-act="evInfo"]');
    ok(!document.querySelector('.boardbar').textContent.includes('1. 開く'), '項目の内容を隠す'); S.evInfo = true;
    bkey('Escape');
    eq([S.view, document.querySelector('#main').hidden], ['sheet', false], 'Esc で表に戻る');
    eq(TB.cellText(0, cols().findIndex(c => c.type === 'verdict')), 'NG', '表に結果が出ている');
  });

  test('エビデンス票: ファイルをドロップすると、テキストはログの枠、それ以外は添付になる。10MB を超えると断る', async () => {
    openBoard();
    const log = new File(['line1\nline2'], 'app.log', { type: 'text/plain' });
    const bin = new File([new Uint8Array(1000)], 'dump.bin', { type: 'application/octet-stream' });
    const big = new File([new Uint8Array(1)], 'big.zip', { type: 'application/zip' }); Object.defineProperty(big, 'size', { value: MAX_FILE + 1 });
    TB.drop(board(), [log, bin, big]); await sleep(300);
    eq(els().map(e => e.type), ['text', 'file'], '置かれた物');
    eq([els()[0].style, els()[0].text], ['log', '【app.log】\nline1\nline2'], 'ログの枠に名前と中身');
    eq([els()[1].name, els()[1].size, els()[1].data.slice(0, 5)], ['dump.bin', 1000, 'data:'], '添付');
    ok(TB.toasts().some(t => t.includes('big.zip は大きすぎるため置けません')), '大きいファイルは断る');
  });

  test('自由シート: 見出し・表・集計を置け、集計は結果を付けると変わる', async () => {
    snap(); addItem(); addItem(); render();
    window.dialog = async () => '説明';
    TB.click('[data-act="addSheetMenu"]'); TB.click('#pop [data-act="addSheet"][data-k="free"]'); await sleep(0);
    TB.click('[data-act="tool"][data-t="title"]'); await sleep(0);
    board().querySelector('.tx-ed[contenteditable]').textContent = '結合試験'; TB.key(board().querySelector('.tx-ed[contenteditable]'), 'Escape');
    eq([els()[0].style, els()[0].text], ['title', '結合試験'], '見出し');
    TB.click('[data-act="tool"][data-t="metric"]'); await sleep(0);
    const m = () => [...board().querySelectorAll('.metric .mcards b')].map(b => b.textContent);  // 消化率・項目数・OK・NG・保留・未実施
    eq(m(), ['0%', '2', '0', '0', '0', '2'], '集計の初期値');
    const cases = caseSheets()[0];
    snap(); await setVerdictRows(itemsOf(cases.id), 'ok');
    S.sheet = cases.id; render(); S.sheet = sheets().find(s => s.kind === 'free').id; render();
    eq(m(), ['100%', '2', '2', '0', '0', '0'], '結果を付けると変わる');
    ok(document.querySelector('#metricRun'), '実施回を選べる');
  });

  test('ボード: 要素の文字も HTML として解釈されない', async () => {
    openBoard();
    snap();
    addEl(boardOwner(), 'text', { x: 0, y: 0, w: 200, text: '<img src=x onerror="window.__tbXss2=1">' });
    addEl(boardOwner(), 'table', { x: 0, y: 200, w: 200, cells: [['<b>x</b>', '<svg onload="window.__tbXss2=2">']] });
    renderBoard(); await sleep(50);
    ok(!board().querySelector('img, svg'), 'img や svg は作られない');
    eq(window.__tbXss2, undefined, 'スクリプトは動かない');
    ok(board().textContent.includes('<img src=x') && board().textContent.includes('<b>x</b>'), '文字のまま出る');
  });
})();
