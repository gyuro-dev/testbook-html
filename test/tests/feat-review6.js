/* 0.3.0 の前のレビューで直したところの試験: 自動保存の途中で別のファイルを開いたとき、保存の部品の扱い、
 * 未解決のコメントのカード、クリップボードの大きさ、まとめて開く折りたたみ、矢印キーでの移動、貼り付けの位置、記録の索引。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, FakeHandle } = TB;
  const K = () => col('確認内容').id;
  const idle = () => { S.lastEdit = performance.now() - 60000; };
  const draftOf = id => idb('drafts', 'readonly', st => st.get(id));
  const clearDrafts = () => idb('drafts', 'readwrite', st => st.clear());
  const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
  // 自動保存が JSON を作る途中で画面に制御を返すくらい大きな表にする
  const bigSheet = () => {
    const sh = curSheet(), C = sheetCols(sh), t = now();
    for (let i = 0; i < 100000; i++) D.items.push({ id: 'big_' + i, sheet: sh.id, order: i + 1, ts: {}, updatedAt: t, [C[3].id]: `項目 ${i + 1} の確認内容をここに書く` });
    S.ver++;
  };

  /* ---------- 自動保存と、別のファイルを開くこと ---------- */
  test('自動保存: JSON を作っている途中で別のファイルを開くと、混ざった中身を書かず、開いた文書の状態にも触らない', async () => {
    await clearDrafts();
    bigSheet();
    const h = new FakeHandle('a.html'); S.handle = h; S.auto = true;
    snap(); setF(item(1), K(), '前の文書'); idle();
    const p = autoSave();
    await sleep(0);                               // 自動保存が最初の区切りで制御を返したところ
    ok(S.saving, '自動保存の途中');
    const other = newDoc(), h2 = new FakeHandle('b.html');
    loadDoc(other, h2); S.lastMod = 777;          // 別のファイルを開いた
    snap(); setF(addItem(), K(), '新しい文書'); render();
    await idb('drafts', 'readwrite', st => st.put({ id: other.meta.id, title: 't', at: now(), clock: CLOCK, json: new Blob(['x']) }, other.meta.id));
    await p;
    eq(h.writes, 0, '前のファイルには何も書かない（書けば2つの文書が混ざる）');
    eq(h2.writes, 0, '新しいファイルにも書かない');
    eq(S.dirty, true, '新しい文書の変更は、保存済みにならない');
    eq(S.lastMod, 777, '新しいファイルの最終更新時刻はそのまま');
    ok(await draftOf(other.meta.id), '新しい文書の下書きは消さない');
  });

  test('自動保存: 書き終えるまでの間に別のファイルを開いても、前のファイルには前の文書だけを書き、新しい文書には触らない', async () => {
    await clearDrafts();
    const h = new FakeHandle('a.html'); S.handle = h; S.auto = true;
    const key = K();  // 文書を切り替える前の列の ID
    snap(); setF(addItem(), key, '前の文書'); idle();
    const write = h.createWritable.bind(h), other = newDoc();
    h.createWritable = async () => { loadDoc(other, new FakeHandle('b.html')); S.lastMod = 777; snap(); setF(addItem(), K(), '新しい文書'); return write(); };
    await autoSave();
    eq(h.writes, 1, '前のファイルには書く');
    const saved = await readBook(h.file);
    eq(saved.items.map(i => i[key]), ['前の文書'], '前の文書だけ');
    ok(saved.meta.id !== other.meta.id, '新しい文書の中身は入らない');
    eq([S.dirty, S.lastMod], [true, 777], '新しい文書は保存済みにならず、最終更新時刻もそのまま');
  });

  test('下書き: 作っている途中で別のファイルを開くと、下書きを置かない', async () => {
    await clearDrafts();
    bigSheet();
    S.handle = null;
    snap(); setF(item(1), K(), '前の文書'); idle();
    const oldId = D.meta.id, p = saveDraft();
    await sleep(0);
    const other = newDoc();
    loadDoc(other, null);
    await p;
    ok(!(await draftOf(oldId)), '前の文書の下書きは、混ざるので置かない');
    ok(!(await draftOf(other.meta.id)), '新しい文書の ID でも置かない');
  });

  /* ---------- 保存の部品 ---------- */
  test('保存: fileBlob に渡した部品は、頼まないかぎり使えなくしない', async () => {
    snap(); setF(addItem(), K(), 'x');
    const parts = jsonParts(), a = fileBlob(parts), b = fileBlob(parts);
    eq(await b.text(), await a.text(), '同じ部品で2回作っても同じ中身');
    ok(parts.every(p => p.length > 0), '部品はそのまま');
    eq(a.jsonLen, parts.chars, '大きさは文字数');
    fileBlob(parts, true);
    if (ArrayBuffer.prototype.transfer) ok(parts.every(p => p.length === 0), '頼めばすぐ手放す');
  });

  test('保存: 文字数を持たない部品を渡しても、大きさの上限を確かめられる', () => {
    snap(); setF(addItem(), K(), 'x');
    const text = TB.partsText(jsonParts());
    eq(fileBlob([text]).jsonLen, text.length);
  });

  /* ---------- 未解決のコメントのカード ---------- */
  test('集計: 未解決のコメントのカードは行の数で、押すと同じ数の行が出る', async () => {
    snap(); for (const t of ['A', 'B', 'C']) setF(addItem(), K(), t);
    render();
    for (const n of [1, 2, 3]) await addComment(item(1).id, '', 'コメント' + n);  // 1行に3つ
    await addComment(item(2).id, '', 'コメント');
    actions.summary();
    const card = $('#summary [data-vf="cmOpen"]');
    ok(card.textContent.includes('コメント未解決'), 'カードの文言');
    eq(card.querySelector('.v').textContent, '2', 'コメントは4つだが、行は2つ');
    TB.click(card);
    eq(S.rows.length, 2, '押すと2行');
    eq($('#hits').textContent, '2 / 3 件を表示');
  });

  /* ---------- クリップボードの大きさ ---------- */
  const openBoard = () => { snap(); addItem(); render(); openEvidence(item(1).id); };
  test('クリップボード: 日本語の多い大きな文字は、バイト数で上限を超えたらこのタブの中に持つ', () => {
    openBoard();
    const big = addEl(boardOwner(), 'text', { x: 0, y: 0, w: 300, text: 'あ'.repeat(12 * 1024 * 1024) });  // 1,200 万文字。UTF-8 で 36MB
    selectEl(big.id);
    const dt = new DataTransfer();
    ok(copyElement(dt, false));
    ok(S.elClip && S.elClip.tag, 'このタブの中に持つ');
    eq(JSON.parse(dt.getData(EL_MIME)), { tbClip: S.elClip.tag }, 'クリップボードには合い札だけ');
    setF(big, 'text', 'a'.repeat(12 * 1024 * 1024));  // ASCII なら 12MB
    const dt2 = new DataTransfer();
    ok(copyElement(dt2, false));
    eq(typeof S.elClip, 'string', '上限より小さいのでクリップボードに載せる');
    closeEvidence();
  });

  /* ---------- 折りたたみをまとめて開く ---------- */
  test('集計から行へ・すべて畳む: グループがたくさんあっても、覚えておく場所に1回だけ書く', () => {
    snap();
    const lv = sheetCols(curSheet()).find(c => c.type === 'level').id;
    for (let i = 0; i < 200; i++) for (const t of ['a', 'b']) { const it = addItem(); setF(it, lv, 'g' + i); setF(it, K(), t); }
    render();
    const proto = Storage.prototype, orig = proto.setItem;
    let writes = 0;
    proto.setItem = function (k, v) { if (String(k).startsWith('testbook.fold.')) writes++; return orig.call(this, k, v); };
    try {
      actions.foldAll({ dataset: { on: '1' } });
      eq([writes, foldSet(curSheet()).size], [1, 200], 'すべて畳む');
      writes = 0;
      actions.summary();
      TB.click($('#summary [data-vf="none"]'));
      eq([writes, foldSet(curSheet()).size], [1, 0], '集計から行へ飛ぶと、まとめて開く');
      actions.foldAll({ dataset: { on: '1' } }); writes = 0;
      actions.foldAll({ dataset: { on: '0' } });
      eq([writes, foldSet(curSheet()).size], [1, 0], 'すべて開く');
    } finally { proto.setItem = orig; }
  });

  /* ---------- 矢印キーでの移動 ---------- */
  test('ボード: 矢印キーで動かすと、選んだ画像の上の印（選んでいないもの）も一緒に動く。1つだけ選んだときも', () => {
    openBoard();
    const o = boardOwner();
    const img = addEl(o, 'image', { x: 100, y: 100, w: 200, h: 100, data: PNG, nw: 1, nh: 1 });
    const frame = addEl(o, 'frame', { x: 150, y: 120, w: 40, h: 30 });
    const note = addEl(o, 'text', { x: 400, y: 100, w: 100, text: '説明' });
    renderBoard();
    selectEls([img.id, note.id]);
    TB.key('#boardwrap', 'ArrowRight', { shift: true });
    eq([img.x, note.x, frame.x], [116, 416, 166], '選んだ2つと、画像の上の枠');
    undo();
    eq([img.x, note.x, frame.x], [100, 400, 150], '1回で戻る');
    selectEl(img.id);
    TB.key('#boardwrap', 'ArrowDown');
    eq([img.y, frame.y], [101, 121], '1つだけでも、ドラッグと同じく上の印が動く');
    TB.key('#boardwrap', 'ArrowLeft', { shift: true });
    eq(img.x, 84, '左へ');
    closeEvidence();
  });

  /* ---------- 貼り付けの位置 ---------- */
  test('貼り付け: 検査で落とした物の位置は、全体の左上に入れない', () => {
    openBoard();
    const o = boardOwner(), p = nextPos(o, true);
    ok(pasteElements(JSON.stringify([
      { type: 'unknown', x: -5000, y: -5000, w: 10, h: 10 },
      { type: 'text', x: 100, y: 100, w: 100, text: 'a' },
      { type: 'text', x: 140, y: 120, w: 100, text: 'b' },
    ])));
    const els = elementsOf(o);
    eq(els.map(e => e.text), ['a', 'b'], '知らない種類は貼らない');
    eq(els.map(e => [e.x, e.y]), [[p.x, p.y], [p.x + 40, p.y + 20]], '残った物の左上が貼り付けの位置');
    closeEvidence();
  });

  /* ---------- 結果の記録の索引 ---------- */
  test('結果の記録: 削除の印を付けても外しても、索引を作り直さずに集計が合う。元に戻すときは作り直す', async () => {
    snap(); for (const t of ['A', 'B']) setF(addItem(), K(), t);
    render();
    await setVerdict(item(1), 'ng');
    render(); buildIndex();
    const ix = IX, r = recOf(item(1).id, S.run), recount = () => tally(itemsOf(S.sheet), S.run);
    sheetTally(S.sheet, S.run); allTally(S.run);
    snap(); setF(r, 'deleted', true);
    buildIndex();
    ok(IX === ix, '消しても作り直さない');
    eq([recOf(item(1).id, S.run), IX.dead.get(r.id) === r], [null, true], '索引から外れて、削除の印の表に入る');
    eq(sheetTally(S.sheet, S.run), recount(), '消したあとの集計');
    eq(allTally(S.run), recount(), '全体の集計');
    snap(); setF(r, 'deleted', false);
    buildIndex();
    ok(IX === ix, '戻しても作り直さない');
    eq(recOf(item(1).id, S.run), r);
    eq(sheetTally(S.sheet, S.run), recount(), '戻したあとの集計');
    const ver = S.ver;
    undo();
    ok(S.ver !== ver, '元に戻すときは作り直す');
    eq(recOf(item(1).id, S.run), null);
    eq(sheetTally(S.sheet, S.run), recount(), '元に戻したあとの集計');
  });

  test('結果の記録: 削除の印の間は、項目と実施回を変えても索引を作り直さない', async () => {
    snap(); setF(addItem(), K(), 'A'); render();
    await setVerdict(item(1), 'ok');
    const r = recOf(item(1).id, S.run);
    snap(); setF(r, 'deleted', true);
    buildIndex();
    const ix = IX;
    snap(); setF(r, 'item', item(1).id); setF(r, 'run', S.run);
    buildIndex();
    ok(IX === ix);
  });

  test('検索: 大文字の İ を小文字にしたときに現れる文字は、ソースで \\u0307 と書いてある', () => {
    ok(rowMatcher.toString().includes("'\\u0307'"), '目に見える形で書く');
    const C = sheetCols(curSheet());
    snap(); setF(addItem(), K(), 'İstanbul'); render();
    ok(rowMatcher(C, 'i̇'.toLowerCase())(item(1)), '見つかる');
  });
})();
