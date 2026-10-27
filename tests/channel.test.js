'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseChannelInput, identFromHref, resolveOwner, findMatchingRule } = require('../extension/lib/channel.js');
const { normalizeSettings } = require('../extension/lib/settings.js');

const ID = 'UC' + 'a'.repeat(21) + 'B'; // 合成ID（24文字）

test('入力: ハンドル・ID・URLを受け付ける', () => {
  assert.deepEqual(parseChannelInput('@cooking_lab'), { type: 'handle', value: 'cooking_lab' });
  assert.deepEqual(parseChannelInput('  ' + ID + ' '), { type: 'id', value: ID });
  assert.deepEqual(parseChannelInput('https://www.youtube.com/@cooking_lab/videos'), { type: 'handle', value: 'cooking_lab' });
  assert.deepEqual(parseChannelInput('youtube.com/@cooking_lab'), { type: 'handle', value: 'cooking_lab' });
  assert.deepEqual(parseChannelInput(`https://m.youtube.com/channel/${ID}?si=x`), { type: 'id', value: ID });
});

test('入力: 日本語ハンドルはエンコード有無で同じ値になる（T05）', () => {
  const enc = 'https://www.youtube.com/@' + encodeURIComponent('料理研究所');
  assert.deepEqual(parseChannelInput(enc), { type: 'handle', value: '料理研究所' });
  assert.deepEqual(parseChannelInput('@料理研究所'), { type: 'handle', value: '料理研究所' });
});

test('入力: 大文字小文字は同一視しない', () => {
  assert.equal(parseChannelInput('@Cooking').value, 'Cooking');
  assert.equal(findMatchingRule([{ type: 'handle', value: 'Cooking' }], { type: 'handle', value: 'cooking' }), null);
});

test('入力: 不正値・対象外URLは登録しない（T05）', () => {
  for (const bad of [
    '',
    'cooking_lab', // @なしは曖昧
    '@',
    '@a b',
    '@%E3%81', // 壊れたエンコード
    'https://www.youtube.com/watch?v=abcdefghijk',
    'https://www.youtube.com/c/OldName',
    'https://www.youtube.com/user/OldName',
    'https://example.com/@cooking_lab',
    'https://www.youtube.com.evil.example/@x',
    'javascript:alert(1)',
    'https://www.youtube.com/channel/UCshort',
    'UC' + 'a'.repeat(21), // 23文字
  ]) {
    assert.ok(parseChannelInput(bad).error, `拒否されるべき: ${bad}`);
  }
});

test('href: チャンネルのリンクだけを識別子にする', () => {
  assert.deepEqual(identFromHref('/@cooking_lab'), { type: 'handle', value: 'cooking_lab' });
  assert.deepEqual(identFromHref('/@' + encodeURIComponent('料理研究所')), { type: 'handle', value: '料理研究所' });
  assert.deepEqual(identFromHref(`/channel/${ID}`), { type: 'id', value: ID });
  assert.equal(identFromHref('/watch?v=abcdefghijk'), null);
  assert.equal(identFromHref('/shorts/abcdefghijk'), null);
  assert.equal(identFromHref('https://www.youtube.com/@cooking_lab'), null); // 絶対URLは想定外として扱わない
  assert.equal(identFromHref('/@%E3%81'), null);
  assert.equal(identFromHref(null), null);
});

test('投稿者の決定: 0件・競合は未判定（T13/H06）', () => {
  const a = { type: 'handle', value: 'a' };
  const b = { type: 'handle', value: 'b' };
  assert.deepEqual(resolveOwner([]), { status: 'unknown', reason: 'no-link' });
  assert.deepEqual(resolveOwner([null, null]), { status: 'unknown', reason: 'no-link' });
  assert.deepEqual(resolveOwner([a, { ...a }, null]), { status: 'identified', owner: a });
  assert.deepEqual(resolveOwner([a, b]), { status: 'unknown', reason: 'conflict' });
  // ハンドルとIDが同じカードに出ても、同一と確認する根拠がないので競合扱い
  assert.equal(resolveOwner([a, { type: 'id', value: ID }]).status, 'unknown');
});

test('ルール照合: IDルールはハンドルのカードに一致しない（T06）', () => {
  const rules = [{ type: 'id', value: ID }];
  assert.equal(findMatchingRule(rules, { type: 'handle', value: 'cooking_lab' }), null);
  assert.equal(findMatchingRule(rules, { type: 'id', value: ID }), rules[0]);
});

test('設定: 壊れた保存値は判定のみ・ルールなしに倒す（T01/T13）', () => {
  assert.deepEqual(normalizeSettings(undefined), { schemaVersion: 1, mode: 'observe', rules: [] });
  const s = normalizeSettings({ mode: 'nuke', rules: [{ type: 'handle', value: 'a' }, { type: 'name', value: 'x' }, null, { type: 'id' }] });
  assert.equal(s.mode, 'observe');
  assert.deepEqual(s.rules, [{ type: 'handle', value: 'a' }]);
});
