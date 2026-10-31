/* 報告書（印刷用の静的な HTML）と、集計の「消化の推移」の試験。印刷そのものは呼び出しを差し替えて確かめる。 */
(() => {
  'use strict';
  const { test, eq, ok, col, item, sleep } = TB;
  const K = () => col('確認内容').id;
  const report = () => document.querySelector('#report');

  test('報告書: ⋯ → 報告書を印刷で、表・集計・エビデンス票を並べた報告書を作って印刷を呼ぶ。印刷が終わると片付ける', async () => {
    TB.resetClock(); loadDoc(sampleDoc());
    let printed = 0; window.print = () => { printed++; };
    window.dialog = async o => o.inputs ? ['all', '1'] : true;
    TB.click('[data-act="more"]'); TB.click('#pop [data-act="report"]'); await TB.until(() => printed);
    eq(printed, 1, '印刷を呼ぶ');
    const r = report();
    ok(r && document.body.classList.contains('printing'), '報告書の節があり、印刷の状態');
    ok(r.querySelector('h1').textContent === '小さなお店 結合試験', '題名');
    eq([...r.querySelectorAll('h2')].map(h => h.textContent), ['試験の説明', '注文', '管理画面'], 'シートの順に章');
    eq(r.querySelectorAll('table.rt:not(.rcm)').length, 2, '試験項目のシートごとに表');
    ok(r.querySelector('table.rcm') && r.textContent.includes('仕様書 v1.4'), '未解決のコメントの表');
    eq(r.querySelectorAll('table.rt:not(.rcm) tbody tr').length, 12, '全部の行');
    ok(r.querySelector('.rsum') && r.querySelector('.rsum').textContent.includes('合計'), '集計の表');
    const ev = [...r.querySelectorAll('.rev h4')].map(h => h.textContent.replace(/\s+/g, ' ').trim());
    eq(ev.length, 2, 'エビデンス票のある項目だけ票が付く');
    ok(ev[0].startsWith('No.4') && ev[0].includes('NG') && ev[0].includes('佐藤'), '票の見出し: ' + ev[0]);
    ok(r.querySelector('.rev img'), '画像も入る');
    ok(r.querySelector('.rev .el-marker, .rev .el-frame'), '枠などの印も入る');
    ok(r.querySelector(`a[href="#rev-${item(4).id}"]`), '表の証跡の列から票へ飛べる');
    ok(r.querySelector('#report .board .metric'), '自由シートの集計も静的に描く');
    ok(r.querySelector('#report a[href*="issues/128"]'), '不具合票のリンクも出る');
    dispatchEvent(new Event('afterprint'));
    eq([report(), document.body.classList.contains('printing')], [null, false], '印刷が終わると片付ける');
  });

  test('報告書: 「このシート」「エビデンス票を含めない」を選べ、行が多いときは確かめる', async () => {
    TB.resetClock(); loadDoc(sampleDoc());
    window.print = () => {};
    window.dialog = async o => o.inputs ? ['sheet', '0'] : true;
    S.sheet = sheets().find(s => s.name === '管理画面').id; render();
    await printReport(); await sleep(0);
    const r = report();
    eq([...r.querySelectorAll('h2')].map(h => h.textContent), ['管理画面'], 'このシートだけ');
    eq(r.querySelectorAll('table.rt tbody tr').length, 3);
    eq(r.querySelectorAll('.rev').length, 0, '票なし');
    dispatchEvent(new Event('afterprint'));
    // 行が多いと確かめる
    const sh = curSheet(), C = sheetCols(sh), t = now();
    for (let i = 0; i < REPORT_WARN_ROWS + 1; i++) D.items.push({ id: 'big_' + i, sheet: sh.id, order: 100 + i, ts: {}, updatedAt: t, [C[3].id]: 'x' });
    S.ver++;
    const asked = []; window.dialog = async o => { asked.push(o.title); return o.inputs ? ['sheet', '0'] : null; };
    await printReport(); await sleep(0);
    ok(asked.includes('行数の多い報告書'), '確かめる: ' + asked);
    eq(report(), null, '「続けない」なら作らない');
  });

  test('消化の推移: 結果を付けた日ごとの数と累計が、集計に折れ線と表で出る', async () => {
    snap(); for (let i = 0; i < 4; i++) addItem(); render();
    await setVerdict(item(1), 'ok'); await setVerdict(item(2), 'ng');
    // 2つ目の結果を「きのう」付けたことにする
    const r2 = recOf(item(2).id, S.run); r2.ts.verdict -= 864e5;
    TB.click('[data-act="summary"]');
    const sum = document.querySelector('#summary');
    ok(sum.querySelector('svg.trend'), '折れ線');
    eq(sum.querySelectorAll('svg.trend circle').length, 2, '2日分の点');
    const rows = [...sum.querySelectorAll('tr')].map(tr => [...tr.children].map(td => td.textContent.trim()).join('|')).filter(r => /^\d{4}\/\d{2}\/\d{2}\|/.test(r));
    eq(rows.map(r => r.split('|').slice(1).join('|')), ['1|1|1', '1|2|0'], '日ごと: その日の消化|累計|NG（古い日から）');
    const tr = trendData(itemsOf(S.sheet), S.run);
    eq(tr.days[1].cum, 2);
    // 保留は消化に数えない。実施日の文字しかない古い記録は、その日付を使う
    await setVerdict(item(3), 'hold');
    const r4 = ensureRec(item(4)); r4.verdict = 'ok'; r4.at = '2026/01/05 10:00'; delete r4.ts.verdict;
    const tr2 = trendData(itemsOf(S.sheet), S.run);
    eq(tr2.days.map(d => [d.day.slice(0, 7), d.n]), [['2026/01', 1], [tr.days[0].day.slice(0, 7), 1], [tr.days[1].day.slice(0, 7), 1]], '実施日の文字から');
  });
})();
