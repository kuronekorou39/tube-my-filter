'use strict';
// 関連動画: メインワールド側のデータ抽出と、属性を読む判定の組み合わせを確かめる。
// データ構造は docs/RESEARCH.md 7章の実測経路を模した合成値。
const test = require('node:test');
const assert = require('node:assert/strict');
const { ownerFromLockupData, buildOwnerMap } = require('../extension/page/owner-bridge.js');
const { RELATED_ADAPTER, HIDDEN_CLASS, MATCH_CLASS, UNKNOWN_CLASS, judgeCard, applyVerdict } = require('../extension/content/card.js');

const ID_A = 'UC' + 'A'.repeat(22);
const ID_B = 'UC' + 'B'.repeat(22);

function lockupData(contentId, browseEndpoint) {
  return {
    lockupViewModel: {
      contentId,
      metadata: {
        lockupMetadataViewModel: {
          image: {
            decoratedAvatarViewModel: {
              rendererContext: { commandContext: { onTap: { innertubeCommand: { browseEndpoint } } } },
            },
          },
        },
      },
    },
  };
}

test('抽出: 実測経路からIDとハンドルを読む', () => {
  const lv = lockupData('VID00000001', { browseId: ID_A, canonicalBaseUrl: '/@TargetCh' }).lockupViewModel;
  assert.deepEqual(ownerFromLockupData(lv), { id: ID_A, handle: '/@TargetCh' });
});

test('抽出: 経路が変わった・値が不正なら読まない（未判定に倒す）', () => {
  assert.equal(ownerFromLockupData({ contentId: 'x', metadata: {} }), null);
  assert.equal(ownerFromLockupData(null), null);
  const bad = lockupData('v', { browseId: 'FEwhat_to_watch', canonicalBaseUrl: 'https://evil.example/@x' }).lockupViewModel;
  assert.equal(ownerFromLockupData(bad), null);
  const idOnly = lockupData('v', { browseId: ID_A }).lockupViewModel;
  assert.deepEqual(ownerFromLockupData(idOnly), { id: ID_A, handle: null });
});

test('抽出: 動画IDごとの表を作る。他の種類の項目は無視', () => {
  const map = buildOwnerMap([
    {
      contents: [
        lockupData('VID00000001', { browseId: ID_A, canonicalBaseUrl: '/@TargetCh' }),
        { continuationItemRenderer: {} },
        lockupData('VID00000002', { browseId: ID_B, canonicalBaseUrl: '/@OtherCh' }),
      ],
    },
    null,
  ]);
  assert.equal(map.size, 2);
  assert.equal(map.get('VID00000002').handle, '/@OtherCh');
});

// 関連動画カード（yt-lockup-view-model）の偽要素
function makeCard(href, attrs = {}) {
  const set = new Set();
  return {
    href,
    attrs,
    classList: { set, add: (c) => set.add(c), remove: (c) => set.delete(c), contains: (c) => set.has(c) },
    querySelector(sel) {
      assert.equal(sel, 'a[href]');
      return { getAttribute: () => this.href };
    },
    getAttribute(n) {
      return n in this.attrs ? this.attrs[n] : null;
    },
  };
}
const owned = (vid, id, handle) => ({ 'data-tmf-owner-video': vid, 'data-tmf-owner-id': id, 'data-tmf-owner-handle': handle });
const run = (card, rules, mode) => applyVerdict(card, judgeCard(card, rules, RELATED_ADAPTER), mode);

test('関連: ハンドルのルールでもIDのルールでも一致する（同じデータ項目のID・ハンドル）', () => {
  const card = makeCard('/watch?v=VID00000001&pp=x', owned('VID00000001', ID_A, '/@TargetCh'));
  assert.equal(run(card, [{ type: 'handle', value: 'TargetCh' }], 'hide'), HIDDEN_CLASS);
  assert.equal(run(card, [{ type: 'id', value: ID_A }], 'hide'), HIDDEN_CLASS);
  assert.equal(run(card, [{ type: 'id', value: ID_B }], 'hide'), null);
});

test('関連: 属性がまだないカードは未判定で残る', () => {
  const card = makeCard('/watch?v=VID00000001');
  const rules = [{ type: 'handle', value: 'TargetCh' }];
  assert.deepEqual(judgeCard(card, rules, RELATED_ADAPTER), { status: 'unknown', reason: 'no-data' });
  assert.equal(run(card, rules, 'observe'), UNKNOWN_CLASS);
  assert.equal(run(card, rules, 'hide'), null);
});

test('関連: 別の動画に再利用され属性が古いままなら隠さない（T08）', () => {
  const rules = [{ type: 'handle', value: 'TargetCh' }];
  const card = makeCard('/watch?v=VID00000001', owned('VID00000001', ID_A, '/@TargetCh'));
  assert.equal(run(card, rules, 'hide'), HIDDEN_CLASS);
  card.href = '/watch?v=VID00000002'; // 中身だけ別チャンネルの動画に
  assert.equal(run(card, rules, 'hide'), null);
  card.attrs = owned('VID00000002', ID_B, '/@OtherCh'); // 属性が更新された
  assert.equal(run(card, rules, 'hide'), null);
  assert.equal(run(card, rules, 'observe'), null);
});

test('関連: ミックス・再生リストは対象外', () => {
  const card = makeCard('/watch?v=VID00000001&list=RDxx', owned('VID00000001', ID_A, '/@TargetCh'));
  assert.equal(judgeCard(card, [{ type: 'handle', value: 'TargetCh' }], RELATED_ADAPTER).status, 'skip');
});

test('関連: 一致しても判定のみでは赤枠だけ', () => {
  const card = makeCard('/watch?v=VID00000001', owned('VID00000001', ID_A, '/@TargetCh'));
  assert.equal(run(card, [{ type: 'handle', value: 'TargetCh' }], 'observe'), MATCH_CLASS);
});
