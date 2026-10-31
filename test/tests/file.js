/* ファイルの読み書きの試験。保存した HTML を読み直して同じになるか、画像が別の塊に分かれるか、など。 */
(() => {
  'use strict';
  const { test, eq, ok, clone, user, col, item } = TB;

  // 今のデータを「保存したファイル」にして、読み直す。head はアプリ本体より前（データと画像のところ）
  const roundTrip = async () => {
    const f = new File([fileBlob()], 't.html'), text = await f.text();
    return { text, head: text.slice(0, text.indexOf('<script id="tb-app">')), doc: await readBook(f) };
  };
  // 保存されるはずの中身（削除した物は印だけ、画像は中身つき）
  const expected = () => {
    const d = JSON.parse(jsonParts().join(''));
    for (const e of d.elements) if (!e.deleted && isBinary(e)) e.data = elData(D.elements.find(x => x.id === e.id));
    return d;
  };

  test('ファイル: サンプルを保存して読み直すと同じデータになる', async () => {
    loadDoc(sampleDoc());
    const want = expected();
    const { doc } = await roundTrip();
    eq(doc, want, '読み直したデータ');
    ok(doc.elements.some(e => e.type === 'image' && e.data.startsWith('data:image/')), '画像の中身が戻っている');
  });

  test('ファイル: 画像は JSON ではなく tb-blob の塊に1枚ずつ入る', async () => {
    loadDoc(sampleDoc());
    const { head } = await roundTrip();
    const images = live(D.elements).filter(isBinary).length;
    eq(head.split(BLOB_OPEN).length - 1, images, 'tb-blob の数（アプリ本体より前にある）');
    const json = head.slice(head.indexOf(DATA_OPEN) + DATA_OPEN.length, head.indexOf(SCRIPT_CLOSE, head.indexOf(DATA_OPEN)));
    ok(!json.includes('data:image'), 'JSON に画像が入っていない');
  });

  test('ファイル: 削除した画像の中身は保存されない（印だけ残る）', async () => {
    loadDoc(sampleDoc());
    const img = live(D.elements).find(e => e.type === 'image');
    snap(); setF(img, 'deleted', true);
    const { text, doc } = await roundTrip();
    ok(!text.includes(img.data.slice(0, 200)), '画像のデータがファイルにない');
    const t = doc.elements.find(e => e.id === img.id);
    eq(Object.keys(t).sort(), ['deleted', 'id', 'ts', 'updatedAt'], '印だけ残る');
  });

  test('ファイル: 「</script>」や「<」を含む文字を入れても壊れない', async () => {
    const s = 'a</script><b>&amp; "引用" \\ 改行\nあ';
    snap(); setF(addItem(), col('確認内容').id, s);
    const { doc } = await roundTrip();
    ok(doc, 'ファイルとして読める');
    eq(doc.items[0][col('確認内容').id], s, '文字がそのまま戻る');
  });

  test('ファイル: 保存したファイルに試験のスクリプトやデータの残骸が混ざらない', async () => {
    loadDoc(sampleDoc());
    const { text, head } = await roundTrip();
    ok(!text.includes('harness.js') && !text.includes('tb-test-golden'), '試験のスクリプトが入っていない');
    eq(text.split('<script id="tb-app">').length - 1, 1, 'アプリ本体は1つ');
    eq(head.split(DATA_OPEN).length - 1, 1, 'データは1つ');
    ok(text.startsWith('<!doctype html>'), 'doctype');
    ok(text.includes(`<title>${esc(D.meta.title)}</title>`), 'タイトルが試験の名前になる');
  });

  test('ファイル: 保存を2回繰り返しても中身が増えない', async () => {
    loadDoc(sampleDoc());
    const a = await roundTrip();
    loadDoc(a.doc);
    const b = await roundTrip();
    eq(b.text.length, a.text.length, 'ファイルの長さ');
  });

  test('ファイル: testbook ではない HTML や、古い版（version 1）は開けない', async () => {
    eq(await readBook(new File(['<!doctype html><html><body>hello</body></html>'], 'a.html')), null, 'ふつうの HTML');
    eq(await readBook(new File(['{"format":"testbook","version":1,"items":[]}'], 'a.json')), null, 'version 1');
    eq(await readBook(new File([''], 'a.html')), null, '空のファイル');
    eq(await readBook(new File([DATA_OPEN + '{"format":"testbook","version":2' + SCRIPT_CLOSE], 'a.html')), null, '途中で切れた JSON');
  });

  test('ファイル: JSON だけのファイルも読める', async () => {
    loadDoc(sampleDoc());
    const want = JSON.parse(jsonParts().join(''));
    const doc = await readBook(new File([JSON.stringify(want)], 'a.json'));
    eq(doc, want);
  });

  test('ファイル: 画像以外のデータが 480MB を超える保存は止める', async () => {
    let shown = null; window.dialog = async o => { shown = o.title; return true; };
    eq(await checkSize({ jsonLen: MAX_JSON + 1, size: MAX_JSON + 1 }), false, '止める');
    eq(shown, '大きすぎて保存できません');
    eq(await checkSize({ jsonLen: 1000, size: 1000 }), true, 'ふつうの大きさは通す');
  });

  test('ファイル: 保存するファイルの名前は試験の名前から作り、使えない文字は _ にする', () => {
    snap(); setF(D.meta, 'title', 'A/B:C*D?E"F<G>H|I');
    eq(fileName(), 'A_B_C_D_E_F_G_H_I.html');
  });
})();
