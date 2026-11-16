import { test } from 'node:test';
import assert from 'node:assert/strict';
import { renderOpml, renderAbout, renderVcard } from '../scripts/social/index.js';

const SITE = 'https://example.com';

test('renderOpml: outlines carry type, text, title, xmlUrl, htmlUrl', () => {
  const out = renderOpml(
    [{ title: 'Blog', feedUrl: 'https://a.test/feed', siteUrl: 'https://a.test/' }],
    { title: 'My follows' }
  );
  assert.match(out, /^<\?xml version="1.0" encoding="UTF-8"\?>\n<opml version="2.0">/);
  assert.match(out, /<head>\s*<title>My follows<\/title>\s*<\/head>/);
  assert.match(out, /<outline type="rss" text="Blog" title="Blog" xmlUrl="https:\/\/a\.test\/feed" htmlUrl="https:\/\/a\.test\/"\/>/);
  assert.ok(out.trimEnd().endsWith('</opml>'));
});

test('renderOpml: escapes & < > " in titles and urls', () => {
  const out = renderOpml(
    [{ title: 'A & B <i> "q"', feedUrl: 'https://a.test/f?x=1&y=2' }],
    { title: 'T & <T>' }
  );
  assert.ok(out.includes('<title>T &amp; &lt;T&gt;</title>'));
  assert.ok(out.includes('text="A &amp; B &lt;i&gt; &quot;q&quot;"'));
  assert.ok(out.includes('xmlUrl="https://a.test/f?x=1&amp;y=2"'));
  assert.ok(!out.includes('htmlUrl'));
});

test('renderOpml: drops private entries, keeps order, null when none public', () => {
  const list = [
    { title: 'One', feedUrl: 'https://1.test/f' },
    { title: 'Hidden', feedUrl: 'https://h.test/f', public: false },
    { title: 'Two', feedUrl: 'https://2.test/f', public: true },
  ];
  const out = renderOpml(list, { title: 'x' });
  assert.ok(!out.includes('Hidden'));
  assert.ok(out.indexOf('One') < out.indexOf('Two'));
  assert.equal(renderOpml([{ title: 'h', feedUrl: 'https://h.test/f', public: false }], { title: 'x' }), null);
  assert.equal(renderOpml([], { title: 'x' }), null);
  assert.equal(renderOpml(undefined, { title: 'x' }), null);
});

test('renderOpml: entry without feedUrl is skipped; missing title falls back to feedUrl', () => {
  const out = renderOpml([{ title: 'nope' }, { feedUrl: 'https://z.test/f' }], { title: 'x' });
  assert.ok(!out.includes('nope'));
  assert.ok(out.includes('text="https://z.test/f"'));
});

test('renderAbout: front matter has only summary, then body', () => {
  const out = renderAbout({ summary: 'Hi there', body: '### About\n\ntext' }, { siteUrl: SITE });
  assert.equal(out, '---\nsummary: "Hi there"\n---\n\n### About\n\ntext\n');
});

test('renderAbout: summary with colon, quotes, backslash, newline is YAML-safe', async () => {
  const matter = (await import('gray-matter')).default;
  const summary = 'Note: "quoted" \\ back # hash\nsecond: line';
  const out = renderAbout({ summary, body: 'b' }, { siteUrl: SITE });
  assert.equal(matter(out).data.summary, summary);
  assert.equal(matter(out).content.trim(), 'b');
});

test('renderAbout: root-relative links and images become absolute', () => {
  const body = 'See [x](/x) and ![i](/img.png) plus [ext](https://o.test/a), [rel](a/b), [proto](//cdn.test/x), [anchor](#top).';
  const out = renderAbout({ body }, { siteUrl: 'https://example.com/' });
  assert.ok(out.includes('[x](https://example.com/x)'));
  assert.ok(out.includes('![i](https://example.com/img.png)'));
  assert.ok(out.includes('[ext](https://o.test/a)'));
  assert.ok(out.includes('[rel](a/b)'));
  assert.ok(out.includes('[proto](//cdn.test/x)'));
  assert.ok(out.includes('[anchor](#top)'));
});

