/* 画面の言葉（日本語 / 英語）の試験。
 * コードの文言は日本語で書いて _t('…') を通し、英語は EN の表で引く。表に穴があると英語の画面に日本語が混ざるので、
 * ここでアプリのソースから鍵を全部拾って表と突き合わせる。英語で描いた画面に日本語が残っていないかも見る。 */
(() => {
  'use strict';
  const { test, eq, ok } = TB;
  const JA = /[ぁ-んァ-ヶ一-龠]/;
  // アプリのソースにある _t('…') の鍵。JS の文字列の書き方（\n や \\）を値に戻す
  const sourceKeys = () => {
    const src = document.getElementById('tb-app').textContent, keys = new Set();
    for (const m of src.matchAll(/_t\('((?:[^'\\]|\\.)*)'/g)) keys.add(m[1].replace(/\\(.)/g, (_, c) => c === 'n' ? '\n' : c));
    return keys;
  };
  // 表で引く文言（_t(l) のように変数で渡すので、ソースの鍵には出ない）
  const tableLabels = () => [
    ...COL_TYPES.map(([, l]) => l), ...RESULT_COLS.map(([, l]) => l), ...COLORS.map(([, l]) => l),
    ...Object.values(EL_NAMES), ...Object.values(FIELD_NAMES), ...VERDICTS.map(v => v.label),
    ...defaultColumns().map(c => c.name),
  ].filter(l => JA.test(l));
  const placeholders = s => [...s.matchAll(/\{(\d)\}/g)].map(m => m[1]).sort().join('');

  test('言語: _t の鍵はすべて EN の表にあり、{0} などの差し込みも合っている', () => {
    const missing = [...sourceKeys(), ...tableLabels()].filter(k => !(k in EN));
    eq(missing, [], '英語がない鍵');
    const badHoles = Object.entries(EN).filter(([k, v]) => placeholders(k) !== placeholders(v)).map(([k]) => k);
    eq(badHoles, [], '差し込みの数や番号が違う鍵');
    const untranslated = Object.entries(EN).filter(([, v]) => JA.test(v)).map(([k]) => k);
    eq(untranslated, [], '英語の値に日本語が残っている鍵');
  });

  test('言語: EN の表に、もう使っていない鍵が残っていない', () => {
    // サンプルの文言は配列で持って _t に通すので、鍵の形ではなくソースに文字列として出ているかで見る
    const src = document.getElementById('tb-app').textContent, keys = sourceKeys(), labels = new Set(tableLabels());
    const asSource = k => "'" + k.replace(/\\/g, '\\\\').replace(/\n/g, '\\n') + "'";
    const unused = Object.keys(EN).filter(k => !keys.has(k) && !labels.has(k) && !src.includes(asSource(k)));
    eq(unused, [], '使っていない鍵');
  });

  test('言語: 英語にすると画面とサンプルが英語になり、日本語に戻せる', () => {
    eq(LANG, 'ja', '試験は日本語で始まる');
    eq(document.documentElement.lang, 'ja', 'html の lang');
    LANG = 'en';
    // 画面の骨組み（上のバーや表の下の「＋ 行を追加」）は開いたときに一度だけ作るので、描き直す部分（タブ・ツールバー・表・パネル・
    // ボード・集計・下の帯）で見る。画面からの切り替えは開き直すので、本物では骨組みも英語になる
    // 隠れている部分（表を見ているときのボードや集計）は描き直されず前の試験の中身が残っているので、見えている部分だけ
    const drawn = () => ['tabs', 'toolbar', 'grid', 'pane', 'boardview', 'summary', 'foot'].map(id => document.getElementById(id))
      .filter(el => !el.hidden && el.offsetParent !== null).map(el => el.textContent).join('\n');
    const jaLines = () => drawn().split('\n').filter(l => JA.test(l)).map(l => l.trim().slice(0, 80));
    try {
      loadDoc(newDoc(), null); render();
      ok(drawn().includes('＋ Add row') && drawn().includes('Summary'), '英語のボタンとタブが出る');
      eq(jaLines(), [], '空の試験の画面に残っている日本語');
      eq(defaultColumns().slice(0, 4).map(c => c.name), ['Category', 'Subcategory', 'Item', 'Check'], '新しい列の名前');
      eq(_t('{0} 行を貼り付けました', 3), 'Pasted 3 rows', '差し込み');
      eq(_t('見つからない鍵'), '見つからない鍵', '表にない鍵はそのまま返す（壊れない）');
      loadDoc(sampleDoc(), null); render(); renderPane();
      eq(D.meta.title, 'Little Shop integration test', 'サンプルの題名');
      eq(sheets().map(s => s.name), ['About this test', 'Orders', 'Admin'], 'サンプルのシート');
      const jaCells = D.items.flatMap(it => Object.values(it).filter(v => typeof v === 'string' && JA.test(v)));
      eq(jaCells, [], 'サンプルの行に日本語が残っていない');
      const jaText = [...D.elements, ...D.records, ...D.comments].flatMap(o => [o.text, o.remark, o.by, o.name, ...(o.cells || []).flat()].filter(v => typeof v === 'string' && JA.test(v)));
      eq(jaText, [], 'サンプルの票・結果・コメントに日本語が残っていない');
      eq(jaLines(), [], 'サンプルを開いた表に残っている日本語');
      S.view = 'summary'; render();
      ok(drawn().includes('By run'), '集計が英語で出る');
      eq(jaLines(), [], '集計に残っている日本語');
      S.view = 'sheet'; render(); openEvidence(itemsOf(S.sheet)[3].id); render();
      ok(drawn().includes('＋ Frame'), 'エビデンス票の道具が英語で出る');
      eq(jaLines(), [], 'エビデンス票に残っている日本語');
    } finally {
      LANG = 'ja'; loadDoc(newDoc(), null); render();
    }
    ok(drawn().includes('＋ 行を追加'), '日本語に戻る');
  });

  test('言語: 最初から入っている列・シート・実施回・題名の名前は、切り替えると表示も変わる。付けた名前とファイルの中身は変わらない', () => {
    const heads = () => [...document.querySelectorAll('#grid th[data-cid] .thn')].map(t => t.textContent.trim());
    snap(); const cs = sheetCols(curSheet()); setF(curSheet(), 'columns', cs.map((c, i) => i === 4 ? { ...c, name: '画面の名前' } : c)); render();
    const stored = () => [sheetCols(curSheet()).map(c => c.name).slice(0, 5), curSheet().name, runs()[0].name, D.meta.title];
    const before = JSON.stringify(stored());
    eq(heads().slice(0, 5), ['大項目', '中項目', '小項目', '確認内容', '画面の名前'], '日本語の見出し');
    S.dirty = false;
    try {
      setLang('en');
      eq(heads().slice(0, 5), ['Category', 'Subcategory', 'Item', 'Check', '画面の名前'], '既定の列名は英語になり、付けた名前はそのまま');
      eq(document.querySelector('#tabs .tab.on').textContent, 'Test cases', 'シートのタブ');
      eq(document.querySelector('#runsel option:checked').textContent, 'Run 1', '実施回');
      eq(document.querySelector('#title').value, 'Untitled test', '題名');
      eq(JSON.stringify(stored()), before, 'ファイルの中身（保存する名前）は変わらない');
      ok(!S.dirty, '変更したことにはならない');
      // 英語で作ったファイルを日本語で見るときも同じ
      loadDoc(newDoc(), null); render();
      eq(sheetCols(curSheet())[0].name, 'Category', '英語で作ると英語の名前で入る');
      setLang('ja');
      eq(heads().slice(0, 4), ['大項目', '中項目', '小項目', '確認内容'], '日本語で見ると日本語');
      eq([runName(S.run), document.querySelector('#tabs .tab.on').textContent], ['1回目', '試験項目'], '実施回とシート');
      snap(); setF(D.runs[0], 'name', 'Run 7'); render();
      eq(runName(S.run), '7回目', '番号つきの既定の名前も');
    } finally { if (LANG !== 'ja') setLang('ja'); }
  });

  test('言語: ⋯ メニューの切り替えは開き直さずにその場で効き、保存していない変更も残る。上のバーも変わる', () => {
    snap(); setF(addItem(), sheetCols(curSheet())[3].id, '保存していない行'); render(); markDirty();
    const top = () => document.querySelector('header.top').textContent;
    ok(top().includes('開く') && top().includes('保存'), '日本語の上のバー');
    try {
      TB.click(document.querySelector('[data-act="more"]'));
      TB.click(document.querySelector('#pop [data-act="lang"]'));
      eq([LANG, document.documentElement.lang], ['en', 'en'], '英語になる');
      ok(top().includes('Open') && top().includes('Import') && top().includes('Save'), '上のバーも英語: ' + top());
      eq(document.querySelector('.addrow').textContent, '＋ Add row', '表の下のボタン');
      eq(document.querySelector('#tabs [data-act="summary"]').textContent, 'Summary', '上のタブは Summary（README と同じ）');
      ok(S.dirty && itemsOf(S.sheet).length === 1 && D.items.some(i => Object.values(i).includes('保存していない行')), '保存していない変更が残る');
      eq(_t('エビデンス票'), 'Evidence board', 'エビデンス票は evidence board（シートのタブと紛れないように）');
      ok(/^Delete .*\?/.test(_t('列「{0}」とその内容を削除しますか？', 'x')), '削除の確認は問いかけ');
      TB.click(document.querySelector('[data-act="more"]'));
      ok(document.querySelector('#pop [data-act="lang"]').textContent === '日本語', 'メニューには戻すほうの言語');
      TB.click(document.querySelector('#pop [data-act="lang"]'));
      eq(LANG, 'ja', '日本語に戻る');
      ok(top().includes('開く'), '上のバーも日本語に戻る');
    } finally { if (LANG !== 'ja') setLang('ja'); try { localStorage.setItem('testbook.lang', 'ja'); } catch { /* 使えなければそのまま */ } }
  });
})();
