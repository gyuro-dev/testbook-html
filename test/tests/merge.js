/* マージ（複数人のファイルを合わせる）の試験。README の「複数人で書くとき」に書いてある約束を1つずつ確かめる。
 * 「田中のファイル」「佐藤のファイル」は TB.user で演じる。マージは mergeInto（保存・取り込みのときに呼ばれるもの）を直接呼ぶ。 */
(() => {
  'use strict';
  const { test, eq, ok, ne, clone, user, col, item } = TB;

  // 2行ある試験ファイル（2人の出発点）
  function base() {
    return user(newDoc(), '田中', () => {
      const a = addItem(), b = addItem();
      setF(a, col('確認内容').id, '最初の値'); setF(b, col('確認内容').id, '2行目');
    });
  }
  const open = doc => { loadDoc(clone(doc)); S.me = '田中'; };
  // 取り込み。アプリでは取り込んだあと必ず描き直す（索引もそこで作り直る）ので、同じようにする
  const merge = src => { const st = mergeInto(D, src); render(); return st; };
  const value = (n, name = '確認内容') => item(n)[col(name).id] || '';
  const conflicts = () => live(D.conflicts);

  test('マージ: 別のセルを2人が直したら両方残り、競合にならない', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    const sato = user(b0, '佐藤', () => setF(item(2), K, '佐藤の値'));
    open(tanaka);
    const st = merge(sato);
    eq(value(1), '田中の値', '自分の値'); eq(value(2), '佐藤の値', '相手の値');
    eq(st.by.items, 1, '取り込んだ項目の数'); eq(st.conflicts, 0, '競合の数'); eq(conflicts().length, 0, '競合の一覧');
  });

  test('マージ: 同じセルを2人が別々に直したら、新しいほうを表示し、古いほうを競合として残す', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    const sato = user(b0, '佐藤', () => setF(item(1), K, '佐藤の値'));  // 佐藤のほうが後に書いた
    open(tanaka);
    const st = merge(sato);
    eq(value(1), '佐藤の値', '新しいほうが表示される');
    eq(st.conflicts, 1, '競合の数');
    const cf = conflicts()[0];
    eq([cf.kind, cf.coll, cf.k, cf.value], ['value', 'items', K, '田中の値'], '競合の中身（古いほうの値が残る）');
    buildIndex(); ok(IX.cf.has(item(1).id + '|' + K), '表のセルに競合の印が付く');
  });

  test('マージ: どちらのファイルに取り込んでも同じ結果になる', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    const sato = user(b0, '佐藤', () => setF(item(1), K, '佐藤の値'));
    open(tanaka); merge(sato); const fromTanaka = [value(1), conflicts().map(c => c.value)];
    open(sato); merge(tanaka); const fromSato = [value(1), conflicts().map(c => c.value)];
    eq(fromSato, fromTanaka, '田中側で合わせた結果と佐藤側で合わせた結果');
  });

  test('マージ: 相手の値を見たうえで直した（順番に直した）ときは競合にしない', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    const sato = user(tanaka, '佐藤', () => setF(item(1), K, '佐藤の値'));  // 田中のファイルを受け取ってから直した
    open(tanaka);
    const st = merge(sato);
    eq(value(1), '佐藤の値'); eq(st.conflicts, 0, '競合の数');
  });

  test('マージ: 3人目が古い値を持っていても、新しい値が負けない', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    open(tanaka);
    const st = merge(b0);  // 直す前のファイルを取り込む
    eq(value(1), '田中の値'); eq(st.n, 0, '変更の数'); eq(st.conflicts, 0);
  });

  test('マージ: 消した行に相手が結果を付けていたら、行を残して知らせる', async () => {
    const b0 = base();
    const tanaka = user(b0, '田中', () => setF(item(1), 'deleted', true));
    loadDoc(clone(b0)); S.me = '佐藤'; await setVerdict(item(1), 'ok'); const sato = clone(D);
    open(tanaka);
    eq(itemsOf(S.sheet).length, 1, '取り込む前は1行');
    const st = merge(sato);
    eq(itemsOf(S.sheet).length, 2, '行が戻る');
    eq(st.conflicts, 1); eq(conflicts()[0].kind, 'revived', '「復活」の競合');
    eq(verdictOf(item(1).id, S.run), 'ok', '相手の結果も入っている');
    // 逆向き（結果を付けた側に、削除を取り込む）でも行は消えない
    open(sato); merge(tanaka);
    eq(itemsOf(S.sheet).length, 2, '逆向きでも行が残る'); eq(conflicts()[0].kind, 'revived');
  });

  test('マージ: 結果もエビデンスもない行の削除は、そのまま消える', () => {
    const b0 = base();
    const tanaka = user(b0, '田中', () => setF(item(2), 'deleted', true));
    open(b0);
    merge(tanaka);
    eq(itemsOf(S.sheet).length, 1); eq(conflicts().length, 0);
  });

  test('マージ: 同じファイルを2回取り込んでも何も変わらない', () => {
    const b0 = base(), K = col('確認内容').id;
    const sato = user(b0, '佐藤', () => setF(item(2), K, '佐藤の値'));
    open(b0);
    ok(merge(sato).n > 0, '1回目は取り込む');
    const again = merge(sato);
    eq([again.n, again.conflicts], [0, 0], '2回目');
    eq(merge(clone(D)).n, 0, '自分自身を取り込んでも変わらない');
  });

  test('マージ: 列の設定は列ごとに合わさる（2人が別々の列を足しても両方残る）', () => {
    const b0 = base();
    const tanaka = user(b0, '田中', () => setColumns(cs => cs.push({ id: 'k_tanaka', name: '田中の列', type: 'text', w: 100 })));
    const sato = user(b0, '佐藤', () => setColumns(cs => cs.push({ id: 'k_sato', name: '佐藤の列', type: 'text', w: 100 })));
    open(tanaka);
    const st = merge(sato);
    const names = sheetCols(curSheet()).map(c => c.name);
    ok(names.includes('田中の列') && names.includes('佐藤の列'), '両方の列がある: ' + names.join(','));
    eq(st.conflicts, 0, '列は競合にしない');
  });

  test('マージ: 同じ列の名前を2人が変えたら、新しいほうになる', () => {
    const b0 = base();
    const K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setColumns(cs => { cs.find(c => c.id === K).name = '田中の名前'; }));
    const sato = user(b0, '佐藤', () => setColumns(cs => { cs.find(c => c.id === K).name = '佐藤の名前'; }));
    open(tanaka); merge(sato);
    eq(sheetCols(curSheet()).find(c => c.id === K).name, '佐藤の名前');
  });

  test('マージ: 相手の PC の時計が進んでいても、取り込んだ後の自分の変更が負けない', () => {
    const b0 = base(), K = col('確認内容').id;
    const sato = user(b0, '佐藤', () => setF(item(1), K, '佐藤の値'));
    const future = Date.now() + 10 * 365 * 864e5;  // 10年先
    const it = sato.items.find(i => i.id === b0.items[0].id);
    it.ts[K] = future; it.updatedAt = future;
    open(b0);
    merge(sato);
    eq(value(1), '佐藤の値');
    snap(); setF(item(1), K, '自分の値');
    ok(item(1).ts[K] > future, '自分の変更の時刻が相手より後になる');
    merge(sato);
    eq(value(1), '自分の値', 'もう一度取り込んでも自分の値が残る');
  });

  test('マージ: 取り込んだ後は「元に戻す」で相手の変更を消せない（履歴を捨てる）', () => {
    const b0 = base(), K = col('確認内容').id;
    const sato = user(b0, '佐藤', () => setF(item(2), K, '佐藤の値'));
    open(b0);
    snap(); setF(item(1), K, '自分の値');
    eq(UNDO.length, 1, '取り込む前の履歴');
    merge(sato);
    eq(UNDO.length, 0, '取り込んだ後の履歴');
    undo();
    eq([value(1), value(2)], ['自分の値', '佐藤の値'], '元に戻しても何も変わらない');
  });

  test('マージ: 競合を「ほかの人の値にする」「今の値のまま」で解決できる', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    const sato = user(b0, '佐藤', () => setF(item(1), K, '佐藤の値'));
    open(tanaka); merge(sato);
    renderConflicts();
    const cf = conflicts()[0];
    resolveConflict('take', cf.id);
    eq(value(1), '田中の値', '「ほかの人の値にする」'); eq(conflicts().length, 0, '競合が消える');
    ok(!document.querySelector('#cfpanel'), '最後の競合を解決すると一覧が閉じる');
    // 「今の値のまま」
    open(tanaka); merge(sato); renderConflicts();
    resolveConflict('keep', conflicts()[0].id);
    eq(value(1), '佐藤の値', '「今の値のまま」'); eq(conflicts().length, 0);
  });

  test('マージ: 解決した競合は、相手のファイルを取り込み直しても戻ってこない', () => {
    const b0 = base(), K = col('確認内容').id;
    const tanaka = user(b0, '田中', () => setF(item(1), K, '田中の値'));
    const sato = user(b0, '佐藤', () => setF(item(1), K, '佐藤の値'));
    open(tanaka); merge(sato); renderConflicts();
    resolveConflict('keep', conflicts()[0].id);
    merge(sato);
    eq(conflicts().length, 0);
  });

  test('マージ: 結果の記録は「項目 × 実施回」で同じ ID になり、2人が別々に付けても1つに合わさる', async () => {
    const b0 = base();
    loadDoc(clone(b0)); S.me = '田中'; await setVerdict(item(1), 'ok'); const tanaka = clone(D);
    loadDoc(clone(b0)); S.me = '佐藤'; await setVerdict(item(1), 'ng'); const sato = clone(D);
    open(tanaka);
    const st = merge(sato);
    eq(live(D.records).length, 1, '記録は1つ');
    eq(verdictOf(item(1).id, S.run), 'ng', '新しいほう');
    // 結果と実施者が別々の値なので、その2つのセルが競合になる（実施日は同じ分なので同じ値）
    eq(conflicts().map(c => c.k).sort(), ['by', 'verdict'], '競合になるセル');
    eq(conflicts().find(c => c.k === 'verdict').value, 'ok', '古いほうの結果が競合に残る');
  });

  test('マージ: 自分が結果を付けたセルを相手が空にした（未実施に戻した）ら、それも競合になる', async () => {
    const b0 = base();
    loadDoc(clone(b0)); S.me = '田中'; await setVerdict(item(1), 'ok'); const tanaka = clone(D);
    loadDoc(clone(tanaka)); S.me = '佐藤'; await setVerdict(item(1), 'ng'); const sato1 = clone(D);  // 田中の結果を見て NG に
    loadDoc(clone(tanaka)); S.me = '田中'; await setVerdict(item(1), null); const tanaka2 = clone(D);  // 同じころ田中は未実施に戻した
    open(sato1);
    merge(tanaka2);
    eq(verdictOf(item(1).id, S.run), null, '新しいほう（未実施）が表示される');
    const cf = conflicts().find(c => c.k === 'verdict');
    ok(cf, '結果のセルが競合になる'); eq(cf.value, 'ng', '佐藤の NG が競合として残る');
  });

  // 性質の試験（repo-rules §4-2 の Hypothesis の代わり）: 2人がランダムに直したファイルを、どちら向きに合わせても同じ中身になる
  test('マージ: ランダムな編集を2人分作って両方向に合わせると、同じ中身に落ち着く（20 通り）', async () => {
    for (let seed = 1; seed <= 20; seed++) {
      const rnd = TB.rng(seed * 7919), pick = a => a[Math.floor(rnd() * a.length)];
      loadDoc(newDoc()); S.me = '田中';
      snap(); for (let i = 0; i < 6; i++) setF(addItem(), col('確認内容').id, 'r' + i);
      const b0 = clone(D), C = sheetCols(curSheet()).filter(c => c.type === 'text' || c.type === 'level');
      const edits = (name, n) => user(b0, name, () => {
        for (let k = 0; k < n; k++) {
          const its = itemsOf(S.sheet), it = pick(its), r = rnd();
          if (r < 0.35) setF(it, pick(C).id, name + k);
          else if (r < 0.55) { const rec = ensureRec(it); setF(rec, 'verdict', pick(['ok', 'ng', 'hold', 'na'])); }
          else if (r < 0.65 && its.length > 2) setF(it, 'deleted', true);
          else if (r < 0.75) addItem();
          else if (r < 0.85) addEl(evOwner(it.id, S.run), 'text', { x: 0, y: k * 10, w: 100, text: name + k });
          else if (r < 0.95) { const c = { id: uid('c_'), item: it.id, col: '', text: name + k, by: name, at: now(), done: false, ts: {}, updatedAt: now() }; D.comments.push(c); created(c, 'comments'); }
          else setColumns(cs => cs.push({ id: uid('k_'), name: name + k, type: 'text', w: 100 }));
        }
      });
      const tanaka = edits('田中', 8), sato = edits('佐藤', 8);
      // 中身の比べ方: 行は ID 順、列は名前順にして、並びの違い（2人が同じ順位に足した行、列を足した順）は見ない
      const view = () => {
        buildIndex();
        const cols = sheetCols(curSheet()).map(c => [c.name, c.id]).sort();
        const items = live(D.items).map(it => { const o = { id: it.id, order: it.order }; for (const [name, id] of cols) o[name] = it[id] || ''; o.v = verdictOf(it.id, S.run); o.ev = IX.el.get(evOwner(it.id, S.run)) || 0; o.cm = (IX.cm.get(it.id) || []).map(c => c.text).sort(); return o; }).sort((a, b) => a.id < b.id ? -1 : 1);
        return { items, cols: cols.map(c => c[0]), conflicts: live(D.conflicts).map(c => c.id).sort() };
      };
      const where = (a, b) => { const x = JSON.stringify(a), y = JSON.stringify(b); let i = 0; while (i < x.length && x[i] === y[i]) i++; return `違い（${i} 文字目）: …${x.slice(Math.max(0, i - 60), i + 80)}… ↔ …${y.slice(Math.max(0, i - 60), i + 80)}…`; };
      loadDoc(clone(tanaka)); mergeInto(D, clone(sato)); const ab = view();
      loadDoc(clone(sato)); mergeInto(D, clone(tanaka)); const ba = view();
      if (JSON.stringify(ab) !== JSON.stringify(ba)) TB.ok(false, `seed ${seed}: 田中→佐藤 と 佐藤→田中。${where(ab, ba)}`);
      // もう一度合わせても変わらず、保存して読み直しても同じ
      eq(mergeInto(D, clone(tanaka)).n, 0, `seed ${seed}: 同じものをもう一度`);
      const back = await readBook(TB.savedFile()); loadDoc(back);
      if (JSON.stringify(view()) !== JSON.stringify(ba)) TB.ok(false, `seed ${seed}: 保存して読み直す。${where(view(), ba)}`);
    }
  });

  test('マージ: 別の試験のファイル（ID が違う）は合わせない', async () => {
    const other = user(newDoc(), '佐藤', () => setF(addItem(), col('確認内容').id, '別の試験'));
    loadDoc(clone(other)); const f = new File([fileBlob()], 'other.html');
    const b0 = base(); open(b0);
    const st = await pullFrom(f);
    eq(st, null, 'pullFrom の戻り');
    eq(itemsOf(S.sheet).length, 2, '行は増えない');
  });

  test('マージ: 保存したファイルからの取り込み（readBook → mergeInto）が通しで動く', async () => {
    const b0 = base(), K = col('確認内容').id;
    const sato = user(b0, '佐藤', () => setF(item(2), K, '佐藤の値'));
    loadDoc(clone(sato)); const f = new File([fileBlob()], 'sato.html');
    open(b0);
    const st = await pullFrom(f);
    ok(st && st.n > 0, '取り込んだ'); eq(value(2), '佐藤の値');
    eq(mergeMsg(st), '項目 1', '取り込みの内訳の文');
  });
})();
