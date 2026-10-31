/* コメント（レビューの指摘）と、ほかの試験ファイルの集計（横断集計）の試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, clone, user } = TB;
  const K = () => col('確認内容').id;
  const pane = () => document.querySelector('#pane');
  const addCm = async (text) => { TB.input('#cmtext', text); TB.click('#pane [data-act="cmAdd"]'); await sleep(0); };

  test('コメント: 詳細パネルから選んでいる列にコメントを付けられ、セルに印と吹き出しが出る。Ctrl+Enter でも付く', async () => {
    snap(); setF(addItem(), K(), 'a'); render();
    S.r = 0; S.c = cols().indexOf(col('期待結果')); collapse(); paintCursor();
    ok(pane().textContent.includes('選んでいる列「期待結果」に付けます'), 'どこに付くか: ' + pane().querySelector('.cmt-new').textContent);
    await addCm('金額の根拠が書かれていません');
    const c = live(D.comments)[0];
    eq([c.item, c.col, c.text, c.by, c.done], [item(1).id, col('期待結果').id, '金額の根拠が書かれていません', '田中', false], 'コメント');
    const td = document.querySelector(`#grid td[data-r="0"][data-c="${cols().indexOf(col('期待結果'))}"]`);
    ok(td.classList.contains('cm'), 'セルに印');
    td.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    ok(td.title.startsWith('田中: 金額の根拠'), '吹き出し: ' + td.title);
    ok(pane().querySelectorAll('.cmt').length === 1 && pane().querySelector('.count').textContent === '1', 'パネルに出る');
    TB.input('#cmtext', '2つ目'); TB.key('#cmtext', 'Enter', { ctrl: true }); await sleep(0);
    eq(live(D.comments).length, 2, 'Ctrl+Enter でも付く');
    eq(live(D.comments)[1].col, col('期待結果').id, '同じ列に付く');
  });

  test('コメント: 「済」にすると印が消え、誰がいつ解決したかが残る。絞り込みと集計に出る', async () => {
    snap(); for (const t of ['a', 'b']) setF(addItem(), K(), t); render();
    S.r = 0; S.c = cols().indexOf(col('確認内容')); collapse(); paintCursor();
    await addCm('指摘1');
    const c = live(D.comments)[0];
    TB.input('#vf', 'cmOpen', 'change'); eq(S.rows.map(i => i[K()]), ['a'], '未解決のコメントあり');
    TB.input('#vf', '', 'change');
    const box = pane().querySelector('[data-act="cmDone"]');
    TB.click(box); await sleep(0);  // クリックでチェックが付く（本物のクリックと同じ）
    eq([c.done, c.doneBy, c.doneAt > 0], [true, '田中', true], '済');
    ok(!document.querySelector('#grid td.cm'), '印が消える');
    ok(pane().querySelector('.cmt.done') && pane().querySelector('.cmt').textContent.includes('解決済み（田中）'), 'パネルの見た目');
    TB.input('#vf', 'cmOpen', 'change'); eq(S.rows.length, 0, '未解決はない');
    TB.input('#vf', 'cm', 'change'); eq(S.rows.map(i => i[K()]), ['a'], 'コメントありには残る');
    TB.input('#vf', '', 'change');
    TB.click('[data-act="summary"]');
    const cards = [...document.querySelectorAll('#summary .card')].map(x => x.textContent.replace(/\s+/g, ''));
    ok(cards.includes('未解決のコメント0'), '集計のカード: ' + cards);
    TB.click('#tabs .tab[data-act="sheet"]');
    TB.click(pane().querySelector('[data-act="cmDone"]')); await sleep(0);
    eq(c.done, false, '戻せる');
    TB.click('#pane [data-act="cmDel"]'); await sleep(0);
    eq([live(D.comments).length, pane().querySelectorAll('.cmt').length], [0, 0], '削除');
    undo();
    eq(live(D.comments).length, 1, '元に戻せる');
  });

  test('コメント: 2人が別々に付けたコメントは両方残り、ファイルの往復でも残る。コメントの付いた行は削除されても残る', async () => {
    snap(); setF(addItem(), K(), 'a'); render();
    const b0 = clone(D);
    loadDoc(clone(b0)); S.me = '田中'; await addComment(item(1).id, '', '田中の指摘'); const tanaka = clone(D);
    loadDoc(clone(b0)); S.me = '佐藤'; await addComment(item(1).id, '', '佐藤の指摘'); const sato = clone(D);
    loadDoc(clone(tanaka)); const st = mergeInto(D, sato); render();
    eq(commentsOf(item(1).id).map(c => c.text), ['田中の指摘', '佐藤の指摘'], '両方残る');
    ok(mergeMsg(st).includes('コメント 1'), 'お知らせ: ' + mergeMsg(st));
    const back = await readBook(TB.savedFile());
    eq(back.comments.filter(c => !c.deleted).length, 2, 'ファイルに入る');
    // 田中が行を消したが、佐藤はその後にコメントを付けていた
    const t2 = user(tanaka, '田中', () => setF(item(1), 'deleted', true));
    loadDoc(clone(sato)); S.me = '佐藤'; await addComment(item(1).id, '', '消される前に'); const s2 = clone(D);
    loadDoc(clone(t2)); mergeInto(D, s2); render();
    eq(itemsOf(S.sheet).length, 1, '行が残る'); eq(live(D.conflicts)[0].kind, 'revived');
  });

  test('コメント: 項目そのものへのコメント（列を選んでいないとき）は No の列に印が付き、報告書に未解決の一覧が出る', async () => {
    snap(); setF(addItem(), K(), 'a'); render();
    S.r = 0; S.c = cols().findIndex(c => c.type === 'evidence'); collapse(); paintCursor();
    await addCm('この項目は要再考');
    eq(live(D.comments)[0].col, '', '列なし');
    ok(document.querySelector('#grid td[data-r="0"][data-c="0"]').classList.contains('cm'), 'No の列に印');
    window.print = () => {}; window.dialog = async o => o.inputs ? ['all', '0'] : true;
    await printReport(); await sleep(0);
    const r = document.querySelector('#report');
    ok(r.textContent.includes('未解決のコメント') && r.textContent.includes('この項目は要再考'), '報告書に出る');
    dispatchEvent(new Event('afterprint'));
    TB.key(document.body, 'm', { ctrl: true });
    eq(document.activeElement && document.activeElement.id, 'cmtext', 'Ctrl+M でコメント欄へ');
  });

  test('横断集計: 自由シートにほかの試験ファイルを落とすと集計カードになり、同じ試験をまた落とすと数字が新しくなる。合計のカードも置ける', async () => {
    TB.resetClock();
    // 2つの試験ファイルを用意する
    loadDoc(sampleDoc()); const fileA = TB.savedFile('shop.html');
    const b = newDoc(); b.meta.title = '管理 API 試験';
    loadDoc(b); snap(); for (let i = 0; i < 4; i++) addItem(); await setVerdictRows(itemsOf(S.sheet).slice(0, 2), 'ok'); await setVerdict(item(3), 'ng');
    const fileB = TB.savedFile('api.html');
    // まとめのファイル（自由シートだけ）
    const m = newDoc(); m.meta.title = 'まとめ'; m.sheets.unshift(newSheet('ダッシュボード', 'free', 0));
    loadDoc(m); S.me = '田中'; S.sheet = sheets()[0].id; render();
    TB.drop('#board', [fileA, fileB]); await sleep(300);
    const els = () => elementsOf(boardOwner());
    eq(els().map(e => [e.type, e.title]), [['xmetric', '小さなお店 結合試験'], ['xmetric', '管理 API 試験']], '2枚のカード');
    const a = els()[0];
    eq(a.runs.map(r => [r.name, r.total, r.ok, r.ng, r.done]), [['1回目', 12, 7, 1, 9], ['回帰', 12, 1, 0, 1]], '実施回ごとの数（shop）');
    eq(a.runs[0].ev, 2, '証跡のある項目の数');
    const card = document.querySelector(`#board .el[data-eid="${a.id}"]`);
    ok(card.textContent.includes('小さなお店 結合試験') && card.textContent.includes('9/12') && card.textContent.includes('75%') && card.textContent.includes('NG 1'), 'カードの文言: ' + card.textContent);
    // B を直してまた落とすと、カードが増えずに数字が変わる
    loadDoc(await readBook(fileB)); await setVerdict(item(4), 'ok'); const fileB2 = TB.savedFile('api.html');
    loadDoc(m); S.me = '田中'; S.sheet = sheets()[0].id; render();
    TB.drop('#board', [fileB2]); await sleep(300);
    eq(els().length, 2, 'カードは増えない');
    eq(els()[1].runs[0].ok, 3, '数字が新しくなる');
    TB.click('[data-act="tool"][data-t="xtotal"]'); await sleep(0);
    const tot = document.querySelector('#board .el-xtotal');
    ok(tot && tot.textContent.includes('2 ファイル') && tot.textContent.includes('16'), '合計: 12 + 4 項目: ' + tot.textContent.slice(0, 80));
    const n = [...tot.querySelectorAll('.mcards b')].map(b => b.textContent);
    eq(n, ['31%', '16', '4', '1', '0', '11'], '最後の実施回どうしの合計（shop は回帰 1/12、api は 1回目 4/4: OK 3 + NG 1）');
    // testbook でない HTML を落としても集計にはならず、添付になる
    TB.drop('#board', [new File(['<html>x</html>'], 'memo.html', { type: 'text/html' })]); await sleep(200);
    ok(els().some(e => e.type === 'text' && e.text.startsWith('【memo.html】')), 'ふつうのファイルとして置かれる（文字のファイルはログの枠）');
    ok(TB.toasts().some(t => t.includes('memo.html は testbook')), '断りの文言');
  });
})();
