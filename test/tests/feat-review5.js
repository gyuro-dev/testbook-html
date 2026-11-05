/* 5回目のレビューで直したところの試験: 集計から行へ飛ぶ、表示件数と解除ボタン、操作のヒント、
 * 速くした処理（検索・行の高さ・列や行の移動・集計・保存）が前と同じ結果を返すこと。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item } = TB;
  const K = () => col('確認内容').id;
  const shown = () => S.rows.map(i => i[K()]);
  // 3行: A は NG（大項目 甲）、B は OK（甲）、C は未実施（乙）
  const setup = async () => {
    snap();
    const lv = sheetCols(curSheet()).find(c => c.type === 'level').id;
    for (const [t, g] of [['A', '甲'], ['B', '甲'], ['C', '乙']]) { const it = addItem(); setF(it, K(), t); setF(it, lv, g); }
    render();
    await setVerdict(item(1), 'ng'); await setVerdict(item(2), 'ok');
    render();
    return lv;
  };
  const openSummary = () => { actions.summary(); return $('#summary'); };

  /* ---------- 集計から行へ ---------- */
  test('集計: NG のカードを押すと、NG の行だけの表が開く', async () => {
    await setup();
    TB.click(openSummary().querySelector('.card.ng[data-act="sumGo"]'));
    eq(S.view, 'sheet', '表に戻る');
    eq(S.vf, 'ng', '結果の絞り込みが付く');
    eq(shown(), ['A']);
    eq($('#vf').value, 'ng', 'ツールバーの選択肢も合っている');
  });

  test('集計: 0 件のカードと数字は押せない', async () => {
    await setup();
    const s = openSummary();
    ok(!s.querySelector('[data-vf="hold"]'), '保留は 0 件なので押せない');
    ok(s.querySelector('[data-vf="none"]'), '未実施は 1 件なので押せる');
  });

  test('集計: カードは Enter キーでも押せる', async () => {
    await setup();
    const c = openSummary().querySelector('.card[data-vf="none"]');
    eq(c.tabIndex, 0, 'Tab で届く');
    TB.key(c, 'Enter');
    eq(shown(), ['C']);
  });

  test('集計: 大項目の行の数字は、その大項目だけに絞る', async () => {
    const lv = await setup();
    TB.click(openSummary().querySelector('tr.sub[data-g="甲"] td[data-vf="ok"]'));
    eq(shown(), ['B']);
    eq([...S.cf[lv]], ['甲'], '大項目の列に絞り込みが付く');
  });

  test('集計: シート名を押すと、絞り込みなしでそのシートを開く', async () => {
    await setup();
    S.q = 'A'; S.vf = 'ng';
    TB.click(openSummary().querySelector(`tr[data-sid="${S.sheet}"]:not(.sub) td:first-child`));
    eq(S.q, ''); eq(S.vf, '');
    eq(shown(), ['A', 'B', 'C']);
  });

  test('集計: 前の検索・列の絞り込み・折りたたみが残っていても、数字どおりの行が出る', async () => {
    const lv = await setup();
    S.q = 'zzz'; S.cf[col('確認内容').id] = new Set(['B']); S.cfVer++;
    setFold(curSheet(), '甲', true);
    TB.click(openSummary().querySelector('.card.ng[data-act="sumGo"]'));
    eq(S.q, ''); eq($('#q').value, '', '検索欄も空');
    eq(shown(), ['A']);
    eq(activeCf(curSheet()).length, 0, '列の絞り込みも外れる');
    ok(!foldSet(curSheet()).has('甲'), '畳んだ大項目も開く');
    ok(lv, '大項目の列がある');
  });

  test('集計: カードは該当する行のあるシートへ。今のシートになくても別のシートへ飛び、複数あれば知らせる', async () => {
    await setup();
    const first = S.sheet;
    window.dialog = async () => 'シート2';
    await actions.addSheet({ dataset: { k: 'cases' } });
    const sheet2 = D.sheets.find(s => s.id !== first && s.kind === 'cases');
    eq(S.sheet, sheet2.id, '足したシートに移る');
    snap(); const it = addItem(); setF(it, sheetCols(sheet2).find(c => c.type === 'text').id, 'X'); render();
    await setVerdict(it, 'hold'); render();
    S.sheet = first; render();
    TB.click(openSummary().querySelector('.card[data-vf="hold"]'));
    eq(S.sheet, sheet2.id, '保留の行があるのは2つ目のシートだけ');
    await setVerdict(it, 'ng'); render();
    TB.click(openSummary().querySelector('.card[data-vf="ng"]'));
    ok(TB.toasts().some(t => t.includes('2 シート')), '両方のシートにあると知らせる');
  });

  test('集計: 証跡の表の数字も押せる', async () => {
    await setup();
    TB.click(openSummary().querySelector(`tr[data-sid="${S.sheet}"] td[data-vf="okNoev"]`));
    eq(shown(), ['B']);
  });

  test('集計: 大項目の名前に HTML の文字があっても、そのまま絞り込める', async () => {
    const lv = await setup();
    const evil = '"><img src=x onerror=alert(1)>';
    snap(); setF(item(3), lv, evil); render();
    const s = openSummary();
    ok(!s.querySelector('img'), 'HTML として解釈しない');
    const tr = [...s.querySelectorAll('tr.sub')].find(x => x.dataset.g === evil);
    ok(tr, '元の文字のまま持っている');
    TB.click(tr.querySelector('td[data-vf="none"]'));
    eq(shown(), ['C']);
  });

  test('集計: 数字は全部を数え直した結果と同じ（作り置きを使っても、結果を変えたあとでずれない）', async () => {
    await setup();
    openSummary();
    actions.sheet({ dataset: { id: S.sheet } });
    await setVerdict(item(3), 'hold');           // 集計の作り置きがある状態で変える
    snap(); const n = addItem(); setF(n, K(), 'D'); render();  // 行も足す
    const s = openSummary(), fresh = tally(caseSheets().flatMap(x => itemsOf(x.id)), S.run);
    const cardNum = sel => +s.querySelector(sel + ' .v').textContent;
    eq(cardNum('.card.hold'), fresh.hold, '保留');
    eq(cardNum('.card.ng'), fresh.ng, 'NG');
    eq(cardNum('.card[data-vf="none"]'), fresh.none, '未実施');
    eq(allTally(S.run).total, fresh.total, '項目数');
  });

  test('推移: 日の変わり目と、時刻が前後しても、1件ずつ Date で求めた日と同じ', () => {
    const naive = ts => { const d = new Date(ts); return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}`; };
    const base = new Date(2026, 2, 1).getTime(), rnd = TB.rng(42);
    for (let i = 0; i < 3000; i++) {
      const ts = base + Math.floor(rnd() * 300) * 86400000 + (rnd() < 0.3 ? (rnd() < 0.5 ? 0 : -1) : Math.floor(rnd() * 86400000));
      if (dayOf(ts) !== naive(ts)) TB.fail(`${ts}: ${dayOf(ts)} / ${naive(ts)}`);
    }
  });

  /* ---------- 表示件数と解除 ---------- */
  test('表示件数: 検索・絞り込みの間だけ「n / 全体 件を表示」が出る', async () => {
    await setup();
    ok($('#hits').hidden, '絞っていないときは出ない');
    TB.input('#vf', 'ng', 'change');
    ok(!$('#hits').hidden, '絞ると出る');
    eq($('#hits').textContent, '1 / 3 件を表示');
    TB.input('#vf', '', 'change');
    ok($('#hits').hidden, '戻すと消える');
  });

  test('表示件数: 列の値の絞り込みでも出る。行の結果を変えて外れても数が合う', async () => {
    await setup();
    TB.input('#vf', 'ok', 'change');
    eq($('#hits').textContent, '1 / 3 件を表示');
    await setVerdict(item(1), 'ok'); render();
    eq($('#hits').textContent, '2 / 3 件を表示');
  });

  test('0件のとき: 「絞り込みを解除」で検索語・結果・列の絞り込みがまとめて外れる', async () => {
    await setup();
    S.q = '存在しない語'; S.vf = 'ng'; S.cf[K()] = new Set(['A']); S.cfVer++;
    renderToolbar(); renderGrid();
    eq(S.rows.length, 0);
    TB.click($('#grid [data-act="clearFilter"]'));
    eq([S.q, S.vf, activeCf(curSheet()).length], ['', '', 0]);
    eq(shown(), ['A', 'B', 'C']);
    eq($('#q').value, '', '検索欄も空');
    eq($('#vf').value, '', '選択肢も戻る');
  });

  test('0件のとき: 行がまだないシートには解除のボタンを出さない', () => {
    render();
    ok(!$('#grid [data-act="clearFilter"]'));
    ok($('#grid [data-act="addRow"]'), '行を足すボタンは出る');
  });

  /* ---------- ヒント ---------- */
  test('ヒント: 表の未実施・証跡の＋・行番号・列の見出しに、できることの説明がある', async () => {
    await setup();
    S.q = ''; renderGrid();
    const j = type => cols().findIndex(c => c.type === type), td = (r, type) => $(`#grid td[data-r="${r}"][data-c="${j(type)}"]`);
    ok(td(2, 'verdict').querySelector('.v-none').title.includes('1〜4'), '未実施');
    ok(td(2, 'evidence').querySelector('.ev-add').title.includes('Ctrl+V'), '証跡の＋');
    ok($('#grid td[data-r="0"][data-c="0"]').title.includes('Alt+↑↓'), '行番号');
    ok($('#grid th[data-act="colMenu"]').title.includes('ドラッグ'), '列の見出し');
  });

  test('ヒント: 詳細パネルの結果のボタンにキーを出す。エビデンス票はキーが効かないので出さない', async () => {
    await setup();
    S.pane = true; render();
    ok($('#pane button[data-act="verdict"][data-v="ok"]').title.includes('1'), '詳細パネル');
    openEvidence(item(1).id);
    eq($('#boardview button[data-act="verdict"][data-v="ok"]').title, '', 'エビデンス票');
    ok($('#boardview button[data-t="frame"]').title.includes('黒塗り'), '＋ 枠 の説明');
    closeEvidence();
  });

  test('ヒント: 開くと取り込みの違いが分かる。ボタンの文言は変えない', () => {
    const o = $('[data-act="open"]'), i = $('[data-act="import"]');
    eq([o.textContent, i.textContent], ['開く', '取り込み']);
    ok(o.title.includes('閉じ'), '開く');
    ok(i.title.includes('1つにまとめる'), '取り込み');
  });

  /* ---------- 速くした処理が同じ結果を返すこと ---------- */
  test('検索: 大文字・小文字の扱いは前と同じ（全角英字・ギリシャ文字・ドイツ語・トルコ語も）', async () => {
    await setup();
    const C = sheetCols(curSheet()), old = (it, q) => C.map(c => cellText(it, c)).join('\n').toLowerCase().includes(q);
    const texts = ['ＡＰＩの確認', 'api 確認', 'API', 'ΣΑΣ', 'σας', 'STRASSE', 'Straße', 'İstanbul', 'KELVIN K', '割引', '１２３', 'a\nb', '㎏', 'Ⅳ'];
    snap();
    for (const t of texts) setF(addItem(), K(), t);
    render();
    const queries = ['ａｐｉ', 'ＡＰＩ', 'api', 'API', 'σ', 'ς', 'σας', 'ΣΑΣ', 'ß', 'ss', 'i̇', 'i', '̇', 'k', '割引', '１２', 'ⅳ', 'Ⅳ', 'ok', 'OK', '田中', '㎏', '存在しない'];
    for (const raw of queries) {
      const q = raw.toLowerCase(), m = rowMatcher(C, q);
      for (const it of itemsOf(S.sheet)) if (m(it) !== old(it, q)) TB.fail(`「${raw}」/「${it[K()]}」: ${m(it)}`);
    }
  });

  test('検索: 結果・実施者・チェック・数値の列も見つかる', async () => {
    await setup();
    S.q = '田中'; renderGrid(); eq(shown(), ['A', 'B'], '実施者');
    S.q = 'ng'; renderGrid(); eq(shown(), ['A'], '結果の文字');
    S.q = ''; renderGrid();
  });

  test('検索: 列を消すと、その列の文字では見つからなくなる（前の結果を使い回さない）', async () => {
    await setup();
    S.q = 'A'; renderGrid(); eq(shown(), ['A']);
    const id = K();
    setColumns(cs => { cs.find(c => c.id === id).deleted = true; });
    eq(S.rows.length, 0, '消した列は探さない');
  });

  test('行の高さ: 見積もりは前の計算と同じ（改行・長い文字・実施回ごとの列）', async () => {
    const old = (it, C) => {
      let lines = 1;
      for (const c of C) {
        if (!TEXTUAL.has(c.type)) continue;
        const v = String(getCell(it, c));
        if (!v) continue;
        const per = Math.max(1, Math.floor((c.w - 16) / 13));
        let n = 0, seg = 0;
        for (let i = 0; i < v.length; i++) { if (v.charCodeAt(i) === 10) { n += Math.max(1, Math.ceil(seg / per)); seg = 0; } else seg++; }
        n += Math.max(1, Math.ceil(seg / per));
        if (n > lines) lines = n;
      }
      return Math.round(ROW_PAD + lines * LINE_H);
    };
    await setup();
    snap();
    const long = 'あ'.repeat(200), rnd = TB.rng(7);
    for (let i = 0; i < 60; i++) {
      const it = addItem();
      setF(it, K(), rnd() < 0.3 ? long : rnd() < 0.5 ? 'a\nb\nc' : '短い');
      setF(it, col('手順').id, rnd() < 0.5 ? '\n\n\n' : '1. 開く\n' + long);
    }
    render();
    await setVerdict(item(5), 'ok'); snap(); setRecField(item(5), 'remark', '備考\n' + long); render();
    const C = cols();
    for (const it of itemsOf(S.sheet)) eq(estimateH(it, C), old(it, C), it.id);
  });

  test('列の移動: 結果の索引と行の高さの作り置きを捨てず、表は新しい並びで描く', async () => {
    await setup();
    buildIndex();
    const ix = IX, rows = S.rows, rh = S.rh.size;
    const ids = sheetCols(curSheet()).map(c => c.id);
    setColumns(cs => { const c = cs.splice(2, 1)[0]; cs.splice(3, 0, c); });
    buildIndex();
    ok(IX === ix, '索引は作り直さない');
    ok(S.rows === rows, '行の一覧もそのまま');
    eq(S.rh.size, rh, '行の高さの見積もりもそのまま');
    eq([...$('#grid').tHead.rows[0].cells].slice(1, 5).map(th => th.dataset.cid), [ids[0], ids[1], ids[3], ids[2]], '見出しは新しい並び');
    undo();
    eq(sheetCols(curSheet()).map(c => c.id), ids, '元に戻せる');
    eq([...$('#grid').tHead.rows[0].cells].slice(1, 5).map(th => th.dataset.cid), ids.slice(0, 4), '見出しも戻る');
  });

  test('列の設定: 名前・幅・固定の変更は表に出る。幅を変えると行の高さを見積もり直す', async () => {
    await setup();
    const c = col('確認内容');
    setColumns(cs => { cs.find(x => x.id === c.id).name = '新しい名前'; });
    ok($('#grid').tHead.textContent.includes('新しい名前'), '名前');
    const fz = S.fz;
    snap(); setF(curSheet(), 'freeze', fz + 1); renderGrid();
    eq(S.fz, fz + 1, '固定');
    snap(); setF(item(1), c.id, 'あ'.repeat(100)); renderGrid();
    const before = S.fen.sum(S.rows.length);
    setColumns(cs => { cs.find(x => x.id === c.id).w = 60; });
    ok(S.fen.sum(S.rows.length) > before, '幅を狭めると、行が高くなる');
  });

  test('列の変更: 大項目の列が変わると、折りたたみのグループも作り直す', async () => {
    const lv = await setup();
    const before = groupsOf(curSheet());
    ok(before.get('甲') === 2 && before.get('乙') === 1);
    setColumns(cs => { cs.find(c => c.id === lv).deleted = true; });
    ok(!groupsOf(curSheet()).has('甲'), '消した列のグループは残らない');
  });

  test('行の移動: 結果の索引は作り直さず、行の順と番号は変わる。元に戻せる', async () => {
    await setup();
    buildIndex();
    const ix = IX, t = sheetTally(S.sheet, S.run);
    S.r = 0; S.curId = item(1).id; S.c = 1; collapse();
    moveRow(1);
    buildIndex();
    ok(IX === ix, '索引は作り直さない');
    ok(sheetTally(S.sheet, S.run) === t, '集計も作り直さない');
    eq(shown(), ['B', 'A', 'C']);
    eq(TB.cellText(1, 0).replace('+', ''), '2', '番号は表示の順');
    undo();
    eq(shown(), ['A', 'B', 'C']);
  });

  test('行の追加: 集計は足すだけで、全部を数え直した結果と同じ。足した行にすぐ結果を付けられる', async () => {
    await setup();
    const sid = S.sheet;
    buildIndex();
    const ix = IX;
    sheetTally(sid, S.run); allTally(S.run);
    snap(); const it = addItem(item(1), true);
    buildIndex();
    ok(IX === ix, '索引は作り直さない');
    eq(sheetTally(sid, S.run), tally(itemsOf(sid), S.run), 'シートの集計');
    eq(allTally(S.run), tally(itemsOf(sid), S.run), '全体の集計');
    eq(getItem(it.id), it, '行は ID で引ける');
    await setVerdict(it, 'ok');
    eq(sheetTally(sid, S.run), tally(itemsOf(sid), S.run), '結果を付けたあと');
    undo(); undo();
    eq(sheetTally(sid, S.run), tally(itemsOf(sid), S.run), '元に戻したあと');
  });

  test('実施回: 同じ項目でも実施回ごとに別の記録を引く。ID に | があっても混ざらない', async () => {
    await setup();
    const r1 = S.run, it = item(1);
    const r2 = { id: 'r|x', name: '二', order: 99, ts: {}, updatedAt: now() };
    D.runs.push(r2); created(r2); buildIndex();
    const rec = ensureRec(it, r2.id);
    eq(recOf(it.id, r2.id), rec);
    eq(recOf(it.id, r1).verdict, 'ng', '前の実施回はそのまま');
    eq(recOf('no-such', r1), null);
    eq(recOf(it.id, 'no-such'), null);
  });

  test('保存: 128KB ごとにバイト列にしても、中身は1件ずつ作ったものと同じ', async () => {
    await setup();
    const sh = curSheet(), C = sheetCols(sh), t = now();
    for (let i = 0; i < 12000; i++) D.items.push({ id: 'big_' + i, sheet: sh.id, order: i + 10, ts: {}, updatedAt: t, [C[3].id]: `<項目> ${i} ` + 'あ'.repeat(120) });
    S.ver++;
    const parts = jsonParts(), text = TB.partsText(parts);
    let want = `{"format":"testbook","version":2,"meta":${J(D.meta)}`;
    for (const k of COLLS) want += `,"${k}":[` + D[k].map(o => jsonOf(k, o)).join(',') + ']';
    want += '}';
    ok(text === want, '同じ文字列になる');
    ok(!text.includes('<'), '< は残らない');
    ok(parts.length < 40, `Blob に渡す部品が少ない（${parts.length}）`);
    ok(parts.some(p => p.length >= PART_CHARS), 'まとめている');
    ok(parts.every(p => p.length < 4 * PART_CHARS), '大きすぎる部品はない');
    eq(parts.chars, text.length, '上限を見るのは文字数');
    ok(parts.every(p => p instanceof Uint8Array), '文字列のまま持ち続けない（保存のあとの GC で画面を止めない）');
    const asyncParts = await jsonPartsAsync();
    ok(TB.partsText(asyncParts) === want, '自動保存の作り方でも同じ');
    eq((await readBook(new File([fileBlob(parts)], 't.html'))).items.length, D.items.length, '読み直せる');
  });

  /* ---------- 結果を付け直す（削除の印が付いた記録を生き返らせる） ---------- */
  const recount = () => tally(itemsOf(S.sheet), S.run);

  test('結果: 付けて戻して付け直しても、1行ごとに索引を作り直さず、集計も合う', async () => {
    await setup();
    await setVerdict(item(3), 'hold');
    undo();                                     // 記録に削除の印が付く
    render(); buildIndex();
    const ix = IX, ver = S.ver;
    ok(ix.dead.size === 1, '削除の印が付いた記録を索引が知っている');
    eq(sheetTally(S.sheet, S.run), recount(), '戻したあと');
    await setVerdict(item(3), 'ok');
    buildIndex();
    ok(IX === ix && S.ver === ver, '索引を作り直さない');
    eq(ix.dead.size, 0, '生き返った記録は外れる');
    eq(recOf(item(3).id, S.run).verdict, 'ok');
    eq(D.records.filter(r => r.item === item(3).id).length, 1, '記録は増えない');
    eq(sheetTally(S.sheet, S.run), recount(), '付け直したあと');
    eq(allTally(S.run), recount(), '全体の集計');
    ok($('#progress').textContent.includes('NG 1'), 'ツールバーの数字');
    undo();
    eq(verdictOf(item(3).id, S.run), null, '元に戻せる');
    eq(sheetTally(S.sheet, S.run), recount(), 'もう一度戻したあと');
    undo(true);
    eq(verdictOf(item(3).id, S.run), 'ok', 'やり直せる');
    eq(sheetTally(S.sheet, S.run), recount(), 'やり直したあと');
  });

  test('結果: 何百行もまとめて付け直しても、索引は作り直さない（行数の2乗で遅くならない）', async () => {
    snap();
    for (let i = 0; i < 300; i++) setF(addItem(), K(), 'R' + i);
    render();
    const rows = () => S.rows.slice(0);
    await setVerdictRows(rows(), 'ok');
    undo(); render(); buildIndex();
    const ix = IX;
    await setVerdictRows(rows(), 'ng');
    buildIndex();
    ok(IX === ix, '索引はそのまま');
    eq(recount().ng, 300);
    eq(sheetTally(S.sheet, S.run), recount());
  });

  test('結果: 保存して開き直したあとの記録（ID と時刻だけが残ったもの）も付け直せる', async () => {
    await setup();
    await setVerdict(item(3), 'hold');
    undo(); render();
    const id = item(3).id;
    loadDoc(normalize(JSON.parse(TB.partsText(jsonParts()))));
    S.me = '田中'; render(); buildIndex();
    const dead = D.records.find(r => r.deleted);
    ok(dead && dead.item === undefined, '削除の印の記録には項目がない');
    await setVerdict(getItem(id), 'ok');
    const r = recOf(id, S.run);
    ok(r === dead, '同じ記録を使う');
    eq([r.deleted, r.item, r.run, r.verdict], [false, id, S.run, 'ok']);
    eq(sheetTally(S.sheet, S.run), recount());
    const saved = JSON.parse(TB.partsText(jsonParts())).records.find(x => x.id === r.id);
    eq([saved.item, saved.run, saved.verdict], [id, S.run, 'ok'], 'ファイルにも入る');
  });

  test('結果: 結果の値を持ったまま削除の印が付いた記録を生き返らせると、集計に戻る', async () => {
    await setup();
    const r = recOf(item(1).id, S.run);
    snap(); setF(r, 'deleted', true); render();
    eq(recount().ng, 0, '消えている');
    eq(sheetTally(S.sheet, S.run), recount());
    snap(); ensureRec(item(1));
    eq(recount().ng, 1, '戻る');
    eq(sheetTally(S.sheet, S.run), recount(), '作り置きの集計も合う');
  });

  test('行の参照: 今のシートの行・ほかのシートの行・削除した行のどれも引ける', async () => {
    await setup();
    const first = S.sheet, a = item(1), gone = item(2);
    renderGrid();
    window.dialog = async () => 'シート2';
    await actions.addSheet({ dataset: { k: 'cases' } });
    snap(); const b = addItem(); renderGrid();
    eq(getItem(b.id), b, '今のシート');
    eq(getItem(a.id), a, 'ほかのシート');
    actions.sheet({ dataset: { id: first } });
    snap(); setF(gone, 'deleted', true); renderGrid();
    eq(getItem(gone.id), gone, '削除した行');
    eq(getItem(a.id), a, '残っている行');
    eq(getItem('no-such'), undefined, 'ない行');
  });

  /* ---------- シート・実施回の切り替えと行の高さ ---------- */
  // 描いていない行の高さは、作り直したときの見積もりと同じはず（描いた行は実際の高さになるので見ない）
  const heightsOk = msg => {
    const C = cols();
    S.rows.forEach((it, i) => { if ((i < S.w0 || i >= S.w1) && S.fen.v[i] !== estimateH(it, C)) TB.fail(`${msg}: ${i} 行目 ${S.fen.v[i]} / ${estimateH(it, C)}`); });
  };
  const manyRows = n => { snap(); const out = []; for (let i = 0; i < n; i++) { const it = addItem(); setF(it, K(), 'R' + i); out.push(it); } render(); return out; };
  const secondRun = () => { const r = { id: uid('r_'), name: '2回目', order: 99, ts: {}, updatedAt: now() }; D.runs.push(r); created(r); return r; };
  const setRun = id => { S.run = id; render(); };

  test('シート: 行き来しても行の高さの見積もりを捨てない', async () => {
    const rows = manyRows(200), first = S.sheet;
    snap(); setF(rows[150], K(), 'あ\nい\nう\nえ\nお'); render();
    window.dialog = async () => 'シート2';
    await actions.addSheet({ dataset: { k: 'cases' } });
    const known = S.rh.get(rows[150].id);
    ok(known > 50, '高い行を覚えている');
    actions.sheet({ dataset: { id: first } });
    eq(S.rh.get(rows[150].id), known, '戻っても同じ');
    heightsOk('戻ったあと');
  });

  test('シート: 別のシートにいる間の変更と、列の幅の変更は高さに反映される', async () => {
    const rows = manyRows(200), first = S.sheet, key = K();
    window.dialog = async () => 'シート2';
    await actions.addSheet({ dataset: { k: 'cases' } });
    const second = S.sheet;
    snap(); setF(rows[150], key, 'あ\nい\nう\nえ\nお\nか');    // ほかの人の変更や元に戻すなど、表にいないときの変更
    actions.sheet({ dataset: { id: first } });
    heightsOk('別のシートにいる間の変更');
    ok(S.fen.v[150] > 100, '高くなっている');
    const before = S.fen.sum(S.rows.length);
    setColumns(cs => { cs.find(x => x.id === K()).w = 40; });
    ok(S.fen.sum(S.rows.length) > before, '狭めると高くなる');
    heightsOk('幅を変えたあと');
    actions.sheet({ dataset: { id: second } });
    actions.sheet({ dataset: { id: first } });
    heightsOk('行き来したあと');
  });

  test('実施回: 切り替えると、備考が長い行だけ高さが変わり、戻すと元の高さになる', async () => {
    const rows = manyRows(300), run1 = S.run;
    const run2 = secondRun();
    await setVerdict(rows[250], 'ok');
    snap(); setRecField(rows[250], 'remark', '備考\n'.repeat(6) + 'おわり'); render();
    const tall = S.fen.v[250];
    ok(tall > 100, '備考で高くなっている');
    heightsOk('はじめ');
    setRun(run2.id);
    heightsOk('2回目へ');
    ok(S.fen.v[250] < tall, '2回目には備考がないので低い');
    setRun(run1);
    heightsOk('1回目へ');
    eq(S.fen.v[250], tall, '元の高さ');
  });

  test('実施回: ほかの列のほうが高い行は、切り替えても高さが変わらず、見積もり直さない', async () => {
    const rows = manyRows(300), run1 = S.run, run2 = secondRun();
    snap(); setF(rows[200], col('手順').id, '1\n2\n3\n4\n5\n6'); render();
    await setVerdict(rows[200], 'ok');
    snap(); setRecField(rows[200], 'remark', 'あ\nい'); render();
    const h = S.fen.v[200];
    S.rh.set(rows[200].id, h);
    S.dirtyRows.clear();
    setRun(run2.id);
    eq(S.fen.v[200], h, '手順の行数で決まっている');
    heightsOk('切り替えたあと');
    setRun(run1);
    heightsOk('戻したあと');
  });

  test('実施回: 別のシートで切り替えたあと、元のシートに戻っても高さが合う', async () => {
    const rows = manyRows(300), first = S.sheet, run2 = secondRun();
    await setVerdict(rows[250], 'ok');
    snap(); setRecField(rows[250], 'remark', '備考\n'.repeat(6)); render();
    heightsOk('はじめ');
    window.dialog = async () => 'シート2';
    await actions.addSheet({ dataset: { k: 'cases' } });
    setRun(run2.id);                            // シート2 を見ている間に実施回を替える
    actions.sheet({ dataset: { id: first } });
    heightsOk('戻ったとき');
    ok(S.fen.v[250] < 100, '2回目の備考はないので低い');
  });

  test('実施回: 今の実施回を消して別の回に移っても、高さが合う', async () => {
    const rows = manyRows(300), run2 = secondRun();
    setRun(run2.id);
    await setVerdict(rows[250], 'ok');
    snap(); setRecField(rows[250], 'remark', '備考\n'.repeat(6)); render();
    ok(S.fen.v[250] > 100);
    snap(); deleteRun(D.runs.find(r => r.id === run2.id)); render();
    ok(S.run !== run2.id, '別の回へ移る');
    heightsOk('消したあと');
    ok(S.fen.v[250] < 100);
    undo();
    setRun(run2.id);
    heightsOk('元に戻したあと');
    ok(S.fen.v[250] > 100, '高さも戻る');
  });

  test('実施回: 多くの行で高さが変わるときも正しい（まとめて計算し直す）', async () => {
    const rows = manyRows(300), run1 = S.run, run2 = secondRun();
    snap();
    for (const it of rows.slice(100)) { await setVerdictRows([it], 'ok'); setRecField(it, 'remark', 'あ\nい\nう\nえ'); }
    render();
    heightsOk('はじめ');
    setRun(run2.id);
    heightsOk('2回目へ');
    setRun(run1);
    heightsOk('1回目へ');
  });
})();
