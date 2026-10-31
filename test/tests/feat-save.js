/* 自動保存と下書きの試験。保存先（ハンドル）は偽物、下書きは本物の IndexedDB を使う。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, clone, user, FakeHandle } = TB;
  const K = () => col('確認内容').id;
  const idle = () => { S.lastEdit = performance.now() - 60000; };  // 入力が止まって十分たったことにする
  const draftOf = id => idb('drafts', 'readonly', st => st.get(id));
  const clearDrafts = () => idb('drafts', 'readwrite', st => st.clear());
  const status = () => document.querySelector('#status').textContent;

  test('自動保存: 入力が止まってから保存先に上書きし、状態に「自動保存」と出る', async () => {
    await clearDrafts();
    const h = new FakeHandle('a.html'); S.handle = h; S.auto = true;
    snap(); setF(addItem(), K(), 'x');
    ok(status().includes('まもなく自動保存'), '状態: ' + status());
    await autoTick();
    eq(h.writes, 0, '打った直後は書かない');
    idle(); await autoTick();
    eq([h.writes, S.dirty], [1, false], '止まってから書く');
    ok(status().startsWith('自動保存 ') && status().includes('a.html'), '状態: ' + status());
    eq((await readBook(h.file)).items[0][K()], 'x', '書いた中身');
    idle(); await autoTick();
    eq(h.writes, 1, '変更がなければ書かない');
  });

  test('自動保存: 編集中・ダイアログ中・自動保存オフのときは書かない（オフのときは下書きに）', async () => {
    await clearDrafts();
    const h = new FakeHandle('a.html'); S.handle = h; S.auto = true;
    snap(); setF(addItem(), K(), 'x'); idle();
    S.editing = 'plain'; await autoTick(); S.editing = false;
    eq(h.writes, 0, '編集中');
    const back = document.createElement('div'); back.className = 'dlg-back'; document.body.appendChild(back);
    await autoTick(); back.remove();
    eq(h.writes, 0, 'ダイアログ中');
    S.auto = false; await autoTick();
    eq(h.writes, 0, 'オフなら書かない'); ok(S.dirty, '保存していないまま');
    const d = await draftOf(D.meta.id);
    ok(d && d.title === D.meta.title && d.json.size > 10, 'かわりに下書きを置く');
    S.auto = true;
  });

  test('自動保存: 保存先にほかの人の変更があれば、合わせてから書く', async () => {
    await clearDrafts();
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '最初'); setF(addItem(), K(), '2行目'); });
    const satoBlob = (() => { loadDoc(clone(user(b0, '佐藤', () => setF(item(2), K(), '佐藤の値')))); return fileBlob(); })();
    loadDoc(clone(b0)); S.me = '田中';
    const h = new FakeHandle('共有.html', satoBlob); S.handle = h; S.lastMod = 1; S.auto = true;
    snap(); setF(item(1), K(), '田中の値'); idle();
    await autoTick();
    eq([item(1)[K()], item(2)[K()]], ['田中の値', '佐藤の値'], '両方が画面に');
    const w = await readBook(h.file);
    eq([w.items[0][K()], w.items[1][K()]], ['田中の値', '佐藤の値'], '両方がファイルに');
  });

  test('自動保存: 大きな表でも JSON を少しずつ作り、途中で編集が入ったら捨ててやり直す', async () => {
    const sh = curSheet(), C = sheetCols(sh), t = now();
    for (let i = 0; i < 100000; i++) D.items.push({ id: 'big_' + i, sheet: sh.id, order: i + 1, ts: {}, updatedAt: t, [C[3].id]: `項目 ${i + 1} の確認内容をここに書く` });
    S.ver++;
    const p = jsonPartsAsync();       // 作り始める（最初の区切りで画面に制御を返す）
    snap(); setF(itemsOf(S.sheet)[0], C[3].id, '途中で直した');  // その間に編集
    eq(await p, null, '編集が入ったので捨てる');
    const parts = await jsonPartsAsync();
    ok(parts && parts.length > 100000, '編集がなければ最後まで作る');
    ok(parts.join('').includes('途中で直した'), '新しい内容が入っている');
  });

  test('自動保存: 手動の保存（Ctrl+S）は自動保存が終わるのを待ってから書く', async () => {
    const h = new FakeHandle('a.html'); S.handle = h; S.auto = true;
    snap(); setF(addItem(), K(), 'x'); idle();
    const a = autoTick();            // 自動保存を始める
    await save();                    // すぐ手動で保存
    await a;
    eq(h.writes, 2, '両方が順に書く（重ならない）');
    eq(S.dirty, false);
  });

  test('下書き: 保存先がないときは入力が止まると IndexedDB に下書きを置き、保存すると消える', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined; window.download = () => {};
    snap(); setF(addItem(), K(), '下書きの行'); setF(D.meta, 'title', '下書きの試験');
    idle(); await autoTick();
    const d = await draftOf(D.meta.id);
    ok(d && d.title === '下書きの試験', '下書きがある');
    const back = await readBook(new File([d.json], 'draft.html'));  // 下書きは保存するファイルと同じ形
    eq(back.items[0][K()], '下書きの行', '下書きの中身');
    snap(); setF(item(1), K(), '直した'); idle(); await autoTick();
    eq((await readBook(new File([(await draftOf(D.meta.id)).json], 'd.html'))).items[0][K()], '直した', '直すたびに書き換わる');
    await save(); await sleep(100);
    eq(await draftOf(D.meta.id), undefined, '保存したら消える');
  });

  test('下書き: 空の状態で開いたとき、残っている下書きを開くか聞く', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    snap(); setF(addItem(), K(), '復元される行'); setF(D.meta, 'title', '消えかけた試験');
    idle(); await autoTick();
    const id = D.meta.id;
    // ブラウザを閉じて、testbook.html をまた開いた（まっさら）
    loadDoc(newDoc());
    let asked = null; window.dialog = async o => { asked = o; return true; };
    await checkDraft();
    ok(asked && asked.title === '保存していない下書きがあります' && asked.message.includes('消えかけた試験'), '聞く: ' + (asked && asked.message));
    eq([D.meta.id, D.meta.title, item(1)[K()], S.dirty], [id, '消えかけた試験', '復元される行', true], '開くと戻る');
    // 「開かない」なら残したまま
    loadDoc(newDoc()); window.dialog = async () => null;
    await checkDraft();
    eq(itemsOf(S.sheet).length, 0, '開かない'); ok(await draftOf(id), '下書きは残る');
  });

  test('下書き: 同じ試験のファイルを開き直したとき、下書きのほうが新しければ合わせる', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '保存した行'); });
    loadDoc(clone(b0));
    snap(); setF(addItem(), K(), '保存し忘れた行'); idle(); await autoTick();
    ok(await draftOf(D.meta.id), '下書きがある');
    loadDoc(clone(b0));  // ファイル（下書きの前に保存したもの）を開き直した
    window.dialog = async () => true;
    await checkDraft();
    eq(itemsOf(S.sheet).map(i => i[K()]), ['保存した行', '保存し忘れた行'], '下書きの変更が合わさる');
    ok(S.dirty && TB.toasts().some(t => t.includes('下書きを反映しました')), 'お知らせ');
    // 「捨てる」なら消える
    loadDoc(clone(b0)); window.dialog = async () => null;
    await checkDraft(); await sleep(100);
    eq(itemsOf(S.sheet).length, 1, '捨てた'); eq(await draftOf(D.meta.id), undefined, '下書きも消える');
  });

  test('下書き: ファイルのほうが新しければ（保存のあとに残った下書き）黙って無視する', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    snap(); setF(addItem(), K(), 'a'); idle(); await autoTick();
    const d = await draftOf(D.meta.id); ok(d, '下書きがある');
    snap(); setF(item(1), K(), 'b');  // 下書きより後に直して保存した（ファイルの時刻のほうが新しい）
    const newer = clone(D);
    loadDoc(newer);
    let asked = 0; window.dialog = async () => { asked++; return true; };
    await checkDraft();
    eq([asked, item(1)[K()]], [0, 'b'], '聞かないし変えない');
  });

  test('下書き: 30 日より古い下書きは捨てる', async () => {
    await clearDrafts();
    await idb('drafts', 'readwrite', st => st.put({ id: 'd_old', title: '古い', at: now() - 40 * 864e5, json: new Blob(['{}']) }, 'd_old'));
    loadDoc(newDoc());
    let asked = 0; window.dialog = async () => { asked++; return true; };
    await checkDraft(); await sleep(100);
    eq([asked, await draftOf('d_old')], [0, undefined], '聞かずに消す');
  });
})();
