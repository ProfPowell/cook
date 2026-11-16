import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SERVICES, parseHandle, profileUrl, normalizeAccounts } from '../scripts/social/index.js';

test('SERVICES lists ids in table order', () => {
  assert.deepEqual(SERVICES.map((s) => s.id), ['bluesky', 'mastodon', 'github', 'linkedin', 'youtube', 'link']);
  assert.deepEqual(SERVICES.map((s) => s.name), ['Bluesky', 'Mastodon', 'GitHub', 'LinkedIn', 'YouTube', 'Link']);
  assert.equal(SERVICES.find((s) => s.id === 'github').checkable, true);
  assert.equal(SERVICES.find((s) => s.id === 'link').checkable, false);
});

const good = [
  ['bluesky', 'tpowell.bsky.social', 'tpowell.bsky.social', 'https://bsky.app/profile/tpowell.bsky.social'],
  ['bluesky', '@TPowell.Bsky.Social', 'tpowell.bsky.social', 'https://bsky.app/profile/tpowell.bsky.social'],
  ['bluesky', 'example.com', 'example.com', 'https://bsky.app/profile/example.com'],
  ['bluesky', 'https://bsky.app/profile/Foo.bsky.social/', 'foo.bsky.social', 'https://bsky.app/profile/foo.bsky.social'],
  ['mastodon', '@tpowell@Mastodon.Social', '@tpowell@mastodon.social', 'https://mastodon.social/@tpowell'],
  ['mastodon', 'TPowell@mastodon.social', '@TPowell@mastodon.social', 'https://mastodon.social/@TPowell'],
  ['mastodon', 'https://mastodon.social/@tpowell', '@tpowell@mastodon.social', 'https://mastodon.social/@tpowell'],
  ['mastodon', 'www.mastodon.social/@tpowell/', '@tpowell@mastodon.social', 'https://mastodon.social/@tpowell'],
  ['bluesky', 'www.example.com', 'www.example.com', 'https://bsky.app/profile/www.example.com'],
  ['bluesky', '@www.example.com', 'www.example.com', 'https://bsky.app/profile/www.example.com'],
  ['mastodon', 'www.bob@mastodon.social', '@www.bob@mastodon.social', 'https://mastodon.social/@www.bob'],
  ['github', 'ProfPowell', 'ProfPowell', 'https://github.com/ProfPowell'],
  ['github', '@ProfPowell', 'ProfPowell', 'https://github.com/ProfPowell'],
  ['github', 'a-b', 'a-b', 'https://github.com/a-b'],
  ['github', 'https://github.com/ProfPowell/', 'ProfPowell', 'https://github.com/ProfPowell'],
  ['github', 'www.github.com/ProfPowell', 'ProfPowell', 'https://github.com/ProfPowell'],
  ['linkedin', 'jane-doe', 'jane-doe', 'https://www.linkedin.com/in/jane-doe'],
  ['linkedin', 'in/jane-doe', 'jane-doe', 'https://www.linkedin.com/in/jane-doe'],
  ['linkedin', 'linkedin.com/in/jane-doe/', 'jane-doe', 'https://www.linkedin.com/in/jane-doe'],
  ['linkedin', 'https://www.linkedin.com/in/jane-doe', 'jane-doe', 'https://www.linkedin.com/in/jane-doe'],
  ['youtube', '@thomas', '@thomas', 'https://www.youtube.com/@thomas'],
  ['youtube', 'youtube.com/@thomas/', '@thomas', 'https://www.youtube.com/@thomas'],
  ['youtube', 'https://www.youtube.com/@thomas', '@thomas', 'https://www.youtube.com/@thomas'],
];
for (const [service, input, handle, url] of good) {
  test(`parseHandle ${service} ${input}`, () => {
    assert.deepEqual(parseHandle(service, input), { handle });
    assert.equal(profileUrl({ service, handle }), url);
  });
}

test('parseHandle trims whitespace', () => {
  assert.deepEqual(parseHandle('github', '  ProfPowell \n'), { handle: 'ProfPowell' });
});

