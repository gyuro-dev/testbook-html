/* 4回目のレビューで見つけた不具合の試験。保存の競合、読めないファイル、壊れた値、消されたシートや実施回、たくさんの画像と行。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, FakeHandle } = TB;
  const K = () => col('確認内容').id;
  const load = d => readBook(new File([JSON.stringify(d)], 'x.json'));
  const smallDoc = () => { snap(); for (const v of ['1行目', '2行目']) setF(addItem(), K(), v); renderGrid(); return TB.clone(D); };
  const blobOf = d => { const cur = D; D = d; const b = fileBlob(); D = cur; return b; };
  // 終わらないと試験全体が止まるので、待ちきれなければ「終わらなかった」と返す
  const settled = (p, ms = 3000) => Promise.race([p.then(() => 'resolved', () => 'rejected'), new Promise(r => setTimeout(() => r('hung'), ms))]);
  const PNG = () => { const cv = document.createElement('canvas'); cv.width = cv.height = 2; cv.getContext('2d').fillRect(0, 0, 2, 2); return cv.toDataURL('image/png'); };

  test('下書きの置き場所: トランザクションが abort しても、ないストアを開いても、待ち続けない', async () => {
    eq(await settled(idb('drafts', 'readwrite', st => { st.transaction.abort(); })), 'rejected', 'abort（容量の超過と同じ終わり方）');
    eq(await settled(idb('no-such-store', 'readonly', st => st.get('x'))), 'rejected', 'ないストア');
    eq(await settled(idb('drafts', 'readwrite', () => { throw new Error('put に失敗'); })), 'rejected', '書き込みの準備で例外');
  });

  test('下書き: 下書きを置けなくても保存は止まらない', async () => {
    let aborted = 0;
    smallDoc();
    // 容量の超過と同じように、abort で終わる下書き
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function () { aborted++; this.transaction.abort(); return { result: undefined }; };
    try { eq(await settled(saveDraft()), 'resolved', '下書きの処理が終わる'); } finally { IDBObjectStore.prototype.put = put; }
    eq([aborted, S.saving], [1, false], '保存を待たせない');
  });

  // 書き込みの途中で何か起きるハンドル
  class HookHandle extends FakeHandle {
    async createWritable() {
      const w = await super.createWritable(), me = this;
      return { async write(b) { if (HookHandle.onWrite) await HookHandle.onWrite(me); await w.write(b); }, close: () => w.close(), async abort() { HookHandle.aborted++; } };
    }
  }

  test('保存: 書いている間に入力したら、保存していない変更のまま残る', async () => {
    const h = new HookHandle('t.html'); S.handle = h;
    smallDoc();
    let during = null;
    HookHandle.onWrite = () => { during = S.saving; snap(); setF(item(1), K(), '書いている間に入力'); };
    try { await save(); } finally { HookHandle.onWrite = null; }
    eq(during, true, '書いている間は保存中');
    eq([S.dirty, S.saving], [true, false], '入力は未保存のまま');
    eq((await readBook(h.file)).items[0][K()], '1行目', 'ファイルには書く前の内容');
    await save();
    eq([S.dirty, (await readBook(h.file)).items[0][K()]], [false, '書いている間に入力'], '次の保存で入る');
  });

  test('保存: 同時に2回保存しても、順番に書く', async () => {
    const h = new HookHandle('t.html'); S.handle = h;
    smallDoc();
    let running = 0, most = 0;
    HookHandle.onWrite = async () => { most = Math.max(most, ++running); await TB.sleep(30); running--; };
    try { await Promise.all([save(), save()]); } finally { HookHandle.onWrite = null; }
    eq(most, 1, '重ならない');
  });

  test('保存: 書けなかったら一時ファイルを片付け、理由を出し、未保存のまま', async () => {
    const h = new HookHandle('t.html'); S.handle = h; HookHandle.aborted = 0;
    smallDoc();
    HookHandle.onWrite = () => { throw new Error('使用中です'); };
    try { await save(); } finally { HookHandle.onWrite = null; }
    eq([HookHandle.aborted, S.dirty, S.saving], [1, true, false], '片付けて未保存のまま');
    ok(TB.toasts().some(t => t.includes('使用中です')), '理由が出る');
  });

  // 読めないファイル（ネットワークが切れたなど）を返すハンドル
  const unreadable = name => { const f = new File(['x'], name, { lastModified: 5000 }); f.stream = () => { throw new Error('読めません'); }; return f; };

  test('保存: 保存先を読めないときは上書きしない（ほかの人の変更を消さない）', async () => {
    const d = smallDoc(), h = new FakeHandle('t.html', blobOf(d));
    S.handle = h; S.lastMod = 1;
    h.getFile = async () => unreadable('t.html');
    await save();
    eq([h.writes, S.saving], [0, false], '書かない');
    ok(TB.toasts().some(t => t.includes('読めません')), '理由が出る');
    await autoSave();
    eq([h.writes, S.saving], [0, false], '自動保存も書かない');
    delete h.getFile;
  });

  test('共有フォルダ: 読めなかった変更は、あとで読めたときに取り込む', async () => {
    const d = smallDoc(), h = new FakeHandle('t.html', blobOf(d));
    S.handle = h; S.lastMod = h.file.lastModified;
    h.put(blobOf(TB.user(d, '佐藤', () => setF(item(2), K(), '佐藤の値'))));
    loadDoc(TB.clone(d)); S.handle = h; S.me = '田中'; S.lastMod = 1000;
    h.getFile = async () => unreadable('t.html');
    await watchFile();
    eq([S.lastMod, S.saving], [1000, false], '読めなければ進めない');
    delete h.getFile;
    await watchFile();
    eq(item(2)[K()], '佐藤の値', '次に読めたときに取り込む');
    ok(S.lastMod > 1000, '読めたら進める');
  });

  test('共有フォルダ: 保存の間は読みに行かない', async () => {
    const d = smallDoc(), h = new FakeHandle('t.html', blobOf(d));
    S.handle = h; S.lastMod = 1;
    S.saving = true;
    let read = 0; h.getFile = async () => { read++; return h.file; };
    try { await watchFile(); } finally { S.saving = false; delete h.getFile; }
    eq(read, 0, '読まない');
  });

  test('マージ: まだ読んでいない画像は、同じファイルと合わせても変更に数えず、メモリにも載せない', async () => {
    const it = addItem(), png = PNG(), e = addEl(evOwner(it.id, S.run), 'image', { x: 0, y: 0, w: 2, h: 2, data: png, name: 'a.png' });
    const other = await readBook(TB.savedFile());
    // ダブルクリックで開いたときと同じように、画像はページの塊に置く
    BLOBNODES.set(e.id, { textContent: png }); delete e.data;
    snap(); setF(it, K(), '直した');
    const undo0 = UNDO.length, st = mergeInto(D, other);
    eq([st.n, st.conflicts], [0, 0], '変更はない');
    eq(UNDO.length, undo0, '元に戻す履歴は消えない');
    ok(!('data' in getEl(e.id)), '中身は読み込まない');
    eq(elData(getEl(e.id)), png, 'ページの塊からは読める');
    BLOBNODES.clear();
  });

  const brokenDoc = () => {
    const d = newDoc(), sh = d.sheets[0], run = d.runs[0], tx = sh.columns.find(c => c.type === 'text').id, rm = 'remark';
    sh.columns.push({ id: 'k_sel', name: 'sel', type: 'select', options: 'abc', w: 90 }, { id: 'k_id', name: 'id', type: 'id', digits: 1e10, w: 90 }, { id: 'constructor', name: 'bad', type: 'text', w: 90 });
    d.sheets.push({ id: 'toString', name: 'bad', kind: 'cases', order: 9, columns: [], ts: {}, updatedAt: 1 });
    d.meta.title = 5;
    d.items.push(
      { id: 'i_a', sheet: sh.id, order: 1, [tx]: 12345, [tx + ':r']: 'not runs', ts: {}, updatedAt: 1 },
      { id: 'i_b', sheet: sh.id, order: 2, [tx]: 'x', [tx + ':r']: [null], ts: {}, updatedAt: 1 },
      { id: 'i_c', sheet: sh.id, order: 3, [tx]: 'x', [tx + ':r']: [{ t: 5 }], ts: {}, updatedAt: 1 });
    d.records.push(
      { id: 'rec_a', item: 'i_a', run: run.id, verdict: 'constructor', at: 5, [rm + ':r']: 7, hist: 5, histX: 5, ts: {}, updatedAt: 1 },
      { id: 'rec_b', item: 'i_b', run: run.id, verdict: ['ok'], hist: [null], ts: {}, updatedAt: 1 },
      { id: 'rec_c', item: 'i_c', run: run.id, verdict: 'ok', at: 5, hist: [{ v: 'constructor', t: 1 }], ts: {}, updatedAt: 1 });
    return d;
  };

  test('壊れた値: 書式・履歴・結果・ID の形が合わなくても、描けて、合わせられて、操作できる', async () => {
    const d = await load(brokenDoc());
    eq(d.sheets.map(s => s.id).includes('toString'), false, '継承した値が見える ID は捨てる');
    eq(d.sheets[0].columns.some(c => c.id === 'constructor'), false, '列も');
    eq(d.records.map(r => r.verdict || null), [null, null, 'ok'], '知らない結果は未実施');
    eq([d.records[0].hist, d.records[0].histX, d.records[1].hist], [undefined, undefined, undefined], '形の合わない履歴は捨てる');
    eq(d.meta.title, '無題の試験', '文字でない題名');
    loadDoc(d); S.me = '田中';
    eq(fileName(), '無題の試験.html', '保存するときの名前も作れる');
    for (let r = 0; r < 3; r++) { S.r = r; S.c = 1; collapse(); paintCursor(); renderPane(); }
    actions.summary(); S.view = 'sheet'; render();
    eq(TB.cellText(0, cols().findIndex(c => c.type === 'text')), '12345', '数の値も出る');
    // 表の全部のメニューを開く（選択肢や ID の形式も見る）
    for (const th of document.querySelectorAll('#grid th[data-act="colMenu"]')) { actions.colMenu(th); hidePop(); }
    S.c = cols().findIndex(c => c.id === 'k_sel'); collapse(); paintCursor(); showSelectPop(cols()[S.c]); hidePop();
    eq(fmtId(cols().find(c => c.id === 'k_id'), 1).length, 'TC-'.length + 8, '桁数は 8 まで');
    addItem(); render();
    // 同じものを合わせても落ちない
    mergeInto(D, await load(brokenDoc()));
    render();
    // 置換は数の値でも動く
    window.dialog = async () => ['123', '9'];
    S.q = ''; collapse(); await actions.replace();
    eq(TB.cellText(0, cols().findIndex(c => c.type === 'text')), '945', '数の値も置き換わる');
  });

  test('壊れた値: 取り込む前から D にあった値でも、1文字の書式の形が合わなければ書式なしで描く', () => {
    const it = addItem(), c = col('確認内容');
    setF(it, c.id, 'あいう');
    for (const bad of ['文字', 5, [null], [{ t: 5 }]]) {
      it[c.id + ':r'] = bad; S.ver++; renderGrid();
      eq(TB.cellText(0, cols().indexOf(c)), 'あいう', JSON.stringify(bad));
    }
    delete it[c.id + ':r'];
  });

  test('時計: ファイルの時刻が大きすぎても文字でも、自分の時計は壊れない', async () => {
    const d = newDoc();
    d.items.push({ id: 'i_x', sheet: d.sheets[0].id, order: 1, ts: { a: 1e300, b: '9e99', c: Infinity }, updatedAt: 1 });
    d.meta.ts = { title: 1e300 };
    mergeInto(D, await load(d));
    const a = tick(), b = tick();
    ok(Number.isFinite(a) && b > a, `時刻は増える: ${a} ${b}`);
    loadDoc(await load(d));
    ok(Number.isFinite(tick()), '開いたときも');
    eq(docMaxTs(await load(d)), 0, '数えない');
  });

  test('時計: 題名の時刻も見る（時計の進んだ PC が直した題名のあとでも、自分の変更が勝つ）', async () => {
    const d = newDoc(), future = Date.now() + 1e12, clock = CLOCK; d.meta.title = '未来'; d.meta.ts = { title: future };
    try {
      eq(docMaxTs(d), future, '題名の時刻を数える');
      loadDoc(d);
      setF(D.meta, 'title', '今');
      ok(D.meta.ts.title > future, '新しい時刻で書く');
    } finally { CLOCK = clock; }  // 進んだ時計を、ほかの試験に持ち込まない
  });

  test('下書き: 時計の進んだ PC が保存したファイルでも、そのあとの下書きを合わせられる', async () => {
    await idb('drafts', 'readwrite', st => st.clear());
    const d = newDoc(), future = Date.now() + 1e12, clock = CLOCK;
    d.items.push({ id: 'i_x', sheet: d.sheets[0].id, order: 1, ts: { a: future }, updatedAt: future });
    window.showSaveFilePicker = undefined;
    try {
      loadDoc(TB.clone(d)); S.me = '田中';
      snap(); setF(item(1), K(), '下書きの値');
      eq(await settled(saveDraft()), 'resolved', '下書きを置く');
      loadDoc(TB.clone(d));
      window.dialog = async () => true;
      await checkDraft();
      eq(item(1)[K()], '下書きの値', '古い扱いにしない');
      dropDraft(); await TB.sleep(50);
    } finally { CLOCK = clock; }
  });

  test('競合: 削除して保存した要素の競合が残っていても、一覧を開いて片付けられる', async () => {
    const it = addItem(), e = addEl(evOwner(it.id, S.run), 'text', { x: 0, y: 0, w: 100, text: 'x' });
    D.conflicts.push({ id: 'cf_e', kind: 'value', coll: 'elements', obj: e.id, k: 'text', value: 'y', vt: 1, at: 1, ts: {}, updatedAt: 1 });
    setF(e, 'deleted', true);
    loadDoc(await readBook(TB.savedFile()));
    const tomb0 = D.elements.find(x => x.id === e.id);
    ok(tomb0 && !tomb0.owner, '保存すると印だけになる');
    renderConflicts();
    ok($('#cfpanel') && $('#cfpanel').textContent.includes('要素'), '一覧が開く');
    TB.click('#cfpanel [data-cf="keep"]');
    eq(live(D.conflicts).length, 0, '片付く');
  });

  test('競合: 戻された実施回を「削除する」と結果とエビデンスも消える。最後の実施回は消せない', () => {
    const it = addItem(), r1 = S.run;
    const r2 = { id: 'r_2', name: '2回目', order: 2, ts: {}, updatedAt: 1 }; D.runs.push(r2); S.ver++;
    S.run = r2.id; buildIndex(); applyVerdict(it, 'ok'); const el = addEl(evOwner(it.id, r2.id), 'text', { x: 0, y: 0, w: 100, text: 'x' });
    D.conflicts.push({ id: 'rv_1', kind: 'revived', coll: 'runs', obj: r2.id, at: 1, ts: {}, updatedAt: 1 });
    S.run = r1; S.ver++; render();
    // 残った実施回がこれだけのときは消さない
    setF(D.runs.find(x => x.id === r1), 'deleted', true); S.run = r2.id; render();
    renderConflicts(); TB.click('#cfpanel [data-cf="drop"]');
    ok(!r2.deleted, '最後の実施回は消えない');
    ok(TB.toasts().some(t => t.includes('最後の実施回')), '理由が出る');
    // ほかに実施回があれば消せて、結果とエビデンスも消える
    setF(D.runs.find(x => x.id === r1), 'deleted', false); render();
    TB.click('#cfpanel [data-cf="drop"]');
    eq([r2.deleted, D.records.find(x => x.run === r2.id).deleted, el.deleted, S.run], [true, true, true, r1], '一緒に消える');
    $('#cfpanel') && $('#cfpanel').remove();
  });

  test('合わせる: 見ていたシートをほかの人が消したら、残っているシートへ移る', () => {
    const d = (() => { D.sheets.push(newSheet('2枚目', 'cases', 2)); S.ver++; return TB.clone(D); })();
    const second = d.sheets[1].id;
    S.sheet = second; render();
    const theirs = TB.user(d, '佐藤', () => { deleteSheet(D.sheets.find(s => s.id === second)); });
    loadDoc(TB.clone(d)); S.sheet = second; render();
    mergeInto(D, TB.clone(theirs));
    render();
    ok(S.sheet !== second, '消えたシートから移る');
    ok(document.querySelector('#tabs .tab.on'), 'タブが選ばれている');
  });

  test('合わせる: 開いていたエビデンス票の行をほかの人が消したら、表に戻る', () => {
    const it = addItem(); renderGrid();
    const d = TB.clone(D), id = it.id;
    const theirs = TB.user(d, '佐藤', () => { deleteItems([D.items.find(x => x.id === id)]); });
    loadDoc(TB.clone(d)); openEvidence(id);
    mergeInto(D, TB.clone(theirs));
    render();
    eq(S.view, 'sheet', '表に戻る');
  });

  test('報告書: 画像が 400 枚を超えても全部読み込んでから印刷し、終わったら片付ける', async () => {
    const it = addItem(), owner = evOwner(it.id, S.run), png = PNG();
    for (let i = 0; i < 420; i++) D.elements.push({ id: `e_${i}`, owner, type: 'image', x: 0, y: i * 4, w: 2, h: 2, z: i, data: png, name: `${i}.png`, ts: {}, updatedAt: 1 });
    S.ver++;
    window.dialog = async o => o.inputs ? ['all', '1'] : true;
    let loaded = null;
    window.print = () => { const imgs = [...document.querySelectorAll('#report img')]; loaded = [imgs.length, imgs.filter(i => i.complete && i.naturalWidth > 0).length]; };
    await printReport();
    eq(loaded, [420, 420], '印刷のときに全部読めている');
    dispatchEvent(new Event('afterprint'));
    ok(BLOBS.size <= BLOBS_MAX, `終わったら減らす: ${BLOBS.size}`);
    eq(S.printing, false, '印刷の状態が戻る');
  });

  test('ボード: ブラウザが読めない画像はファイルとして置く。ほかのファイルも止めない', async () => {
    const it = addItem(), owner = evOwner(it.id, S.run);
    const bad = new File(['not an image'], 'scan.tiff', { type: 'image/tiff' }), good = await TB.png(10, 10, 'ok.png');
    eq(await addFilesToBoard(owner, [bad, good]), 2, '両方置く');
    eq(elementsOf(owner).map(e => e.type), ['file', 'image'], 'ファイルと画像');
    eq(elementsOf(owner)[0].name, 'scan.tiff', '名前も残る');
  });

  test('貼り付け: 20 万行でも引数の上限に当たらない', async () => {
    eq(maxLen([['a'], ['a', 'b'], []]), 2, '一番長い行');
    S.c = cols().findIndex(c => c.type === 'text');
    await pasteGrid('a\tb\n'.repeat(200000));
    eq(itemsOf(S.sheet).length, 200000, '全部の行が入る');
    loadDoc(newDoc());
  });

  test('リンク: 引用符や日本語の区切りで URL が終わり、& はそのまま', () => {
    const hrefs = s => { const t = document.createElement('div'); t.innerHTML = linkify(s); return [...t.querySelectorAll('a')].map(a => a.getAttribute('href')); };
    eq(hrefs('見て "https://a.example/x" と'), ['https://a.example/x'], '二重引用符');
    eq(hrefs("'https://a.example/y'"), ['https://a.example/y'], '一重引用符');
    eq(hrefs('<https://a.example/z>'), ['https://a.example/z'], '山括弧');
    eq(hrefs('https://a.example/p。次の文'), ['https://a.example/p'], '句点');
    eq(hrefs('「https://a.example/q」と（https://a.example/r）'), ['https://a.example/q', 'https://a.example/r'], '全角の括弧');
    eq(hrefs('https://a.example/?a=1&b=2'), ['https://a.example/?a=1&b=2'], '& を含む URL');
    ok(linkify('"https://a.example/x"').startsWith('&quot;<a '), '引用符は文字のまま');
  });

  test('行の追加: 列の値で絞り込んでいても、足した行が見える', () => {
    const a = addItem(), c = col('確認内容');
    setF(a, c.id, 'りんご'); renderGrid();
    S.cf[c.id] = new Set(['りんご']); S.cfVer++; render();
    actions.addRow();
    ok(S.rows.some(x => x.id === S.curId), '足した行が表にある');
    eq(S.cf[c.id], undefined, '隠す絞り込みは外す');
  });

  test('ほかの試験の集計: 同じ試験を別の名前のファイルで置き直すと、ファイル名も新しくなる', async () => {
    D.sheets.push(newSheet('free', 'free', 2)); S.ver++;
    const free = D.sheets[1], owner = sheetOwner(free.id), other = newDoc();
    S.sheet = free.id; render();
    const blob = blobOf(other);
    await addXMetrics(owner, [new File([blob], '前.html')]);
    await addXMetrics(owner, [new File([blob], '後.html')]);
    const cards = elementsOf(owner).filter(e => e.type === 'xmetric');
    eq([cards.length, cards[0].file], [1, '後.html'], '1枚のまま、名前が新しくなる');
  });

  test('取り込み: 読めないファイルは testbook ではないと知らせる', async () => {
    await importFiles([unreadable('gone.html')]);
    ok(TB.toasts().some(t => t.includes('gone.html')), 'お知らせ');
  });

  test('集計カード: 作り置きの数字でも、結果を付けるとすぐ合う', () => {
    const it = addItem(), it2 = addItem();
    S.ver++; buildIndex();
    const before = metricHtml({ run: S.run });
    ok(before.includes('<b>2</b>'), '項目数');
    applyVerdict(it, 'ng');
    const after = metricHtml({ run: S.run });
    ok(after.includes('color:var(--ng)">1</b>'), 'NG が増える: ' + after.slice(0, 300));
    applyVerdict(it2, 'ok'); applyVerdict(it, null);
    ok(metricHtml({ run: S.run }).includes('color:var(--ok)">1</b>'), 'OK が増える');
  });

  test('グループ: 大項目ごとの分け方は、最初に出た順で全行を分ける', () => {
    const lv = { id: 'k' }, rows = [{ k: 'b' }, { k: 'a' }, {}, { k: 'b' }];
    eq([...byGroup(rows, lv)].map(([g, l]) => [g, l.length]), [['b', 2], ['a', 1], ['', 1]], '順と数');
  });

  test('外への通信: ページの方針でファイルの外へ出られず、保存するファイルにも残る', async () => {
    const m = document.querySelector('meta[http-equiv="Content-Security-Policy"]');
    ok(m && /connect-src 'none'/.test(m.content) && /img-src blob: data:/.test(m.content), '方針がある');
    ok(SHELL[0].includes('Content-Security-Policy'), '保存するファイルにも入る');
    const blocked = await new Promise(res => {
      const on = e => { removeEventListener('securitypolicyviolation', on); res(e.effectiveDirective); };
      addEventListener('securitypolicyviolation', on);
      fetch('https://example.invalid/x').catch(() => {});
      setTimeout(() => res(null), 2000);
    });
    eq(blocked, 'connect-src', '外への通信は止まる');
  });
})();
