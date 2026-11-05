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
    TB.drop(board(), [log, bin, big]); await TB.until(() => els().length >= 2 && TB.toasts().length);
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

  /* ---- 複数の要素の選択 ---- */
  const domOf = id => board().querySelector(`.el[data-eid="${id}"]`);
  const pos = l => l.map(e => [e.x, e.y]);
  const rel = l => l.map(e => [e.x - l[0].x, e.y - l[0].y]);
  // 枠・文字・右上から左下への線（始点が右上で、w が負）を置く
  const three = () => {
    snap();
    const f = addEl(boardOwner(), 'frame', { x: 100, y: 100, w: 80, h: 40, color: 'blue' });
    const t = addEl(boardOwner(), 'text', { x: 300, y: 120, w: 120, text: 'メモ' });
    const l = addEl(boardOwner(), 'line', { x: 400, y: 200, w: -160, h: 60, arrow: true, color: 'red' });
    renderBoard();
    return [f, t, l];
  };
  // 本物のマウスと同じ順でイベントを送る
  const mouse = (type, target, x, y, mods) => target.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, clientX: x, clientY: y, ...mods }));
  const center = id => { const d = domOf(id).querySelector('.tx, line.hit, .edge, img') || domOf(id), r = d.getBoundingClientRect(); return [d, r.left + r.width / 2, r.top + r.height / 2]; };
  const clickEl = (id, mods) => { const [d, x, y] = center(id); mouse('mousedown', d, x, y, mods); mouse('mouseup', window, x, y, mods); };
  const dragEl = (id, dx, dy, mods) => { const [d, x, y] = center(id); mouse('mousedown', d, x, y, mods); mouse('mousemove', window, x + dx, y + dy, mods); mouse('mouseup', window, x + dx, y + dy, mods); };
  const marquee = (x1, y1, x2, y2, mods) => { const r = board().getBoundingClientRect(); mouse('mousedown', board(), r.left + x1, r.top + y1, mods); mouse('mousemove', window, r.left + x2, r.top + y2, mods); const box = board().querySelector('.marquee'); mouse('mouseup', window, r.left + x2, r.top + y2, mods); return box; };
  const selected = () => [...board().querySelectorAll('.el.sel')].map(d => d.dataset.eid).sort();
  const ids = l => l.map(e => e.id).sort();

  test('複数選択: Shift / Ctrl+クリックで足して外し、Ctrl+A で全部、Esc で解除する', () => {
    openBoard();
    const [f, t, l] = three();
    clickEl(f.id);
    eq([selected(), multiSel()], [[f.id], null], '1つのときは今までどおり');
    clickEl(t.id, { shiftKey: true });
    eq(selected(), ids([f, t]), 'Shift+クリックで足す');
    clickEl(l.id, { ctrlKey: true });
    eq(selected(), ids([f, t, l]), 'Ctrl+クリックで足す（線も選べる）');
    clickEl(t.id, { ctrlKey: true });
    eq(selected(), ids([f, l]), 'もう一度押すと外す');
    clickEl(l.id, { shiftKey: true });
    eq([selected(), multiSel(), S.bSel], [[f.id], null, f.id], '1つに戻ると、ふつうの選択');
    bkey('a', { ctrl: true });
    eq(selected(), ids([f, t, l]), 'Ctrl+A で全部');
    bkey('Escape');
    eq([selected(), S.bSel, S.view], [[], null, 'board'], 'Esc で解除（表には戻らない）');
    bkey('a', { ctrl: true }); clickEl(t.id);
    eq([selected(), multiSel()], [[t.id], null], '選んだ物を動かさずにクリックすると、それだけになる');
  });

  test('複数選択: 何もないところからのドラッグで、全体が入った要素を選ぶ。クリックとダブルクリックは今までどおり', async () => {
    openBoard();
    const [f, t, l] = three();
    const box = marquee(90, 90, 200, 150);
    ok(box, 'ドラッグ中は範囲が見える');
    eq([selected(), board().querySelector('.marquee')], [[f.id], null], '枠だけが入る。離すと範囲は消える');
    marquee(90, 90, 340, 150);
    eq(selected(), [f.id], '一部だけ入った文字は選ばない');
    marquee(230, 100, 500, 300);
    eq(selected(), ids([t, l]), '線は両端が入れば選ぶ（w が負でも）');
    marquee(90, 90, 200, 150, { shiftKey: true });
    eq(selected(), ids([f, t, l]), 'Shift を押していれば足す');
    const r = board().getBoundingClientRect();
    mouse('mousedown', board(), r.left + 600, r.top + 400); mouse('mouseup', window, r.left + 600, r.top + 400);
    eq([selected(), S.bSel], [[], null], '何もないところのクリックは解除');
    marquee(600, 400, 700, 500);
    eq(selected(), [], '何も入らなければ何も選ばない');
    board().dispatchEvent(new MouseEvent('dblclick', { bubbles: true, clientX: r.left + 600, clientY: r.top + 400 })); await sleep(0);
    ok(S.bEdit, 'ダブルクリックは文字を書き始める');
  });

  test('複数選択: ドラッグで相対位置を保って動かし、1回の Ctrl+Z で戻る。線は両端が一緒に動く', () => {
    openBoard();
    const list = three(), [f, t, l] = list, before = pos(list), w = [l.w, l.h];
    bkey('a', { ctrl: true });
    dragEl(t.id, 40, 80);
    eq(pos(list), before.map(([x, y]) => [x + 40, y + 80]), 'まとめて動く');
    eq([l.w, l.h], w, '線の向きと長さは変わらない');
    eq(selected(), ids(list), '動かしたあとも選択は残る');
    eq([domOf(f.id).style.left, domOf(l.id).style.left], ['140px', 40 + 400 - 160 - 12 + 'px'], '画面の位置も動く（線は余白の分だけ左）');
    eq(f.ts.x > 0 && t.ts.y > 0 && l.ts.x > 0, true, '要素ごとに setF で変える（合わせる処理が見る時刻が付く）');
    bkey('z', { ctrl: true });
    eq(pos(list), before, '1回で全部戻る');
    bkey('z', { ctrl: true, shift: true });
    eq(pos(list), before.map(([x, y]) => [x + 40, y + 80]), 'やり直しも1回');
  });

  test('複数選択: 左上の端で止まり、形が崩れない。4px 刻みでない位置でも相対位置を保つ', () => {
    openBoard();
    const list = three(), [f, t, l] = list;
    snap(); setF(f, 'x', 101); setF(t, 'y', 123); renderBoard();
    const shape = rel(list);
    bkey('a', { ctrl: true });
    dragEl(t.id, 8, 8);
    eq(rel(list), shape, '4px 刻みに丸めても、間隔は変わらない');
    dragEl(t.id, -5000, -5000);
    eq(rel(list), shape, '端まで行っても間隔は変わらない');
    eq([f.x, f.y], [0, 0], 'いちばん左上の物が端で止まる');
    bkey('ArrowLeft'); bkey('ArrowUp');
    eq(rel(list), shape, '端で矢印を押しても形は崩れない');
    eq([f.x, f.y], [0, 0], '動かない');
    bkey('ArrowRight', { shift: true }); bkey('ArrowDown');
    eq([f.x, f.y, rel(list)], [16, 1, shape], '矢印キーでまとめて動く（Shift で 16px）');
    eq(selected(), ids(list), '選択は残る');
    bkey('z', { ctrl: true });
    eq([f.x, f.y], [16, 0], '矢印1回ずつ戻る');
  });

  test('複数選択: 線の始点が端に近いときも、線の全体で端を見る', () => {
    openBoard();
    snap();
    const a = addEl(boardOwner(), 'frame', { x: 400, y: 200, w: 40, h: 40 }), l = addEl(boardOwner(), 'line', { x: 200, y: 200, w: -100, h: 0 });
    renderBoard(); bkey('a', { ctrl: true });
    dragEl(a.id, -1000, 0);
    eq([elBox(l).x, l.x, a.x], [0, 100, 300], '線の左端が 0 で止まり、枠も同じだけ動く');
  });

  test('複数選択: 画像を含めて動かすと、選んでいない上の印も一緒に動く', () => {
    openBoard();
    snap();
    const data = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEBgIApD5fRAAAAABJRU5ErkJggg==';
    const img = addEl(boardOwner(), 'image', { x: 100, y: 100, w: 200, h: 100, data }), other = addEl(boardOwner(), 'frame', { x: 400, y: 100, w: 40, h: 40 });
    const m = addEl(boardOwner(), 'marker', { x: 150, y: 120, w: 28, h: 28, n: 1 }), far = addEl(boardOwner(), 'marker', { x: 600, y: 300, w: 28, h: 28, n: 2 });
    renderBoard(); selectEls([img.id, other.id]);
    dragEl(img.id, 40, 40);
    eq([img.x, other.x, m.x, far.x], [140, 440, 190, 600], '印は一緒に、離れた物は動かない');
    bkey('z', { ctrl: true });
    eq([img.x, other.x, m.x], [100, 400, 150], '印も一緒に戻る');
  });

  test('複数選択: 道具のボタンは最前面・複製・削除だけ。つまみも編集もない', () => {
    openBoard();
    const list = three(), [f, t, l] = list;
    clickEl(l.id);
    ok(board().querySelector('.lh'), '線を1つ選ぶと端のつまみが出る');
    bkey('a', { ctrl: true });
    eq([...board().querySelectorAll('.seltb button')].map(b => b.dataset.act), ['elFront', 'elDup', 'elDel'], 'ボタン');
    ok(board().querySelector('.seltb').textContent.includes('3 個を選択中'), '選んだ数が出る');
    eq(board().querySelector('.lh'), null, '線のつまみは出ない');
    eq(getComputedStyle(domOf(f.id).querySelector('.rh')).display, 'none', '大きさのつまみは出ない');
    bkey('Enter'); bkey('F2');
    eq(S.bEdit, null, 'Enter で編集を始めない');
    bkey('b', { ctrl: true }); eq(t.bold, undefined, 'Ctrl+B は効かない');
    clickEl(f.id);
    eq(getComputedStyle(domOf(f.id).querySelector('.rh')).display, 'block', '1つに戻すと大きさのつまみが出る');
    ok(!domOf(f.id).classList.contains('msel') && !domOf(t.id).classList.contains('sel'), '見た目も1つに戻る');
    clickEl(t.id); clickEl(l.id); ok(board().querySelector('.lh'), '線のつまみも戻る');
    clickEl(f.id, { shiftKey: true }); eq(board().querySelector('.lh'), null, '線を選んだまま足すと、つまみが消える');
    bkey('Escape');
    clickEl(l.id);
    const h = board().querySelector('.lh[data-end="2"]'), r = h.getBoundingClientRect(), x = r.left + 7, y = r.top + 7;
    mouse('mousedown', h, x, y, { shiftKey: true }); mouse('mousemove', window, x + 40, y + 200, { shiftKey: true }); mouse('mouseup', window, x + 40, y + 200, { shiftKey: true });
    eq([selected(), l.w], [[l.id], 0], 'つまみの Shift+ドラッグは今までどおり（垂直にそろえる。選択に足さない）');
  });

  test('複数選択: Delete と切り取りは1回の Ctrl+Z で全部戻り、複製と最前面は重なりの順を保つ', () => {
    openBoard();
    const list = three(), [f, t, l] = list;
    snap(); const under = addEl(boardOwner(), 'frame', { x: 700, y: 100, w: 40, h: 40 }); renderBoard();
    selectEls([f.id, l.id]);
    bkey('Delete');
    eq([els().map(e => e.id), S.bSel, multiSel()], [[t.id, under.id], null, null], '選んだ物だけ消える');
    bkey('z', { ctrl: true });
    eq(ids(els()), ids([f, t, l, under]), '1回で全部戻る');
    selectEls([f.id, l.id]);
    bkey('d', { ctrl: true });
    const made = els().slice(-2);
    eq(made.map(e => [e.type, e.x, e.y]), [['frame', 116, 116], ['line', 416, 216]], '少しずらして複製する');
    eq(made[1].w, -160, '線の向きも同じ');
    eq(selected(), ids(made), '複製した物が選ばれる');
    ok(made[0].z < made[1].z && made[0].z > under.z, '重なりの順を保って手前に置く');
    bkey('z', { ctrl: true });
    eq(els().length, 4, '1回で複製が全部消える');
    selectEls([t.id, f.id]);
    TB.click('.seltb [data-act="elFront"]');
    ok(f.z < t.z && t.z > under.z && f.z > under.z, '最前面へ（2つの前後は保つ）');
    eq(selected(), ids([f, t]), '選択は残る');
    bkey('z', { ctrl: true });
    ok(f.z < t.z && t.z < l.z, '1回で戻る');
    selectEls([f.id, t.id]);
    TB.clip(wrap(), 'cut', TB.dt());
    eq(els().length, 2, '切り取りで消える');
    bkey('z', { ctrl: true });
    eq(els().length, 4, '1回で戻る');
  });

  test('複数選択: 別のボードへ相対位置を保って貼り付ける。1つのときの動きは変わらない', async () => {
    openBoard();
    const list = three(), [f, t, l] = list, shape = rel(list);
    bkey('a', { ctrl: true });
    const dt = TB.clip(wrap(), 'copy', TB.dt());
    eq(JSON.parse(dt.getData(EL_MIME)).map(o => o.type), ['frame', 'text', 'line'], '奥から順に要素そのものが入る');
    eq(dt.getData('text/plain').split('\n')[1], 'メモ', 'ほかのアプリには文字');
    TB.click('[data-act="evNav"][data-d="1"]');
    eq(els().length, 0, '別の項目');
    const r = board().getBoundingClientRect();
    document.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    board().dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 40, clientY: r.top + 60 }));
    TB.clip(wrap(), 'paste', TB.dt({ extra: { [EL_MIME]: dt.getData(EL_MIME) } })); await sleep(0);
    const p = els();
    eq(p.map(e => e.type), ['frame', 'text', 'line'], '3つ入る');
    eq(rel(p), shape, '相対位置を保つ');
    eq([p[0].x, p[0].y], [40, 60], '全体の左上がマウスの位置に来る');
    eq([p[2].w, p[2].h, p[2].arrow], [-160, 60, true], '線の向きと矢印');
    ok(p.every(e => e.owner === boardOwner() && !list.includes(e)), '別の物として入る');
    ok(p[0].z < p[1].z && p[1].z < p[2].z, '重なりの順');
    eq(selected(), ids(p), '貼った物が全部選ばれる');
    bkey('z', { ctrl: true });
    eq(els().length, 0, '1回で全部消える');
    bkey('z', { ctrl: true, shift: true });
    TB.clip(wrap(), 'paste', TB.dt({ extra: { [EL_MIME]: dt.getData(EL_MIME) } })); await sleep(0);
    eq(rel(els().slice(3)), shape, 'マウスを動かさずに貼ると下に置く（相対位置は同じ）');
    ok(els()[3].y >= Math.max(...els().slice(0, 3).map(e => elBox(e).y)), '前に貼った物の下');
    // 線の始点より終点が左のとき: 全体の左上で合わせるので、はみ出さない
    snap(); for (const e of [...els()]) setF(e, 'deleted', true); renderBoard();
    board().dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left, clientY: r.top }));
    TB.clip(wrap(), 'paste', TB.dt({ extra: { [EL_MIME]: JSON.stringify([{ type: 'line', x: 400, y: 100, w: -300, h: 50 }, { type: 'marker', x: 200, y: 110, w: 28, h: 28, n: 1 }]) } })); await sleep(0);
    eq(els().map(e => [e.x, e.y]), [[300, 0], [100, 10]], '線の左端が左上になる');
  });

  test('複数選択: 自由シートでも使える。1つのコピーと貼り付けは今までと同じ位置', async () => {
    snap(); const s = newSheet('説明', 'free', 2); D.sheets.push(s); created(s); S.sheet = s.id; S.view = 'sheet'; render();
    const list = three();
    bkey('a', { ctrl: true });
    eq(selected(), ids(list), '全部選ぶ');
    bkey('Delete'); eq(els().length, 0, '消える');
    bkey('z', { ctrl: true });
    selectEl(list[0].id);
    const dt = TB.clip(wrap(), 'copy', TB.dt());
    eq(JSON.parse(dt.getData(EL_MIME)).length, 1, '1つだけ');
    const r = board().getBoundingClientRect();
    board().dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: r.left + 40, clientY: r.top + 60 }));
    TB.clip(wrap(), 'paste', dt); await sleep(0);
    const n = els().slice(-1)[0];
    eq([n.type, n.x, n.y, S.bSel, multiSel()], ['frame', 40, 60, n.id, null], 'マウスの位置に、1つ選ばれた状態で');
  });

  test('複数選択: 選択はファイルに入らず、元に戻しや票の切り替えで残らない', () => {
    openBoard();
    const list = three(), [f, t] = list;
    bkey('a', { ctrl: true });
    ok(!JSON.stringify(D).includes('bMulti') && !('sel' in f), 'データに選択の印はない');
    TB.click('[data-act="evNav"][data-d="1"]');
    eq([S.bSel, multiSel(), selected()], [null, null, []], '別の票では何も選ばれていない');
    TB.click('[data-act="evNav"][data-d="-1"]');
    eq(selected(), [], '戻っても選ばれていない');
    selectEls([f.id, t.id]);
    snap(); setF(f, 'deleted', true); renderBoard();
    eq([selected(), multiSel(), S.bSel], [[t.id], null, t.id], '選んだ物が消えたら、残りだけになる');
    bkey('a', { ctrl: true });
    TB.click('[data-act="tool"][data-t="frame"]');
    return sleep(0).then(() => { eq([selected().length, multiSel()], [1, null], '新しく置いた物だけが選ばれる'); });
  });

  test('複数選択: 合わせるときは、まとめて動かした値が要素ごとに残る', () => {
    openBoard();
    const [f, t] = three();
    const base = JSON.parse(JSON.stringify(D));
    selectEls([f.id, t.id]); dragEl(t.id, 40, 40);
    const theirs = JSON.parse(JSON.stringify(base));
    const tf = theirs.elements.find(e => e.id === f.id);
    tf.color = 'yellow'; tf.ts.color = tf.updatedAt = Date.now() + 1000;
    const st = mergeInto(D, theirs);
    render();
    const mf = getEl(f.id), mt = getEl(t.id);
    eq([mf.x, mf.y, mf.color, mt.x, mt.y], [140, 140, 'yellow', 340, 160], '相手の色と、自分の位置の両方が残る');
    eq(st.conflicts, 0, '競合にならない');
  });

  test('複数選択: 大きいものはクリップボードに載せず、このタブの中で貼り付ける', async () => {
    openBoard();
    snap();
    const half = 'data:application/octet-stream;base64,' + 'A'.repeat(CLIP_MAX / 2 + 8);
    const a = addEl(boardOwner(), 'file', { x: 0, y: 0, w: 200, data: half, name: 'a.bin', size: 1 }), b = addEl(boardOwner(), 'file', { x: 0, y: 100, w: 200, data: half, name: 'b.bin', size: 1 });
    renderBoard(); selectEls([a.id, b.id]);
    const dt = TB.clip(wrap(), 'copy', TB.dt());
    ok(dt.getData(EL_MIME).length < 200, 'クリップボードには合い札だけ: ' + dt.getData(EL_MIME).length);
    eq(dt.getData('text/plain'), 'a.bin\nb.bin', '文字は名前');
    ok(TB.toasts().some(t => t.includes('このタブの中でだけ')), '知らせる');
    TB.click('[data-act="evNav"][data-d="1"]');
    TB.clip(wrap(), 'paste', dt); await sleep(0);
    eq(els().map(e => [e.name, e.data.length, e.y - els()[0].y]), [['a.bin', half.length, 0], ['b.bin', half.length, 100]], '中身ごと貼れて、相対位置を保つ');
    TB.clip(wrap(), 'paste', dt); await sleep(0);
    eq(els().length, 4, 'もう一度貼れる');
    const other = TB.dt({ extra: { [EL_MIME]: JSON.stringify({ tbClip: 'c_other' }) } });
    TB.clip(wrap(), 'paste', other); await sleep(0);
    eq(els().length, 4, '別のタブの合い札では貼らない');
    ok(TB.toasts().some(t => t.includes('コピーしたタブの中でだけ')), '理由を出す');
    // 切り取っても、持っておいた中身は残る
    TB.click('[data-act="evNav"][data-d="-1"]');
    selectEls([a.id, b.id]);
    TB.clip(wrap(), 'cut', dt);
    eq(els().length, 0, '切り取りで消える');
    TB.clip(wrap(), 'paste', dt); await sleep(0);
    eq(els().map(e => e.data.length), [half.length, half.length], '貼り戻せる');
    S.elClip = null;
  });

  test('複数選択: クリップボードの変な中身でも壊れない', async () => {
    openBoard();
    const bad = [
      [{ type: 'frame', x: '<img>', y: {}, w: 1, h: 1 }, { type: 'marker', x: 1e308, y: -1e308, w: 28, h: 28 }, { type: 'frame', x: -1e308, y: 1e308, w: 1, h: 1 }],
      [null, 1, 'a', [], { type: 'nope', x: 1 }, { type: 'text', x: 1, y: 2, w: 3, text: '<img src=x onerror="window.__tbXss3=1">' }],
      { tag: 'x', items: 3 }, { tbClip: 3 }, { items: [{ type: 'frame' }] },
    ].map(b => JSON.stringify(b));
    bad.push('[{"type":"frame","x":1,"y":2,"w":3,"h":4,"__proto__":{"z":9}},{"type":"frame","x":5,"y":6,"w":3,"h":4,"constructor":{}}]', '{', '[]');
    for (const b of bad) {
      TB.clip(wrap(), 'paste', TB.dt({ extra: { [EL_MIME]: b } })); await sleep(0);
    }
    ok(els().length >= 5, '形の合う物は入る: ' + els().length);
    for (const e of els()) ok([e.x, e.y, e.z].every(Number.isFinite), '位置は数: ' + JSON.stringify([e.x, e.y, e.z]));
    eq(window.__tbXss3, undefined, 'スクリプトは動かない');
    bkey('a', { ctrl: true }); bkey('ArrowRight'); bkey('Delete');
    eq(els().length, 0, '貼った物も選んで消せる');
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
