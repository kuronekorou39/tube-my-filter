'use strict';
// ホームのグリッドセル（ytd-rich-item-renderer）を模した偽要素で判定を確かめる。
// 構造は docs/RESEARCH.md 6章の実測に基づく。
const test = require('node:test');
const assert = require('node:assert/strict');
const { HOME_ADAPTER, HIDDEN_CLASS, MATCH_CLASS, UNKNOWN_CLASS, judgeCard, applyVerdict } = require('../extension/content/card.js');

const link = (href) => ({ getAttribute: (n) => (n === 'href' ? href : null) });

// 中身（lockup）: { mainHref, ownerHrefs } / Shorts は { shorts: true } / 未描画は null
function makeLockup({ mainHref, ownerHrefs = [] }) {
  return {
    querySelector: (sel) => (sel === 'a[href]' ? link(mainHref) : null),
    ownerLinks: ownerHrefs.map(link),
  };
}

// セル。content を差し替えれば「同じセルの再利用」になる
function makeCell(content) {
  const cell = {
    content,
    classList: {
      set: new Set(),
      add(c) { this.set.add(c); },
      remove(c) { this.set.delete(c); },
      contains(c) { return this.set.has(c); },
    },
    querySelector(sel) {
      assert.equal(sel, 'yt-lockup-view-model');
      return this.content && !this.content.shorts ? this.content : null;
    },
    querySelectorAll(sel) {
      assert.equal(sel, HOME_ADAPTER.ownerLinkSelector);
      return this.content && !this.content.shorts ? this.content.ownerLinks : [];
    },
  };
  return cell;
}

const video = (owner, v = 'VIDEO000001') =>
  makeLockup({ mainHref: `/watch?v=${v}&pp=x`, ownerHrefs: owner ? [owner] : [] });

const rules = [{ type: 'handle', value: 'TargetCh' }];
const run = (cell, mode) => applyVerdict(cell, judgeCard(cell, rules, HOME_ADAPTER), mode);

test('ホーム: 登録チャンネルの通常動画は判定のみで赤枠、非表示で隠れる', () => {
  const cell = makeCell(video('/@TargetCh'));
  assert.equal(run(cell, 'observe'), MATCH_CLASS);
  assert.equal(run(cell, 'hide'), HIDDEN_CLASS);
  assert.equal(run(cell, 'off'), null);
});

test('ホーム: 別チャンネルは隠れない', () => {
  const cell = makeCell(video('/@OtherCh'));
  assert.equal(run(cell, 'hide'), null);
  assert.equal(run(cell, 'observe'), null);
});

test('ホーム: Shorts・ミックス・未描画のセルは対象外で印を付けない', () => {
  for (const content of [
    { shorts: true },
    makeLockup({ mainHref: '/watch?v=VIDEO000001&list=RDxxxx&start_radio=1', ownerHrefs: [] }),
    makeLockup({ mainHref: '/watch?v=VIDEO000001&list=PLxxxx', ownerHrefs: ['/@TargetCh'] }),
    null,
  ]) {
    const cell = makeCell(content);
    assert.equal(judgeCard(cell, rules, HOME_ADAPTER).status, 'skip');
    assert.equal(run(cell, 'observe'), null);
    assert.equal(run(cell, 'hide'), null);
  }
});

test('ホーム: 投稿者リンクのない共同投稿は未判定で残る（H06）', () => {
  const cell = makeCell(video(null));
  assert.deepEqual(judgeCard(cell, rules, HOME_ADAPTER), { status: 'unknown', reason: 'no-link' });
  assert.equal(run(cell, 'observe'), UNKNOWN_CLASS);
  assert.equal(run(cell, 'hide'), null);
});

test('ホーム: セルが再利用され中身が別チャンネルになったら表示に戻る（T08、チップ切替で実測した形）', () => {
  const cell = makeCell(video('/@TargetCh'));
  assert.equal(run(cell, 'hide'), HIDDEN_CLASS);
  cell.content = null; // 差し替え途中
  assert.equal(run(cell, 'hide'), null);
  cell.content = video('/@OtherCh', 'VIDEO000002');
  assert.equal(run(cell, 'hide'), null);
  assert.equal(cell.classList.contains(HIDDEN_CLASS), false);
  cell.content = video('/@TargetCh', 'VIDEO000003');
  assert.equal(run(cell, 'hide'), HIDDEN_CLASS);
});
