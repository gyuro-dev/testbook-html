/* 二重管理のずれを機械的に見つける試験（repo-rules §4-1）。
 * 版（testbook.html の APP_VERSION）と CHANGELOG.md、README の日本語版と英語版の構成がずれていないかを見る。 */
(() => {
  'use strict';
  const { test, eq, ok, doc } = TB;
  const headings = md => {
    const out = []; let code = false;
    for (const line of md.split('\n')) {
      if (line.startsWith('```')) { code = !code; continue; }
      const m = !code && /^(#{1,6})\s/.exec(line);
      if (m) out.push(m[1].length);
    }
    return out;
  };

  test('文書: APP_VERSION は CHANGELOG の一番新しい版と同じで、[Unreleased] の節がある', () => {
    const cl = doc('CHANGELOG.md');
    ok(/^## \[Unreleased\]/m.test(cl), '## [Unreleased] がある');
    const released = [...cl.matchAll(/^## \[(\d+\.\d+\.\d+)\] - (\d{4}-\d{2}-\d{2})$/gm)].map(m => m[1]);
    ok(released.length >= 1, '公開した版の節が 1 つ以上ある');
    eq(APP_VERSION, released[0], 'APP_VERSION と CHANGELOG の一番上の版');
    ok(/^\d+\.\d+\.\d+$/.test(APP_VERSION), 'SemVer の形');
    for (const v of released) ok(cl.includes(`\n[${v}]: https://github.com/`), `比較のリンクがある: [${v}]`);
    ok(cl.includes('[Unreleased]: https://github.com/'), 'Unreleased の比較のリンク');
    ok(cl.indexOf('## [Unreleased]') < cl.indexOf(`## [${released[0]}]`), 'Unreleased が上');
  });

  test('文書: README.md（英）と README.ja.md（日）は同じ見出しの構成で、互いにリンクしている', () => {
    const en = doc('README.md'), ja = doc('README.ja.md');
    eq(headings(en), headings(ja), '見出しの深さの並び');
    ok(en.split('\n').slice(0, 4).some(l => l.includes('[日本語](README.ja.md)')), '英語版の冒頭に日本語版へのリンク');
    ok(ja.split('\n').slice(0, 4).some(l => l.includes('[English](README.md)')), '日本語版の冒頭に英語版へのリンク');
    ok(en.startsWith('# testbook\n') && ja.startsWith('# testbook\n'), '題名はツールの名前');
    ok(!/（仮）/.test(ja) && !/\(draft\)/i.test(en), '仮の名前が残っていない');
    // 英語版の本文に日本語の段落が混ざっていない（画面の文言をそのまま引くのは「」の中だけ）
    const jaParagraphsInEn = en.split('\n').filter(l => /^[^|`#\s-]/.test(l) && /[ぁ-んァ-ン]/.test(l.replace(/"[^"]*"|「[^」]*」|`[^`]*`/g, '')));
    eq(jaParagraphsInEn, [], '英語版に日本語の段落');
  });

  test('文書: README.ja.md の行末の \\（強制改行）は、括弧やかぎ括弧の途中に入っていない', () => {
    // 「。」のあとで改行する決まり。括弧の中の「。」で切ると、GitHub の表示で文がぶつ切りになる
    const bad = [];
    let code = false;
    for (const [i, line] of doc('README.ja.md').split('\n').entries()) {
      if (line.startsWith('```')) code = !code;
      if (code || !line.endsWith('\\')) continue;
      const open = (line.match(/[（「]/g) || []).length, close = (line.match(/[）」]/g) || []).length;
      if (open !== close) bad.push(`${i + 1}: ${line.slice(0, 40)}`);
    }
    eq(bad, [], '括弧の途中で改行している行');
  });

  // README にライセンスの節は置かない（GitHub がリポジトリの画面に出すので）
  test('文書: LICENSE があり、MIT ライセンス', () => {
    ok(/^MIT License/.test(doc('LICENSE')), 'LICENSE は MIT');
  });

  test('文書: README の試験の件数と、実際の件数が合っている', () => {
    const n = TB.count();
    for (const [name, md] of [['README.md', doc('README.md')], ['README.ja.md', doc('README.ja.md')]]) {
      const m = /`(\d+) 件 OK`/.exec(md);
      ok(m, name + ' に「N 件 OK」の例がある');
      eq(+m[1], n, `${name} の件数`);
    }
  });
})();
