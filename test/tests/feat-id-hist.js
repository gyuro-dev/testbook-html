/* ID の列、結果の履歴、置換、丸数字マーカーの試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, clone, user } = TB;
  const K = () => col('確認内容').id;
  const ids = () => itemsOf(S.sheet).map(i => i[col('ID').id]);
  // 「前提条件」の列を ID の列にする（接頭辞 TC-、3桁）
  const makeIdCol = async (prefix = 'TC-', digits = '3') => {
    window.dialog = async o => o.inputs ? [prefix, digits] : true;
    TB.click(`#grid th[data-cid="${col('前提条件').id}"]`); TB.click('#pop [data-act="colType"][data-t="id"]'); await sleep(0);
    window.dialog = async () => true;
  };

  test('ID: 列を ID にすると今ある行に上から振り、足した行には次の番号が付く。手では直せない', async () => {
    snap(); for (const t of ['a', 'b', 'c']) setF(addItem(), K(), t);
    render();
    await makeIdCol();
    const c = sheetCols(curSheet()).find(x => x.type === 'id');
    eq(c.name, '前提条件', '名前はそのまま（列13 のような仮の名前なら ID になる）');
    eq([c.prefix, c.digits], ['TC-', 3], '形式');
    eq(itemsOf(S.sheet).map(i => i[c.id]), ['TC-001', 'TC-002', 'TC-003'], '上から振る');
    TB.click('[data-act="addRow"]');
    eq(curItem()[c.id], 'TC-004', '足した行（1行目の下に入る）は次の番号');
    S.r = 0; S.c = cols().indexOf(c); collapse(); paintCursor();
    TB.typeText('手で'); TB.gridKey('Enter');
    eq(item(1)[c.id], 'TC-001', '手では直せない');
    ok(document.querySelector(`#grid td[data-r="0"][data-c="${cols().indexOf(c)}"]`).classList.contains('idc'), '見た目');
    eq(freezeOf(curSheet()), 1 + 3 + 0, '既定の固定は No と先頭の階層まで（ID は階層の後ろにあるので含まない）');
  });

  test('ID: 行を複製・移動・削除しても番号は変わらず、複製には新しい番号が付く', async () => {
    snap(); for (const t of ['a', 'b']) setF(addItem(), K(), t);
    render(); await makeIdCol();
    const c = sheetCols(curSheet()).find(x => x.type === 'id');
    S.r = 0; S.c = cols().indexOf(col('確認内容')); collapse(); paintCursor();
    TB.gridKey('D', { ctrl: true, shift: true });
    eq(itemsOf(S.sheet).map(i => [i[K()], i[c.id]]), [['a', 'TC-001'], ['a', 'TC-003'], ['b', 'TC-002']], '複製は新しい番号');
    TB.gridKey('ArrowDown', { alt: true });
    eq(itemsOf(S.sheet).map(i => i[c.id]), ['TC-001', 'TC-002', 'TC-003'], '動かしても番号はそのまま');
    window.dialog = async () => true;
    TB.click('[data-act="delRow"]'); await sleep(0);
    TB.click('[data-act="addRow"]');
    eq(itemsOf(S.sheet).map(i => i[c.id]).includes('TC-004'), true, '消した番号は使い回さない');
    TB.gridKey('z', { ctrl: true }); TB.gridKey('z', { ctrl: true });
    eq(itemsOf(S.sheet).map(i => i[c.id]), ['TC-001', 'TC-002', 'TC-003'], '元に戻せる');
  });

  test('ID: Excel から貼った行にも振られ、CSV と検索にも出る', async () => {
    snap(); setF(addItem(), K(), 'a'); render(); await makeIdCol('CASE-', '2');
    const c = sheetCols(curSheet()).find(x => x.type === 'id');
    S.r = 0; S.c = cols().indexOf(col('確認内容')); collapse();
    TB.clip(ed(), 'paste', TB.dt({ text: 'x\ny\nz' })); await sleep(0);
    eq(itemsOf(S.sheet).map(i => [i[K()], i[c.id]]), [['x', 'CASE-01'], ['y', 'CASE-02'], ['z', 'CASE-03']], '貼って増えた行にも振る（1行目は上書き）');
    TB.input('#q', 'CASE-03'); await sleep(250);
    eq(S.rows.map(i => i[K()]), ['z'], '検索で見つかる');
    TB.input('#q', ''); await sleep(250);
    let got = null; window.download = (name, blob) => { got = blob; };
    exportCsv();
    ok((await got.text()).includes('"CASE-03"'), 'CSV に出る');
  });

  test('ID: 2人が同時に行を足して同じ番号になったら、合わせたときに新しいほうを振り直す', async () => {
    snap(); setF(addItem(), K(), 'a'); render(); await makeIdCol();
    const c = sheetCols(curSheet()).find(x => x.type === 'id'), b0 = clone(D);
    const tanaka = user(b0, '田中', () => setF(addItem(), K(), '田中の行'));
    const sato = user(b0, '佐藤', () => setF(addItem(), K(), '佐藤の行'));
    eq([tanaka.items[1][c.id], sato.items[1][c.id]], ['TC-002', 'TC-002'], '別々に足すと同じ番号になる');
    loadDoc(clone(tanaka)); S.me = '田中';
    const st = mergeInto(D, sato); render();
    const all = itemsOf(S.sheet).map(i => [i[K()], i[c.id]]);
    eq(all.map(x => x[1]).sort(), ['TC-001', 'TC-002', 'TC-003'], '重ならない: ' + JSON.stringify(all));
    eq(all.find(x => x[0] === '田中の行')[1], 'TC-002', '先に付いたほう（田中）は残る');
    eq(st.renum, 1); ok(mergeMsg(st).includes('重複していた ID 1 件'), 'お知らせ: ' + mergeMsg(st));
    eq(curSheet().idNext, 3, 'シートの番号も進む');
    // もう一度合わせても変わらない
    eq(mergeInto(D, sato).n, 0);
  });

  test('ID: 形式の変更はこれから振る分だけに効き、「振り直す」で全部を今の並びで振り直す', async () => {
    snap(); for (const t of ['a', 'b']) setF(addItem(), K(), t); render(); await makeIdCol();
    const c = sheetCols(curSheet()).find(x => x.type === 'id');
    window.dialog = async o => o.inputs ? ['T', '2'] : true;
    TB.click(`#grid th[data-cid="${c.id}"]`); TB.click('#pop [data-act="colIdFmt"]'); await sleep(0);
    TB.click('[data-act="addRowEnd"]');
    eq(itemsOf(S.sheet).map(i => i[c.id]), ['TC-001', 'TC-002', 'T03'], '新しい行から新しい形式');
    TB.gridKey('ArrowUp', { alt: true });
    window.dialog = async () => true;
    TB.click(`#grid th[data-cid="${c.id}"]`); TB.click('#pop [data-act="colIdRenum"]'); await sleep(0);
    eq(itemsOf(S.sheet).map(i => i[c.id]), ['T01', 'T02', 'T03'], '今の並びで振り直す');
  });

  test('履歴: 結果を変えるたびに「誰がいつ何に」が残り、詳細パネルに出る。元に戻すと履歴も戻る', async () => {
    snap(); addItem(); render();
    await setVerdict(item(1), 'ok');
    S.me = '佐藤'; await setVerdict(item(1), 'ng');
    const r = recOf(item(1).id, S.run);
    eq(r.hist.map(h => [h.v, h.by]), [['ok', '田中'], ['ng', '佐藤']], '履歴');
    ok(r.hist[1].t > r.hist[0].t, '時刻は進む');
    r.hist[0].t -= 2 * HIST_FIX; r.hist[1].t -= HIST_FIX + 1;  // 2分以上前に付けたことにする（打ち間違いのまとめの対象外）
    const pane = document.querySelector('#pane');
    ok(pane.textContent.includes('結果の履歴') && pane.querySelectorAll('.hist > div').length === 2, 'パネルに出る');
    ok(pane.querySelector('.hist').textContent.includes('佐藤') && pane.querySelector('.hist').textContent.includes('OK →'), '前の値 → 今の値: ' + pane.querySelector('.hist').textContent);
    undo();
    eq([recOf(item(1).id, S.run).verdict, recOf(item(1).id, S.run).hist.length], ['ok', 1], '戻すと履歴も戻る');
    await setVerdict(item(1), 'ok');
    eq(recOf(item(1).id, S.run).hist.length, 1, '同じ値を付け直しても増えない');
    recOf(item(1).id, S.run).hist[0].t -= HIST_FIX + 1;
    await setVerdict(item(1), null);
    eq(recOf(item(1).id, S.run).hist.slice(-1)[0].v, '', '未実施に戻したのも残る');
  });

  test('履歴: 同じ人が2分以内に付け直したら打ち間違いとみなして1件にまとめ、元に戻したなら残さない', async () => {
    snap(); addItem(); render();
    await setVerdict(item(1), 'ng');   // 間違えて NG
    await setVerdict(item(1), 'ok');   // すぐ OK に直した
    const r = recOf(item(1).id, S.run);
    eq(r.hist.map(h => h.v), ['ok'], '1件にまとまる');
    await setVerdict(item(1), 'hold');  // また間違えた
    await setVerdict(item(1), 'ok');    // 戻した
    eq(r.hist.map(h => h.v), ['ok'], '元の値に戻したら増えない');
    r.hist[0].t -= HIST_FIX + 1;        // 2分たった
    await setVerdict(item(1), 'ng');
    eq(r.hist.map(h => h.v), ['ok', 'ng'], '時間がたてば別の1件');
    S.me = '佐藤'; await setVerdict(item(1), 'ok');
    eq(r.hist.map(h => [h.v, h.by]), [['ok', '田中'], ['ng', '田中'], ['ok', '佐藤']], '別の人なら別の1件');
  });

  test('履歴: 1件ずつ消す・項目ごと消す・試験全体で消すことができ、消したものは合わせても戻ってこない', async () => {
    snap(); addItem(); addItem(); render();
    await setVerdict(item(1), 'ok');
    const r = recOf(item(1).id, S.run); r.hist[0].t -= HIST_FIX + 1;
    await setVerdict(item(1), 'ng'); r.hist[1].t -= HIST_FIX + 1;
    await setVerdict(item(1), 'hold');
    eq(r.hist.length, 3);
    const before = clone(D);  // 消す前のファイル（ほかの人が持っている）
    // 1件消す
    const pane = document.querySelector('#pane');
    TB.click(pane.querySelectorAll('[data-act="histDel"]')[2]);  // 一番古い（新しい順に並ぶので最後）
    eq(r.hist.map(h => h.v), ['ng', 'hold'], '1件消える'); eq(r.histX.length, 1, '消した時刻を覚える');
    mergeInto(D, before); render();
    eq(recOf(item(1).id, S.run).hist.map(h => h.v), ['ng', 'hold'], '消す前のファイルと合わせても戻らない');
    TB.gridKey('z', { ctrl: true });
    eq(recOf(item(1).id, S.run).hist.length, 3, 'Ctrl+Z で戻る');
    // 項目ごと消す
    TB.click(pane.querySelector('[data-act="histClear"]'));
    const r2 = recOf(item(1).id, S.run);
    eq([r2.hist.length, r2.histClr > 0], [0, true], '全部消える'); ok(!pane.querySelector('.hist'), 'パネルからも消える');
    mergeInto(D, before); render();
    eq(recOf(item(1).id, S.run).hist.length, 0, '合わせても戻らない');
    eq(recOf(item(1).id, S.run).verdict, 'hold', '結果そのものは残る');
    await setVerdict(item(1), 'ok');
    eq(recOf(item(1).id, S.run).hist.map(h => h.v), ['ok'], '消したあとの変更は新しく残る');
    // 試験全体で消す
    await setVerdict(item(2), 'ng');
    window.dialog = async () => true;
    TB.click('[data-act="more"]'); TB.click('#pop [data-act="histClearAll"]'); await sleep(0);
    eq(live(D.records).map(x => (x.hist || []).length), [0, 0], '全部の記録の履歴が消える');
    ok(TB.toasts().some(t => t.includes('2 件の履歴を消しました')));
    TB.gridKey('z', { ctrl: true });
    eq(live(D.records).map(x => (x.hist || []).length), [1, 1], 'Ctrl+Z で戻る');
  });

  test('履歴: 2人が別々に結果を変えていたら、合わせたときに両方の履歴が残る', async () => {
    snap(); addItem(); render();
    await setVerdict(item(1), 'ok');
    const b0 = clone(D);
    loadDoc(clone(b0)); S.me = '田中'; await setVerdict(item(1), 'ng'); const tanaka = clone(D);
    loadDoc(clone(b0)); S.me = '佐藤'; await setVerdict(item(1), 'hold'); const sato = clone(D);
    loadDoc(clone(tanaka)); mergeInto(D, sato); render();
    const h = recOf(item(1).id, S.run).hist;
    eq(h.map(x => x.v), ['ok', 'ng', 'hold'], '両方の履歴（時刻順）');
    eq(live(D.conflicts).filter(c => c.k === 'hist').length, 0, '履歴そのものは競合にしない');
    eq(mergeHist([{ v: 'a', t: 1 }, { v: 'b', t: 2 }], [{ v: 'b', t: 2 }, { v: 'c', t: 3 }]).map(x => x.v), ['a', 'b', 'c'], '同じ時刻のものは1つに');
    eq(mergeHist(Array.from({ length: 40 }, (_, i) => ({ v: 'x', t: i })), []).length, HIST_MAX, '直近だけ残す');
  });

  test('履歴: セルにマウスを乗せると、いつ変えたかが出る', async () => {
    snap(); const it = addItem(); setF(it, K(), 'a'); render();
    await setVerdict(it, 'ok');
    const td = document.querySelector(`#grid td[data-r="0"][data-c="${cols().indexOf(col('確認内容'))}"]`);
    td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    ok(/^更新日時 \d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(td.title), '文字の列: ' + td.title);
    const tv = document.querySelector(`#grid td[data-r="0"][data-c="${cols().indexOf(col('結果'))}"]`);
    tv.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    ok(tv.title.startsWith('更新日時 ') && tv.title.includes('（田中）'), '結果の列は誰が: ' + tv.title);
    const tn = document.querySelector(`#grid td[data-r="0"][data-c="${cols().indexOf(col('手順'))}"]`);
    tn.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    eq(tn.title, '', '触っていないセルには出ない');
  });

  test('置換: 表に出ている行の文字の列を置き換え、Ctrl+Z で一度に戻る。範囲を選んでいればその中だけ', async () => {
    snap(); for (const [a, b] of [['りんごを買う', 'りんご'], ['バナナを買う', 'りんご'], ['りんごとバナナ', '']]) { const it = addItem(); setF(it, K(), a); setF(it, col('手順').id, b); }
    render();
    window.dialog = async () => ['りんご', '林檎'];
    TB.key(document.body, 'h', { ctrl: true }); await sleep(0);
    eq(itemsOf(S.sheet).map(i => [i[K()], i[col('手順').id]]), [['林檎を買う', '林檎'], ['バナナを買う', '林檎'], ['林檎とバナナ', '']], '全部置き換わる');
    ok(TB.toasts().some(t => t.includes('4 個のセルを置き換えました')), 'お知らせ: ' + TB.toasts());
    TB.gridKey('z', { ctrl: true });
    eq(itemsOf(S.sheet).map(i => i[K()]), ['りんごを買う', 'バナナを買う', 'りんごとバナナ'], '一度に戻る');
    // 範囲だけ
    S.r = 0; S.c = cols().indexOf(col('確認内容')); collapse(); TB.gridKey('ArrowDown', { shift: true });
    TB.click('[data-act="replace"]'); await sleep(0);
    eq(itemsOf(S.sheet).map(i => [i[K()], i[col('手順').id]]), [['林檎を買う', 'りんご'], ['バナナを買う', 'りんご'], ['りんごとバナナ', '']], '選んだ範囲（確認内容の1〜2行目）だけ');
    // 絞り込み中は出ている行だけ
    collapse(); TB.input('#q', 'バナナ'); await sleep(250);
    window.dialog = async () => ['バナナ', '🍌'];
    TB.click('[data-act="replace"]'); await sleep(0);
    eq(itemsOf(S.sheet).map(i => i[K()]), ['林檎を買う', '🍌を買う', 'りんごと🍌'], '絞り込みに出ている行だけ');
    window.dialog = async () => ['ない文字', 'x'];
    TB.click('[data-act="replace"]'); await sleep(0);
    ok(TB.toasts().some(t => t === '見つかりませんでした'));
  });

  test('丸数字: ①②③ を置け、番号と色を変えられ、コピーしても番号が残る', async () => {
    snap(); addItem(); render(); openEvidence(item(1).id);
    const els = () => elementsOf(boardOwner());
    TB.click('[data-act="tool"][data-t="marker"]'); await sleep(0);
    TB.click('[data-act="tool"][data-t="marker"]'); await sleep(0);
    eq(els().map(e => [e.type, e.n]), [['marker', 1], ['marker', 2]], '順に番号が付く');
    eq([...document.querySelectorAll('#board .el-marker')].map(d => d.textContent), ['1', '2'], '描かれる');
    TB.click('.seltb [data-act="elNum"][data-d="1"]'); TB.click('.seltb [data-act="elNum"][data-d="1"]');
    eq(els()[1].n, 4, '＋で増える');
    TB.click('.seltb [data-act="elNum"][data-d="-1"]'); eq(els()[1].n, 3, '−で減る');
    TB.click('.seltb [data-act="elColor"][data-v="blue"]');
    ok(document.querySelector('#board .el-marker.c-blue'), '色');
    ok(!document.querySelector(`#board .el[data-eid="${els()[1].id}"] .rh`), '大きさは変えない（つかみなし）');
    const dt = TB.clip(document.querySelector('#boardwrap'), 'copy', TB.dt());
    TB.click('[data-act="tool"][data-t="marker"]'); await sleep(0);
    eq(els()[2].n, 4, '次の番号は今ある最大 + 1');
    TB.clip(document.querySelector('#boardwrap'), 'paste', TB.dt({ extra: { [EL_MIME]: dt.getData(EL_MIME) } })); await sleep(0);
    eq([els()[3].type, els()[3].n, els()[3].color], ['marker', 3, 'blue'], '貼ると番号と色が残る');
    ok(document.querySelector('#pane') && true, '');
    closeEvidence();
    ok(document.querySelector('#pane .minib .el-marker'), '詳細パネルの縮小表示にも出る');
  });
})();
