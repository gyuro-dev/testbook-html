/*
 * testbook の性能試験。testbook.html を Edge / Chrome で開き、開発者ツール（F12）のコンソールに
 * このファイルの中身を貼って、たとえば次のように実行する。
 *
 *   await tbBench({ rows: 10000 })                  // 1万行
 *   await tbBench({ rows: 100000 })                 // 10万行
 *   await tbBench({ rows: 2000, images: 1000 })     // 画像 1000 枚
 *
 * 作ったデータは画面にそのまま残るので、Ctrl+S で保存すれば、
 * その大きさのファイルを開き直す試験もできる。
 */
(function () {
  const words = ['ログイン', '注文', '在庫', '支払い', '会員', '割引', '帳票', '検索', '画面', 'API', '通知', '権限', 'CSV', '設定', '履歴'];
  const pick = (a, i) => a[i % a.length];
  const ms = t => Math.round((performance.now() - t) * 10) / 10;
  const heapMB = () => performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null;
  const frame = () => new Promise(r => requestAnimationFrame(() => setTimeout(r)));

  // スクショらしい画像（文字とノイズ入り）を作る。圧縮後でだいたい 100〜200KB
  function makeImages(n) {
    const out = [];
    for (let k = 0; k < n; k++) {
      const cv = document.createElement('canvas'); cv.width = 1280; cv.height = 720;
      const x = cv.getContext('2d');
      x.fillStyle = '#f4f6f9'; x.fillRect(0, 0, 1280, 720);
      for (let i = 0; i < 1800; i++) { x.fillStyle = `hsl(${(i * 37 + k * 50) % 360},40%,${40 + (i % 50)}%)`; x.fillRect((i * 97) % 1280, (i * 53) % 720, 3 + (i % 40), 2 + (i % 18)); }
      x.fillStyle = '#222'; x.font = '28px sans-serif';
      for (let i = 0; i < 14; i++) x.fillText(`画面 ${k}-${i}  確認内容のテキスト ${'あいうえお'.repeat(4)}`, 40, 60 + i * 46);
      out.push(cv.toDataURL('image/webp', 0.9));
    }
    return out;
  }

  function makeDoc({ rows, images = 0, runs = 2 }) {
    const d = newDoc(), t = Date.now();
    d.meta.title = `性能試験 ${rows}行 画像${images}枚`;
    const sh = d.sheets[0], C = sh.columns;
    for (let i = 1; i < runs; i++) d.runs.push({ id: uid('r_'), name: `${i + 1}回目`, order: i + 1, ts: {}, updatedAt: t });
    const R = d.runs;
    for (let i = 0; i < rows; i++) {
      const it = { id: uid('i_'), sheet: sh.id, order: i + 1, ts: {}, updatedAt: t };
      it[C[0].id] = pick(words, Math.floor(i / 400)) + '機能';
      it[C[1].id] = pick(words, Math.floor(i / 40)) + 'の確認';
      it[C[2].id] = pick(['画面', 'API', '帳票'], Math.floor(i / 8));
      it[C[3].id] = `${pick(words, i)}の${pick(words, i * 7)}が正しく動くこと（No.${i + 1}）`;
      it[C[4].id] = i % 3 ? 'ログイン済み' : '一般会員でログイン済み\n在庫を10にしておく';
      it[C[5].id] = `1. ${pick(words, i * 3)}画面を開く\n2. ${pick(words, i * 5)}を入力する\n3. 保存を押す`;
      it[C[6].id] = `${pick(words, i * 11)}が保存され、一覧に表示される`;
      d.items.push(it);
      if (i % 10 < 7) d.records.push({ id: `rec_${it.id}_${R[0].id}`, item: it.id, run: R[0].id, verdict: pick(['ok', 'ok', 'ok', 'ok', 'ng', 'hold', 'na'], i), by: pick(['田中', '佐藤', '鈴木'], i), at: '2026/10/29 10:00', remark: i % 9 ? '' : '再確認が必要', ts: {}, updatedAt: t });
    }
    if (images) {
      const base = makeImages(8);
      for (let k = 0; k < images; k++) {
        const it = d.items[k % Math.min(rows, Math.ceil(images / 3))];
        d.elements.push({ id: uid('e_'), owner: `ev:${it.id}:${R[0].id}`, type: 'image', z: k + 1, x: 24, y: 24 + Math.floor(k / Math.min(rows, Math.ceil(images / 3))) * 470, w: 720, h: 405, data: base[k % 8], name: `img${k}`, nw: 1280, nh: 720, by: '佐藤', at: t, ts: {}, updatedAt: t });
      }
    }
    return d;
  }

  window.tbBench = async function (opt) {
    const res = { ...opt };
    const heap0 = heapMB();
    // 1. 保存の形にする（書き出し）→ 読み込み（ファイルを開くときと同じ処理）
    D = makeDoc(opt);
    let t = performance.now();
    const blob = fileBlob();
    res.saveMs = ms(t);
    res.fileMB = Math.round(blob.size / 1048576 * 10) / 10;
    t = performance.now();
    const doc = await readBook(new File([blob], "bench.html"));
    res.loadMs = ms(t);
    // 2. 最初の表示
    t = performance.now();
    loadDoc(doc, null);
    res.firstRenderMs = ms(t);
    await frame();
    res.heapMB = heapMB(); res.heapBeforeMB = heap0;
    // 3. スクロール（あちこちに飛ぶ）
    const wrap = $('#gridwrap'), times = [];
    for (let i = 0; i < 40; i++) {
      wrap.scrollTop = Math.floor((wrap.scrollHeight - wrap.clientHeight) * ((i * 0.618) % 1));
      t = performance.now(); renderWindow(false); times.push(performance.now() - t);
    }
    // 少しずつスクロール（ホイールで流す感じ）
    const smooth = [];
    for (let i = 0; i < 60; i++) { wrap.scrollTop += 120; t = performance.now(); renderWindow(false); smooth.push(performance.now() - t); }
    res.scrollJumpAvgMs = Math.round(times.reduce((a, b) => a + b) / times.length * 10) / 10;
    res.scrollJumpMaxMs = Math.round(Math.max(...times) * 10) / 10;
    res.scrollSmoothMaxMs = Math.round(Math.max(...smooth) * 10) / 10;
    res.renderedRows = S.w1 - S.w0;
    // 4. セルの編集・結果の入力・範囲の操作
    S.r = Math.floor(S.rows.length / 2); S.c = 4; collapse(); paintCursor();
    t = performance.now(); startEdit(true); ed().value += '（編集）'; commitEdit(); res.editMs = ms(t);
    t = performance.now(); snap(); applyVerdict(curItem(), 'ng'); afterChange(); res.verdictMs = ms(t);
    S.ar = S.r; S.r = Math.min(S.rows.length - 1, S.r + 199); S.ac = 4; S.c = 6;
    t = performance.now(); clearSelection(); res.clear200x3Ms = ms(t);
    t = performance.now(); undo(); res.undoMs = ms(t);
    // 5. 検索・集計
    t = performance.now(); S.q = '割引'; renderGrid(); res.searchMs = ms(t); res.searchHits = S.rows.length;
    S.q = ''; renderGrid();
    t = performance.now(); actions.summary(); res.summaryMs = ms(t);
    actions.sheet({ dataset: { id: S.sheet } });
    // 6. 画像のあるエビデンス票を開く
    if (opt.images) {
      const owner = D.elements.find(e => !e.deleted).owner, itemId = owner.split(':')[1];
      t = performance.now(); openEvidence(itemId); res.openBoardMs = ms(t); res.boardImages = elementsOf(owner).length;
      closeEvidence();
    }
    t = performance.now(); fileBlob(); res.save2Ms = ms(t);
    S.dirty = false; renderStatus();
    console.table(res);
    return res;
  };
})();
