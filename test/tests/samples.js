/* samples/ のファイルが、今のアプリから作ったものと同じかを見る試験。
 * サンプルはここで作る（日本語と英語）。アプリやサンプルの内容を変えたら、この試験が「違う」と言うので --update で作り直す。
 * 画像（スクリーンショット）の中身はブラウザや OS の文字の描き方で変わるので、比べるときは外す。 */
(() => {
  'use strict';
  const { test, eq, ok } = TB;
  const L = (ja, en) => LANG === 'ja' ? ja : en;
  const stripBlobs = s => s.replace(/(<script type="text\/plain" class="tb-blob" data-id="[^"]*">)[^<]*/g, '$1');
  // 今の中身をファイルにして、samples/ のものと比べる。違えばランナーに新しい中身を渡す（--update で書かれる）
  const check = async name => {
    render();
    const text = await fileBlob().text(), have = TB.sampleFile(name);
    const same = have !== undefined && stripBlobs(have) === stripBlobs(text);
    if (!same || TB.updating) TB.writeFile(name, text);
    if (!same && !TB.updating) TB.fail(have === undefined ? `samples/${name} がまだありません（--update で作れます）` : `samples/${name} が今のアプリと違います（--update で作り直せます）`);
    return text;
  };
  // 言語ごとに同じ手順で作る。時計と乱数を戻すので、ID や日時は毎回同じになる
  const inLang = async (lang, fn) => { LANG = lang; try { TB.resetClock(); loadDoc(newDoc(), null); S.me = L('田中', 'Tanaka'); return await fn(); } finally { LANG = 'ja'; } };

  // 2つ目の試験ファイル（API の試験）。ダッシュボードに複数のファイルを置くために用意する
  const apiDoc = () => {
    const d = newDoc(), t = now() - 2 * 864e5;
    d.meta.title = L('小さなお店 API 試験', 'Little Shop API test');
    d.meta.issueUrl = 'https://github.com/example/shop/issues/{n}';
    const [s] = d.sheets; s.name = 'API';
    const r2 = { id: uid('r_'), name: L('回帰', 'Regression'), order: 2, ts: {}, updatedAt: t };
    d.runs.push(r2);
    const rows = [
      [L('商品', 'Items'), L('一覧', 'List'), 'GET', L('商品一覧が返る', 'Item list is returned'), L('商品が3件ある', 'Three items exist'), 'GET /items', L('200 で 3 件、価格は整数', '200 with 3 items; prices are integers')],
      [L('商品', 'Items'), L('一覧', 'List'), 'GET', L('ページング', 'Paging'), L('商品が 25 件ある', '25 items exist'), 'GET /items?page=2&size=10', L('11〜20 件目が返り、next リンクがある', 'Items 11–20 are returned with a next link')],
      [L('商品', 'Items'), L('詳細', 'Detail'), 'GET', L('ない商品', 'Missing item'), '', 'GET /items/999', L('404 と {"error":"not_found"}', '404 with {"error":"not_found"}')],
      [L('見積もり', 'Quote'), L('割引', 'Discount'), 'GET', L('まとめ買い割引', 'Bulk discount'), L('API キーを用意しておく', 'Have an API key ready'), 'GET /quote?item=banana&qty=5', 'discount=50, total=450'],
      [L('見積もり', 'Quote'), L('割引', 'Discount'), 'GET', L('ゴールド会員の割引', 'Gold member discount'), L('ゴールド会員のキー', 'Key of a gold member'), 'GET /quote?item=apple&qty=3', 'discount=18, total=342'],
      [L('見積もり', 'Quote'), L('入力チェック', 'Validation'), 'GET', L('数量が 0', 'Quantity 0'), '', 'GET /quote?item=apple&qty=0', L('400 と qty のエラー', '400 with a qty error')],
      [L('注文', 'Orders'), L('作成', 'Create'), 'POST', L('注文を作る', 'Create an order'), L('在庫がある', 'Item in stock'), 'POST /orders {"item":"apple","qty":1}', L('201 と注文番号。在庫が 1 減る', '201 with an order number; stock drops by 1')],
      [L('注文', 'Orders'), L('作成', 'Create'), 'POST', L('在庫切れ', 'Out of stock'), L('在庫を 0 にしておく', 'Set stock to 0'), 'POST /orders {"item":"apple","qty":1}', L('409 と {"error":"out_of_stock"}', '409 with {"error":"out_of_stock"}')],
    ];
    const ids = rows.map((vals, i) => {
      const it = { id: uid('i_'), sheet: s.id, order: i + 1, ts: {}, updatedAt: t };
      s.columns.slice(0, 7).forEach((c, k) => { it[c.id] = vals[k]; });
      d.items.push(it); return it.id;
    });
    const [r1] = d.runs;
    const rec = (i, run, by, v, dt, remark) => d.records.push({ id: `rec_${ids[i]}_${run.id}`, item: ids[i], run: run.id, by, at: fmt(t + dt * 36e5, true), verdict: v, remark: remark || '', ts: {}, updatedAt: t });
    const suzuki = L('鈴木', 'Suzuki');
    rec(0, r1, suzuki, 'ok', 1); rec(1, r1, suzuki, 'ok', 1.1); rec(2, r1, suzuki, 'ok', 1.2);
    rec(3, r1, suzuki, 'ng', 2, L('#131 割引が 0 で返る', '#131 discount comes back as 0')); rec(4, r1, suzuki, 'ok', 2.2); rec(5, r1, suzuki, 'ok', 2.5);
    rec(6, r1, suzuki, 'ok', 3); rec(3, r2, suzuki, 'ok', 26, L('#131 修正を確認', 'Verified the fix for #131'));
    d.elements.push({ id: uid('e_'), owner: evOwner(ids[3], r1.id), type: 'text', z: 1, by: suzuki, at: t, ts: {}, updatedAt: t, x: 24, y: 24, w: 640, style: 'log',
      text: '$ curl -s "https://staging.shop.example/quote?item=banana&qty=5" -H "X-Api-Key: ****"\n{"item":"banana","qty":5,"subtotal":500,"discount":0,"total":500}' });
    return d;
  };

  const shopName = () => L('shop-ja.html', 'shop-en.html'), apiName = () => L('api-ja.html', 'api-en.html'), dashName = () => L('dashboard-ja.html', 'dashboard-en.html');

  test('サンプル: samples/shop-*.html は「サンプルで試す」と同じ中身（日・英）', async () => {
    for (const lang of ['ja', 'en']) {
      await inLang(lang, async () => {
        loadDoc(sampleDoc(), null);
        const text = await check(shopName());
        ok(text.includes(`<title>${L('小さなお店 結合試験', 'Little Shop integration test')}</title>`), lang + ' の題名');
        ok(text.includes('class="tb-blob"'), lang + ' のスクリーンショットが入っている');
      });
    }
  });

  test('サンプル: samples/api-*.html は API の試験（2つ目のファイル）', async () => {
    for (const lang of ['ja', 'en']) {
      await inLang(lang, async () => { loadDoc(apiDoc(), null); eq(itemsOf(S.sheet).length, 8, '8 行'); return check(apiName()); });
    }
  });

  test('サンプル: samples/dashboard-*.html は shop と api の集計カードと合計を置いた自由シート', async () => {
    for (const lang of ['ja', 'en']) {
      await inLang(lang, async () => {
        // 置くファイルは、samples/ のものではなく今作ったもの（samples/ の側がずれていたらその試験が言う）
        loadDoc(sampleDoc(), null); render(); const shop = new File([fileBlob()], shopName(), { type: 'text/html' });
        TB.resetClock(); loadDoc(apiDoc(), null); render(); const api = new File([fileBlob()], apiName(), { type: 'text/html' });
        TB.resetClock();
        const d = newDoc(), free = newSheet(L('ダッシュボード', 'Dashboard'), 'free', 1);
        d.sheets = [free]; d.meta.title = L('小さなお店 試験ダッシュボード', 'Little Shop test dashboard');
        loadDoc(d, null); S.me = L('田中', 'Tanaka');
        const owner = sheetOwner(free.id);
        addEl(owner, 'text', { x: 32, y: 28, w: 720, style: 'title', text: d.meta.title });
        addEl(owner, 'text', { x: 32, y: 76, w: 720, style: 'normal', text: L('ほかの試験ファイルをこのボードに落とすと、その消化状況のカードになります。同じファイルをまた落とすと数字が新しくなり、「全部の合計」は置いたカードを足します。',
          'Drop other test files on this board to get a card with their progress. Drop the same file again to refresh the numbers; "Grand total" adds up the cards.') });
        const r = await addXMetrics(owner, [shop, api], { x: 32, y: 150 });
        eq(r.n, 2, '2 つのカード');
        addEl(owner, 'xtotal', { x: 480, y: 150, w: 560 });
        eq(elementsOf(owner).filter(e => e.type === 'xmetric').map(e => e.title), [L('小さなお店 結合試験', 'Little Shop integration test'), L('小さなお店 API 試験', 'Little Shop API test')], 'カードの題名');
        return check(dashName());
      });
    }
  });
})();
