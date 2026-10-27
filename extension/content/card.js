// 画面ごとのカード定義（アダプター）と、カード1枚に対する「識別」「ルール判定」「表示変更」。
// セレクタは 2026-10-27 の実DOM調査（docs/RESEARCH.md 5章・6章）に基づく。
(function (root) {
  'use strict';

  const channel = typeof module !== 'undefined' && module.exports ? require('../lib/channel.js') : root.TMF_channel;

  // 検索結果: 通常動画カード ytd-video-renderer。投稿者リンクはカード内に3箇所（同じhref）。
  const SEARCH_ADAPTER = {
    name: 'search',
    matchesPath: (p) => p === '/results',
    rootSelector: 'ytd-search',
    cardSelector: 'ytd-video-renderer',
    // カードの投稿者部分のリンクだけを見る。タイトル・説明文中のリンクは使わない。
    ownerLinkSelector: '#channel-info a[href], ytd-channel-name a[href]',
    isTargetCard: () => true,
  };

  // ホーム: グリッドのセル ytd-rich-item-renderer を隠す単位にする。
  // セルは再利用され、中の yt-lockup-view-model だけが差し替わることを実測済み（T08）。
  // 投稿者リンクはメタデータ行の a のみ（アバターはリンクではない）。
  const HOME_ADAPTER = {
    name: 'home',
    matchesPath: (p) => p === '/',
    rootSelector: 'ytd-browse[page-subtype="home"]',
    cardSelector: 'ytd-rich-item-renderer',
    ownerLinkSelector: 'yt-lockup-view-model yt-content-metadata-view-model a[href]',
    // 通常動画だけを対象にする。Shorts（別の要素）、ミックス・再生リスト（list付きURL）は対象外
    isTargetCard(card) {
      const lockup = card.querySelector('yt-lockup-view-model');
      if (!lockup) return false;
      const a = lockup.querySelector('a[href]');
      const href = (a && a.getAttribute('href')) || '';
      return href.startsWith('/watch?') && !/[?&]list=/.test(href);
    },
  };

  const ADAPTERS = [SEARCH_ADAPTER, HOME_ADAPTER];

  const HIDDEN_CLASS = 'tmf-hidden';
  // 判定のみモードの目印（枠線だけでレイアウトは変えない）
  const MATCH_CLASS = 'tmf-match';
  const UNKNOWN_CLASS = 'tmf-unknown';
  const ALL_CLASSES = [HIDDEN_CLASS, MATCH_CLASS, UNKNOWN_CLASS];

  // 戻り値: { status: 'skip'|'match'|'nomatch'|'unknown', reason?, owner?, rule? }
  //   skip: その画面の対象種別ではないカード（Shorts・ミックス等）
  function judgeCard(card, rules, adapter = SEARCH_ADAPTER) {
    if (!adapter.isTargetCard(card)) return { status: 'skip' };
    const hrefs = Array.from(card.querySelectorAll(adapter.ownerLinkSelector), (a) => a.getAttribute('href'));
    const resolved = channel.resolveOwner(hrefs.map(channel.identFromHref));
    if (resolved.status === 'unknown') return { status: 'unknown', reason: resolved.reason };
    const rule = channel.findMatchingRule(rules, resolved.owner);
    return rule
      ? { status: 'match', owner: resolved.owner, rule }
      : { status: 'nomatch', owner: resolved.owner };
  }

  // 判定結果に応じた拡張専用クラスを1つだけ付け、他は外す。
  //   非表示モード: 一致 → 非表示
  //   判定のみモード: 一致 → 赤枠、未判定 → 灰色点線枠
  //   停止・対象外: 何も付けない
  // 戻り値: 付けたクラス名（なければ null）
  function applyVerdict(card, verdict, mode) {
    let cls = null;
    if (mode === 'hide' && verdict.status === 'match') cls = HIDDEN_CLASS;
    else if (mode === 'observe' && verdict.status === 'match') cls = MATCH_CLASS;
    else if (mode === 'observe' && verdict.status === 'unknown') cls = UNKNOWN_CLASS;
    for (const c of ALL_CLASSES) if (c !== cls) card.classList.remove(c);
    if (cls) card.classList.add(cls);
    return cls;
  }

  const api = {
    SEARCH_ADAPTER,
    HOME_ADAPTER,
    ADAPTERS,
    HIDDEN_CLASS,
    MATCH_CLASS,
    UNKNOWN_CLASS,
    ALL_CLASSES,
    judgeCard,
    applyVerdict,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TMF_card = api;
})(globalThis);
