/* 取り込んだファイルのどの項目に細工した値を入れても、スクリプトが動かず、画面も落ちないことの試験。
 * 項目を1つずつ確かめる security.js と違い、全部の項目に同じ値を入れて、全部の画面を描いてみる。
 * 開発者が思いつかなかった経路を見つけるためのもので、CodeQL の js/xss-through-dom を閉じる根拠にもしている。 */
(() => {
  'use strict';
  const { test, eq, ok } = TB;
  const INJ = '"><img src=x onerror="window.__tbXss=1">', JS = 'javascript:window.__tbXss=1';

  // すべての種類の要素、コメント、競合、履歴、書式がある試験
  const rich = () => {
    const d = newDoc(), sh = d.sheets[0], run = d.runs[0], free = { id: 's_free', name: 'free', kind: 'free', order: 2, columns: [], ts: {}, updatedAt: 1 };
    d.sheets.push(free);
    d.runs.push({ id: 'r_2', name: 'run2', order: 2, ts: {}, updatedAt: 1 });
    sh.columns.push({ id: 'k_sel', name: 'sel', type: 'select', options: ['a', 'b'], w: 90 }, { id: 'k_id', name: 'id', type: 'id', prefix: 'TC-', digits: 3, w: 90 }, { id: 'k_ck', name: 'ck', type: 'check', w: 60 });
    const lv = sh.columns.find(c => c.type === 'level').id, tx = sh.columns.find(c => c.type === 'text').id;
    for (let i = 0; i < 3; i++) d.items.push({ id: 'i_' + i, sheet: sh.id, order: i + 1, [lv]: 'g', [tx]: 'text', [tx + ':r']: [{ t: 'x', b: 1, c: 'red' }], [tx + ':f']: { b: 1, c: 'red' }, k_sel: 'a', k_id: 'TC-001', k_ck: true, ts: {}, updatedAt: 1 });
    for (const i of [0, 1]) d.records.push({ id: `rec_i_${i}_${run.id}`, item: 'i_' + i, run: run.id, verdict: 'ng', by: 'me', at: '2026', remark: 'rem', 'remark:r': [{ t: 'x' }], hist: [{ v: 'ok', t: 1, by: 'me' }, { v: 'ng', t: 2, by: 'me' }], histX: [1], ts: {}, updatedAt: 1 });
    d.comments.push({ id: 'c_1', item: 'i_0', col: tx, text: 'c', by: 'me', at: 1, ts: {}, updatedAt: 1 }, { id: 'c_2', item: 'i_1', col: 'k_sel', text: 'c', by: 'me', at: 1, done: true, doneBy: 'me', ts: {}, updatedAt: 1 });
    const png = 'data:image/png;base64,iVBORw0KGgo=';
    const el = (id, owner, type, o) => ({ id, owner, type, x: 1, y: 1, w: 50, h: 50, z: 1, ts: {}, updatedAt: 1, ...o });
    for (const [pre, owner] of [['e', `ev:i_0:${run.id}`], ['f', sheetOwner(free.id)]]) d.elements.push(
      el(pre + '_t', owner, 'text', { text: 'x', style: 'title', fc: 'red', bold: true, runs: [{ t: 'x', b: 1, c: 'red' }] }), el(pre + '_i', owner, 'image', { data: png, name: 'n', nw: 9, nh: 9, by: 'me', at: 1 }),
      el(pre + '_fr', owner, 'frame', { color: 'red' }), el(pre + '_tb', owner, 'table', { cells: [['a', 'b']] }), el(pre + '_fi', owner, 'file', { data: png, name: 'n', size: 9 }), el(pre + '_m', owner, 'metric', { run: run.id }),
      el(pre + '_l', owner, 'line', { color: 'red', arrow: true }), el(pre + '_mk', owner, 'marker', { n: 1, color: 'red' }), el(pre + '_x', owner, 'xmetric', { title: 't', file: 'f', srcAt: 1, runs: [{ name: 'r', total: 1, ok: 1, ng: 0, hold: 0, na: 0, none: 0, done: 1, ev: 0 }] }), el(pre + '_xt', owner, 'xtotal', {}));
    d.conflicts.push({ id: 'cf_v', kind: 'value', coll: 'items', obj: 'i_0', k: tx, value: 'v', vt: 1, at: 1, ts: {}, updatedAt: 1 }, { id: 'cf_v2', kind: 'value', coll: 'records', obj: `rec_i_0_${run.id}`, k: 'verdict', value: 'ok', vt: 1, at: 1, ts: {}, updatedAt: 1 }, { id: 'cf_r', kind: 'revived', coll: 'items', obj: 'i_1', at: 1, ts: {}, updatedAt: 1 }, { id: 'cf_e', kind: 'value', coll: 'elements', obj: 'e_t', k: 'text', value: 'v', vt: 1, at: 1, ts: {}, updatedAt: 1 }, { id: 'cf_s', kind: 'value', coll: 'sheets', obj: sh.id, k: 'name', value: 'v', vt: 1, at: 1, ts: {}, updatedAt: 1 });
    d.meta.issueUrl = 'https://x.example/{n}/{key}'; d.meta.title = 't';
    return d;
  };
  // keep にある項目のほかは、中身をすべて bad にする
  const poison = (v, bad, keep) => {
    if (Array.isArray(v)) return v.map(x => poison(x, bad, keep));
    if (v && typeof v === 'object') { const o = {}; for (const k of Object.keys(v)) o[k] = keep.has(k) ? v[k] : poison(v[k], bad, keep); return o; }
    return bad;
  };
  const load = d => readBook(new File([JSON.stringify(d)], 'evil.json'));

  // 全部の画面を描く。動いてはいけないものが作られたら hits に、例外は errors に、細工した値が文字として見えた画面は seen に入れる
  const walker = () => {
    const hits = new Set(), errors = new Set(), seen = new Set();
    const scan = where => {
      for (const el of document.querySelectorAll('img[src="x"],[onerror],a[href^="javascript"],[src^="javascript"]')) { hits.add(`${where}: ${el.parentElement ? el.parentElement.outerHTML.slice(0, 160) : el.outerHTML.slice(0, 160)}`); el.remove(); }
      if (document.documentElement.textContent.includes('onerror=')) seen.add(where.split(' ')[0]);
    };
    const step = async (where, fn) => { try { await fn(); } catch (e) { errors.add(`${where}: ${e.message}`); } scan(where); };
    const walk = async () => {
      await step('描く', () => render());
      for (const s of sheets()) for (const r of runs()) {
        await step('シート', () => { S.view = 'sheet'; S.sheet = s.id; S.run = r.id; render(); });
        if (s.kind === 'free') { for (const e of elementsOf(sheetOwner(s.id))) await step('自由シート', () => selectEl(e.id)); continue; }
        for (let i = 0; i < Math.min(3, S.rows.length); i++) await step('詳細パネル', () => { S.r = i; S.c = 1; collapse(); paintCursor(); renderPane(); });
        const C = cols();
        for (let j = 1; j < C.length && S.rows.length; j++) await step('セルの編集', () => { S.r = 0; S.c = j; collapse(); paintCursor(); if (startEdit(true)) TB.gridKey('Escape'); });
        for (const th of [...document.querySelectorAll('#grid th[data-act="colMenu"]')]) {
          await step('列のメニュー', () => actions.colMenu(th));
          await step('値の絞り込み', () => actions.colFilter(th));
          hidePop();
        }
        for (const sel of ['[data-act="more"]', '[data-act="runMenu"]', '[data-act="toc"]']) { await step('メニュー', () => { const b = document.querySelector(sel); if (b) TB.click(b); }); hidePop(); }
        for (const t of [...document.querySelectorAll('#tabs .tab[data-id]')]) { await step('タブのメニュー', () => actions.tabMenu(t)); hidePop(); }
      }
      for (const it of live(D.items)) for (const r of runs()) {
        const els = elementsOf(evOwner(it.id, r.id));
        if (!els.length) continue;
        await step('エビデンス票', () => { S.run = r.id; S.sheet = it.sheet; openEvidence(it.id); });
        for (const e of [...els]) {
          await step('要素の選択', () => selectEl(e.id));
          if (e.type === 'text' || e.type === 'table') await step('要素の編集', () => { startBoardEdit(e.id, e.type === 'table' ? [0, 0] : undefined); commitBoardEdit(); });
          if (e.type === 'image') await step('拡大', () => { lightbox(e); scan('拡大'); const lb = document.querySelector('.lightbox'); if (lb) TB.click(lb); });
        }
        await step('票を閉じる', () => closeEvidence());
      }
      await step('集計', () => actions.summary());
      for (const scope of ['all', 'sheet']) await step('報告書', async () => {
        const print = window.print, ask = window.dialog;
        window.print = () => {}; window.dialog = async o => o.inputs ? [scope, '1'] : true;
        try { await printReport(); scan('報告書'); dispatchEvent(new Event('afterprint')); } finally { window.print = print; window.dialog = ask; }
      });
      await step('競合の一覧', () => { renderConflicts(); scan('競合の一覧'); const p = $('#cfpanel'); if (p) p.remove(); });
      await step('表に戻す', () => { S.view = 'sheet'; S.sheet = (caseSheets()[0] || sheets()[0]).id; render(); });
    };
    return { hits, errors, seen, step, walk };
  };
  const check = async w => {
    await TB.sleep(100);
    eq([...w.hits].slice(0, 5), [], '動いてはいけないものが作られた');
    eq([...w.errors].slice(0, 5), [], '例外で止まった');
    eq(window.__tbXss, undefined, 'スクリプトは動かない');
  };

  const CORE = ['id', 'ts', 'bt', 'deleted', 'format', 'version', 'order', 'coll', 'obj', 'k', 'kind', 'type', 'owner', 'item', 'run', 'sheet', 'col'];
  const STRUCT_TOO = ['id', 'ts', 'bt', 'deleted', 'format', 'version', 'coll', 'obj', 'k', 'kind', 'order'];
  const each = async (bad, keep, w) => {
    const doc = poison(rich(), bad, new Set(keep));
    let r;
    await w.step('開く', async () => { loadDoc(await load(doc)); });
    await w.walk();
    loadDoc(newDoc());
    await w.step('取り込み', async () => { r = await load(doc); r.meta.id = D.meta.id; mergeInto(D, r); });
    await w.walk();
    loadDoc(newDoc());
  };

  test('細工: 値の項目を全部 HTML にしても、どの画面でも動かない', async () => {
    const w = walker();
    await each(INJ, CORE, w);
    await check(w);
    // 試験が画面まで届いていることも確かめる（細工した値が文字のまま見えている）
    for (const v of ['シート', '詳細パネル', '列のメニュー', 'エビデンス票', '要素の選択', '集計', '報告書', '競合の一覧', 'タブのメニュー']) ok(w.seen.has(v), v + ' で細工した値が見える: ' + [...w.seen]);
  });

  test('細工: ID と種類のほかの項目を全部 HTML にしても動かない', async () => {
    const w = walker();
    await each(INJ, STRUCT_TOO, w);
    await check(w);
  });

  test('細工: javascript: の URL を入れてもリンクや画像にならない', async () => {
    const w = walker();
    await each(JS, CORE, w);
    await check(w);
  });

  test('細工: 文字のはずの項目が数でも、Object の持つ名前でも、画面は落ちない', async () => {
    for (const bad of [12345, 'constructor', '__proto__']) {
      const w = walker();
      await each(bad, CORE, w);
      await check(w);
    }
  });

  test('細工: 同じ ID を並べて種類だけ変えても、検査していない値が出ない', async () => {
    for (const T of EL_TYPES) {
      const w = walker(), d = rich(), owner = sheetOwner('s_free');
      d.elements.push({ id: 'e_conf', owner, type: 'text', x: 1, y: 1, w: 9, h: 9, z: 1, text: INJ, title: INJ, file: INJ, srcAt: INJ, name: INJ, data: INJ, size: INJ, n: 1, run: INJ,
        runs: [{ t: INJ, name: INJ, total: INJ, ok: INJ, ng: INJ, hold: INJ, na: INJ, none: INJ, done: INJ, ev: INJ }], cells: [[INJ]], ts: { type: 1 }, updatedAt: 1 },
      { id: 'e_conf', owner, type: T, x: 1, y: 1, w: 9, h: 9, z: 1, ts: { type: 9 }, updatedAt: 9 });
      await w.step('取り込み', async () => { const r = await load(d); r.meta.id = D.meta.id; mergeInto(D, r); });
      await w.walk();
      await check(w);
      eq(D.elements.find(e => e.id === 'e_conf').type, T, T + ' に変わっている');
      loadDoc(newDoc());
    }
  });

  test('細工: 競合の一覧で種類を変えても、検査していない値が出ない', async () => {
    const d = rich(), owner = sheetOwner('s_free');
    d.elements.push({ id: 'e_conf', owner, type: 'text', x: 1, y: 1, w: 9, h: 9, z: 1, text: 'x', runs: [{ t: 'x', total: INJ, done: INJ, ng: INJ }], ts: {}, updatedAt: 1 });
    d.conflicts.push({ id: 'cf_t', kind: 'value', coll: 'elements', obj: 'e_conf', k: 'type', value: 'xmetric', vt: 1, at: 1, ts: {}, updatedAt: 1 });
    loadDoc(await load(d));
    renderConflicts();
    resolveConflict('take', 'cf_t');
    const p = $('#cfpanel'); if (p) p.remove();
    const e = getEl('e_conf');
    eq(e.type, 'xmetric', '種類は変わる');
    ok(!elHtml(e, false).includes('<img'), '数字のところに HTML が出ない');
  });

  test('細工: 英語の画面でも動かない', async () => {
    const w = walker();
    LANG = 'en';
    try { await each(INJ, CORE, w); await check(w); } finally { LANG = 'ja'; loadDoc(newDoc()); }
  });

  test('細工: ほかのファイルを落として集計カードを作っても動かない', async () => {
    const free = newSheet('まとめ', 'free', 2); snap(); D.sheets.push(free); created(free); S.sheet = free.id; render();
    const other = poison(rich(), INJ, new Set(CORE));
    const w = walker();
    await w.step('集計カード', async () => { await addXMetrics(sheetOwner(free.id), [new File([JSON.stringify(other)], INJ + '.json')], { x: 1, y: 1 }); });
    ok(elementsOf(sheetOwner(free.id)).some(e => e.type === 'xmetric'), 'カードができる');
    await w.walk();
    await check(w);
  });

  // __proto__ を自分の項目として持つ JSON は JSON.stringify では作れないので、文字列で作る
  const COLOR = `{"color":${JSON.stringify(INJ)}}`;

  test('細工: __proto__ を混ぜても、合わせたあとにプロトタイプが差し替わらない', async () => {
    const doc = newDoc(), owner = sheetOwner(doc.sheets[0].id), base = `"id":"e_p","owner":"${owner}","type":"frame","x":1,"y":1,"w":9,"h":9,"z":1`;
    const text = JSON.stringify(doc).replace('"elements":[]', () => `"elements":[{${base},"updatedAt":1,"ts":{"__proto__":5}},{${base},"updatedAt":9,"__proto__":${COLOR},"ts":{"__proto__":9}}]`);
    const r = await readBook(new File([text], 'evil.json'));
    r.meta.id = D.meta.id;
    mergeInto(D, r); render();
    const e = D.elements.find(x => x.id === 'e_p');
    ok(Object.getPrototypeOf(e) === Object.prototype, '要素のプロトタイプ');
    eq(e.color, undefined, '色は入らない');
    ok(!elHtml(e, false).includes('<img'), '属性を壊さない');
  });

  test('細工: __proto__ を ID や試験の情報に入れても、取り込まれない', async () => {
    const text = JSON.stringify(newDoc())
      .replace('"items":[]', () => '"items":[{"id":"__proto__","order":1,"ts":{},"updatedAt":1}]')
      .replace('"conflicts":[]', () => `"conflicts":[{"id":"cf_p","kind":"value","coll":"elements","obj":"e_x","k":"__proto__","value":${COLOR},"vt":1,"at":1,"ts":{},"updatedAt":1}]`)
      .replace('"meta":{', () => `"meta":{"__proto__":{"issueUrl":${JSON.stringify(INJ)}},`);
    const r = await readBook(new File([text], 'evil.json'));
    eq(r.items.length, 0, '__proto__ という ID の行は捨てる');
    eq(r.conflicts.length, 0, '__proto__ を書き換える競合も捨てる');
    ok(Object.getPrototypeOf(r.meta) === Object.prototype, '試験の情報のプロトタイプ');
    eq(r.meta.issueUrl, undefined, '不具合票のひな形は入らない');
  });

  test('細工: CSV では数式の始まりに見える値に \' を付ける。ただの数はそのまま', async () => {
    const K = sheetCols(curSheet()).find(c => c.type === 'text').id;
    let blob = null; window.download = (n, b) => { blob = b; };
    snap();
    const cases = [['=1+1', "'=1+1"], ['+cmd|x', "'+cmd|x"], ['-1+2', "'-1+2"], ['@SUM(A1)', "'@SUM(A1)"], ['\t=1', "'\t=1"], ['\r=1', "'\r=1"], ['=HYPERLINK("u")', "'=HYPERLINK(\"u\")"],
      ['-1', '-1'], ['+81', '+81'], ['-1.5', '-1.5'], ['-', '-'], ['+', '+'], ['50%', '50%'], ['普通の文字', '普通の文字'], ['a=1', 'a=1']];
    for (const [v] of cases) setF(addItem(), K, v);
    setF(sheetCols(curSheet()).find(c => c.id === K), 'name', '=列名');
    render(); exportCsv();
    const text = (await blob.text()).replace(/^﻿/, '');
    const cell = s => { const m = /^"((?:[^"]|"")*)"/.exec(s); return m[1].replace(/""/g, '"'); };
    // 1行に値が1つだけ入る列を、ヘッダーの位置で読む
    const lines = text.split('\r\n'), head = lines[0];
    ok(head.includes('"\'=列名"') || head.includes('"確認内容"'), 'ヘッダー: ' + head.slice(0, 80));
    const j = sheetCols(curSheet()).findIndex(c => c.id === K) + 1;
    const fields = l => { const out = []; let rest = l; while (rest.length) { const v = cell(rest); out.push(v); rest = rest.slice(v.replace(/"/g, '""').length + 3); } return out; };
    cases.forEach(([v, want], i) => eq(fields(lines[i + 1])[j], want, JSON.stringify(v)));
  });

  test('細工: 消したシートの削除時刻が文字でも、競合の ID に入らない', () => {
    const d = rich();
    d.sheets[1] = { ...d.sheets[1], deleted: true, ts: { deleted: INJ }, updatedAt: 1 };
    const src = clone(d);
    d.sheets[1].deleted = true;
    loadDoc(d);
    mergeInto(D, src);
    for (const c of live(D.conflicts)) ok(safeId(c.id), 'ID の形: ' + c.id);
  });
})();
