/* 3回目のレビューの指摘の試験: リンクの作り方、削除の印の検査、行やシートを消したときの中身、シートの復活、下書きの導線、ダイアログ中のキー。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, clone, user, FakeHandle } = TB;
  const K = () => col('確認内容').id;
  const idle = () => { S.lastEdit = performance.now() - 60000; };
  const draftOf = id => idb('drafts', 'readonly', st => st.get(id));
  const clearDrafts = () => idb('drafts', 'readwrite', st => st.clear());
  const INJ = '"><img src=x onerror="window.__tbXss=1">';
  const links = s => { const el = document.createElement('div'); el.innerHTML = linkify(s); return [el.textContent, [...el.querySelectorAll('a')].map(a => a.getAttribute('href'))]; };
  const open = doc => { loadDoc(clone(doc)); S.me = '田中'; };
  const merge = src => { const st = mergeInto(D, src); render(); return st; };
  // 行が1つと、その行のエビデンス票に画像が1枚ある試験
  const withImage = async () => {
    snap(); const it = addItem(); setF(it, K(), '証跡つき'); render();
    await addFilesToBoard(evOwner(it.id, S.run), [await TB.png(40, 30)]);
    return [it, elementsOf(evOwner(it.id, S.run))[0]];
  };
  const inFile = async e => (await new Response(fileBlob()).text()).includes(`${BLOB_OPEN}${e.id}">`);
  const closePanel = () => { const p = $('#cfpanel'); if (p) p.remove(); };

  test('リンク: アポストロフィを #39 と読まず、リンクの中をもう一度書き換えない', () => {
    snap(); setF(D.meta, 'issueUrl', 'https://x.example/issues/{n}');
    eq(links("don't #12 'x'"), ["don't #12 'x'", ['https://x.example/issues/12']], '文字が壊れず #12 だけリンク');
    eq(links('a#5'), ['a#5', ['https://x.example/issues/5']], '語に続く # は今までどおり');
    snap(); setF(D.meta, 'issueUrl', 'https://ABC-1.example/{key}/{n}');
    eq(links("'PROJ-7' #3"), ["'PROJ-7' #3", ['https://ABC-1.example/PROJ-7/{n}', 'https://ABC-1.example/{key}/3']], 'ひな形の中の ABC-1 は触らず、引用符の中の PROJ-7 もリンク');
  });

  test('取り込み: 削除の印が付いた要素も検査し、合わせて復活しても確かめていない値が出ない', async () => {
    const doc = newDoc(), el = { id: 'e_x', owner: sheetOwner(doc.sheets[0].id), type: 'frame', x: 0, y: 0, w: 9, h: 9, z: 1, ts: { x: 1 }, updatedAt: 1 };
    doc.elements.push(el); loadDoc(clone(doc));
    const evil = clone(doc);
    Object.assign(evil.elements[0], { deleted: true, color: INJ, ts: { deleted: 5, color: 9 } });
    evil.elements.push({ id: 'e_bad', deleted: true, type: 'evil', owner: 1, color: INJ, ts: { deleted: 5 }, updatedAt: 5 }, { id: 'e_tomb', deleted: true, ts: { deleted: 5 }, updatedAt: 5 });
    const r = await readBook(new File([JSON.stringify(evil)], 'evil.json'));
    eq(r.elements.map(e => e.id), ['e_x', 'e_bad', 'e_tomb'], '削除の印は残す');
    eq(Object.keys(r.elements[1]).sort(), ['deleted', 'id', 'ts', 'updatedAt'], '種類のおかしいものは印だけに');
    ok(!('color' in r.elements[0]), '色の検査が通る');
    merge(r);
    const e = D.elements[0];
    eq(e.deleted, false, '削除のあとに変更があるので復活する');
    ok(!elHtml(e, false).includes('<img'), '属性を壊さない');
  });

  // 枠が1つあるファイルに、細工した競合を入れて読む
  const withConflict = async c => {
    const doc = newDoc();
    doc.elements.push({ id: 'e_x', owner: sheetOwner(doc.sheets[0].id), type: 'frame', x: 0, y: 0, w: 9, h: 9, z: 1, color: 'red', ts: {}, updatedAt: 1 });
    doc.conflicts.push({ id: 'cf_a', kind: 'value', coll: 'elements', obj: 'e_x', vt: 1, at: 1, ts: {}, updatedAt: 1, ...c });
    loadDoc(await readBook(new File([JSON.stringify(doc)], 'x.json')));
    renderConflicts();
    return D.elements[0];
  };

  test('取り込み: 競合の「ほかの人の値」も開くときと同じ検査を通し、通らない値は使わない', async () => {
    for (const c of [{ k: 'color', value: INJ }, { k: 'type', value: INJ }, { k: 'owner', value: 1 }, { k: 'id', value: 'e_y' }, { k: 'constructor', value: 'x' }]) {
      const e = await withConflict(c), before = JSON.stringify(e);
      resolveConflict('take', 'cf_a');
      closePanel();
      const name = c.k + ' に細工';
      eq(JSON.stringify(e).replace(/,"updatedAt":\d+/, ''), before.replace(/,"updatedAt":\d+/, ''), name + ': 値は変わらない');
      ok(Object.getPrototypeOf(e) === Object.prototype, name + ': プロトタイプも変わらない');
      ok(!elHtml(e, false).includes('<img'), name + ': 属性を壊さない');
      eq(live(D.conflicts).length, 0, name + ': 競合は片づく');
      ok(TB.toasts().some(t => t.includes('この値は使えない')), name + ': お知らせ');
    }
  });

  test('取り込み: ふつうの値は、競合の「ほかの人の値」で今までどおり置き換わる', async () => {
    const e = await withConflict({ k: 'color', value: 'blue' });
    resolveConflict('take', 'cf_a');
    closePanel();
    eq(e.color, 'blue', '色');
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '最初'); });
    const a = user(b0, '田中', () => setF(item(1), K(), '田中'));
    const b = user(b0, '佐藤', () => setF(item(1), K(), '佐藤'));
    open(a); merge(b);
    const cf = live(D.conflicts)[0], other = cf.value;
    renderConflicts();
    resolveConflict('take', cf.id);
    closePanel();
    eq(item(1)[K()], other, 'セル');
    // 実施回の名前も（シート・実施回は検査用のひな形と並べて調べる）
    const r0 = user(b0, '田中', () => setF(D.runs[0], 'name', '田中の回'));
    const r1 = user(b0, '佐藤', () => setF(D.runs[0], 'name', '佐藤の回'));
    open(r0); merge(r1);
    const cr = live(D.conflicts).find(c => c.coll === 'runs'), val = cr.value;
    renderConflicts();
    resolveConflict('take', cr.id);
    closePanel();
    eq(D.runs[0].name, val, '実施回の名前');
  });

  test('取り込み: 細工した項目名は競合にならず、競合の ID は描くときにエスケープする', async () => {
    const doc = newDoc(), evil = 'k' + INJ, sid = doc.sheets[0].id;
    // 同じ ID を2つ並べると、1つのファイルの中で合わさって競合が作られる
    doc.items.push({ id: 'i_x', sheet: sid, order: 1, [evil]: 'a', ts: { [evil]: 5 }, updatedAt: 5 }, { id: 'i_x', sheet: sid, order: 1, [evil]: 'b', ts: { [evil]: 9 }, updatedAt: 9 });
    const r = await readBook(new File([JSON.stringify(doc)], 'evil.json'));
    r.meta.id = D.meta.id;
    merge(r);
    eq(live(D.conflicts).length, 0, '競合にしない');
    // 競合の ID がどこから来ても、属性を壊さない
    snap(); const it = addItem(); render();
    const id = 'cf_' + INJ;
    D.conflicts.push({ id, kind: 'value', coll: 'items', obj: it.id, k: K(), value: 'x', vt: 1, at: 1, ts: {}, updatedAt: 1 });
    S.ver++; renderConflicts();
    eq($('#cfpanel').querySelectorAll('img').length, 0, 'img が作られない');
    eq($('#cfpanel [data-cf="keep"]').dataset.id, id, 'ID はそのまま読める');
    resolveConflict('keep', id);
    closePanel();
    eq(live(D.conflicts).length, 0, '片づけられる');
    eq(window.__tbXss, undefined, 'スクリプトは動かない');
  });

  test('取り込み: 知らない入れ物を指す競合は捨てる', async () => {
    const doc = newDoc();
    doc.conflicts.push({ id: 'cf_a', kind: 'value', coll: 'constructor', obj: 'x', k: 'y', value: 1, vt: 1, at: 1, ts: {}, updatedAt: 1 }, { id: 'cf_m', kind: 'value', coll: 'meta', obj: doc.meta.id, k: 'title', value: 'x', vt: 1, at: 1, ts: {}, updatedAt: 1 });
    const r = await readBook(new File([JSON.stringify(doc)], 'x.json'));
    eq(r.conflicts.map(c => c.id), ['cf_m'], '残るのは知っている入れ物だけ');
  });

  test('取り込み: 空の表や形のおかしい書式は、描くときに落ちない形に直す', async () => {
    const doc = newDoc(), owner = sheetOwner(doc.sheets[0].id), el = (id, o) => ({ id, owner, x: 0, y: 0, w: 9, h: 9, ...o });
    doc.elements.push(el('e_a', { type: 'table', cells: [] }), el('e_b', { type: 'table', cells: [[], ['x']] }), el('e_c', { type: 'text', text: 'x', runs: 'evil' }), el('e_d', { type: 'text', text: 'x', runs: [null] }));
    const r = await readBook(new File([JSON.stringify(doc)], 'x.json'));
    eq(r.elements.slice(0, 2).map(e => e.cells), [[['']], [['']]], '表');
    eq(r.elements.slice(2).map(e => 'runs' in e), [false, false], '書式');
    for (const e of r.elements) ok(elHtml(e, false), '描ける');
  });

  test('削除: 行を消すとエビデンスの中身も保存するファイルから消え、元に戻すと戻る', async () => {
    const [it, e] = await withImage();
    ok(await inFile(e), '消す前はファイルにある');
    S.curId = it.id; S.r = 0; S.ar = 0; S.c = 1; S.ac = 1;
    await actions.delRow();
    eq(e.deleted, true, '要素にも印');
    ok(!(await inFile(e)), '中身はファイルに入らない');
    undo();
    eq([!!it.deleted, !!e.deleted], [false, false], '元に戻す');
    ok(await inFile(e), 'ファイルにも戻る');
  });

  test('削除: シートを消すと行のエビデンスの中身も消え、元に戻すと戻る', async () => {
    const [it, e] = await withImage(), s = curSheet();
    const s2 = newSheet('2枚目', 'cases', 2); snap(); D.sheets.push(s2); created(s2); render();
    snap(); deleteSheet(s); S.sheet = s2.id; render();
    eq([s.deleted, it.deleted, e.deleted], [true, true, true], '印');
    ok(!(await inFile(e)), '中身はファイルに入らない');
    undo();
    eq([!!s.deleted, !!it.deleted, !!e.deleted], [false, false, false], '元に戻す');
  });

  test('集計: 削除した行に残った未解決のコメントは数えない', async () => {
    snap(); const a = addItem(), b = addItem(); render();
    await addComment(a.id, K(), '残る'); await addComment(b.id, K(), '消える');
    snap(); deleteItems([b]); render();
    TB.click('[data-act="summary"]');
    const cards = [...document.querySelectorAll('#summary .card')].map(x => x.textContent.replace(/\s+/g, ''));
    ok(cards.includes('未解決のコメント1'), '集計のカード: ' + cards);
  });

  test('マージ: 行が残るとき、行といっしょに消えたエビデンスも戻る。先に消してあったものは戻さない', async () => {
    const [it, kept] = await withImage();
    await addFilesToBoard(evOwner(it.id, S.run), [await TB.png(50, 30, 'old.png')]);
    const old = elementsOf(evOwner(it.id, S.run)).find(e => e !== kept);
    const b0 = clone(D);
    snap(); setF(old, 'deleted', true); snap(); deleteItems([it]);
    const tanaka = await readBook(TB.savedFile());
    eq(tanaka.elements.find(e => e.id === kept.id).type, undefined, '保存すると印だけになる');
    loadDoc(clone(b0)); S.me = '佐藤'; await setVerdict(item(1), 'ok'); const sato = clone(D);
    for (const [a, b] of [[tanaka, sato], [sato, tanaka]]) {
      open(a); const st = merge(clone(b));
      eq(itemsOf(S.sheet).length, 1, '行が残る'); ok(st.conflicts >= 1, '知らせる');
      eq(elementsOf(evOwner(item(1).id, S.run)).map(e => e.id), [kept.id], '行といっしょに消えた要素だけ戻る');
      ok(elData(getEl(kept.id)), '中身もある');
    }
  });

  // 1枚目と、2行ある2枚目のシートがある試験
  const twoSheets = () => user(newDoc(), '田中', () => {
    setF(addItem(), K(), '1枚目');
    const s2 = newSheet('2枚目', 'cases', 2); D.sheets.push(s2); created(s2); S.sheet = s2.id;
    setF(addItem(), K(), '2-1'); setF(addItem(), K(), '2-2');
  });
  const delSheet2 = (b0, sid) => user(b0, '田中', () => { S.sheet = sid; deleteSheet(curSheet()); S.sheet = D.sheets[0].id; });

  test('マージ: 消したシートの行を相手が直していたら、シートも行もそろって残して知らせる', () => {
    const b0 = twoSheets(), sid = b0.sheets[1].id;
    const tanaka = delSheet2(b0, sid);
    const sato = user(b0, '佐藤', () => { S.sheet = sid; setF(item(1), K(), '佐藤の値'); });
    for (const [a, b] of [[tanaka, sato], [sato, tanaka]]) {
      open(a); const st = merge(clone(b));
      ok(sheets().some(s => s.id === sid), 'シートが残る'); ok(st.conflicts >= 1, '知らせる');
      S.sheet = sid; eq(itemsOf(sid).map(i => i[K()]), ['佐藤の値', '2-2'], '行もそろって残る');
    }
  });

  test('マージ: 消したシートに相手が行を足していたらシートが残り、競合の一覧から開いたり消したりできる', () => {
    const b0 = twoSheets(), sid = b0.sheets[1].id;
    const sato = user(b0, '佐藤', () => { S.sheet = sid; setF(addItem(), K(), '新しい行'); });
    open(delSheet2(b0, sid)); merge(clone(sato));
    const cf = live(D.conflicts).find(c => c.coll === 'sheets');
    ok(cf && cf.kind === 'revived', 'シートの競合');
    eq(itemsOf(sid).length, 3, '行が見える');
    renderConflicts();
    const text = $('#cfpanel').textContent;
    ok(text.includes('シート「2枚目」') && text.includes('このシートを削除しましたが'), '何が残ったか分かる: ' + text);
    resolveConflict('go', cf.id);
    eq(S.sheet, sid, 'その場所を開く');
    renderConflicts();
    resolveConflict('drop', cf.id);
    ok(!sheets().some(s => s.id === sid), '「削除する」で消える'); eq(itemsOf(sid).length, 0, '行も消える'); ok(S.sheet !== sid, '開いていたら別のシートへ');
    closePanel();
  });

  test('マージ: 印だけのシートは戻せないので、そのままにする', () => {
    const b0 = twoSheets(), sid = b0.sheets[1].id;
    const d = clone(b0), s = d.sheets[1];
    d.sheets[1] = { id: s.id, deleted: true, ts: { deleted: 1 }, updatedAt: 1 };
    open(d);
    merge(clone(d));
    eq(sheets().some(x => x.id === sid), false, 'シートは増えない');
  });

  test('下書き: 起動時の確認を Esc で閉じても、一覧から反映できる。反映のあとは出ない', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '保存した行'); });
    loadDoc(clone(b0));
    snap(); setF(addItem(), K(), '保存し忘れた行'); idle(); await autoTick();
    loadDoc(clone(b0));
    window.dialog = TB.realDialog;
    const list = async () => { const p = (async () => draftsDialog(await liveDrafts()))(); await TB.until(() => TB.dlg()); return p; };
    const asked = checkDraft(); await TB.until(() => TB.dlg());
    TB.key(document.activeElement, 'Escape'); await asked; await sleep(0);
    let p = list(); await TB.until(() => TB.dlg() && TB.dlg().querySelector('.dlg-rows'));
    TB.click(TB.dlg().querySelector('[data-r="apply:0"]')); await p; await TB.until(() => S.dirty);
    eq(itemsOf(S.sheet).map(i => i[K()]), ['保存した行', '保存し忘れた行'], '反映される');
    ok(TB.toasts().some(t => t.includes('下書きを反映しました')), 'お知らせ');
    idle(); await autoTick();
    p = list(); await TB.until(() => TB.dlg() && TB.dlg().querySelector('.dlg-rows'));
    eq(TB.dlg().querySelector('[data-r="apply:0"]'), null, '保留していなければ、反映のボタンは出ない');
    TB.key(document.activeElement, 'Escape'); await p;
    await clearDrafts();
  });

  test('下書き: 保留したあとに編集して下書きを置き直すと、反映のボタンは出ない', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '保存した行'); });
    loadDoc(clone(b0));
    snap(); setF(addItem(), K(), '保存し忘れた行'); idle(); await autoTick();
    loadDoc(clone(b0));
    window.dialog = TB.realDialog;
    const asked = checkDraft(); await TB.until(() => TB.dlg());
    TB.key(document.activeElement, 'Escape'); await asked; await sleep(0);
    snap(); setF(item(1), K(), '編集'); idle(); await autoTick();
    const p = (async () => draftsDialog(await liveDrafts()))(); await TB.until(() => TB.dlg() && TB.dlg().querySelector('.dlg-rows'));
    eq(TB.dlg().querySelector('[data-r="apply:0"]'), null, '反映のボタンは出ない');
    TB.key(document.activeElement, 'Escape'); await p;
    await clearDrafts();
  });

  test('下書き: 「開く」でファイルを選んだときも、下書きがあれば聞く。ほかの下書きの一覧は出さない', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '保存した行'); });
    loadDoc(clone(b0)); const blob = fileBlob();
    snap(); setF(addItem(), K(), '保存し忘れた行'); idle(); await autoTick();
    let asked = 0; window.dialog = async () => { asked++; return true; };
    window.showOpenFilePicker = async () => [new FakeHandle('a.html', blob)];
    loadDoc(newDoc());
    await openFile();
    eq(asked, 1, '聞く'); eq(itemsOf(S.sheet).map(i => i[K()]), ['保存した行', '保存し忘れた行'], '反映する');
    // 別の試験の空のファイルを開いても、一覧は出さない
    asked = 0; S.dirty = false;
    loadDoc(newDoc()); const blob2 = fileBlob();
    window.showOpenFilePicker = async () => [new FakeHandle('b.html', blob2)];
    await openFile();
    eq(asked, 0, '聞かない');
    await clearDrafts();
  });

  test('下書き: 一覧から開いただけでは、下書きを置き直さない', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    snap(); setF(addItem(), K(), '下書きの行'); idle(); await autoTick();
    const id = D.meta.id, d0 = await draftOf(id);
    loadDoc(newDoc());
    await openDraft(d0);
    eq([D.meta.id, S.dirty], [id, true], '開く');
    idle(); await autoTick();
    eq((await draftOf(id)).at, d0.at, '編集がなければ時刻が変わらない');
    snap(); setF(item(1), K(), '編集'); idle(); await autoTick();
    ok((await draftOf(id)).at > d0.at, '編集したら置く');
    await clearDrafts();
  });

  test('キー: ダイアログの間はショートカットで後ろの操作を始めない', async () => {
    window.dialog = TB.realDialog;
    let saves = 0; window.showSaveFilePicker = async () => { saves++; throw Object.assign(new Error('x'), { name: 'AbortError' }); };
    const p = dialog({ title: 'x', message: 'y' });
    for (const k of ['s', 'h', 'f', 'm']) TB.key(document.activeElement, k, { ctrl: true });
    await sleep(0);
    eq(document.querySelectorAll('.dlg-back').length, 1, 'ダイアログが重ならない'); eq(saves, 0, '保存しない');
    TB.key(document.activeElement, 'Escape'); await p;
  });

  test('キー: 競合の一覧を開くとフォーカスが移り、Esc で閉じて表に戻る', () => {
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '最初'); });
    const a = user(b0, '田中', () => setF(item(1), K(), '田中'));
    const b = user(b0, '佐藤', () => setF(item(1), K(), '佐藤'));
    open(a); merge(b);
    ed().focus();
    renderConflicts();
    ok($('#cfpanel').contains(document.activeElement), 'フォーカスが一覧に移る');
    TB.key(document.activeElement, 'Escape');
    eq($('#cfpanel'), null, 'Esc で閉じる');
    ok(document.activeElement === ed(), '表に戻る');
  });

  test('表: 列幅をドラッグしている間も、表の幅は描いたときと同じ計算', () => {
    snap(); addItem(); render();
    const h = document.querySelector('#grid .colrs');
    h.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, clientX: 100 }));
    window.dispatchEvent(new MouseEvent('mousemove', { bubbles: true, clientX: 130 }));
    const during = parseInt(grid().style.width);
    window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
    eq(during, cols().reduce((s, x) => s + x.w, 0) + 40, '右端の＋の分も含む');
  });

  test('表: 並べ替え中は Alt+↑↓ でも行を動かさない', () => {
    snap(); for (const t of ['b', 'a']) setF(addItem(), K(), t);
    S.sort = { sheet: S.sheet, col: K(), dir: 'asc' }; S.sortVer++; render();
    S.r = 0; S.c = 1; collapse(); paintCursor();
    const before = itemsOf(S.sheet).map(i => i.order);
    moveRow(1);
    eq(itemsOf(S.sheet).map(i => i.order), before, '動かない');
    ok(TB.toasts().some(t => t.includes('並べ替え中は行を移動できません')), 'お知らせ');
    S.sort = null; S.sortVer++;
  });

  test('置換: 書式の区切りをまたぐ語は、置き換えていないのに数えない', async () => {
    snap(); const it = addItem(); render();
    setCellRich(it, col('確認内容'), 'りんごを買う', [{ t: 'りんご', b: 1 }, { t: 'を買う' }]);
    renderGrid();
    window.dialog = async () => ['ごを買', 'x'];
    TB.click('[data-act="replace"]');
    await TB.until(() => TB.toasts().some(t => t.includes('見つかりませんでした')));
    ok(TB.toasts().some(t => t.includes('見つかりませんでした')), 'お知らせ: ' + TB.toasts());
    eq(it[K()], 'りんごを買う', '変わらない');
  });

  test('移動: 目次と競合の「その場所を開く」は、行を隠している絞り込みや折りたたみを外す', () => {
    snap();
    for (const [g, t] of [['A', 'a1'], ['A', 'a2'], ['B', 'b1'], ['B', 'b2']]) { const it = addItem(); setF(it, col('大項目').id, g); setF(it, K(), t); }
    render();
    S.cf[K()] = new Set(['a1']); S.cfVer++; render();
    eq(S.rows.map(i => i[K()]), ['a1'], '絞り込み中');
    actions.tocGo({ dataset: { k: 'B' } });
    eq(S.curId, item(3).id, '目次の行へ'); ok(S.rows.includes(item(3)), '見える');
    // 畳んだグループの2行目へ
    const b2 = item(4);
    setFold(curSheet(), 'B', true); renderGrid();
    ok(!S.rows.includes(b2), '畳まれている');
    snap(); const cf = { id: 'cf_x', kind: 'value', coll: 'items', obj: b2.id, k: K(), value: 'x', vt: 1, ts: {}, at: 1, updatedAt: 1 }; D.conflicts.push(cf); render();
    renderConflicts();
    resolveConflict('go', cf.id);
    eq(S.curId, b2.id, '行へ'); ok(S.rows.includes(b2), 'グループが開く');
  });
})();
