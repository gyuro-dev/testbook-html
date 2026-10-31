/* 表（試験項目のシート）を、画面の操作で動かす試験。キーやクリック、クリップボードのイベントを本物の要素に送る。
 * README の「試験項目のシート」の章に書いてある操作を、上から順に確かめる。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, gridKey, typeText, clickCell, cellText, sleep } = TB;
  const K = () => col('確認内容');
  const colIndex = name => cols().findIndex(c => c.name === name);
  // 3行の表を作る（階層つき）
  const rows3 = () => {
    snap();
    for (const [a, b, t] of [['価格', '割引', '1行目'], ['価格', '割引', '2行目'], ['在庫', '切れ', '3行目']]) {
      const it = addItem(); setF(it, col('大項目').id, a); setF(it, col('中項目').id, b); setF(it, K().id, t);
    }
    render(); S.r = 0; S.c = colIndex('確認内容'); collapse(); paintCursor();
  };

  test('表: 矢印キーで動き、Shift+矢印で範囲が広がり、Ctrl+A で全部選べる', () => {
    rows3();
    gridKey('ArrowDown'); eq([S.r, S.c], [1, colIndex('確認内容')], '下へ');
    gridKey('ArrowRight'); eq(S.c, colIndex('前提条件'), '右へ');
    gridKey('ArrowUp'); gridKey('ArrowUp'); gridKey('ArrowUp'); eq(S.r, 0, '一番上で止まる');
    gridKey('ArrowDown', { shift: true }); gridKey('ArrowRight', { shift: true });
    ok(isMulti(), '範囲になる'); eq(rng(), { r0: 0, r1: 1, c0: colIndex('前提条件'), c1: colIndex('手順') }, '範囲');
    eq(document.querySelectorAll('#grid td.insel').length, 4, '選んだセルに印が付く');
    eq(document.querySelector('#selinfo').textContent, '2 行 × 2 列を選択', '選んだ大きさの表示');
    gridKey('Escape'); ok(!isMulti(), 'Esc で範囲が解ける');
    gridKey('a', { ctrl: true }); eq(rng(), { r0: 0, r1: 2, c0: 1, c1: cols().length - 1 }, 'Ctrl+A');
    gridKey('Home'); eq(S.c, 1, 'Home'); gridKey('End'); eq(S.c, cols().length - 1, 'End');
  });

  test('表: 文字を打ち始めると編集になり、Enter で確定して下に移る。Esc は取り消す', () => {
    rows3();
    typeText('新しい値');
    eq(S.editing, 'plain', '打ち始めで編集が始まる');
    gridKey('Enter');
    eq([item(1)[K().id], S.r, S.editing], ['新しい値', 1, false], '確定して下へ');
    eq(cellText(0, colIndex('確認内容')), '新しい値', '表に出る');
    typeText('捨てる値'); gridKey('Escape');
    eq(item(2)[K().id], '2行目', 'Esc で元のまま');
    typeText('タブで右'); gridKey('Tab');
    eq([item(2)[K().id], S.c], ['タブで右', colIndex('前提条件')], 'Tab で確定して右へ');
  });

  test('表: Alt+Enter で改行が入り、Ctrl+Enter で編集中の値が範囲の全部に入る', () => {
    rows3();
    typeText('1行');
    ed().setSelectionRange(2, 2); gridKey('Enter', { alt: true });
    eq(ed().value, '1行\n', 'Alt+Enter で改行');
    ed().value += '2行'; gridKey('Enter');
    eq(item(1)[K().id], '1行\n2行');
    // 範囲を選んでから打って Ctrl+Enter
    S.r = 0; S.c = colIndex('前提条件'); collapse(); gridKey('ArrowDown', { shift: true }); gridKey('ArrowDown', { shift: true });
    typeText('全部同じ'); gridKey('Enter', { ctrl: true });
    eq(itemsOf(S.sheet).map(i => i[col('前提条件').id]), ['全部同じ', '全部同じ', '全部同じ'], '範囲の全部に入る');
  });

  test('表: Enter で書式つきの編集になり、選んだ文字だけ太字にして確定できる', () => {
    rows3();
    gridKey('Enter');
    eq(S.editing, 'rich', 'Enter で書式つきの編集');
    const r = document.querySelector('#reditor');
    r.innerHTML = '<b>太い</b>文字';
    TB.key(r, 'Enter');
    const runs = cellRuns(item(1), K());
    eq(runText(runs), '太い文字', '文字'); ok(runs[0].b && !runs[1].b, '最初の2文字だけ太字: ' + JSON.stringify(runs));
    ok(document.querySelector(`#grid td[data-r="0"][data-c="${colIndex('確認内容')}"] b, #grid td[data-r="0"][data-c="${colIndex('確認内容')}"] .fb`), '表でも太字で出る');
    eq(S.r, 1, 'Enter で確定すると下に移る');
    // 打ち直すと1文字ずつの書式は消える（Excel と同じ）
    gridKey('ArrowUp'); typeText('打ち直し'); gridKey('Enter');
    eq([item(1)[K().id], cellRuns(item(1), K()) || null], ['打ち直し', null], '打ち直すと消える');
  });

  test('表: Ctrl+Enter で下に行が増えて階層を引き継ぐ。Ctrl+Shift+D で複製、Alt+↑↓ で移動', () => {
    rows3();
    gridKey('Enter', { ctrl: true });
    eq(itemsOf(S.sheet).length, 4, '行が増える');
    eq([S.r, item(2)[col('大項目').id], item(2)[col('中項目').id], item(2)[K().id] || ''], [1, '価格', '割引', ''], '2行目に、階層だけ入って入る');
    S.r = 0; S.c = colIndex('確認内容'); collapse(); paintCursor();
    gridKey('D', { ctrl: true, shift: true });
    eq([itemsOf(S.sheet).length, item(2)[K().id], S.r], [5, '1行目', 1], '複製が下に入る');
    gridKey('ArrowDown', { alt: true });
    eq([item(2)[K().id] || '', item(3)[K().id], S.r], ['', '1行目', 2], 'Alt+↓ で1つ下へ');
    gridKey('ArrowUp', { alt: true }); gridKey('ArrowUp', { alt: true });
    eq([item(1)[K().id], S.r], ['1行目', 0], 'Alt+↑ で一番上へ');
  });

  test('表: Ctrl+Z で戻り、Ctrl+Y / Ctrl+Shift+Z でやり直す（表の上のキー）', () => {
    rows3();
    typeText('変えた'); gridKey('Enter');
    gridKey('z', { ctrl: true }); eq(item(1)[K().id], '1行目', '戻る');
    gridKey('y', { ctrl: true }); eq(item(1)[K().id], '変えた', 'やり直す');
    gridKey('z', { ctrl: true }); eq(item(1)[K().id], '1行目', 'もう一度戻す');
    gridKey('z', { ctrl: true, shift: true }); eq(item(1)[K().id], '変えた', 'Ctrl+Shift+Z でもやり直す');
    eq(cellText(0, colIndex('確認内容')), '変えた', '表も変わる');
  });

  test('表: Delete で範囲をまとめて消し、Ctrl+D で下へコピーする', () => {
    rows3();
    gridKey('ArrowDown', { shift: true }); gridKey('ArrowRight', { shift: true });
    gridKey('Delete');
    eq(itemsOf(S.sheet).slice(0, 2).map(i => [i[K().id] || '', i[col('前提条件').id] || '']), [['', ''], ['', '']], '2×2 が消える');
    eq(item(3)[K().id], '3行目', '範囲の外は残る');
    gridKey('z', { ctrl: true });
    // Ctrl+D: 1行だけなら上の行の値、範囲なら一番上の行で埋める
    S.r = 1; S.c = colIndex('確認内容'); collapse(); gridKey('d', { ctrl: true });
    eq(item(2)[K().id], '1行目', '上の行の値が入る');
    S.r = 0; collapse(); gridKey('ArrowDown', { shift: true }); gridKey('ArrowDown', { shift: true }); gridKey('d', { ctrl: true });
    eq(item(3)[K().id], '1行目', '範囲の一番上で埋める');
  });

  test('表: 結果の列で 1〜4 と 0、スペースで選ぶ窓。複数行にまとめて付けられ、行に色が付く', async () => {
    rows3();
    S.c = colIndex('結果'); collapse(); paintCursor();
    gridKey('1'); await sleep(0);
    eq(verdictOf(item(1).id, S.run), 'ok', '1 で OK');
    eq(cellText(0, colIndex('結果')), 'OK', '表に OK');
    gridKey('3'); await sleep(0);
    ok(document.querySelector('#grid tr[data-r="0"]').classList.contains('row-hold'), '保留の行は黄色（row-hold）');
    gridKey('4'); await sleep(0);
    ok(document.querySelector('#grid tr[data-r="0"]').classList.contains('row-na'), '対象外の行は灰色（row-na）');
    gridKey('0'); await sleep(0);
    eq(verdictOf(item(1).id, S.run), null, '0 で未実施に戻す');
    gridKey('ArrowDown', { shift: true }); gridKey('ArrowDown', { shift: true }); gridKey('2'); await sleep(0);
    eq(itemsOf(S.sheet).map(i => verdictOf(i.id, S.run)), ['ng', 'ng', 'ng'], '3行まとめて NG');
    const prog = document.querySelector('#progress').textContent.replace(/\s+/g, ' ');
    ok(prog.includes('消化 3/3') && prog.includes('NG 3'), '消化数の表示: ' + prog);
    S.r = 0; collapse(); paintCursor(); gridKey(' ');
    const pop = document.querySelector('#pop');
    ok(!pop.hidden && pop.querySelector('[data-act="popVerdict"][data-v="ok"]'), 'スペースで結果の窓が出る');
    TB.click('#pop [data-act="popVerdict"][data-v="ok"]'); await sleep(0);
    eq(verdictOf(item(1).id, S.run), 'ok', '窓から選べる'); ok(pop.hidden, '窓が閉じる');
  });

  test('表: 結果のセルをクリックすると窓が開き、証跡のセルをクリックするとエビデンス票が開く', async () => {
    rows3();
    clickCell(1, colIndex('結果'));
    ok(!document.querySelector('#pop').hidden, '結果の窓'); eq([S.r, S.c], [1, colIndex('結果')], 'そのセルが選ばれる');
    hidePop();
    clickCell(2, colIndex('証跡'));
    eq([S.view, S.boardItem], ['board', item(3).id], 'エビデンス票が開く');
    ok(!document.querySelector('#boardview').hidden && document.querySelector('#main').hidden, '画面が切り替わる');
    TB.click('[data-act="closeEv"]');
    eq(S.view, 'sheet', '「表に戻る」で戻る');
  });

  test('表: No の列をクリックすると行ごと選べ、Shift+クリックで広がる', () => {
    rows3();
    clickCell(0, 0);
    eq(rng(), { r0: 0, r1: 0, c0: 1, c1: cols().length - 1 }, '1行');
    clickCell(2, 0, { shift: true });
    eq(rng(), { r0: 0, r1: 2, c0: 1, c1: cols().length - 1 }, '3行');
    eq(selRows().length, 3);
  });

  test('表: Ctrl+C は範囲を TSV にして、Excel にそのまま貼れる形にする。Ctrl+X は切り取る', () => {
    rows3();
    gridKey('ArrowDown', { shift: true }); gridKey('ArrowRight', { shift: true });
    const dt = TB.clip(ed(), 'copy', TB.dt());
    eq(dt.getData('text/plain'), '1行目\t\r\n2行目\t', 'TSV（行は CRLF）');
    S.r = 0; S.c = colIndex('確認内容'); collapse(); snap(); setF(item(1), K().id, 'タブ\tと"引用"');
    eq(TB.clip(ed(), 'copy', TB.dt()).getData('text/plain'), '"タブ\tと""引用"""', '1つのセルでも、タブや引用符を含めば引用符で囲む（Excel と同じ）');
    snap(); setF(item(2), K().id, '改行\nあり');
    S.r = 1; collapse();
    eq(TB.clip(ed(), 'copy', TB.dt()).getData('text/plain'), '"改行\nあり"', '改行を含むセルも囲む');
    S.r = 0; collapse(); gridKey('ArrowRight', { shift: true });
    eq(TB.clip(ed(), 'copy', TB.dt()).getData('text/plain'), '"タブ\tと""引用"""\t', '範囲でも同じ');
    const cut = TB.clip(ed(), 'cut', TB.dt());
    eq([cut.getData('text/plain'), item(1)[K().id]], ['"タブ\tと""引用"""\t', ''], '切り取り');
    // 囲んだものを貼り直すと元の文字に戻る（自分の表どうしの往復）
    S.r = 0; S.c = colIndex('確認内容'); collapse();
    TB.clip(ed(), 'paste', TB.dt({ text: '"タブ\tと""引用"""' }));
    eq(item(1)[K().id], 'タブ\tと"引用"', '貼り直すと元に戻る');
  });

  test('表: Excel の表を Ctrl+V すると行として貼り付き、結果の列に「OK」「NG」も入る', async () => {
    rows3();
    S.r = 2; S.c = colIndex('確認内容'); collapse(); paintCursor();
    const tsv = 'A\t前提A\t手順A\t期待A\tOK\n"B\n2行"\t前提B\t手順B\t期待B\tNG\nC\t\t\t\t保留';
    TB.clip(ed(), 'paste', TB.dt({ text: tsv })); await sleep(0);
    const L = itemsOf(S.sheet);
    eq(L.length, 5, '足りない行が増える');
    eq(L.slice(2).map(i => i[K().id]), ['A', 'B\n2行', 'C'], '確認内容（引用符の中の改行も）');
    eq(L.slice(2).map(i => i[col('期待結果').id] || ''), ['期待A', '期待B', ''], '右の列');
    eq(L.slice(2).map(i => verdictOf(i.id, S.run)), ['ok', 'ng', 'hold'], '結果の列');
    eq(rng(), { r0: 2, r1: 4, c0: colIndex('確認内容'), c1: colIndex('結果') }, '貼った範囲が選ばれる');
    ok(TB.toasts().some(t => t.includes('3 行を貼り付けました（2 行を追加）')), 'お知らせ: ' + TB.toasts());
  });

  test('表: 値が1つの貼り付けは、選んでいる範囲の全部に入る', async () => {
    rows3();
    S.c = colIndex('前提条件'); collapse(); gridKey('ArrowDown', { shift: true }); gridKey('ArrowDown', { shift: true });
    TB.clip(ed(), 'paste', TB.dt({ text: '共通の前提' })); await sleep(0);
    eq(itemsOf(S.sheet).map(i => i[col('前提条件').id]), ['共通の前提', '共通の前提', '共通の前提']);
  });

  test('表: 画像を Ctrl+V すると、その行のエビデンス票に入り、証跡の列に枚数が出る', async () => {
    rows3();
    S.r = 1; collapse(); paintCursor();
    TB.clip(ed(), 'paste', TB.dt({ files: [await TB.png(1600, 1200)] }));
    await sleep(300);
    const els = elementsOf(evOwner(item(2).id, S.run));
    eq(els.length, 1, 'エビデンス票に1つ'); eq(els[0].type, 'image');
    ok(els[0].data.startsWith('data:image/'), '画像の中身'); eq([els[0].w, els[0].nw], [720, 1600], '幅 720 に縮めて置き、元の大きさも覚える');
    eq(cellText(1, colIndex('証跡')), '1', '証跡の列に枚数');
    eq(cellText(0, colIndex('証跡')), '＋', 'ほかの行は＋のまま');
    ok(document.querySelector('#pane .count') && document.querySelector('#pane .count').textContent === '1', '詳細パネルにも枚数');
  });

  test('表: Ctrl+B で太字、Ctrl+5 で取り消し線、色のメニューで色が付き、もう一度で外れる', () => {
    rows3();
    gridKey('ArrowDown', { shift: true });
    gridKey('b', { ctrl: true });
    eq([cellFmt(item(1), K()), cellFmt(item(2), K())], [{ b: true }, { b: true }], '範囲に太字');
    ok(document.querySelector(`#grid td[data-r="0"][data-c="${colIndex('確認内容')}"]`).classList.contains('fb'), '表の見た目');
    gridKey('5', { ctrl: true }); eq(cellFmt(item(1), K()), { b: true, s: true }, '取り消し線');
    TB.click('[data-act="fmtColorMenu"]'); TB.click('#pop [data-act="fmtColor"][data-v="red"]');
    eq(cellFmt(item(1), K()), { b: true, s: true, c: 'red' }, '色');
    gridKey('b', { ctrl: true }); gridKey('5', { ctrl: true });
    TB.click('[data-act="fmtColorMenu"]'); TB.click('#pop [data-act="fmtColor"][data-v=""]');
    eq(cellFmt(item(1), K()) || null, null, '全部外すと書式なし');
  });

  test('表: 結合表示は同じ値のセルをつなげ、階層の列はグループの境目をまたがない', () => {
    rows3();
    const td = (r, name) => document.querySelector(`#grid td[data-r="${r}"][data-c="${colIndex(name)}"]`).className;
    ok(td(1, '大項目').includes('dup') && td(1, '中項目').includes('dup'), '2行目の階層は上とつながる');
    ok(!td(2, '大項目').includes('dup'), '3行目は別のグループ');
    snap(); setF(item(3), col('中項目').id, '割引'); renderGrid();
    ok(!td(2, '中項目').includes('dup'), '中項目が同じでも、左の大項目が違えばつなげない');
    snap(); setF(item(2), K().id, '1行目'); renderGrid();
    ok(td(1, '確認内容').includes('dup'), '文字の列は階層に関係なく同じ値ならつながる');
    actions.colMerge({ dataset: { cid: K().id } });
    ok(!td(1, '確認内容').includes('dup'), '列ごとに結合表示を切れる');
  });

  test('表: 検索と結果の絞り込みで行が減り、行を追加すると絞り込みが外れる', async () => {
    rows3();
    TB.input('#q', '3行'); await sleep(250);
    eq(S.rows.map(i => i[K().id]), ['3行目'], '検索');
    TB.input('#q', ''); await sleep(250);
    await setVerdict(item(1), 'ok');
    TB.input('#vf', 'none', 'change');
    eq(S.rows.length, 2, '未実施だけ');
    TB.input('#vf', 'ok', 'change');
    eq(S.rows.map(i => i[K().id]), ['1行目'], 'OK だけ');
    TB.click('[data-act="addRow"]');
    eq([S.vf, S.rows.length], ['', 4], '行を足すと絞り込みが外れて全部出る');
  });

  test('表: 境目の＋で行と列が入り、「＋ 行を追加」で一番下に増える', () => {
    rows3();
    TB.click('#grid [data-act="insRow"][data-r="0"]');
    eq([itemsOf(S.sheet).length, item(2)[col('大項目').id], item(2)[K().id] || ''], [4, '価格', ''], '1行目の下に、階層を引き継いで入る');
    TB.click('#grid [data-act="insRow"][data-r="-1"]');
    eq([item(1)[K().id] || '', item(1)[col('大項目').id]], ['', '価格'], '一番上に入る');
    const n = sheetCols(curSheet()).length;
    TB.click('#grid [data-act="insCol"][data-j="1"]');
    eq([sheetCols(curSheet()).length, sheetCols(curSheet())[1].type], [n + 1, 'text'], '大項目の右に文字の列が入る');
    TB.click('[data-act="addRowEnd"]');
    eq([itemsOf(S.sheet).length, S.r], [6, 5], '一番下に増えて、そこが選ばれる');
  });

  test('表: 右の詳細パネルに項目の内容と結果が出て、そこからも結果・備考を書ける', async () => {
    rows3();
    const pane = document.querySelector('#pane');
    ok(pane.textContent.includes('No.1') && pane.textContent.includes('1行目') && pane.textContent.includes('価格 › 割引'), '内容: ' + pane.textContent.slice(0, 80));
    TB.click(`#pane [data-act="verdict"][data-v="ng"]`); await sleep(0);
    eq(verdictOf(item(1).id, S.run), 'ng', 'パネルの結果ボタン');
    ok(pane.querySelector('[data-act="verdict"][data-v="ng"]').classList.contains('sel'), '選んだ結果に印');
    TB.input('#pane [data-rf="remark"]', '#12 で起票', 'change');
    eq(recOf(item(1).id, S.run).remark, '#12 で起票', '備考');
    eq(cellText(0, colIndex('備考')), '#12 で起票', '表にも出る');
    TB.input('#pane [data-rf="by"]', '佐藤', 'change');
    eq([recOf(item(1).id, S.run).by, recOf(item(1).id, S.run).byAuto], ['佐藤', false], '実施者を手で直すと自動扱いでなくなる');
    TB.click('[data-act="togglePane"]');
    ok(pane.hidden, '× で閉じる'); S.pane = true;
  });

  test('表: 試験の名前を打つとタブのタイトルに反映され、保存していない印が出る', () => {
    TB.input('#title', '新しい試験名');
    eq([D.meta.title, document.title], ['新しい試験名', '新しい試験名 - testbook']);
    ok(document.querySelector('#status').classList.contains('dirty') && document.querySelector('#status').textContent.includes('保存していない'), '保存していない印');
  });

  test('表: 行の削除は、結果やエビデンスがある行だけ確認してから消す', async () => {
    rows3();
    let asked = 0; window.dialog = async () => { asked++; return true; };
    TB.click('[data-act="delRow"]'); await sleep(0);
    eq([itemsOf(S.sheet).length, asked], [2, 0], '何もない1行は聞かずに消す');
    await setVerdict(item(1), 'ok');
    TB.click('[data-act="delRow"]'); await sleep(0);
    eq([itemsOf(S.sheet).length, asked], [1, 1], '結果がある行は聞いてから消す');
    await setVerdict(item(1), 'ok');
    window.dialog = async () => false;
    TB.click('[data-act="delRow"]'); await sleep(0);
    eq(itemsOf(S.sheet).length, 1, '「キャンセル」なら消さない');
  });

  test('表: セルの HTML のタグは文字のまま出る（スクリプトは動かない）。ボードの文字の URL はリンクになる', () => {
    rows3();
    snap();
    setF(item(2), K().id, '<img src=x onerror="window.__tbXss=1"><b>bold</b>');
    setF(D.meta, 'title', '<script>window.__tbXss=2</script>');
    render(); renderPane();
    eq(cellText(1, colIndex('確認内容')), '<img src=x onerror="window.__tbXss=1"><b>bold</b>', 'タグは文字のまま');
    const t = addEl(evOwner(item(1).id, S.run), 'text', { x: 0, y: 0, w: 300, text: '手順書 https://example.com/a?b=1&c=2 を見る' });
    openEvidence(item(1).id);
    const a = document.querySelector(`#board .el[data-eid="${t.id}"] a`);
    ok(a && a.href === 'https://example.com/a?b=1&c=2' && a.target === '_blank' && a.rel === 'noopener', 'ボードの文字の URL はリンク: ' + (a && a.outerHTML));
    closeEvidence();
    ok(!document.querySelector('#grid img, #pane img'), 'img 要素は作られない');
    eq(window.__tbXss, undefined, 'スクリプトは動かない');
    ok(document.title.startsWith('<script>'), 'タイトルも文字のまま');
  });
})();
