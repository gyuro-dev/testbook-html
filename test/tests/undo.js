/* 元に戻す・やり直す、と、集計の作り置き（差分更新）がずれないことの試験。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item } = TB;
  const K = () => col('確認内容').id;
  // 作り置きの集計と、数え直した集計が同じか
  const tallyMatches = msg => { const fresh = tally(itemsOf(S.sheet), S.run); eq(sheetTally(S.sheet, S.run), fresh, msg + '（作り置きの集計と数え直し）'); };

  test('元に戻す: セルの編集を戻すと値が戻り、時刻は前より新しくなる（マージで古い版に負けない）', () => {
    snap(); const it = addItem(); setF(it, K(), '最初');
    snap(); setF(it, K(), '直した');
    const t1 = it.ts[K()];
    undo();
    eq(it[K()], '最初', '戻した値');
    ok(it.ts[K()] > t1, '時刻が進む');
    undo(true);
    eq(it[K()], '直した', 'やり直し');
  });

  test('元に戻す: 行の追加を戻すと行が消え、やり直すと戻る', () => {
    snap(); addItem();
    eq(itemsOf(S.sheet).length, 1);
    undo(); eq(itemsOf(S.sheet).length, 0, '戻す');
    undo(true); eq(itemsOf(S.sheet).length, 1, 'やり直す');
  });

  test('元に戻す: 戻すものがないときは何も起きない', () => {
    snap(); const it = addItem(); setF(it, K(), 'a');
    undo(); undo(); undo();
    eq(itemsOf(S.sheet).length, 0);
    undo(true); undo(true); undo(true);
    eq(item(1)[K()], 'a');
  });

  test('元に戻す: 結果を付けたのを戻すと、消化数の集計も戻る', async () => {
    snap(); addItem(); addItem(); addItem();
    await setVerdict(item(1), 'ok'); tallyMatches('OK を付けた後');
    eq(sheetTally(S.sheet, S.run).ok, 1);
    await setVerdict(item(2), 'ng'); await setVerdict(item(1), 'hold'); tallyMatches('付け替えた後');
    undo(); tallyMatches('1回戻した後'); eq(sheetTally(S.sheet, S.run).ok, 1);
    undo(); undo(); tallyMatches('全部戻した後');
    eq(sheetTally(S.sheet, S.run), { total: 3, ok: 0, ng: 0, hold: 0, na: 0, none: 3, done: 0 });
    undo(true); undo(true); tallyMatches('やり直した後');
  });

  test('元に戻す: 結果を付けた行を削除して戻しても、集計がずれない', async () => {
    snap(); addItem(); addItem();
    await setVerdict(item(1), 'ok'); await setVerdict(item(2), 'ng');
    snap(); setF(item(1), 'deleted', true); tallyMatches('削除した後');
    eq(sheetTally(S.sheet, S.run).total, 1);
    undo(); tallyMatches('削除を戻した後');
    eq(sheetTally(S.sheet, S.run), { total: 2, ok: 1, ng: 1, hold: 0, na: 0, none: 0, done: 2 });
  });

  test('結果: 実施者・実施日は自動で入り、手で直したものは結果を付け直しても上書きしない', async () => {
    snap(); const it = addItem();
    await setVerdict(it, 'ok');
    const r = recOf(it.id, S.run);
    eq(r.by, '田中', '自動で入る実施者'); ok(/^\d{4}\/\d{2}\/\d{2} \d{2}:\d{2}$/.test(r.at), '自動で入る実施日: ' + r.at);
    snap(); setRecField(it, 'by', '佐藤');
    await setVerdict(it, 'ng');
    eq(r.by, '佐藤', '手で直した実施者が残る');
    await setVerdict(it, null);
    eq([r.verdict, r.by], [null, '佐藤'], '未実施に戻しても手で直した実施者は残る');
    eq(r.at, '', '自動の実施日は消える');
  });

  test('結果: 範囲にまとめて付けられ、同じ値のときは何もしない', async () => {
    snap(); addItem(); addItem(); addItem();
    await setVerdictRows(itemsOf(S.sheet), 'na');
    eq(sheetTally(S.sheet, S.run).na, 3);
    const before = JSON.stringify(D.records);
    await setVerdictRows(itemsOf(S.sheet), 'na');
    eq(JSON.stringify(D.records), before, '同じ値を付け直しても変わらない');
  });

  test('行: 下に行を足すと、階層の列を引き継ぎ、並びは間に入る', () => {
    snap(); const a = addItem(), c = addItem();
    setF(a, col('大項目').id, '価格'); setF(a, col('中項目').id, '割引');
    const b = addItem(a, true);
    eq(itemsOf(S.sheet).map(i => i.id), [a.id, b.id, c.id], '並び');
    eq([b[col('大項目').id], b[col('中項目').id]], ['価格', '割引'], '引き継いだ階層');
    eq(b[col('確認内容').id], undefined, 'ほかの列は空');
  });
})();
