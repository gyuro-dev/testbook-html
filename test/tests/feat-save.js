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
    ok(parts && parts.length > 3 && parts.every(p => p.length < 4 * PART_CHARS), '編集がなければ最後まで作る。全体を1つの巨大な文字列にはしない');
    ok(TB.partsText(parts).includes('途中で直した'), '新しい内容が入っている');
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
    let asked = null; window.dialog = async o => { asked = o; return 'open:0'; };
    await checkDraft();
    ok(asked && asked.title === '保存していない下書きがあります' && asked.rows.includes('消えかけた試験'), '聞く: ' + (asked && asked.rows));
    eq([D.meta.id, D.meta.title, item(1)[K()], S.dirty], [id, '消えかけた試験', '復元される行', true], '開くと戻る');
    // 閉じるなら残したまま
    loadDoc(newDoc()); window.dialog = async () => null;
    await checkDraft();
    eq(itemsOf(S.sheet).length, 0, '開かない'); ok(await draftOf(id), '下書きは残る');
  });

  // 下書きを直接置く（中身は本当の試験ファイルの形）。一覧の試験は本物のダイアログを押す
  const putDraft = async (id, title, at, json) => {
    const doc = newDoc(); doc.meta.id = id; doc.meta.title = title;
    if (!json) { const cur = D; D = doc; json = fileBlob(); D = cur; }
    await idb('drafts', 'readwrite', st => st.put({ id, title, at, json }, id));
  };
  const rowTitles = () => [...TB.dlg().querySelectorAll('.dlg-row b')].map(b => b.textContent);
  const pushBtn = async sel => { await TB.until(() => TB.dlg() && TB.dlg().querySelector(sel)); TB.click(TB.dlg().querySelector(sel)); await TB.frame(); };
  const waitDlg = () => TB.until(() => TB.dlg());
  const realDialog = () => { window.dialog = TB.realDialog; };

  test('下書きの削除: 空の状態で開いたときの一覧に新しい順に全部並び、確認してから消す', async () => {
    await clearDrafts(); realDialog();
    const t = now();
    await putDraft('d_a', '古いほう', t - 864e5);
    await putDraft('d_b', '新しいほう', t - 1000);
    const p = checkDraft(); await waitDlg();
    eq(rowTitles(), ['新しいほう', '古いほう'], '新しい順');
    eq(document.activeElement.dataset.r, 'open:0', '最初は一番新しい下書きの「開く」に');
    // 確認でやめると、消さずに一覧に戻る
    await pushBtn('[data-r="del:0"]');
    ok(TB.dlg().querySelector('.danger') && TB.dlg().textContent.includes('元に戻せません'), '確認が出る');
    TB.key(document.activeElement, 'Escape'); await waitDlg();
    eq(rowTitles(), ['新しいほう', '古いほう'], 'やめたら一覧に戻る');
    ok(await draftOf('d_b'), 'やめたら残る');
    // 確認すると消え、残りが一覧に残る
    await pushBtn('[data-r="del:0"]');
    await pushBtn('.danger');
    await TB.until(() => TB.dlg() && TB.dlg().querySelectorAll('.dlg-row').length === 1);
    eq(rowTitles(), ['古いほう'], '消したものは一覧から消える');
    eq(await draftOf('d_b'), undefined, '消える');
    ok(await draftOf('d_a'), 'ほかの下書きは残る');
    ok(TB.toasts().some(s => s.includes('下書きを削除しました: 新しいほう')), 'お知らせ');
    // 最後の 1 件を消すと一覧も閉じる
    await pushBtn('[data-r="del:0"]');
    await pushBtn('.danger');
    await p;
    eq([TB.dlg(), await draftOf('d_a')], [null, undefined], '全部消えたら閉じる');
    eq(itemsOf(S.sheet).length, 0, '画面はそのまま');
  });

  test('下書きの削除: ⋯ メニューから一覧を開ける。一番新しくない下書きも開ける。なければお知らせだけ', async () => {
    await clearDrafts(); realDialog();
    TB.click('[data-act="more"]');
    TB.click('#pop [data-act="drafts"]');
    await TB.until(() => TB.toasts().some(s => s.includes('保存していない下書きはありません')));
    ok(TB.toasts().some(s => s.includes('保存していない下書きはありません')), 'なければお知らせ'); eq(TB.dlg(), null, '一覧は出ない');
    const t = now();
    await putDraft('d_a', '古いほう', t - 864e5);
    await putDraft('d_b', '新しいほう', t - 1000);
    await putDraft('d_old', '期限切れ', t - 40 * 864e5);
    TB.click('[data-act="more"]');
    TB.click('#pop [data-act="drafts"]');
    await waitDlg();
    eq(rowTitles(), ['新しいほう', '古いほう'], '期限切れは出ない');
    await pushBtn('[data-r="open:1"]');
    await TB.until(() => D.meta.id === 'd_a');
    eq([D.meta.id, D.meta.title, S.dirty], ['d_a', '古いほう', true], '選んだ下書きが開く');
    ok(await draftOf('d_b'), 'ほかの下書きは残る');
    eq(await draftOf('d_old'), undefined, '期限切れは捨てる');
  });

  test('下書きの削除: 今の変更が保存されていないときに別の下書きを開くなら確認する', async () => {
    await clearDrafts(); realDialog();
    await putDraft('d_a', '別の試験', now() - 1000);
    snap(); setF(addItem(), K(), '今の変更');
    const p = (async () => draftsDialog(await liveDrafts()))(); await waitDlg();
    await pushBtn('[data-r="open:0"]');
    ok(TB.dlg().textContent.includes('保存していない変更は失われます'), '確認が出る');
    TB.key(document.activeElement, 'Escape');
    await p;
    eq(item(1)[K()], '今の変更', 'やめたら今の試験のまま');
  });

  test('下書きの削除: 開いている試験の下書きは削除だけ。画面はそのままで、次に編集するまで置き直さない', async () => {
    await clearDrafts(); realDialog();
    window.showSaveFilePicker = undefined;
    snap(); setF(addItem(), K(), '画面の行'); idle(); await autoTick();
    const id = D.meta.id;
    ok(await draftOf(id), '下書きがある');
    // 下書きを置いたあとの編集がまだ書かれていなくても、消したあとに書き戻さない
    snap(); setF(item(1), K(), '画面の行2');
    const p = (async () => draftsDialog(await liveDrafts()))(); await waitDlg();
    eq([TB.dlg().querySelector('[data-r="open:0"]'), TB.dlg().querySelector('.dlg-row').textContent.includes('開いている試験')], [null, true], '「開く」はなく、開いている試験と分かる');
    await pushBtn('[data-r="del:0"]');
    ok(TB.dlg().textContent.includes('画面の内容はそのままです'), '確認に書いてある');
    await pushBtn('.danger');
    await p;
    eq(await draftOf(id), undefined, '消える');
    eq([item(1)[K()], S.dirty], ['画面の行2', true], '画面は変わらず、保存していないまま');
    idle(); await autoTick();
    eq(await draftOf(id), undefined, '編集がなければ置き直さない');
    snap(); setF(item(1), K(), '次の編集'); idle(); await autoTick();
    ok(await draftOf(id), '次に編集したら置く');
  });

  test('下書きの削除: 読めない下書きも消せる。題名はエスケープする。Enter はフォーカスのあるボタンを押す', async () => {
    await clearDrafts(); realDialog();
    const evil = '<img src=x onerror=window.TB_XSS=1>';
    await putDraft('d_bad', evil, now() - 1000, new Blob(['壊れた中身']));
    let p = (async () => draftsDialog(await liveDrafts()))(); await waitDlg();
    eq(rowTitles(), [evil], '題名は文字のまま');
    eq(TB.dlg().querySelector('.dlg-row img'), null, 'タグにならない');
    eq(document.activeElement.dataset.r, 'open:0');
    TB.key(document.activeElement, 'Enter');  // 開く
    await p;
    ok(TB.toasts().some(s => s.includes('下書きを読めませんでした')), '読めなければお知らせ');
    ok(await draftOf('d_bad'), '読めなくても勝手には消さない');
    p = (async () => draftsDialog(await liveDrafts()))(); await waitDlg();
    // フォーカスが一覧の外（data-r を持つ表のセルなど）にあるときの Enter は何もしない
    const outside = document.createElement('button'); outside.dataset.r = '3'; document.body.appendChild(outside); outside.focus();
    TB.key(outside, 'Enter'); outside.remove();
    ok(TB.dlg() && rowTitles().length === 1, '一覧のまま');
    TB.dlg().querySelector('[data-r="del:0"]').focus();
    TB.key(document.activeElement, 'Enter');  // 削除（確認が出る）
    await waitDlg();
    ok(TB.dlg().textContent.includes('元に戻せません'), 'Enter でも確認が出る');
    await pushBtn('.danger');
    await p;
    eq(await draftOf('d_bad'), undefined, '消える');
  });

  test('下書きの削除: 英語の画面でも日本語が残らない', async () => {
    await clearDrafts(); realDialog();
    setLang('en');
    try {
      await putDraft('d_a', 'A test', now() - 1000);
      const p = (async () => draftsDialog(await liveDrafts()))(); await waitDlg();
      eq(/[ぁ-んァ-ヶ一-龠]/.test(TB.dlg().textContent), false, '一覧: ' + TB.dlg().textContent);
      await pushBtn('[data-r="del:0"]');
      eq(/[ぁ-んァ-ヶ一-龠]/.test(TB.dlg().textContent), false, '確認: ' + TB.dlg().textContent);
      await pushBtn('.danger');
      await p;
    } finally { setLang('ja'); }
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
    loadDoc(clone(b0)); window.dialog = async o => o.cancelAnswer;
    await checkDraft(); await sleep(100);
    eq(itemsOf(S.sheet).length, 1, '捨てた'); eq(await draftOf(D.meta.id), undefined, '下書きも消える');
  });

  test('下書き: 開き直したときの窓は、Esc や窓の外のクリックでは下書きを消さず、次にまた聞く。「破棄する」を押したときだけ消す', async () => {
    await clearDrafts();
    window.showSaveFilePicker = undefined;
    const b0 = user(newDoc(), '田中', () => { setF(addItem(), K(), '保存した行'); });
    loadDoc(clone(b0));
    snap(); setF(addItem(), K(), '保存し忘れた行'); idle(); await autoTick();
    const id = D.meta.id;
    ok(await draftOf(id), '下書きがある');
    window.dialog = TB.realDialog;
    const ask = async answer => {
      loadDoc(clone(b0));
      const p = checkDraft();
      await TB.until(() => TB.dlg());
      ok(TB.dlg() && TB.dlg().textContent.includes('保存していない変更があります'), '聞く');
      answer();
      await p; await sleep(100);
    };
    await ask(() => TB.key(document.activeElement, 'Escape'));
    ok(await draftOf(id), 'Esc では残る');
    eq([itemsOf(S.sheet).length, S.dirty], [1, false], 'Esc では合わせない');
    await ask(() => TB.click('.dlg-back'));
    ok(await draftOf(id), '窓の外のクリックでは残る');
    await ask(() => TB.click(TB.dlg().querySelector('[data-r="discard"]')));
    eq(await draftOf(id), undefined, '「破棄する」で消える');
    eq(itemsOf(S.sheet).length, 1, '合わせない');
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
