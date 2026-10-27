// chrome.storage.local に保存する設定の既定値と検証。
(function (root) {
  'use strict';

  const SCHEMA_VERSION = 1;
  const MODES = ['off', 'observe', 'hide'];
  const DEFAULTS = { schemaVersion: SCHEMA_VERSION, mode: 'observe', rules: [] };

  // 保存値が壊れていても、不明な部分は「隠さない」側に倒す。
  function normalizeSettings(raw) {
    const src = raw && typeof raw === 'object' ? raw : {};
    const mode = MODES.includes(src.mode) ? src.mode : DEFAULTS.mode;
    const rules = Array.isArray(src.rules)
      ? src.rules.filter(
          (r) => r && (r.type === 'handle' || r.type === 'id') && typeof r.value === 'string' && r.value.length > 0
        )
      : [];
    return { schemaVersion: SCHEMA_VERSION, mode, rules };
  }

  const api = { SCHEMA_VERSION, MODES, DEFAULTS, normalizeSettings };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TMF_settings = api;
})(globalThis);
