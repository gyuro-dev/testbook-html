/* ほかの人から受け取ったファイルの中身で、画面のスクリプトが動かないことの試験（XSS）。
 * HTML ファイルを直接開けばそのファイルの script は動くので、守るのは「手元の testbook.html に、受け取ったファイルを
 * 取り込んだとき」。取り込みは readBook → normalize を通るので、細工した JSON を readBook で読んで確かめる。 */
(() => {
  'use strict';
  const { test, eq, ok, col, sleep } = TB;
  const K = () => col('確認内容').id;
  const INJ = '"><img src=x onerror="window.__tbXss=1">';
  const noXss = where => {
    ok(!document.querySelector(`${where} img[src="x"]`), `${where} に img が作られない`);
    eq(window.__tbXss, undefined, 'スクリプトは動かない');
  };
  const readJson = d => readBook(new File([JSON.stringify(d)], 'evil.json'));

  test('取り込み: 不具合票のリンクが javascript: や引用符入りでも、リンクにしない・属性を壊さない', async () => {
    snap(); const it = addItem(); setF(it, K(), '#12 を見る'); render();
    for (const u of ['javascript:window.__tbXss=1//{n}', INJ + '{n}', 'ftp://x.example/{n}']) {
      snap(); setF(D.meta, 'issueUrl', u); render();
      noXss('#grid');
      eq(document.querySelectorAll('#grid a').length, 0, u + ' はリンクにしない');
    }
    snap(); setF(D.meta, 'issueUrl', 'https://x.example/?q="a"&n={n}'); render();
    const a = document.querySelector('#grid a');
    eq(a && a.getAttribute('href'), 'https://x.example/?q="a"&n=12', '引用符や & を含む https の URL はそのままリンク');
  });

  test('取り込み: 画像やファイルの中身が base64 の data URL でなければ出さない', async () => {
    snap(); const it = addItem(); const owner = evOwner(it.id, S.run);
    addEl(owner, 'image', { x: 0, y: 0, w: 100, h: 100, data: INJ, name: 'a' });
    addEl(owner, 'file', { x: 0, y: 200, w: 100, data: 'javascript:window.__tbXss=1', name: 'b', size: 1 });
    addEl(owner, 'image', { x: 0, y: 400, w: 100, h: 100, data: 'data:text/html,<script>window.__tbXss=1</script>', name: 'c' });
    openEvidence(it.id); await sleep(0);
    noXss('#board');
    eq([...document.querySelectorAll('#board img, #board a')].map(x => x.getAttribute('src') ?? x.getAttribute('href')), ['', '', ''], 'src / href は空');
    closeEvidence();
  });

  test('取り込み: 細工した ID・種類・色・座標・結果の値は捨てられ、画面に属性として出ない', async () => {
    const d = newDoc(), sh = d.sheets[0], run = d.runs[0], kc = sh.columns.find(c => c.name === '確認内容').id;
    d.items.push({ id: 'i_good', sheet: sh.id, order: 1, ts: {}, updatedAt: 1, [kc]: 'ok' }, { id: 'i_bad' + INJ, sheet: sh.id, order: 2, ts: {}, updatedAt: 1, [kc]: 'bad' });
    sh.columns.push({ id: 'k_' + INJ, name: 'x', type: 'text', w: 100 });
    sh.columns[0].w = '10px;' + INJ;
    sh.color = 'red' + INJ;
    d.runs.push({ id: 'r_' + INJ, name: 'r', order: 2, ts: {}, updatedAt: 1 });
    d.records.push({ id: 'rec_i_good_' + run.id, item: 'i_good', run: run.id, verdict: 'ok' + INJ, hist: [{ t: 1, by: 'a', v: 'ng' + INJ }, { t: INJ, by: 'b', v: 'ok' }], ts: {}, updatedAt: 1 });
    const owner = `ev:i_good:${run.id}`, base = { owner, ts: {}, updatedAt: 1, x: 0, y: 0, w: 100, h: 50 };
    d.elements.push(
      { ...base, id: 'e_1', type: 'frame' + INJ },
      { ...base, id: 'e_2', type: 'frame', color: 'red' + INJ, x: '0;' + INJ },
      { ...base, id: 'e_3', type: 'text', style: 'log' + INJ, fc: 'red' + INJ, text: 'hi', runs: [{ t: 'hi', c: 'red' + INJ }] },
      { ...base, id: 'e_4', type: 'marker', n: INJ, color: 'red' },
      { ...base, id: 'e_5', type: 'table', cells: 'x' },
      { ...base, id: 'e_6', type: 'xmetric', title: 't', runs: [{ name: 'r', total: INJ, done: INJ, ok: 1 }, 'junk'] },
      { ...base, id: 'e_' + INJ, type: 'text', text: 'x' },
      { ...base, id: 'e_7', type: 'text', text: 'x', owner: 5 },
      { id: 'e_8', deleted: true, ts: { deleted: 1 }, updatedAt: 1 },
    );
    d.comments.push({ id: 'c_' + INJ, item: 'i_good', text: 'x', by: 'a', at: 1, ts: {}, updatedAt: 1 });
    d.conflicts.push({ id: 'cf_1', kind: 'value', coll: 'items', obj: 'i_good', k: 'k' + INJ, value: 'x', vt: 1, at: 1, ts: {}, updatedAt: 1 });
    const r = await readJson(d);
    ok(r, 'ファイルとして読める');
    eq(r.items.map(i => i.id), ['i_good'], '形のおかしい ID の行は捨てる');
    eq([r.runs.length, r.comments.length, r.conflicts.length], [1, 0, 0], '実施回・コメント・競合も');
    eq([r.sheets[0].columns.map(c => c.name).includes('x'), r.sheets[0].columns[0].w, 'color' in r.sheets[0]], [false, 140, false], '列の ID・幅、シートの色');
    eq(r.elements.map(e => e.id), ['e_2', 'e_3', 'e_4', 'e_5', 'e_6', 'e_8'], '種類・ID・置き場所のおかしい要素は捨て、削除の印は残す');
    const E = Object.fromEntries(r.elements.map(e => [e.id, e]));
    eq([E.e_2.color, E.e_2.x, E.e_3.style, E.e_3.fc, E.e_4.n, E.e_5.cells, E.e_6.runs.length, E.e_6.runs[0].total, E.e_6.runs[0].ok],
      [undefined, 0, undefined, undefined, 0, [['']], 1, 0, 1], '色・座標・書式・番号・表の中身・集計の数');
    // 開いて、表・パネル・エビデンス票・報告書を描いても、スクリプトは動かず img も作られない
    loadDoc(r); render(); S.r = 0; S.c = 1; paintCursor(); renderPane();
    noXss('#grid'); noXss('#pane');
    ok(document.querySelector('#grid td.pick').textContent.includes('—'), '知らない結果の値は未実施として出る');
    ok(document.querySelector('#pane .hist').textContent.includes('ng' + INJ), '履歴の知らない値は文字のまま');
    openEvidence('i_good'); await sleep(0); noXss('#board');
    ok(document.querySelector('#board .el-xmetric').textContent.includes('0/0'), '集計カードの数は数として出る');
    closeEvidence();
    ok(!/<img/.test(reportHtml({ scope: 'all', withEv: true })), '報告書にも出ない');
  });

  test('ファイル: 題名に $& や $\' があっても、保存したファイルの <title> が壊れない', async () => {
    const title = "a$&b$'c$1$$";
    snap(); setF(D.meta, 'title', title);
    const text = await new File([fileBlob()], 't.html').text(), head = text.slice(0, text.indexOf('<script id="tb-app">'));
    eq(head.split('<title>').length - 1, 1, 'title は1つ');
    ok(head.includes(`<title>${esc(title)}</title>`), 'そのまま: ' + head.slice(head.indexOf('<title>'), head.indexOf('<title>') + 60));
    eq((await readBook(new File([fileBlob()], 't.html'))).meta.title, title, '読み直しても同じ');
  });

  test('言語: 英語でも、コメント欄の placeholder と「並べ替え中」のボタンの列名が正しく出る', async () => {
    LANG = 'en';
    try {
      snap(); for (const t of ['b', 'a']) setF(addItem(), K(), t);
      S.sort = { sheet: S.sheet, col: K(), dir: 'asc' }; S.sortVer++; render();
      S.r = 0; S.c = cols().indexOf(col('確認内容')); paintCursor(); renderPane();
      const ph = document.querySelector('#cmtext').placeholder;
      ok(ph.startsWith('About "Check"') && ph.includes('Ctrl+Enter'), 'placeholder: ' + ph);
      const b = document.querySelector('#toolbar [data-act="sortClear"]');
      ok(b && b.textContent.includes('Check') && !b.textContent.includes('確認内容'), '並べ替え中: ' + (b && b.textContent));
    } finally { LANG = 'ja'; S.sort = null; S.sortVer++; }
  });
})();
