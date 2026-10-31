/* 保存・開く・取り込み・共有フォルダの流れと、大きなデータ、ダイアログの試験。
 * ファイルの保存先（File System Access API のハンドル）は偽物を作って渡す。
 * メソッドをプロトタイプに置いた class にしているのは、アプリが保存先を IndexedDB に覚えるとき（structured clone）に関数が邪魔にならないため。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep, clone, user } = TB;
  const FakeHandle = TB.FakeHandle;
  const K = () => col('確認内容').id;
  const base = () => user(newDoc(), '田中', () => { setF(addItem(), K(), '最初の値'); setF(addItem(), K(), '2行目'); });
  const blobOf = doc => { const keep = clone(D); loadDoc(clone(doc)); const b = fileBlob(); loadDoc(keep); return b; };

  test('保存: 初回は保存先を選び、2回目からはそのまま上書きする（Ctrl+S）', async () => {
    const h = new FakeHandle('試験.html');
    let picked = 0; window.showSaveFilePicker = async () => { picked++; return h; };
    {
      snap(); setF(addItem(), K(), 'a');
      TB.key(document.body, 's', { ctrl: true }); await sleep(100);
      eq([picked, h.writes, S.dirty], [1, 1, false], '1回目: 保存先を選んで書く');
      ok(document.querySelector('#status').textContent.includes('保存済み') && document.querySelector('#status').textContent.includes('試験.html'), '状態の表示');
      snap(); setF(item(1), K(), 'b');
      await save();
      eq([picked, h.writes], [1, 2], '2回目: 聞かずに上書き');
      const d = await readBook(h.file);
      eq(d.items[0][K()], 'b', '書いた中身');
      await save(true);
      eq(picked, 2, '「名前を付けて保存」は選び直す');
    }
  });

  test('保存: 上書きできないブラウザではダウンロードになる', async () => {
    window.showSaveFilePicker = undefined;  // File System Access API のないブラウザ
    let got = null; window.download = (name, blob) => { got = { name, blob }; };
    snap(); setF(D.meta, 'title', 'DL試験');
    await save();
    ok(got && got.name === 'DL試験.html' && got.blob.size > 100000, 'ダウンロード: ' + (got && got.name));
    eq(S.dirty, false); ok(TB.toasts().some(t => t.includes('ダウンロードとして保存しました')));
  });

  test('共有フォルダ: 保存の直前にディスクの最新を読み、ほかの人の変更を合わせてから書く', async () => {
    const b0 = base();
    const sato = user(b0, '佐藤', () => setF(item(2), K(), '佐藤の値'));
    const [baseBlob, satoBlob] = [blobOf(b0), blobOf(sato)];  // loadDoc は保存先を忘れるので、先に作っておく
    loadDoc(clone(b0)); S.me = '田中';
    const h = new FakeHandle('共有.html', baseBlob); S.handle = h; S.lastMod = h.file.lastModified;
    snap(); setF(item(1), K(), '田中の値');
    h.put(satoBlob);  // その間に佐藤が保存した
    await save();
    eq([item(1)[K()], item(2)[K()]], ['田中の値', '佐藤の値'], '両方が画面に入る');
    const written = await readBook(h.file);
    eq([written.items[0][K()], written.items[1][K()]], ['田中の値', '佐藤の値'], '両方がファイルに書かれる');
    ok(TB.toasts().some(t => t.includes('ほかの人の変更も取り込みました') && t.includes('項目 1')), 'お知らせ: ' + TB.toasts().slice(-1));
    eq(S.lastMod, h.file.lastModified, '次の保存のために更新日時を覚える');
    await save();
    eq(h.writes, 2, '変わっていなければ読み直さず、そのまま書く');
  });

  test('共有フォルダ: 開いている間にほかの人が保存したら、取り込んで画面に出す', async () => {
    const b0 = base();
    loadDoc(clone(b0)); S.me = '田中';
    const baseBlob = blobOf(b0), satoBlob = blobOf(user(b0, '佐藤', () => setF(item(2), K(), '佐藤の値'))), sato2Blob = blobOf(user(b0, '佐藤', () => setF(item(2), K(), 'もっと新しい')));
    loadDoc(clone(b0)); S.me = '田中';
    const h = new FakeHandle('共有.html', baseBlob); S.handle = h; S.lastMod = h.file.lastModified;
    await watchFile();
    eq(item(2)[K()], '2行目', '変わっていなければ何もしない');
    h.put(satoBlob);
    await watchFile();
    eq(item(2)[K()], '佐藤の値', '取り込まれる');
    eq(TB.cellText(1, cols().findIndex(c => c.id === K())), '佐藤の値', '表にも出る');
    ok(TB.toasts().some(t => t.includes('ほかの人が保存した変更を取り込みました')), 'お知らせ');
    // 編集中は取り込まない（打っている最中に表が描き変わらないように）
    h.put(sato2Blob);
    S.editing = 'plain'; await watchFile(); S.editing = false;
    eq(item(2)[K()], '佐藤の値', '編集中は待つ');
    await watchFile();
    eq(item(2)[K()], 'もっと新しい', '編集が終わったら取り込む');
  });

  test('取り込み: 「取り込み」でほかの人のファイルを選ぶと合わさり、内訳が出る', async () => {
    const b0 = base();
    const sato = user(b0, '佐藤', () => { setF(item(2), K(), '佐藤の値'); });
    loadDoc(clone(b0)); S.me = '田中';
    const satoBlob = blobOf(sato);
    const pick = () => { const fi = document.querySelector('#filein'); fi.files = TB.dt({ files: [new File([satoBlob], 'sato.html', { type: 'text/html' })] }).files; fi.dispatchEvent(new Event('change', { bubbles: true })); };
    TB.click('[data-act="import"]');
    eq(document.querySelector('#filein').dataset.mode, 'import');
    pick(); await sleep(200);
    eq(item(2)[K()], '佐藤の値', '合わさる');
    ok(TB.toasts().some(t => t.includes('sato.html を取り込みました: 項目 1')), 'お知らせ: ' + TB.toasts());
    ok(S.dirty, '保存していない印');
    pick(); await sleep(200);
    ok(TB.toasts().some(t => t.includes('新しい内容はありませんでした')), '同じものは二重に入らない');
  });

  test('取り込み: 表にファイルをドラッグすると取り込み、testbook でないファイルは断る', async () => {
    const b0 = base();
    const sato = user(b0, '佐藤', () => setF(item(1), K(), 'ドロップ'));
    loadDoc(clone(b0)); S.me = '田中';
    TB.drop('#gridwrap', [new File([blobOf(sato)], 'sato.html', { type: 'text/html' }), new File(['<html>x</html>'], 'memo.html', { type: 'text/html' })]);
    await sleep(300);
    eq(item(1)[K()], 'ドロップ', '取り込まれる');
    ok(TB.toasts().some(t => t.includes('memo.html は testbook')), 'testbook でないファイルは断る: ' + TB.toasts());
  });

  test('取り込み: 別の試験のファイルは確認してから、シートごと取り込む', async () => {
    const other = user(newDoc(), '佐藤', () => { setF(curSheet(), 'name', '別の試験のシート'); setF(addItem(), K(), '別の行'); });
    loadDoc(newDoc()); S.me = '田中';
    let asked = null; window.dialog = async o => { asked = o; return true; };
    await importFiles([new File([blobOf(other)], 'other.html')]);
    ok(asked && asked.title === '別の試験ファイルです', '確認する');
    eq(sheets().map(s => s.name), ['試験項目', '別の試験のシート'], 'シートごと入る');
    window.dialog = async () => false;
    loadDoc(newDoc());
    await importFiles([new File([blobOf(other)], 'other.html')]);
    eq(sheets().length, 1, '断れば入らない');
  });

  test('開く: 別のファイルを開くと中身が入れ替わり、保存していない変更があれば確認する', async () => {
    const other = user(newDoc(), '佐藤', () => { setF(D.meta, 'title', '開いた試験'); setF(addItem(), K(), '開いた行'); });
    const otherBlob = blobOf(other);
    loadDoc(newDoc()); S.me = '田中';
    let asked = 0; window.dialog = async () => { asked++; return false; };
    snap(); setF(addItem(), K(), '未保存');
    await openFile();
    eq(asked, 1, '保存していない変更があるので聞く'); eq(item(1)[K()], '未保存', '「キャンセル」なら開かない');
    S.dirty = false;
    // Edge / Chrome: ファイルを選ぶ窓（showOpenFilePicker）で開くと、その保存先を覚えて上書きできる
    const h = new FakeHandle('other.html', otherBlob);
    window.showOpenFilePicker = async () => [h];
    await openFile();
    eq([D.meta.title, item(1)[K()], document.title], ['開いた試験', '開いた行', '開いた試験 - testbook'], '入れ替わる');
    eq([S.handle, S.lastMod], [h, h.file.lastModified], '保存先を覚える');
    ok(TB.toasts().some(t => t.includes('other.html を開きました')));
    // ほかのブラウザ: ふつうのファイル選択で開く（保存先は覚えない）
    window.showOpenFilePicker = undefined;
    loadDoc(newDoc());
    await openFile();
    const fi = document.querySelector('#filein');
    eq(fi.dataset.mode, 'open');
    fi.files = TB.dt({ files: [new File([otherBlob], 'other.html', { type: 'text/html' })] }).files; fi.dispatchEvent(new Event('change', { bubbles: true })); await sleep(200);
    eq([D.meta.title, S.handle], ['開いた試験', null], '入れ替わるが保存先はない');
  });

  test('ダイアログ: 本物の窓が出て、ボタンで答えが返り、入力つきなら文字が返る', async () => {
    window.dialog = TB.realDialog;
    let p = dialog({ title: '確認', message: '消しますか？', ok: '消す', danger: true });
    await sleep(0);
    const d = TB.dlg();
    ok(d && d.textContent.includes('確認') && d.textContent.includes('消しますか？'), '窓の文言');
    TB.click(d.querySelector('[data-r="1"]'));
    eq(await p, true, 'OK は true');
    p = dialog({ title: '確認' }); await sleep(0); TB.click(TB.dlg().querySelector('[data-r="0"]'));
    eq(await p, null, 'キャンセルは null');
    p = dialog({ title: '確認' }); await sleep(0); TB.key(document.body, 'Enter');
    eq(await p, true, 'Enter は OK');
    p = dialog({ title: '名前', input: '田中' }); await sleep(0);
    const inp = TB.dlg().querySelector('input'); eq(inp.value, '田中', '初期値');
    inp.value = '佐藤'; TB.click(TB.dlg().querySelector('[data-r="1"]'));
    eq(await p, '佐藤', '入力つきは文字が返る');
    p = dialog({ title: '名前', input: '' }); await sleep(0); TB.key(TB.dlg().querySelector('input'), 'Escape');
    eq(await p, null, 'Esc は null');
    eq(document.querySelectorAll('.dlg-back').length, 0, '窓は閉じる');
  });

  test('名前: 名前が未設定なら、結果を付ける前に名前を聞く', async () => {
    S.me = ''; lsSet('testbook.me', '');
    snap(); addItem(); render();
    window.dialog = async o => (o.title === 'あなたの名前' ? '鈴木' : true);
    await setVerdict(item(1), 'ok');
    eq([S.me, recOf(item(1).id, S.run).by], ['鈴木', '鈴木'], '聞いた名前が実施者に入る');
    ok(document.querySelector('#me').textContent.includes('鈴木'), '右上に名前');
    window.dialog = async () => '';
    S.me = ''; await setVerdict(item(1), 'ng');
    eq(recOf(item(1).id, S.run).verdict, 'ok', '名前を入れなければ結果も付けない');
    S.me = '田中';
  });

  test('大きなデータ: 1万行でも見えている行しか描かず、スクロールすると続きが描かれる', async () => {
    const sh = curSheet(), C = sheetCols(sh), t = now();
    for (let i = 0; i < 10000; i++) D.items.push({ id: 'big_' + i, sheet: sh.id, order: i + 1, ts: {}, updatedAt: t, [C[0].id]: '大' + Math.floor(i / 100), [C[3].id]: `項目 ${i + 1}` });
    S.ver++; render();
    const drawn = () => document.querySelectorAll('#grid tr[data-r]').length;
    ok(drawn() > 5 && drawn() < 150, `描いた行は少し: ${drawn()}`);
    eq(itemsOf(S.sheet).length, 10000);
    const w = document.querySelector('#gridwrap');
    ok(w.scrollHeight > 100000, '表の高さは全行ぶん: ' + w.scrollHeight);
    w.scrollTop = w.scrollHeight; renderWindow(true);
    const last = [...document.querySelectorAll('#grid tr[data-r]')].pop();
    ok(last && last.textContent.includes('項目 10000'), '一番下の行が描かれる: ' + (last && last.textContent.slice(0, 40)));
    // 編集しても全部を描き直さない（行の一覧が同じなら、変わった行だけ）
    const t0 = performance.now(); snap(); setF(itemsOf(S.sheet)[9999], C[3].id, '直した'); renderGrid();
    ok(performance.now() - t0 < 200, '編集の描き直しが速い: ' + Math.round(performance.now() - t0) + 'ms');
    ok(document.querySelector('#progress').textContent.includes('消化 0/10000'), '集計: ' + document.querySelector('#progress').textContent);
  });

  test('大きなデータ: 1万行のファイルを保存して読み直せる', async () => {
    const sh = curSheet(), C = sheetCols(sh), t = now();
    for (let i = 0; i < 10000; i++) D.items.push({ id: 'big_' + i, sheet: sh.id, order: i + 1, ts: {}, updatedAt: t, [C[3].id]: `項目 ${i + 1}` });
    S.ver++;
    const f = TB.savedFile();
    ok(f.size > 1e6, 'ファイルの大きさ: ' + f.size);
    const d = await readBook(f);
    eq(d.items.length, 10000); eq(d.items[9999][C[3].id], '項目 10000');
  });

  test('新しい試験ファイル: ⋯ → 「新しい試験ファイル」でまっさらになる（保存していなければ確認）', async () => {
    snap(); setF(addItem(), K(), 'a'); setF(D.meta, 'title', '古い');
    let asked = 0; window.dialog = async () => { asked++; return true; };
    TB.click('[data-act="more"]'); TB.click('#pop [data-act="newDoc"]'); await sleep(0);
    eq([asked, itemsOf(S.sheet).length, D.meta.title], [1, 0, '無題の試験'], '確認してから新しくなる');
  });

  test('ブラウザを閉じるとき: 保存していない変更があれば確認が出る', () => {
    const fire = () => { const e = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(e); return e.defaultPrevented; };
    eq(fire(), false, '変更がなければそのまま');
    snap(); addItem();
    eq(fire(), true, '変更があれば止める');
  });
})();
