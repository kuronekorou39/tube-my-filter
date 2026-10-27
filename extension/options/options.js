(function () {
  'use strict';

  const { parseChannelInput, sameIdent } = globalThis.TMF_channel;
  const { normalizeSettings } = globalThis.TMF_settings;

  const $ = (id) => document.getElementById(id);
  const KIND_LABEL = { handle: 'ハンドル', id: 'ID' };

  async function load() {
    return normalizeSettings(await chrome.storage.local.get(null));
  }

  async function save(patch) {
    const cur = await load();
    await chrome.storage.local.set({ ...cur, ...patch });
  }

  function showMessage(text, isError) {
    const el = $('add-message');
    el.textContent = text;
    el.classList.toggle('error', !!isError);
  }

  function displayValue(rule) {
    return rule.type === 'handle' ? '@' + rule.value : rule.value;
  }

  function renderRules(rules) {
    const list = $('rules');
    list.replaceChildren();
    $('rule-count').textContent = String(rules.length);
    for (const rule of rules) {
      const li = document.createElement('li');
      const kind = document.createElement('span');
      kind.className = 'kind';
      kind.textContent = KIND_LABEL[rule.type];
      const value = document.createElement('span');
      value.className = 'value';
      value.textContent = displayValue(rule);
      li.append(kind, value);
      if (rule.label) {
        const label = document.createElement('span');
        label.className = 'label';
        label.textContent = rule.label;
        li.append(label);
      }
      const del = document.createElement('button');
      del.type = 'button';
      del.textContent = '削除';
      del.addEventListener('click', async () => {
        const cur = await load();
        await save({ rules: cur.rules.filter((r) => !sameIdent(r, rule)) });
      });
      li.append(del);
      list.append(li);
    }
  }

  function render(settings) {
    for (const input of document.querySelectorAll('input[name=mode]')) {
      input.checked = input.value === settings.mode;
    }
    renderRules(settings.rules);
  }

  const STATS_LABELS = [
    ['page', '画面'],
    ['mode', 'モード'],
    ['total', '通常動画カード'],
    ['identified', '投稿者を識別'],
    ['matched', 'ルールに一致'],
    ['hidden', '非表示中'],
    ['unknownNoLink', '未判定（リンクなし）'],
    ['unknownConflict', '未判定（投稿者が競合）'],
    ['skipped', '対象外（Shorts・ミックス等）'],
    ['maxBatchMs', '最大処理時間(ms)'],
  ];
  const PAGE_LABEL = { search: '検索結果', home: 'ホーム' };
  const MODE_LABEL = { off: '停止', observe: '判定のみ', hide: '非表示', loading: '読込中' };

  // ポップアップとして開いたとき、アクティブなYouTubeタブの集計を表示する
  async function refreshStats() {
    let stats = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id !== undefined) stats = await chrome.tabs.sendMessage(tab.id, { type: 'tmf:getStats' });
    } catch {
      stats = null; // content scriptのないタブ
    }
    const section = $('stats-section');
    section.hidden = false;
    const dl = $('stats');
    dl.replaceChildren();
    const note = (text) => {
      const dd = document.createElement('dd');
      dd.textContent = text;
      dl.append(dd);
    };
    if (!stats) {
      note('このタブの判定情報を取得できません。YouTubeのタブなら、拡張の読み込み・更新後にタブを再読み込みしてください。');
      return;
    }
    if (!(stats.page in PAGE_LABEL)) {
      note('対象外のページです（検索結果・ホームに対応）');
      return;
    }
    for (const [key, label] of STATS_LABELS) {
      const dt = document.createElement('dt');
      dt.textContent = label;
      const dd = document.createElement('dd');
      dd.textContent =
        key === 'mode' ? MODE_LABEL[stats.mode] || stats.mode : key === 'page' ? PAGE_LABEL[stats.page] : String(stats[key]);
      dl.append(dt, dd);
    }
  }

  for (const input of document.querySelectorAll('input[name=mode]')) {
    input.addEventListener('change', () => {
      if (input.checked) save({ mode: input.value });
    });
  }

  $('add-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const parsed = parseChannelInput($('add-input').value);
    if (parsed.error) {
      showMessage(parsed.error, true);
      return;
    }
    const cur = await load();
    if (cur.rules.some((r) => sameIdent(r, parsed))) {
      showMessage(`登録済みです: ${displayValue(parsed)}`, true);
      return;
    }
    const label = $('add-label').value.trim().slice(0, 100);
    const rule = { type: parsed.type, value: parsed.value, addedAt: new Date().toISOString() };
    if (label) rule.label = label;
    await save({ rules: [...cur.rules, rule] });
    $('add-input').value = '';
    $('add-label').value = '';
    showMessage(`${KIND_LABEL[parsed.type]}として登録しました: ${displayValue(parsed)}`, false);
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'local') return;
    load().then(render);
    if (isPopup) setTimeout(refreshStats, 100);
  });

  // 件数欄はツールバーのポップアップとして開いたときだけ使う
  const isPopup = new URLSearchParams(location.search).has('popup');

  load().then(render);
  if (isPopup) refreshStats();
})();
