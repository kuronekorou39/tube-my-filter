// chrome.storage.local に保存する設定の既定値と検証。
(function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MODES = ['off', 'observe', 'hide'];
  // YouTubeのメニューで選んだときに、その動画のチャンネルを登録リストへ加えるか
  const CAPTURE_DEFAULTS = { dontRecommend: true, notInterested: true };
  const DEFAULTS = { schemaVersion: SCHEMA_VERSION, mode: 'observe', rules: [], capture: CAPTURE_DEFAULTS, hideShorts: false };

  // 保存値が壊れていても、不明な部分は「隠さない」側に倒す。
  function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = MODES.includes(src.mode) ? src.mode : DEFAULTS.mode;
    const rules = Array.isArray(src.rules)
      ? src.rules.filter(
          (r) => r && (r.type === 'handle' || r.type === 'id') && typeof r.value === 'string' && r.value.length > 0
        )
      : [];
    const cap = src.capture && typeof src.capture === 'object' ? src.capture : {};
    const capture = {};
    for (const k of Object.keys(CAPTURE_DEFAULTS)) {
      capture[k] = typeof cap[k] === 'boolean' ? cap[k] : CAPTURE_DEFAULTS[k];
    }
    const hideShorts = typeof src.hideShorts === 'boolean' ? src.hideShorts : DEFAULTS.hideShorts;
    return { schemaVersion: SCHEMA_VERSION, mode, rules, capture, hideShorts };
  }

  const api = { SCHEMA_VERSION, MODES, DEFAULTS, CAPTURE_DEFAULTS, normalizeSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TMF_settings = api;
})(globalThis);
