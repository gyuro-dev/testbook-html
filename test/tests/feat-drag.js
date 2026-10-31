/* 行と列をドラッグで動かす試験と、実施回を続けて足す試験。
 * ドラッグは本物と同じく、要素の上で mousedown、window に mousemove と mouseup を送る（アプリは window で受ける）。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep } = TB;
  const mouse = (type, target, x, y, buttons) => (target || window).dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, button: 0, buttons, clientX: x, clientY: y }));
  const center = el => { const r = el.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; };
  const th = name => [...document.querySelectorAll('#grid th[data-cid]')].find(t => t.dataset.cid === col(name).id);
  const noCell = r => document.querySelector(`#grid td[data-r="${r}"][data-c="0"]`);
  const names = () => sheetCols(curSheet()).map(c => c.name);
  const K = () => col('確認内容').id;
  const titles = () => itemsOf(S.sheet).map(it => it[K()]);
  const rows = (...ts) => { snap(); for (const t of ts) setF(addItem(), K(), t); render(); };
  // 列の見出しを押して、x まで動かして離す
  const dragTh = (name, x) => {
    const t = th(name), [x0, y0] = center(t);
    mouse('mousedown', t, x0, y0, 1);
    mouse('mousemove', null, x0 + (x > x0 ? 10 : -10), y0, 1);
    mouse('mousemove', null, x, y0, 1);
    mouse('mouseup', null, x, y0, 0);
    return t;
  };
  // No の列の r 行目を押して、行 to の上半分（before）か下半分に動かして離す
  const dragRow = (r, to, before) => {
    const from = noCell(r), [x0, y0] = center(from), tr = noCell(to).parentElement.getBoundingClientRect();
    const y = before ? tr.top + 3 : tr.bottom - 3;
    mouse('mousedown', from, x0, y0, 1);
    mouse('mousemove', null, x0, y0 + (y > y0 ? 8 : -8), 1);
    mouse('mousemove', null, x0, y, 1);
    mouse('mouseup', null, x0, y, 0);
  };
  const selectRows = (r0, r1) => { TB.clickCell(r0, 0); if (r1 != null) TB.clickCell(r1, 0, { shift: true }); };

  test('列のドラッグ: 見出しを横に動かすとその列が動き、Ctrl+Z 1回で戻る。動かさなければ今までどおり列のメニュー', async () => {
    rows('a');
    const start = names();
    const t = dragTh('確認内容', th('手順').getBoundingClientRect().left + 5);
    eq(names().slice(3, 6), ['前提条件', '確認内容', '手順'], '確認内容が前提条件の後ろへ');
    ok(!document.querySelector('#dropline') || document.querySelector('#dropline').hidden, '線は消える');
    TB.click(th('確認内容'));
    ok(document.querySelector('#pop').hidden, 'ドラッグの直後の click ではメニューを開かない');
    undo(); render();
    eq(names(), start, 'Ctrl+Z 1回で元の並び');
    await sleep(350);
    TB.click(th('確認内容'));
    ok(!document.querySelector('#pop').hidden && document.querySelector('#pop').textContent.includes('名前を変更'), '動かさずに押すとメニュー');
    hidePop();
    dragTh('備考', th('大項目').getBoundingClientRect().left + 3);
    eq(names()[0], '備考', '一番左（No の次）へも動かせる');
    eq(cols()[S.c].name, '備考', '動かした列が選ばれている');
  });

  test('列のドラッグ: 少しだけ動かして同じ場所に戻したら、何も変わらず履歴も増えない', () => {
    rows('a');
    const start = names(), n = UNDO.length;
    dragTh('手順', center(th('手順'))[0] + 2);
    eq(names(), start, '並びはそのまま');
    eq(UNDO.length, n, '元に戻す履歴が増えない');
  });

  test('行のドラッグ: No で選んだ行を No でつかんで動かす。何行でも、上へも下へも。Ctrl+Z で戻る', () => {
    rows('1', '2', '3', '4', '5');
    selectRows(1);
    dragRow(1, 3, false);
    eq(titles(), ['1', '3', '4', '2', '5'], '2 を 4 の下へ');
    eq([S.rows[S.r][K()], rng().c0, rng().c1], ['2', 1, cols().length - 1], '動かした行が選ばれたまま');
    undo(); render();
    eq(titles(), ['1', '2', '3', '4', '5'], 'Ctrl+Z 1回で戻る');
    selectRows(2, 3);
    dragRow(2, 0, true);
    eq(titles(), ['3', '4', '1', '2', '5'], '3 と 4 をまとめて一番上へ');
    selectRows(4);
    dragRow(4, 0, false);
    eq(titles(), ['3', '5', '4', '1', '2'], '一番下の行を 1 行目の下へ');
  });

  test('行のドラッグ: 選んでいない行を No で押してドラッグすると、今までどおり範囲選択。選んだ行を押して動かさなければ、その行を選ぶ', () => {
    rows('1', '2', '3', '4');
    TB.clickCell(0, 2);
    const [x0, y0] = center(noCell(0));
    mouse('mousedown', noCell(0), x0, y0, 1);
    mouse('mousemove', noCell(2), x0, center(noCell(2))[1], 1);
    mouse('mouseup', null, x0, center(noCell(2))[1], 0);
    eq([rng().r0, rng().r1], [0, 2], '範囲選択になる');
    eq(titles(), ['1', '2', '3', '4'], '並びは変わらない');
    const [x1, y1] = center(noCell(1));
    mouse('mousedown', noCell(1), x1, y1, 1); mouse('mouseup', null, x1, y1, 0);
    eq([rng().r0, rng().r1, S.r], [1, 1, 1], '選んだ中の 1 行を押して離すと、その行だけを選ぶ');
  });

  test('行のドラッグ: 絞り込み中は表に出ている行の間に入り、隠れている行は動かない。並べ替え中は動かせない', () => {
    rows('a1', 'b2', 'a3', 'b4', 'a5');
    S.q = 'a'; render();
    eq(S.rows.map(it => it[K()]), ['a1', 'a3', 'a5'], '絞り込んだ表');
    selectRows(2);
    dragRow(2, 0, true);
    eq(titles(), ['a5', 'a1', 'b2', 'a3', 'b4'], 'a5 が a1 の前へ。b2・b4 は元の場所');
    S.q = ''; render();
    actions.colSort({ dataset: { cid: K(), d: 'desc' } });
    const before = titles();
    selectRows(0);
    dragRow(0, 2, false);
    eq(titles(), before, '並べ替え中は動かない');
    ok(TB.toasts().some(t => t.includes('並べ替え中は行を移動できません')), '理由が出る');
  });

  test('行のドラッグ: 同じ所に何十回入れても並びが崩れない（精度が尽きたら振り直す）', () => {
    rows('1', '2', '3');
    for (let i = 0; i < 60; i++) { selectRows(2); dragRow(2, 1, true); selectRows(1); dragRow(1, 2, true); }
    eq(titles(), ['1', '2', '3'], '行き来しても並びが保たれる');
    const os = itemsOf(S.sheet).map(it => it.order);
    ok(os.every((o, i) => !i || o > os[i - 1]), 'order が狭義の昇順');
  });

  test('行のドラッグ: 保存して読み直しても、ほかの人のファイルと合わせても、動かした並びが残る', async () => {
    rows('1', '2', '3');
    const base = TB.clone(D);
    selectRows(0); dragRow(0, 2, false);
    const mine = TB.clone(D);
    loadDoc(await readBook(TB.savedFile())); render();
    eq(titles(), ['2', '3', '1'], '読み直しても同じ');
    loadDoc(TB.clone(base)); mergeInto(D, mine); render();
    eq(titles(), ['2', '3', '1'], '動かす前のファイルに合わせると、動かしたほうになる');
  });

  test('実施回: メニューから続けて何回でも足せて、名前は 2回目・3回目・4回目と進む', async () => {
    window.dialog = TB.realDialog;
    for (let i = 2; i <= 4; i++) {
      TB.click(document.querySelector('[data-act="runMenu"]'));
      const add = document.querySelector('#pop [data-act="addRun"]');
      ok(add && !document.querySelector('#pop').hidden, `${i}回目: メニューに「実施回を追加」がある`);
      TB.click(add); await sleep(0);
      const d = TB.dlg();
      ok(d, `${i}回目: 窓が出る`);
      eq(d.querySelector('input[data-i="0"]').value, `${i}回目`, `${i}回目: 名前の初期値`);
      TB.click(d.querySelector('[data-r="1"]')); await sleep(0);
    }
    eq(runs().map(r => r.name), ['1回目', '2回目', '3回目', '4回目'], '4つになる');
    eq(runName(S.run), '4回目', '足した実施回に切り替わる');
  });

  // 実施回を2つにして、2回目に結果とエビデンスを付けておく
  const twoRuns = async () => {
    snap(); const it = addItem(); setF(it, K(), 'a'); render();
    const r2 = { id: uid('r_'), name: '2回目', order: 2, ts: {}, updatedAt: now() };
    D.runs.push(r2); created(r2); S.run = r2.id;
    applyVerdict(it, 'ng');
    addEl(evOwner(it.id, r2.id), 'text', { x: 10, y: 10, w: 200, text: '2回目の証跡' });
    S.run = runs()[0].id; applyVerdict(it, 'ok'); S.run = r2.id; render();
    return { it, r2 };
  };

  test('実施回の削除: メニューから今の実施回を消すと、その回の結果とエビデンス票も消え、ほかの回はそのまま。Ctrl+Z で戻る', async () => {
    const { it, r2 } = await twoRuns();
    let msg = '';
    window.dialog = async o => { msg = o.message; return true; };
    TB.click(document.querySelector('[data-act="runMenu"]'));
    const del = document.querySelector('#pop [data-act="delRun"]');
    ok(del && del.textContent.includes('「2回目」を削除'), 'メニューに今の実施回の削除がある');
    TB.click(del); await sleep(0);
    ok(msg.includes('結果 1 件') && msg.includes('エビデンス票 1 枚'), '何が消えるかを確認で出す: ' + msg);
    eq(runs().map(r => r.name), ['1回目'], '2回目が消える');
    eq(runName(S.run), '1回目', '残っている実施回に切り替わる');
    eq(verdictOf(it.id, S.run), 'ok', '1回目の結果はそのまま');
    ok(D.records.filter(x => x.run === r2.id).every(x => x.deleted), '2回目の結果は消える');
    ok(D.elements.filter(e => e.owner === evOwner(it.id, r2.id)).every(e => e.deleted), '2回目のエビデンス票も消える');
    ok(TB.toasts().some(t => t.includes('「2回目」を削除しました')), '知らせる');
    undo();
    eq(runs().map(r => r.name), ['1回目', '2回目'], 'Ctrl+Z 1回で戻る');
    S.run = r2.id; render();
    eq([verdictOf(it.id, r2.id), elementsOf(evOwner(it.id, r2.id)).length], ['ng', 1], '結果とエビデンスも戻る');
  });

  test('実施回の削除: 1つしかないときはメニューに出さず、消せない。キャンセルなら何も変わらない', async () => {
    TB.click(document.querySelector('[data-act="runMenu"]'));
    ok(!document.querySelector('#pop [data-act="delRun"]'), '1つならメニューに出ない');
    hidePop();
    await actions.delRun();
    eq(runs().length, 1, '消えない');
    ok(TB.toasts().some(t => t.includes('最後の実施回は削除できません')), '理由が出る');
    await twoRuns();
    window.dialog = async () => null;
    await actions.delRun();
    eq(runs().length, 2, 'キャンセルなら残る');
  });

  test('実施回の削除: 消したあとで、ほかの人がその回に結果を付けていたら、合わせたときに実施回ごと戻して競合として知らせる', async () => {
    const { it, r2 } = await twoRuns();
    const base = TB.clone(D);
    await actions.delRun();
    const mine = TB.clone(D);
    const theirs = TB.user(base, '佐藤', () => { S.run = r2.id; applyVerdict(getItem(it.id), 'ok'); });
    loadDoc(TB.clone(mine)); const st = mergeInto(D, theirs); render();
    eq(runs().map(r => r.name), ['1回目', '2回目'], '2回目が戻る');
    eq(verdictOf(it.id, r2.id), 'ok', 'ほかの人の結果が残る');
    ok(st.conflicts >= 1 && D.conflicts.some(c => c.kind === 'revived' && c.coll === 'runs'), '競合として知らせる');
    renderConflicts();
    ok(document.querySelector('#cfpanel').textContent.includes('実施回「2回目」'), '競合の一覧にどの実施回かが出る');
    document.querySelector('#cfpanel').remove();
    const untouched = TB.user(base, '佐藤', () => {});
    loadDoc(TB.clone(mine)); mergeInto(D, untouched); render();
    eq(runs().map(r => r.name), ['1回目'], 'ほかの人が何もしていなければ消えたまま');
  });
})();
