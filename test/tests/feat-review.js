/* レビューで出た指摘の修正の試験。
 * バグ: 下書きの画像、置換で書式が消える、貼り付けの結果に実施者・履歴が入らない、同じ所への連続挿入で order の精度が尽きる。
 * 提案: ◀ ▶ が絞り込みに沿う、実施回の引き継ぎ、並べ替え、報告書の書式、初回保存の案内、黒塗り、画像の上の印の一括移動。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, clone, FakeHandle } = TB;
  const K = () => col('確認内容').id;
  const idle = () => { S.lastEdit = performance.now() - 60000; };

  test('下書き: 貼った画像の中身も下書きに入り、復元すると画像が戻る', async () => {
    await idb('drafts', 'readwrite', st => st.clear());
    window.showSaveFilePicker = undefined;
    snap(); addItem(); render(); openEvidence(item(1).id);
    TB.clip(document.querySelector('#boardwrap'), 'paste', TB.dt({ files: [await TB.png(300, 200)] })); await sleep(300);
    const img = elementsOf(boardOwner()).find(e => e.type === 'image');
    ok(img && img.data.length > 100, '画像がある');
    closeEvidence(); idle(); await autoTick();
    const d = await idb('drafts', 'readonly', st => st.get(D.meta.id));
    ok(d && d.json.size > img.data.length, '下書きに画像の分の大きさがある');
    loadDoc(newDoc()); window.dialog = async () => true;
    await checkDraft();
    const back = D.elements.find(e => e.id === img.id);
    ok(back && back.data === img.data, '復元した画像の中身が同じ');
  });

  test('置換: 1文字ずつの書式があるセルでも、書式を残して置き換える', async () => {
    snap(); const it = addItem(); render();
    setCellRich(it, col('確認内容'), 'りんごを買う', [{ t: 'りんご', b: 1, c: 'red' }, { t: 'を買う' }]);
    renderGrid();
    window.dialog = async () => ['りんご', '林檎'];
    TB.click('[data-act="replace"]'); await sleep(0);
    eq(it[K()], '林檎を買う', '文字');
    eq(cellRuns(it, col('確認内容')), [{ t: '林檎', b: 1, c: 'red' }, { t: 'を買う' }], '書式が残る');
  });

  test('貼り付け: 結果の列に OK / NG を貼ると、キーで付けたときと同じく実施者・実施日・履歴が入る', async () => {
    snap(); addItem(); addItem(); render();
    S.r = 0; S.c = cols().indexOf(col('結果')); collapse();
    TB.clip(ed(), 'paste', TB.dt({ text: 'OK\nNG' })); await sleep(0);
    const r = recOf(item(1).id, S.run);
    eq([r.verdict, r.by, r.byAuto, r.hist.length], ['ok', '田中', true, 1], '1行目');
    ok(/^\d{4}\/\d{2}\/\d{2}/.test(r.at), '実施日');
    eq(recOf(item(2).id, S.run).verdict, 'ng', '2行目');
    // 名前が未設定なら先に聞く
    S.me = ''; let asked = 0; window.dialog = async o => { asked++; return '鈴木'; };
    TB.clip(ed(), 'paste', TB.dt({ text: '保留' })); await sleep(0);
    eq([asked, recOf(item(1).id, S.run).by], [1, '鈴木'], '名前を聞いてから入れる');
    S.me = '田中';
  });

  test('行: 同じ所に 60 回連続で行を入れても並びが壊れない（精度が尽きたら振り直す）', () => {
    snap(); const a = addItem(), b = addItem();
    setF(a, K(), 'A'); setF(b, K(), 'B');
    render();
    for (let i = 0; i < 60; i++) { S.r = 0; collapse(); actions.addRow(); setF(curItem(), K(), 'x' + i); }
    const L = itemsOf(S.sheet);
    eq(L.length, 62);
    eq([L[0][K()], L[61][K()]], ['A', 'B'], '端は変わらない');
    for (let i = 1; i < L.length; i++) ok(L[i].order > L[i - 1].order, `order が増える (${i}: ${L[i - 1].order} < ${L[i].order})`);
    eq(new Set(L.map(x => x.order)).size, 62, '全部違う値');
    eq(L[1][K()], 'x59', '最後に入れたものが A のすぐ下');
  });

  test('エビデンス票: 表で絞り込んでいれば、◀ ▶ はその並びの中で動く', async () => {
    snap(); for (let i = 0; i < 5; i++) { const it = addItem(); setF(it, K(), 'r' + i); } render();
    await setVerdict(item(2), 'ng'); await setVerdict(item(4), 'ng'); await setVerdict(item(5), 'ng');
    TB.input('#vf', 'ng', 'change');
    eq(S.rows.map(i => i[K()]), ['r1', 'r3', 'r4']);
    openEvidence(item(2).id);
    ok(document.querySelector('.boardbar').textContent.includes('絞り込み中 1/3'), '絞り込みの中の位置が出る');
    TB.click('[data-act="evNav"][data-d="1"]');
    eq(getItem(S.boardItem)[K()], 'r3', '次の NG へ（r2 を飛ばす）');
    TB.click('[data-act="evNav"][data-d="1"]');
    eq(getItem(S.boardItem)[K()], 'r4');
    ok(document.querySelector('[data-act="evNav"][data-d="1"]').disabled, '絞り込みの最後で止まる');
    TB.click('[data-act="evNav"][data-d="-1"]'); TB.click('[data-act="evNav"][data-d="-1"]');
    eq(getItem(S.boardItem)[K()], 'r1');
    closeEvidence(); TB.input('#vf', '', 'change');
    openEvidence(item(1).id); TB.click('[data-act="evNav"][data-d="1"]');
    eq(getItem(S.boardItem)[K()], 'r1', '絞り込みがなければ全部の並び');
  });

  test('実施回: 追加するときに「前回 NG と未実施だけ」や「前回の結果を引き継ぐ」を選べる', async () => {
    snap(); for (let i = 0; i < 4; i++) addItem(); render();
    await setVerdict(item(1), 'ok'); await setVerdict(item(2), 'ng'); await setVerdict(item(3), 'na');  // item(4) は未実施
    const r1 = S.run;
    window.dialog = async o => o.inputs ? ['2回目', 'ngOnly'] : true;
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="addRun"]'); await sleep(0);
    eq(runName(S.run), '2回目');
    eq(itemsOf(S.sheet).map(i => verdictOf(i.id, S.run)), ['na', null, 'na', null], '前回 OK・対象外は対象外、NG と未実施はそのまま');
    eq(recOf(item(1).id, S.run).remark, '前回（1回目）はOK', '備考に理由');
    ok(TB.toasts().some(t => t.includes('2 件を対象外にしました')), 'お知らせ');
    TB.input('#vf', 'none', 'change'); eq(S.rows.length, 2, 'やる行だけ絞れる'); TB.input('#vf', '', 'change');
    window.dialog = async o => o.inputs ? ['3回目', 'copy'] : true;
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="addRun"]'); await sleep(0);
    eq(itemsOf(S.sheet).map(i => verdictOf(i.id, S.run)), ['na', null, 'na', null], '2回目の結果をそのまま引き継ぐ');
    eq(recOf(item(1).id, S.run).remark, '前回（1回目）はOK', '備考も引き継ぐ');
    TB.input('#runsel', r1, 'change');
    eq(itemsOf(S.sheet).map(i => verdictOf(i.id, S.run)), ['ok', 'ng', 'na', null], '1回目は変わらない');
    window.dialog = async o => o.inputs ? ['4回目', 'none'] : true;
    TB.click('[data-act="runMenu"]'); TB.click('#pop [data-act="addRun"]'); await sleep(0);
    eq(itemsOf(S.sheet).map(i => verdictOf(i.id, S.run)), [null, null, null, null], '引き継がない');
  });

  test('並べ替え: 列のメニューで昇順・降順に並べ替え、見出しに印、ツールバーで解除。数字は数として比べ、空は最後', async () => {
    snap(); for (const [t, n] of [['b', '10'], ['a', '9'], ['c', ''], ['a', '100']]) { const it = addItem(); setF(it, K(), t); setF(it, col('手順').id, n); } render();
    const th = name => `#grid th[data-cid="${col(name).id}"]`;
    TB.click(th('確認内容')); TB.click('#pop [data-act="colSort"][data-d="asc"]');
    eq(S.rows.map(i => i[K()]), ['a', 'a', 'b', 'c'], '昇順（同じなら元の順）');
    eq(S.rows.map(i => i[col('手順').id]), ['9', '100', '10', ''], '同じ値は元の順');
    ok(document.querySelector(th('確認内容') + ' .cfmark'), '見出しに印');
    TB.click(th('手順')); TB.click('#pop [data-act="colSort"][data-d="desc"]');
    eq(S.rows.map(i => i[col('手順').id]), ['100', '10', '9', ''], '数として降順、空は最後');
    ok(document.querySelector('[data-act="sortClear"]').textContent.includes('手順 降順'), 'ツールバー');
    eq(itemsOf(S.sheet).map(i => i[K()]), ['b', 'a', 'c', 'a'], '行の order そのものは変えない');
    TB.input('#q', 'a'); await sleep(250);
    eq(S.rows.map(i => i[col('手順').id]), ['100', '9'], '検索と組み合わさる');
    TB.input('#q', ''); await sleep(250);
    snap(); setF(S.rows[0], K(), 'a!'); renderGrid();
    eq(S.rows[0][K()], 'a!', '編集しても並びは保つ（描き直しは変わった行だけ）');
    TB.click('[data-act="sortClear"]');
    eq(S.rows.map(i => i[col('手順').id]), ['10', '9', '', '100'], '元の順に戻る');
  });

  test('報告書: セルの太字・色・1文字ずつの書式が報告書にも出る', async () => {
    snap(); const it = addItem(); setF(it, K(), '太字'); render();
    S.r = 0; S.c = cols().indexOf(col('確認内容')); collapse(); TB.gridKey('b', { ctrl: true });
    setCellRich(it, col('手順'), '赤い字', [{ t: '赤い', c: 'red' }, { t: '字' }]);
    window.print = () => {}; window.dialog = async o => o.inputs ? ['all', '0'] : true;
    await printReport(); await sleep(0);
    const r = document.querySelector('#report');
    ok(r.querySelector('td.fb') && r.querySelector('td.fb').textContent === '太字', '太字のセル');
    ok(r.querySelector('td .fc-red') && r.querySelector('td .fc-red').textContent === '赤い', '1文字ずつの色');
    dispatchEvent(new Event('afterprint'));
  });

  test('保存: 初めての保存の前に「開いているファイル自身を選ぶと上書き」の案内を一度だけ出す', async () => {
    localStorage.removeItem('testbook.saveHint');
    const h = new FakeHandle('a.html'); window.showSaveFilePicker = async () => h;
    const asked = []; window.dialog = async o => { asked.push(o.title); return true; };
    snap(); addItem();
    await save();
    eq(asked, ['保存先の選択'], '案内が出る'); eq(h.writes, 1, 'そのあと保存する');
    loadDoc(newDoc()); snap(); addItem();
    await save();
    eq(asked.length, 1, '2回目は出ない');
    localStorage.removeItem('testbook.saveHint');
    window.dialog = async () => null; loadDoc(newDoc()); snap(); addItem();
    await save();
    eq(h.writes, 2, '案内で「キャンセル」なら保存しない');
  });

  test('エビデンス票: 枠を黒塗りにして個人情報を隠せる。画像を動かすと、その上の枠・丸数字・矢印も一緒に動く', async () => {
    snap(); addItem(); render(); openEvidence(item(1).id);
    const owner = boardOwner();
    snap();
    const img = addEl(owner, 'image', { x: 20, y: 20, w: 400, h: 300, data: 'data:image/png;base64,iVBORw0KGgo=', name: 'a', nw: 400, nh: 300 });
    const fr = addEl(owner, 'frame', { x: 100, y: 100, w: 80, h: 40, color: 'red' });
    const mk = addEl(owner, 'marker', { x: 300, y: 200, w: 28, h: 28, n: 1, color: 'red' });
    const ln = addEl(owner, 'line', { x: 200, y: 150, w: 100, h: 0, arrow: true, color: 'red' });
    const out = addEl(owner, 'text', { x: 20, y: 400, w: 200, text: '画像の外' });
    renderBoard();
    selectEl(fr.id); TB.click('.seltb [data-act="elColor"][data-v="black"]');
    eq(fr.color, 'black'); ok(document.querySelector(`#board .el[data-eid="${fr.id}"]`).classList.contains('c-black'), '黒塗り');
    eq(riders(img).map(e => e.id).sort(), [fr.id, mk.id, ln.id].sort(), '画像の上の印');
    // 画像をドラッグ（押して、動かして、離す）
    startDrag({ clientX: 100, clientY: 100, preventDefault() {} }, img, 'move');
    dispatchEvent(new MouseEvent('mousemove', { clientX: 140, clientY: 124 }));
    dispatchEvent(new MouseEvent('mouseup', {}));
    eq([img.x, img.y], [60, 44], '画像が動く');
    eq([[fr.x, fr.y], [mk.x, mk.y], [ln.x, ln.y]], [[140, 124], [340, 224], [240, 174]], '印も同じだけ動く');
    eq([out.x, out.y], [20, 400], '画像の外のものは動かない');
    undo();
    eq([[img.x, img.y], [fr.x, fr.y]], [[20, 20], [100, 100]], 'まとめて元に戻る');
  });
})();
