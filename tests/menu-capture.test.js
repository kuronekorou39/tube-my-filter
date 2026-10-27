'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { menuActionKind, ruleToCapture, PENDING_TTL_MS } = require('../extension/content/menu-capture.js');
const { normalizeSettings } = require('../extension/lib/settings.js');

test('メニュー項目: 対象の2項目だけを見分ける', () => {
  assert.equal(menuActionKind('チャンネルをおすすめに表示しない'), 'dontRecommend');
  assert.equal(menuActionKind('  興味なし \n'), 'notInterested');
  assert.equal(menuActionKind("Don't recommend channel"), 'dontRecommend');
  for (const t of ['報告', 'キューに追加', '共有', '興味なしの理由', '', null]) assert.equal(menuActionKind(t), null, String(t));
});

const owner = { type: 'handle', value: 'TargetCh' };
const base = normalizeSettings({ mode: 'hide', rules: [] });
const pending = { owner, label: '対象チャンネル', at: 1000 };

test('追加: メニューを開いたカードの投稿者を、選んだ項目付きで登録する', () => {
  const r = ruleToCapture({ kind: 'dontRecommend', pending, settings: base, now: 2000 });
  assert.deepEqual({ ...r, addedAt: undefined }, { type: 'handle', value: 'TargetCh', source: 'dontRecommend', label: '対象チャンネル', addedAt: undefined });
});

test('追加しない: 対象外の項目・控えなし・時間切れ・登録済み・停止中・設定オフ', () => {
  assert.equal(ruleToCapture({ kind: null, pending, settings: base, now: 2000 }), null);
  assert.equal(ruleToCapture({ kind: 'notInterested', pending: null, settings: base, now: 2000 }), null);
  assert.equal(ruleToCapture({ kind: 'notInterested', pending, settings: base, now: 1000 + PENDING_TTL_MS + 1 }), null);
  assert.equal(ruleToCapture({ kind: 'notInterested', pending, settings: { ...base, rules: [owner] }, now: 2000 }), null);
  assert.equal(ruleToCapture({ kind: 'notInterested', pending, settings: { ...base, mode: 'off' }, now: 2000 }), null);
  const off = normalizeSettings({ mode: 'hide', capture: { notInterested: false } });
  assert.equal(ruleToCapture({ kind: 'notInterested', pending, settings: off, now: 2000 }), null);
  assert.ok(ruleToCapture({ kind: 'dontRecommend', pending, settings: off, now: 2000 }));
});

test('設定: ショートの棚の非表示は既定オフ、真偽値以外は無視', () => {
  assert.equal(normalizeSettings({}).hideShorts, false);
  assert.equal(normalizeSettings({ hideShorts: true }).hideShorts, true);
  assert.equal(normalizeSettings({ hideShorts: 'yes' }).hideShorts, false);
});

test('設定: 連動の既定は両方オン、壊れた値は既定に戻す', () => {
  assert.deepEqual(normalizeSettings({}).capture, { dontRecommend: true, notInterested: true });
  assert.deepEqual(normalizeSettings({ capture: { dontRecommend: 'yes', notInterested: false } }).capture, { dontRecommend: true, notInterested: false });
});
