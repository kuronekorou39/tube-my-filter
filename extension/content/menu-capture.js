// YouTube自身のメニューで「チャンネルをおすすめに表示しない」「興味なし」を利用者が選んだとき、
// その動画のチャンネルを登録リストへ加える。拡張がメニューを開いたり項目を押したりはしない。
// メニュー項目に安定した属性がないため、どの項目かは表示文字で見分ける（RESEARCH.md 8章）。
// 投稿者の識別は、メニューを開いたカードから通常どおり行う（表示名は使わない）。
(function (root) {
  'use strict';

  const ITEM_LABELS = {
    dontRecommend: ['チャンネルをおすすめに表示しない', "Don't recommend channel"],
    notInterested: ['興味なし', 'Not interested'],
  };
  // メニューを開いてから項目を選ぶまでの猶予
  const PENDING_TTL_MS = 120000;
  const TOAST_MS = 8000;

  function menuActionKind(text) {
    const t = String(text || '').replace(/\s+/g, ' ').trim();
    for (const [kind, labels] of Object.entries(ITEM_LABELS)) if (labels.includes(t)) return kind;
    return null;
  }

  // メニュー連動で追加するルール。追加不要なら null。
  function ruleToCapture({ kind, pending, settings, now }) {
    if (!kind || !pending || !settings || settings.mode === 'off') return null;
    if (!settings.capture || !settings.capture[kind]) return null;
    if (now - pending.at > PENDING_TTL_MS) return null;
    const { owner, label } = pending;
    if (settings.rules.some((r) => r.type === owner.type && r.value === owner.value)) return null;
    const rule = { type: owner.type, value: owner.value, addedAt: new Date(now).toISOString(), source: kind };
    if (label) rule.label = label;
    return rule;
  }

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = { menuActionKind, ruleToCapture, PENDING_TTL_MS };
    return;
  }

  // ---- ここから content script としての動作 ----
  const { judgeCard } = root.TMF_card;
  const { normalizeSettings } = root.TMF_settings;
  const { sameIdent } = root.TMF_channel;
  const main = root.TMF_main;

  let pending = null; // { owner, label, at }

  function onClick(e) {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const settings = main.getSettings();
    if (!settings || settings.mode === 'off') return;

    // メニュー項目が選ばれた
    const item = t.closest('ytd-popup-container yt-list-item-view-model, ytd-popup-container ytd-menu-service-item-renderer');
    if (item) {
      const kind = menuActionKind(item.textContent);
      const rule = ruleToCapture({ kind, pending, settings, now: Date.now() });
      pending = null;
      if (rule) addRule(rule);
      return;
    }

    // カード内のボタン（「⋮」）が押された → そのカードの投稿者を控える
    const ctx = main.activeContext();
    const button = t.closest('button');
    if (!ctx || !button) return;
    const card = button.closest(ctx.adapter.cardSelector);
    if (!card || !ctx.root.contains(card)) return;
    const v = judgeCard(card, settings.rules, ctx.adapter);
    pending =
      v.status === 'match' || v.status === 'nomatch'
        ? { owner: v.owner, label: ctx.adapter.readOwnerLabel(card), at: Date.now() }
        : null;
  }

  async function loadSettings() {
    return normalizeSettings(await chrome.storage.local.get(null));
  }

  async function saveRules(rules) {
    const cur = await loadSettings();
    await chrome.storage.local.set({ ...cur, rules });
  }

  async function addRule(rule) {
    const cur = await loadSettings();
    if (cur.rules.some((r) => sameIdent(r, rule))) return;
    await saveRules([...cur.rules, rule]);
    const name = rule.label || (rule.type === 'handle' ? '@' + rule.value : rule.value);
    showToast(`${name} を非表示リストに追加しました`, async () => {
      const now = await loadSettings();
      await saveRules(now.rules.filter((r) => !sameIdent(r, rule)));
    });
  }

  // ---- 通知（拡張専用の要素1つ、閉じたShadow DOM。YouTubeのDOMには差し込まない） ----
  let toastEl = null;
  let toastTimer = 0;

  function ensureToast() {
    if (toastEl && toastEl.isConnected) return toastEl;
    const host = document.createElement('tmf-overlay');
    const shadow = host.attachShadow({ mode: 'closed' });
    const style = document.createElement('style');
    style.textContent = `
      :host { all: initial; }
      .toast {
        position: fixed; z-index: 2147483000; left: 50%; bottom: 24px; transform: translateX(-50%);
        display: none; align-items: center; gap: 14px; padding: 10px 14px; max-width: min(90vw, 520px);
        color: #fff; background: #222; border-radius: 8px; box-shadow: 0 2px 10px rgba(0,0,0,.4);
        font: 13px/1.4 system-ui, sans-serif;
      }
      .toast.show { display: flex; }
      .label { font-size: 11px; color: #aaa; display: block; }
      button { border: 0; background: none; color: #8ab4f8; font: 600 13px system-ui, sans-serif; cursor: pointer; padding: 0; white-space: nowrap; }
    `;
    toastEl = document.createElement('div');
    toastEl.className = 'toast';
    toastEl.setAttribute('role', 'status');
    shadow.append(style, toastEl);
    document.documentElement.append(host);
    return toastEl;
  }

  function showToast(message, undo) {
    const el = ensureToast();
    clearTimeout(toastTimer);
    const text = document.createElement('span');
    const head = document.createElement('span');
    head.className = 'label';
    head.textContent = 'Tube My Filter';
    text.append(head, document.createTextNode(message));
    const undoBtn = document.createElement('button');
    undoBtn.type = 'button';
    undoBtn.textContent = '取り消す';
    undoBtn.addEventListener('click', async () => {
      el.classList.remove('show');
      await undo();
    });
    el.replaceChildren(text, undoBtn);
    el.classList.add('show');
    toastTimer = setTimeout(() => el.classList.remove('show'), TOAST_MS);
  }

  // 捕捉段階で見るだけ。イベントは止めず、YouTube側の動作はそのまま
  document.addEventListener('click', onClick, { capture: true, passive: true });
})(globalThis);
