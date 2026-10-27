// 設定の読込、DOM監視、画面遷移の検出、診断用の集計。
(function () {
  'use strict';

  const { normalizeSettings } = globalThis.TMF_settings;
  const { ADAPTERS, HIDDEN_CLASS, ALL_CLASSES, judgeCard, applyVerdict } = globalThis.TMF_card;

  let settings = null; // 読込完了まで null。この間は何も隠さない
  let observer = null;
  let lastPath = location.pathname;
  const markedCards = new Set(); // 拡張のクラスを付けたカード
  const perf = { batches: 0, maxBatchMs: 0 };

  // 今表示中の対応画面。YouTubeは離れた画面のDOMを hidden 属性付きで残すため、表示中のものだけを選ぶ
  function activeContext() {
    for (const adapter of ADAPTERS) {
      if (!adapter.matchesPath(location.pathname)) continue;
      const el = document.querySelector(adapter.rootSelector);
      if (el && !el.hasAttribute('hidden')) return { adapter, root: el };
    }
    return null;
  }

  function unmark(card) {
    card.classList.remove(...ALL_CLASSES);
    markedCards.delete(card);
  }

  function processCard(card, adapter) {
    const verdict = judgeCard(card, settings.rules, adapter);
    if (applyVerdict(card, verdict, settings.mode)) markedCards.add(card);
    else markedCards.delete(card);
  }

  function restoreAll() {
    for (const card of [...markedCards]) unmark(card);
    // 集合から漏れた要素があっても戻す
    for (const card of document.querySelectorAll(ALL_CLASSES.map((c) => '.' + c).join(','))) unmark(card);
  }

  function timed(fn) {
    const t0 = performance.now();
    fn();
    const ms = performance.now() - t0;
    perf.batches++;
    if (ms > perf.maxBatchMs) perf.maxBatchMs = ms;
  }

  function processAll() {
    timed(() => {
      const ctx = activeContext();
      if (!ctx) {
        restoreAll();
        return;
      }
      // 表示中の画面の外に残った印（遷移前の画面など）は外す
      for (const card of [...markedCards]) if (!ctx.root.contains(card)) unmark(card);
      for (const card of ctx.root.querySelectorAll(ctx.adapter.cardSelector)) processCard(card, ctx.adapter);
    });
  }

  function onMutations(mutations) {
    if (location.pathname !== lastPath) {
      lastPath = location.pathname;
      processAll();
      return;
    }
    const ctx = activeContext();
    let rescan = !ctx && markedCards.size > 0;
    const targets = new Set();
    for (const m of mutations) {
      if (m.type === 'attributes' && m.attributeName === 'hidden') {
        rescan = true;
        continue;
      }
      if (!ctx) continue;
      const sel = ctx.adapter.cardSelector;
      // カード内部の変化（中身の差し替え・href変更）はそのカードを再判定する
      const owner = m.target.closest?.(sel);
      if (owner) targets.add(owner);
      for (const n of m.addedNodes) {
        if (n.nodeType !== 1) continue;
        if (n.matches(sel)) targets.add(n);
        else for (const c of n.querySelectorAll(sel)) targets.add(c);
      }
    }
    if (rescan) {
      processAll();
      return;
    }
    if (!ctx || targets.size === 0) return;
    timed(() => {
      for (const card of targets) if (card.isConnected && ctx.root.contains(card)) processCard(card, ctx.adapter);
    });
    // 外れたカードへの参照を手放す
    for (const card of markedCards) if (!card.isConnected) markedCards.delete(card);
  }

  function start() {
    if (!observer) {
      observer = new MutationObserver(onMutations);
      // class属性は監視しない（自分の変更で再発火させないため）
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        // data-tmf-owner-*: 関連動画でメインワールド側が書く投稿者情報
        attributeFilter: ['href', 'hidden', 'data-tmf-owner-video', 'data-tmf-owner-id', 'data-tmf-owner-handle'],
      });
    }
    document.documentElement.setAttribute(BRIDGE_ATTR, '');
    lastPath = location.pathname;
    processAll();
  }

  // メインワールドの owner-bridge.js に動作を許可する目印
  const BRIDGE_ATTR = 'data-tmf-bridge';

  const SHORTS_ATTR = 'data-tmf-shorts';
  // ショートの棚はCSSだけで扱う（hide.css）。ここでは <html> の目印を切り替えるだけ
  function applyShortsOption() {
    const html = document.documentElement;
    const value = settings && settings.hideShorts && settings.mode !== 'off' ? (settings.mode === 'hide' ? 'hide' : 'mark') : null;
    if (value) html.setAttribute(SHORTS_ATTR, value);
    else html.removeAttribute(SHORTS_ATTR);
  }

  // 棚の数（診断用、要求時だけ数える）
  const SHORTS_SHELF_SELECTOR = [
    'ytd-rich-section-renderer:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
    'grid-shelf-view-model:has(ytm-shorts-lockup-view-model, ytm-shorts-lockup-view-model-v2)',
    'ytd-reel-shelf-renderer',
  ].join(',');

  function stop() {
    document.documentElement.removeAttribute(BRIDGE_ATTR);
    if (observer) {
      observer.disconnect();
      observer = null;
    }
    restoreAll();
  }

  function applySettings(raw) {
    settings = normalizeSettings(raw);
    applyShortsOption();
    if (settings.mode === 'off') stop();
    else start();
  }

  function collectStats() {
    const ctx = activeContext();
    const stats = {
      page: ctx ? ctx.adapter.name : 'unsupported',
      mode: settings ? settings.mode : 'loading',
      rules: settings ? settings.rules.length : 0,
      total: 0,
      skipped: 0,
      identified: 0,
      matched: 0,
      hidden: 0,
      unknownNoLink: 0,
      unknownConflict: 0,
      shortsShelves: ctx ? ctx.root.querySelectorAll(SHORTS_SHELF_SELECTOR).length : 0,
      batches: perf.batches,
      maxBatchMs: Math.round(perf.maxBatchMs * 10) / 10,
    };
    if (!ctx || !settings) return stats;
    for (const card of ctx.root.querySelectorAll(ctx.adapter.cardSelector)) {
      const v = judgeCard(card, settings.rules, ctx.adapter);
      if (v.status === 'skip') {
        stats.skipped++;
        continue;
      }
      stats.total++;
      if (v.status === 'unknown') {
        if (v.reason === 'conflict') stats.unknownConflict++;
        else stats.unknownNoLink++; // no-link / no-data
        continue;
      }
      stats.identified++;
      if (v.status === 'match') stats.matched++;
      if (card.classList.contains(HIDDEN_CLASS)) stats.hidden++;
    }
    return stats;
  }

  chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
    if (msg && msg.type === 'tmf:getStats') sendResponse(collectStats());
  });

  chrome.storage.onChanged.addListener((changes, area) => {
    if (area !== 'local') return;
    if (!['mode', 'rules', 'capture', 'hideShorts'].some((k) => k in changes)) return;
    chrome.storage.local.get(null).then(applySettings);
  });

  window.addEventListener('popstate', () => {
    if (settings && settings.mode !== 'off') processAll();
  });

  // メニュー連動（content/menu-capture.js）に、今の画面と設定を渡す
  globalThis.TMF_main = { activeContext, getSettings: () => settings };

  // 読込に失敗した場合は settings が null のままで、何も隠さない
  chrome.storage.local.get(null).then(applySettings);
})();
