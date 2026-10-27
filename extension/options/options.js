(function () {
  'use strict';

  const { parseChannelInput, sameIdent } = globalThis.TMF_channel;
  const { normalizeSettings } = globalThis.TMF_settings;

  const $ = (id) => document.getElementById(id);
  const KIND_LABEL = { handle: 'ハンドル', id: 'ID' };
  const MODE_HELP = {
    off: '何もしません。隠していた動画も元に戻ります。',
    observe: '隠さずに判定だけします。一致した動画は赤枠、判定できない動画は点線枠で示します。',
    hide: '登録したチャンネルの動画を隠します。',
  };
  const PAGE_LABEL = { search: '検索結果', home: 'ホーム', related: '関連動画' };
  const FILTER_MIN_RULES = 6;

  // ツールバーのポップアップとして開いたときだけ、このタブの集計を出す
  const isPopup = new URLSearchParams(location.search).has('popup');
  if (!isPopup) document.body.classList.add('page');
  $('version').textContent = 'v' + chrome.runtime.getManifest().version;

  let currentRules = [];

  async function load() {
    return normalizeSettings(await chrome.storage.local.get(null));
  }

  async function save(patch) {
    const cur = await load();
    await chrome.storage.local.set({ ...cur, ...patch });
  }

  function displayValue(rule) {
    return rule.type === 'handle' ? '@' + rule.value : rule.value;
  }

  function el(tag, className, text) {
    const e = document.createElement(tag);
    if (className) e.className = className;
    if (text !== undefined) e.textContent = text;
    return e;
  }

  function renderRules() {
    const q = $('filter').value.trim().toLowerCase();
    const list = $('rules');
    list.replaceChildren();
    $('rule-count').textContent = String(currentRules.length);
    $('filter').hidden = currentRules.length < FILTER_MIN_RULES;
    $('empty').hidden = currentRules.length > 0;

    // 新しく追加したものを上に
    const rules = [...currentRules].reverse().filter((r) => {
      if (!q) return true;
      return displayValue(r).toLowerCase().includes(q) || (r.label || '').toLowerCase().includes(q);
    });
    for (const rule of rules) {
      const li = el('li');
      const text = el('div', 'text');
      text.append(el('div', 'name', rule.label || displayValue(rule)));
      const SOURCE_LABEL = { dontRecommend: '「おすすめに表示しない」から', notInterested: '「興味なし」から' };
      const sub = el('div', 'sub');
      sub.append(el('span', 'kind', KIND_LABEL[rule.type]), document.createTextNode(displayValue(rule)));
      if (SOURCE_LABEL[rule.source]) sub.append(document.createTextNode(' · ' + SOURCE_LABEL[rule.source]));
      text.append(sub);
      const del = el('button', 'icon-btn', '×');
      del.type = 'button';
      del.title = '登録を外す（表示に戻す）';
      del.setAttribute('aria-label', `${rule.label || displayValue(rule)} の登録を外す`);
      del.addEventListener('click', async () => {
        const cur = await load();
        await save({ rules: cur.rules.filter((r) => !sameIdent(r, rule)) });
      });
      li.append(text, del);
      list.append(li);
    }
  }

  function render(settings) {
    for (const input of document.querySelectorAll('input[name=mode]')) {
      input.checked = input.value === settings.mode;
    }
    $('mode-help').textContent = MODE_HELP[settings.mode];
    $('opt-hideShorts').checked = settings.hideShorts;
    for (const k of Object.keys(settings.capture)) {
      const box = $('cap-' + k);
      if (box) box.checked = settings.capture[k];
    }
    currentRules = settings.rules;
    renderRules();
  }

  async function refreshStats() {
    let stats = null;
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab && tab.id !== undefined) stats = await chrome.tabs.sendMessage(tab.id, { type: 'tmf:getStats' });
    } catch {
      stats = null; // content scriptのないタブ
    }
    $('stats-section').hidden = false;
    const note = $('stats-note');
    const tiles = $('stats-tiles');
    const detail = $('stats-detail');
    const chip = $('page-chip');
    const supported = !!stats && stats.page in PAGE_LABEL;
    tiles.hidden = !supported;
    detail.hidden = !supported;
    note.hidden = supported;
    chip.textContent = supported ? PAGE_LABEL[stats.page] : '対象外';
    if (!stats) {
      note.textContent = 'このタブの情報を取得できません。YouTubeのタブなら、再読み込みしてください。';
      return;
    }
    if (!supported) {
      note.textContent = '検索結果・ホーム・動画ページで使えます。';
      return;
    }
    $('st-matched').textContent = String(stats.matched);
    $('st-hidden').textContent = String(stats.hidden);
    $('st-unknown').textContent = String(stats.unknownNoLink + stats.unknownConflict);
    $('st-total').textContent = String(stats.total);
    detail.textContent = `ショートの棚 ${stats.shortsShelves} / 対象外 ${stats.skipped} 件（Shorts・ミックス等） / 最大処理時間 ${stats.maxBatchMs} ms`;
  }

  for (const input of document.querySelectorAll('input[name=mode]')) {
    input.addEventListener('change', () => {
      if (input.checked) save({ mode: input.value });
    });
  }

  $('filter').addEventListener('input', renderRules);

  $('opt-hideShorts').addEventListener('change', (e) => save({ hideShorts: e.target.checked }));

  for (const box of document.querySelectorAll('input[id^="cap-"]')) {
    box.addEventListener('change', async () => {
      const cur = await load();
      await save({ capture: { ...cur.capture, [box.id.slice(4)]: box.checked } });
    });
  }

  function showMessage(text, isError) {
    const m = $('add-message');
    m.textContent = text;
    m.classList.toggle('error', !!isError);
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
    showMessage(`${KIND_LABEL[parsed.type]}として追加しました: ${displayValue(parsed)}`, false);
  });

  chrome.storage.onChanged.addListener((_changes, area) => {
    if (area !== 'local') return;
    load().then(render);
    if (isPopup) setTimeout(refreshStats, 150);
  });

  load().then(render);
  if (isPopup) refreshStats();
})();
