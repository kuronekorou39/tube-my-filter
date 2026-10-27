'use strict';
// 実DOM（docs/RESEARCH.md 5章）の構造を模した最小の偽要素で、カード単位の判定と表示切り替えを確かめる。
const test = require('node:test');
const assert = require('node:assert/strict');
const { SEARCH_ADAPTER, HIDDEN_CLASS, MATCH_CLASS, UNKNOWN_CLASS, judgeCard, applyVerdict } = require('../extension/content/card.js');

class FakeClassList {
  constructor() { this.set = new Set(); }
  add(c) { this.set.add(c); }
  remove(c) { this.set.delete(c); }
  contains(c) { return this.set.has(c); }
}

// links: [{ area: 'channel-info'|'byline'|'title'|'description', href }]
// 投稿者部分（channel-info / byline）のリンクだけが ownerLinkSelector に一致する、という実DOMの関係を再現する。
function makeCard(links) {
  return {
    links,
    classList: new FakeClassList(),
    querySelectorAll(sel) {
      assert.equal(sel, SEARCH_ADAPTER.ownerLinkSelector);
      return this.links
        .filter((l) => l.area === 'channel-info' || l.area === 'byline')
        .map((l) => ({ getAttribute: (n) => (n === 'href' ? l.href : null) }));
    },
  };
}

function ownerCard(handlePath, extra = []) {
  return makeCard([
    { area: 'title', href: '/watch?v=VIDEO000001' },
    { area: 'channel-info', href: handlePath },
    { area: 'channel-info', href: handlePath },
    { area: 'byline', href: handlePath },
    ...extra,
  ]);
}

const rules = [{ type: 'handle', value: 'TargetCh' }];

function run(card, mode) {
  return applyVerdict(card, judgeCard(card, rules), mode);
}

const classes = (card) => [...card.classList.set].sort();

test('一致したカードは非表示モードでだけ隠れ、判定のみでは枠だけ付く（T01/T02/T09）', () => {
  const card = ownerCard('/@TargetCh');
  assert.equal(judgeCard(card, rules).status, 'match');
  assert.equal(run(card, 'observe'), MATCH_CLASS);
  assert.deepEqual(classes(card), [MATCH_CLASS]);
  assert.equal(run(card, 'hide'), HIDDEN_CLASS);
  assert.deepEqual(classes(card), [HIDDEN_CLASS]);
  assert.equal(run(card, 'observe'), MATCH_CLASS);
  assert.deepEqual(classes(card), [MATCH_CLASS]);
  assert.equal(run(card, 'off'), null);
  assert.deepEqual(classes(card), []);
});

test('一致しないカードはどのモードでも印を付けない', () => {
  const card = ownerCard('/@OtherCh');
  for (const mode of ['off', 'observe', 'hide']) {
    assert.equal(run(card, mode), null);
    assert.deepEqual(classes(card), []);
  }
});

test('似た名前の別チャンネルは隠れない（T03）', () => {
  for (const h of ['/@TargetCh2', '/@TargetC', '/@targetch', '/@Target_Ch', '/@TargetCh%E3%80%80']) {
    const card = ownerCard(h);
    assert.notEqual(judgeCard(card, rules).status, 'match', h);
    assert.equal(run(card, 'hide'), null, h);
    assert.notEqual(run(card, 'observe'), MATCH_CLASS, h);
  }
});

test('タイトル・説明文にある対象チャンネルへのリンクでは隠れない（T04）', () => {
  const card = ownerCard('/@OtherCh', [{ area: 'description', href: '/@TargetCh' }]);
  assert.equal(judgeCard(card, rules).status, 'nomatch');
  assert.equal(run(card, 'hide'), null);
});

test('投稿者リンクがないカードは未判定で残る（T13）', () => {
  const card = makeCard([{ area: 'title', href: '/watch?v=VIDEO000001' }]);
  assert.deepEqual(judgeCard(card, rules), { status: 'unknown', reason: 'no-link' });
  assert.equal(run(card, 'hide'), null);
  assert.equal(run(card, 'observe'), UNKNOWN_CLASS);
});

test('投稿者部分に異なるチャンネルが並ぶカードは隠さない（H06）', () => {
  const card = ownerCard('/@TargetCh', [{ area: 'byline', href: '/@OtherCh' }]);
  assert.deepEqual(judgeCard(card, rules), { status: 'unknown', reason: 'conflict' });
  assert.equal(run(card, 'hide'), null);
  assert.equal(run(card, 'observe'), UNKNOWN_CLASS);
});

test('同じノードが別チャンネルに再利用されたら再判定で戻る（T08）', () => {
  const card = ownerCard('/@TargetCh');
  assert.equal(run(card, 'hide'), HIDDEN_CLASS);
  for (const l of card.links) if (l.area !== 'title') l.href = '/@OtherCh';
  assert.equal(run(card, 'hide'), null);
  assert.equal(card.classList.contains(HIDDEN_CLASS), false);
  // 逆方向
  for (const l of card.links) if (l.area !== 'title') l.href = '/@TargetCh';
  assert.equal(run(card, 'hide'), HIDDEN_CLASS);
});

test('ルール削除で戻る（T10）', () => {
  const card = ownerCard('/@TargetCh');
  assert.equal(run(card, 'hide'), HIDDEN_CLASS);
  assert.equal(applyVerdict(card, judgeCard(card, []), 'hide'), null);
  assert.equal(card.classList.contains(HIDDEN_CLASS), false);
});

test('他のクラスには触れない', () => {
  const card = ownerCard('/@TargetCh');
  card.classList.add('style-scope');
  run(card, 'hide');
  run(card, 'off');
  assert.equal(card.classList.contains('style-scope'), true);
});
