/*
 * testbook の試験用ハーネス。test\run.ps1 / test\run.sh が testbook.html の <script id="tb-app"> の手前に差し込む。
 * アプリと同じページ・同じスコープで動くので、アプリの関数（mergeInto、setF、loadDoc …）や
 * D・S・UNDO などの変数を、そのまま呼んだり見たりできる。
 *
 *   TB.test('名前', async () => { ... });     試験を登録する（tests\*.js で使う）
 *   TB.eq(実際, 期待, 'メモ')                 JSON にして比べる
 *   TB.ok(条件, 'メモ')
 *   TB.golden('ファイル名', 文字列)            test\golden\ のファイルと比べる（--update で書き換え）
 *   TB.user(doc, 名前, () => { ... })         「その人がファイルを開いて直して保存した」を演じ、保存後の中身を返す
 *   TB.key / TB.click / TB.typeText …         画面を操作する（キーやクリックのイベントを本物の要素に送る）
 *
 * 結果は console.log の "TBTEST ok 名前" / "TBTEST NG 名前"（続く "TBMSG 行" が理由）で出し、ランナーがログから拾う。
 */
(() => {
  'use strict';
  const me = document.currentScript;
  const UPDATE = me.dataset.update === '1', FILTER = me.dataset.filter || '';
  me.remove();  // 保存するファイル（captureShell）に試験のスクリプトが混ざらないように、自分を外す
  // 試験は日本語の画面で書いてある（既定の英語は別の試験で確かめる）
  try { localStorage.setItem('testbook.lang', 'ja'); } catch { /* 使えなければそのまま */ }

  // ゴールデンのファイルと、文書（README・CHANGELOG）はランナーが base64 で埋め込んでいる。読んだら外す。
  // 改行は LF に揃える（git の設定で CRLF になっていても比べられるように）
  const GOLDEN = new Map(), DOCS = new Map(), SAMPLES = new Map();
  const unb64 = s => new TextDecoder().decode(Uint8Array.from(atob(s.trim()), c => c.charCodeAt(0))).replace(/\r\n/g, '\n');
  for (const s of document.querySelectorAll('script.tb-test-golden')) { GOLDEN.set(s.dataset.name, unb64(s.textContent)); s.remove(); }
  for (const s of document.querySelectorAll('script.tb-test-doc')) { DOCS.set(s.dataset.name, unb64(s.textContent)); s.remove(); }
  for (const s of document.querySelectorAll('script.tb-test-sample')) { SAMPLES.set(s.dataset.name, unb64(s.textContent)); s.remove(); }

  /* 時刻と乱数を決まった並びにする（ゴールデン試験で ID や時刻が毎回同じになるように） */
  const BASE = Date.UTC(2026, 9, 26, 3, 0, 0);  // 2026/10/26 12:00 JST
  let T = BASE;
  const realNow = Date.now.bind(Date);
  Date.now = () => (T += 1);
  let seed = 1;
  const rnd = () => { seed ^= seed << 13; seed ^= seed >>> 17; seed ^= seed << 5; return (seed >>> 0) & 255; };
  Object.defineProperty(Crypto.prototype, 'getRandomValues', { value(a) { for (let i = 0; i < a.length; i++) a[i] = rnd(); return a; } });

  const log = (tag, s) => console.log(`${tag} ${s}`);
  const tests = [];
  // 大きな文字列（サンプルのファイル）も通るように、少しずつ変換する
  const b64 = s => { const u = new TextEncoder().encode(s); let bin = ''; for (let i = 0; i < u.length; i += 0x8000) bin += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(bin); };
  const fail = msg => { throw new Error(msg); };
  const show = v => { const s = JSON.stringify(v); return s && s.length > 300 ? s.slice(0, 300) + '…' : s; };
  const firstDiff = (a, b) => {
    const A = a.split('\n'), B = b.split('\n');
    for (let i = 0; i < Math.max(A.length, B.length); i++) if (A[i] !== B[i]) return `${i + 1} 行目:\n  実際: ${A[i] ?? '（なし）'}\n  期待: ${B[i] ?? '（なし）'}`;
    return '';
  };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const $1 = sel => { const el = typeof sel === 'string' ? document.querySelector(sel) : sel; if (!el) fail(`要素がない: ${sel}`); return el; };
  const MODS = m => ({ ctrlKey: !!(m && m.ctrl), shiftKey: !!(m && m.shift), altKey: !!(m && m.alt), metaKey: false });

  // 保存先（File System Access API のハンドル）の偽物。メソッドをプロトタイプに置いているのは、
  // アプリが保存先を IndexedDB に覚えるとき（structured clone）に関数が邪魔にならないため
  const FILES = new WeakMap();
  class FakeHandle {
    constructor(name, blob, lastModified = 1000) { this.kind = 'file'; this.name = name; FILES.set(this, { file: new File(blob ? [blob] : [], name, { type: 'text/html', lastModified }), writes: 0 }); }
    async queryPermission() { return 'granted'; }
    async requestPermission() { return 'granted'; }
    async getFile() { return FILES.get(this).file; }
    async createWritable() {
      const st = FILES.get(this), chunks = [];
      return { async write(b) { chunks.push(b); }, async close() { st.file = new File(chunks, st.file.name, { type: 'text/html', lastModified: st.file.lastModified + 1000 }); st.writes++; } };
    }
    put(blob) { const st = FILES.get(this); st.file = new File([blob], st.file.name, { type: 'text/html', lastModified: st.file.lastModified + 1000 }); }  // ほかの人が保存したことにする
    get writes() { return FILES.get(this).writes; }
    get file() { return FILES.get(this).file; }
  }

  window.TB = {
    FakeHandle,
    test(name, fn) { tests.push({ name, fn }); },
    count: () => tests.length,  // 登録された試験の数（README の「N 件 OK」と合わせる）
    ok(c, msg = '') { if (!c) fail(`${msg} が成り立たない`); },
    eq(a, b, msg = '') { const x = JSON.stringify(a), y = JSON.stringify(b); if (x !== y) fail(`${msg}\n  実際: ${show(a)}\n  期待: ${show(b)}`); },
    ne(a, b, msg = '') { if (JSON.stringify(a) === JSON.stringify(b)) fail(`${msg}: 同じ値 ${show(a)}`); },
    // 改行の違い（CRLF / LF）は見ない。改行そのものを確かめたい試験は、別に ok() で見る
    golden(name, actual) {
      const want = GOLDEN.get(name), got = actual.replace(/\r\n/g, '\n');
      if (UPDATE || want === undefined) { log('TBGOLDEN', `${name} ${b64(actual)}`); if (!UPDATE) fail(`ゴールデン ${name} がまだありません（--update で作れます）`); return; }
      if (got !== want) { log('TBGOLDEN', `${name} ${b64(actual)}`); fail(`ゴールデン ${name} と違います（--update で書き換えられます）\n  ${firstDiff(got, want).replace(/\n/g, '\n  ')}`); }
    },
    resetClock() { T = BASE; seed = 1; CLOCK = 0; },
    // リポジトリの文書（README.md、README.ja.md、CHANGELOG.md）。二重管理のずれを見る試験で使う
    doc(name) { const d = DOCS.get(name); if (d === undefined) fail(`文書がない: ${name}（ランナーが埋め込むもの）`); return d; },
    // samples/ のファイル（ランナーが埋め込む）。まだなければ undefined
    sampleFile: name => SAMPLES.get(name),
    // ランナーに「samples/ にこのファイルを書いて」と頼む（--update のときだけ書かれる）。1行が長くなりすぎないように分けて出す
    writeFile(name, text) { const s = b64(text), n = Math.ceil(s.length / 60000) || 1; for (let i = 0; i < n; i++) log('TBFILE', `${name} ${i + 1}/${n} ${s.slice(i * 60000, (i + 1) * 60000)}`); },
    updating: UPDATE,
    fail,
    // 決まったシードの乱数（0 以上 1 未満）。性質の試験で、毎回同じ「ランダム」を作る
    rng(seed0) { let s = seed0 >>> 0 || 1; return () => { s ^= s << 13; s ^= s >>> 17; s ^= s << 5; return ((s >>> 0) % 1000000) / 1000000; }; },
    clone: v => JSON.parse(JSON.stringify(v)),
    // 「この人がファイルを開いて、直して、保存した」を演じる。保存した中身（JSON を通した物）を返す
    user(doc, name, fn) { loadDoc(TB.clone(doc)); S.me = name; snap(); fn(); return TB.clone(D); },
    col: name => sheetCols(curSheet()).find(c => c.name === name),
    item: n => itemsOf(S.sheet)[n - 1],
    realNow, sleep,
    // 条件が成り立つまで待つ（画像の圧縮など、ランナーの速さで時間が変わる処理のあとに使う）。待ちきれなければそのまま進む
    async until(cond, ms = 5000) { for (let t = 0; t < ms && !cond(); t += 50) await sleep(50); },
    frame: () => new Promise(r => requestAnimationFrame(() => setTimeout(r, 0))),

    /* ---- 画面の操作。アプリが本物の操作で受け取るのと同じイベントを送る ---- */
    key(target, key, mods) {
      const el = $1(target), init = { key, bubbles: true, cancelable: true, ...MODS(mods) };
      el.dispatchEvent(new KeyboardEvent('keydown', init));
      el.dispatchEvent(new KeyboardEvent('keyup', init));
    },
    // 表の上でキーを押す（表のキー操作は編集用の textarea が受ける）
    gridKey(key, mods) { TB.key(ed(), key, mods); },
    // 表のセルに文字を打ち始める（打ち始めると編集が始まる）
    typeText(text) { const e = ed(); e.focus(); e.value = text; e.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText', data: text })); },
    click(target) { const el = $1(target); el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 })); return el; },
    dblclick(target) { $1(target).dispatchEvent(new MouseEvent('dblclick', { bubbles: true, cancelable: true, button: 0 })); },
    // セルをクリック（押して離す）。表はマウスの押下で選び、離したときに結果や証跡のセルを開く
    clickCell(r, c, mods) {
      const td = $1(`#grid td[data-r="${r}"][data-c="${c}"]`);
      td.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true, button: 0, buttons: 1, ...MODS(mods) }));
      window.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, button: 0 }));
      return td;
    },
    cellText: (r, c) => $1(`#grid td[data-r="${r}"][data-c="${c}"]`).textContent,
    // 入力欄に値を入れて input / change を起こす
    input(target, value, ev = 'input') { const el = $1(target); el.value = value; el.dispatchEvent(new Event(ev, { bubbles: true })); },
    // クリップボード: text や files を持った DataTransfer を作り、paste / copy / cut を送る
    dt({ text, files, extra } = {}) {
      const d = new DataTransfer();
      if (text != null) d.setData('text/plain', text);
      for (const [k, v] of Object.entries(extra || {})) d.setData(k, v);
      for (const f of files || []) d.items.add(f);
      return d;
    },
    clip(target, type, dt) { const el = $1(target); el.focus(); el.dispatchEvent(new ClipboardEvent(type, { bubbles: true, cancelable: true, clipboardData: dt })); return dt; },
    drop(target, files) { $1(target).dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: TB.dt({ files }) })); },
    // 試験用の画像ファイル（PNG）
    async png(w = 400, h = 300, name = 'image.png') {
      const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
      const x = cv.getContext('2d'); x.fillStyle = '#4a90d9'; x.fillRect(0, 0, w, h); x.fillStyle = '#fff'; x.fillRect(20, 20, w / 2, h / 2);
      const blob = await new Promise(r => cv.toBlob(r, 'image/png'));
      return new File([blob], name, { type: 'image/png' });
    },
    // 今の表示を「保存したファイル」にする
    savedFile: (name = 't.html') => new File([fileBlob()], name, { type: 'text/html' }),
    toasts: () => [...document.querySelectorAll('#toast > div')].map(d => d.textContent),
    // 画面の「開いているダイアログ」を押す（本物の dialog() を使う試験のため）
    dlg: () => document.querySelector('.dlg-back .dlg'),
  };

  // 試験の中で出た想定外のエラーも落とす
  const errs = [];
  window.addEventListener('error', e => errs.push(e.message));
  window.addEventListener('unhandledrejection', e => errs.push(String(e.reason && e.reason.message || e.reason)));

  window.addEventListener('load', async () => {
    await sleep(50);
    TB.realDialog = window.dialog;  // 本物のダイアログ（ふだんの試験では「OK」を返す偽物に差し替える）
    // 試験が差し替えることのある物は、毎回元に戻す
    const orig = { download: window.download, showSaveFilePicker: window.showSaveFilePicker, showOpenFilePicker: window.showOpenFilePicker };
    let pass = 0, nfail = 0;
    for (const t of tests) {
      if (FILTER && !t.name.includes(FILTER)) continue;
      errs.length = 0;
      try {
        // 毎回まっさらな試験ファイルから始める（dialog は出さずに「OK」にする）
        for (const d of document.querySelectorAll('.dlg-back')) d.remove();
        Object.assign(window, orig);
        loadDoc(newDoc()); S.me = '田中'; window.dialog = async () => true; S.handle = null; S.elClip = null; S.editing = false;
        await t.fn();
        if (errs.length) throw new Error('想定外のエラー: ' + errs.join(' / '));
        pass++; log('TBTEST', `ok ${t.name}`);
      } catch (e) {
        nfail++; log('TBTEST', `NG ${t.name}`);
        for (const l of String(e && e.message || e).split('\n')) log('TBMSG', l);
        const where = String(e && e.stack || '').split('\n').filter(l => /^\s+at /.test(l)).slice(0, 2).map(l => l.trim());
        for (const l of where) log('TBMSG', l);
      }
    }
    log('TBTEST_DONE', `${pass} ${nfail}`);
  });
})();