test('renderAbout: body wins over file; file read through injected readFile', () => {
  const readFile = (p) => { assert.equal(p, 'config/about.md'); return 'from file [a](/a)'; };
  assert.ok(renderAbout({ body: 'inline', file: 'config/about.md' }, { siteUrl: SITE, readFile }).includes('inline'));
  const out = renderAbout({ file: 'config/about.md' }, { siteUrl: SITE, readFile });
  assert.ok(out.includes('from file [a](https://example.com/a)'));
});

test('renderAbout: nothing to say, or unreadable file, gives null', () => {
  assert.equal(renderAbout({}, { siteUrl: SITE }), null);
  assert.equal(renderAbout({ body: '  \n' }, { siteUrl: SITE }), null);
  assert.equal(renderAbout(null, { siteUrl: SITE }), null);
  assert.equal(renderAbout({ file: 'x.md' }, { siteUrl: SITE, readFile: () => { throw new Error('ENOENT'); } }), null);
  assert.equal(renderAbout({ file: 'x.md' }, { siteUrl: SITE }), null);
});

test('renderAbout: without siteUrl links are left alone', () => {
  assert.ok(renderAbout({ body: '[x](/x)' }, {}).includes('[x](/x)'));
});

test('renderVcard: minimal card, CRLF, URL defaults to siteUrl', () => {
  const { text, warning } = renderVcard({ name: 'Jordan Doe', email: 'j@example.com' }, { siteUrl: SITE });
  assert.equal(warning, undefined);
  assert.equal(text, 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:Jordan Doe\r\nEMAIL;PREF=1:j@example.com\r\nURL:https://example.com\r\nEND:VCARD\r\n');
  assert.ok(!/[^\r]\n/.test(text));
});

test('renderVcard: empty fields omitted; ORG and TITLE emitted; explicit url wins', () => {
  const a = renderVcard({ name: 'N', email: '', url: '', org: '', title: '' }, {}).text;
  assert.equal(a, 'BEGIN:VCARD\r\nVERSION:4.0\r\nFN:N\r\nEND:VCARD\r\n');
  const b = renderVcard({ name: 'N', org: 'Acme', title: 'CTO', url: 'https://me.test' }, { siteUrl: SITE }).text;
  assert.ok(b.includes('\r\nORG:Acme\r\n'));
  assert.ok(b.includes('\r\nTITLE:CTO\r\n'));
  assert.ok(b.includes('\r\nURL:https://me.test\r\n'));
  assert.ok(!b.includes('EMAIL'));
});

test('renderVcard: escapes backslash, comma, semicolon and newline', () => {
  const { text } = renderVcard({ name: 'A, B; C\\D\nE', org: 'X;Y' }, { siteUrl: SITE });
  assert.ok(text.includes('FN:A\\, B\\; C\\\\D\\nE\r\n'));
  assert.ok(text.includes('ORG:X\\;Y\r\n'));
  assert.ok(renderVcard({ name: 'A;B,C' }, {}).text.includes('A\\;B\\,C')); // raw: backslash then semicolon
});

test('renderVcard: no name gives null text and a warning', () => {
  for (const c of [{}, { email: 'a@b.c' }, { name: '  ' }, undefined]) {
    const r = renderVcard(c, { siteUrl: SITE });
    assert.equal(r.text, null);
    assert.match(r.warning, /name/i);
  }
});

test('renderVcard: folds at 75 octets, never inside a UTF-8 character, and unfolds losslessly', () => {
  const name = 'Zoë 日本語テキスト😀 '.repeat(12).trim();
  const { text } = renderVcard({ name, title: 'x'.repeat(200) }, { siteUrl: SITE });
  const lines = text.split('\r\n');
  for (const l of lines) assert.ok(Buffer.byteLength(l) <= 75, `${Buffer.byteLength(l)} octets: ${l}`);
  assert.ok(lines.some((l) => l.startsWith(' ')));
  assert.ok(!text.includes('�'));
  const unfolded = text.replace(/\r\n /g, '');
  assert.ok(unfolded.includes('FN:' + name + '\r\n'));
  assert.ok(unfolded.includes('TITLE:' + 'x'.repeat(200) + '\r\n'));
});

test('renderVcard: a line of exactly 75 octets is not folded', () => {
  const name = 'a'.repeat(75 - 'FN:'.length);
  const { text } = renderVcard({ name }, {});
  assert.ok(text.includes('FN:' + name + '\r\nEND'));
});
