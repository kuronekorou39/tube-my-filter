// ページのメインワールドで動く読み取り専用スクリプト。
// 関連動画カードにはDOM上の投稿者リンクがないため（docs/RESEARCH.md 7章）、
// ページが持つデータから「チャンネルID・ハンドル」だけを読み、カードの data 属性に写す。
// 判定・非表示は拡張側（隔離環境）が行う。ここでは chrome API・通信・ページ関数の呼び出しを使わない。
//
// 利用者の承認: 2026-10-28、関連動画に限り方式2を採用（docs/SPEC.md 4章）。
(function (root) {
  'use strict';

  const ATTR_VIDEO = 'data-tmf-owner-video';
  const ATTR_ID = 'data-tmf-owner-id';
  const ATTR_HANDLE = 'data-tmf-owner-handle';
  // 拡張側（隔離環境）が停止以外のモードのとき <html> に付ける
  const ACTIVE_ATTR = 'data-tmf-bridge';

  const CONTAINER = 'ytd-watch-next-secondary-results-renderer';
  const ID_RE = /^UC[0-9A-Za-z_-]{22}$/;
  const HANDLE_RE = /^\/@[^/?#\s]+$/;

  // lockupViewModel 1件から投稿者を読む。実測した経路だけを見て、なければ null。
  function ownerFromLockupData(lv) {
    const be =
      lv &&
      lv.metadata &&
      lv.metadata.lockupMetadataViewModel &&
      lv.metadata.lockupMetadataViewModel.image &&
      lv.metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel &&
      lv.metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel.rendererContext &&
      lv.metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel.rendererContext.commandContext &&
      lv.metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel.rendererContext.commandContext.onTap &&
      lv.metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel.rendererContext.commandContext.onTap
        .innertubeCommand &&
      lv.metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel.rendererContext.commandContext.onTap
        .innertubeCommand.browseEndpoint;
    if (!be) return null;
    const id = typeof be.browseId === 'string' && ID_RE.test(be.browseId) ? be.browseId : null;
    const handle =
      typeof be.canonicalBaseUrl === 'string' && HANDLE_RE.test(be.canonicalBaseUrl) ? be.canonicalBaseUrl : null;
    if (!id && !handle) return null;
    return { id, handle };
  }

  // セクションの data.contents から 動画ID → 投稿者 の表を作る
  function buildOwnerMap(sectionDataList) {
    const map = new Map();
    for (const data of sectionDataList) {
      const contents = data && Array.isArray(data.contents) ? data.contents : [];
      for (const item of contents) {
        const lv = item && item.lockupViewModel;
        if (!lv || typeof lv.contentId !== 'string') continue;
        const owner = ownerFromLockupData(lv);
        if (owner) map.set(lv.contentId, owner);
      }
    }
    return map;
  }

  function videoIdOfLockup(lockup) {
    const a = lockup.querySelector('a[href]');
    const href = (a && a.getAttribute('href')) || '';
    if (!href.startsWith('/watch?')) return null;
    return new URLSearchParams(href.slice('/watch?'.length)).get('v');
  }

  function clearAttrs(el) {
    el.removeAttribute(ATTR_VIDEO);
    el.removeAttribute(ATTR_ID);
    el.removeAttribute(ATTR_HANDLE);
  }

  function syncContainer(container) {
    const sections = Array.from(container.querySelectorAll('ytd-item-section-renderer'), (s) => s.data);
    const map = buildOwnerMap(sections);
    for (const lockup of container.querySelectorAll('yt-lockup-view-model')) {
      const vid = videoIdOfLockup(lockup);
      const owner = vid ? map.get(vid) : null;
      if (!owner) {
        if (lockup.hasAttribute(ATTR_VIDEO)) clearAttrs(lockup);
        continue;
      }
      if (lockup.getAttribute(ATTR_VIDEO) === vid) continue;
      // 動画IDを最後に書く。拡張側は動画IDが一致するときだけ属性を信用する
      lockup.removeAttribute(ATTR_VIDEO);
      if (owner.id) lockup.setAttribute(ATTR_ID, owner.id);
      else lockup.removeAttribute(ATTR_ID);
      if (owner.handle) lockup.setAttribute(ATTR_HANDLE, owner.handle);
      else lockup.removeAttribute(ATTR_HANDLE);
      lockup.setAttribute(ATTR_VIDEO, vid);
    }
  }

  function syncAll() {
    for (const c of document.querySelectorAll(CONTAINER)) syncContainer(c);
  }

  function clearAll() {
    for (const el of document.querySelectorAll('[' + ATTR_VIDEO + '],[' + ATTR_ID + '],[' + ATTR_HANDLE + ']')) {
      clearAttrs(el);
    }
  }

  function start() {
    const html = document.documentElement;
    const observer = new MutationObserver((mutations) => {
      const active = html.hasAttribute(ACTIVE_ATTR);
      let touched = false;
      let toggled = false;
      for (const m of mutations) {
        if (m.target === html && m.attributeName === ACTIVE_ATTR) toggled = true;
        else if (m.target.closest && m.target.closest(CONTAINER)) touched = true;
        else for (const n of m.addedNodes) if (n.nodeType === 1 && (n.matches(CONTAINER) || n.querySelector(CONTAINER))) touched = true;
      }
      if (toggled && !active) clearAll();
      else if (active && (touched || toggled)) syncAll();
    });
    // 自分が書く data-tmf-owner-* は監視しない（自己ループ防止）
    observer.observe(html, { childList: true, subtree: true, attributes: true, attributeFilter: ['href', ACTIVE_ATTR] });
    if (html.hasAttribute(ACTIVE_ATTR)) syncAll();
  }

  const api = { ownerFromLockupData, buildOwnerMap, ATTR_VIDEO, ATTR_ID, ATTR_HANDLE, ACTIVE_ATTR };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else start();
})(globalThis);