const bad = [
  ['github', '-bad'], ['github', 'bad-'], ['github', 'a--b'], ['github', 'a'.repeat(40)], ['github', ''],
  ['mastodon', 'tpowell'], ['mastodon', '@tpowell@'], ['mastodon', '@@x.social'],
  ['bluesky', 'nodots'], ['bluesky', ''],
  ['linkedin', ''], ['linkedin', 'a/b'],
  ['youtube', 'thomas'], ['youtube', '@'],
  ['link', 'http://example.com'], ['link', 'javascript:alert(1)'], ['link', 'example.com'],
  ['nope', 'x'],
];
for (const [service, input] of bad) {
  test(`parseHandle rejects ${service} ${JSON.stringify(input)}`, () => {
    assert.ok(typeof parseHandle(service, input).error === 'string');
  });
}

test('parseHandle rejects non-strings', () => {
  assert.ok(parseHandle('github', 42).error);
  assert.ok(parseHandle('github', undefined).error);
});

test('parseHandle link accepts https', () => {
  assert.deepEqual(parseHandle('link', 'https://example.com/me'), { handle: 'https://example.com/me' });
});

test('profileUrl link returns the url; unknown gives null', () => {
  assert.equal(profileUrl({ service: 'link', url: 'https://example.com/me' }), 'https://example.com/me');
  assert.equal(profileUrl({ service: 'link', url: 'http://example.com' }), null);
  assert.equal(profileUrl({ service: 'nope', handle: 'x' }), null);
  assert.equal(profileUrl(null), null);
});

test('normalizeAccounts keeps order and builds Accounts', () => {
  const r = normalizeAccounts({ accounts: [
    { service: 'github', handle: '@ProfPowell' },
    { service: 'bluesky', handle: 'TPowell.bsky.social', did: 'did:plc:abc' },
    { service: 'link', label: 'My Site', url: 'https://example.com' },
  ] });
  assert.deepEqual(r.warnings, []);
  assert.deepEqual(r.all.map((a) => a.service), ['github', 'bluesky', 'link']);
  assert.deepEqual(r.all[0], { service: 'github', handle: 'ProfPowell', url: 'https://github.com/ProfPowell', name: 'GitHub', icon: 'github', hidden: false });
  assert.equal(r.all[1].did, 'did:plc:abc');
  assert.equal(r.all[1].handle, 'tpowell.bsky.social');
  assert.deepEqual(r.all[2], { service: 'link', handle: '', url: 'https://example.com', name: 'My Site', icon: 'link', hidden: false });
});

test('normalizeAccounts drops a non-did did silently', () => {
  const r = normalizeAccounts({ accounts: [{ service: 'bluesky', handle: 'a.bsky.social', did: 'nope' }, { service: 'github', handle: 'x', did: 'did:plc:1' }] });
  assert.deepEqual(r.warnings, []);
  assert.equal('did' in r.all[0], false);
  assert.equal('did' in r.all[1], false);
});

test('normalizeAccounts hidden goes in all but not visible', () => {
  const r = normalizeAccounts({ accounts: [{ service: 'github', handle: 'a', hidden: true }, { service: 'github', handle: 'b' }] });
  assert.equal(r.all.length, 2);
  assert.equal(r.all[0].hidden, true);
  assert.deepEqual(r.visible.map((a) => a.handle), ['b']);
});

test('normalizeAccounts skips bad entries with one warning naming the index', () => {
  const r = normalizeAccounts({ accounts: [
    { service: 'github', handle: 'ok' },
    { service: 'myspace', handle: 'x' },
    { service: 'github', handle: '-bad' },
    'string',
    null,
    { service: 'link', label: 'x', url: 'http://example.com' },
    { service: 'link', label: '', url: 'https://example.com' },
  ] });
  assert.equal(r.all.length, 1);
  assert.equal(r.warnings.length, 6);
  [1, 2, 3, 4, 5, 6].forEach((i, n) => assert.ok(r.warnings[n].includes(`accounts[${i}]`), r.warnings[n]));
});

test('normalizeAccounts tolerates non-array or missing accounts', () => {
  for (const raw of [undefined, null, {}, { accounts: 'x' }, { accounts: {} }, 5, []]) {
    const r = normalizeAccounts(raw);
    assert.deepEqual(r.all, []);
    assert.deepEqual(r.visible, []);
  }
});
