// チャンネル識別子の解析とルール照合。DOMに依存しない純粋関数だけを置く。
// content script・設定画面・Nodeのテストから共通で読み込む。
(function (root) {
  'use strict';

  const CHANNEL_ID_RE = /^UC[0-9A-Za-z_-]{22}$/;
  const YOUTUBE_HOSTS = new Set(['www.youtube.com', 'youtube.com', 'm.youtube.com']);

  // ハンドル本体（@を除く）として受け付ける文字列か。
  // 区切り文字・空白・制御文字を含むものは拒否する。大文字小文字やUnicodeの正規化はしない。
  function isValidHandleBody(s) {
    if (typeof s !== 'string' || s.length === 0 || s.length > 100) return false;
    return !/[\s/?#%@\\<>"'`\u0000-\u001f\u007f]/u.test(s);
  }

  function safeDecode(s) {
    try {
      return decodeURIComponent(s);
    } catch {
      return null;
    }
  }

  // パス（例: "/@abc", "/channel/UC…/videos"）からチャンネル識別子を得る。
  // 戻り値: { type: 'handle'|'id', value } / { error } / null（チャンネルのパスではない）
  function identFromPath(pathname) {
    const segs = pathname.split('/');
    // segs[0] は先頭スラッシュ前の空文字
    const first = segs[1] || '';
    if (first.startsWith('@')) {
      const body = safeDecode(first.slice(1));
      if (body === null) return { error: 'ハンドルのURLエンコードが不正です' };
      if (!isValidHandleBody(body)) return { error: 'ハンドルとして扱えない文字を含みます' };
      return { type: 'handle', value: body };
    }
    if (first === 'channel') {
      const id = segs[2] || '';
      if (!CHANNEL_ID_RE.test(id)) return { error: 'チャンネルIDの形式ではありません' };
      return { type: 'id', value: id };
    }
    if (first === 'c' || first === 'user') {
      return { error: '/c/・/user/ 形式のURLは未対応です。ハンドル（@〜）かチャンネルIDで登録してください' };
    }
    return null;
  }

  // カード内リンクのhref属性（相対パス）から識別子を得る。チャンネルのリンクでなければ null。
  function identFromHref(href) {
    if (typeof href !== 'string' || !href.startsWith('/')) return null;
    const pathname = href.split(/[?#]/)[0];
    const r = identFromPath(pathname);
    if (!r || r.error) return null;
    return r;
  }

  // 利用者の入力（@ハンドル / UCから始まるID / チャンネルURL）を解析する。
  function parseChannelInput(input) {
    const s = typeof input === 'string' ? input.trim() : '';
    if (!s) return { error: '入力が空です' };

    if (CHANNEL_ID_RE.test(s)) return { type: 'id', value: s };

    if (s.startsWith('@')) {
      const body = safeDecode(s.slice(1));
      if (body === null) return { error: 'ハンドルのURLエンコードが不正です' };
      if (!isValidHandleBody(body)) return { error: 'ハンドルとして扱えない文字を含みます' };
      return { type: 'handle', value: body };
    }

    if (/^https?:\/\//i.test(s) || /^(www\.|m\.)?youtube\.com\//i.test(s)) {
      let url;
      try {
        url = new URL(/^https?:\/\//i.test(s) ? s : 'https://' + s);
      } catch {
        return { error: 'URLとして解析できません' };
      }
      if (url.protocol !== 'https:' && url.protocol !== 'http:') return { error: 'http(s)のURLではありません' };
      if (!YOUTUBE_HOSTS.has(url.hostname.toLowerCase())) return { error: 'YouTubeのURLではありません' };
      const r = identFromPath(url.pathname);
      if (!r) return { error: 'チャンネルのURLではありません（動画URL等は登録できません）' };
      return r;
    }

    return { error: '@ハンドル、UCから始まるチャンネルID、またはチャンネルURLを入力してください' };
  }

  function sameIdent(a, b) {
    return !!a && !!b && a.type === b.type && a.value === b.value;
  }

  // カード内で見つかった識別子の一覧から、カードの投稿者を1つに決める。
  // 0件・複数の異なる値は unknown（隠さない）。
  function resolveOwner(idents) {
    const uniq = [];
    for (const it of idents) {
      if (it && !uniq.some((u) => sameIdent(u, it))) uniq.push(it);
    }
    if (uniq.length === 0) return { status: 'unknown', reason: 'no-link' };
    if (uniq.length > 1) return { status: 'unknown', reason: 'conflict' };
    return { status: 'identified', owner: uniq[0] };
  }

  // 投稿者に一致するルールを返す。IDとハンドルは別の識別子として扱い、相互に推測しない。
  function findMatchingRule(rules, owner) {
    if (!owner || !Array.isArray(rules)) return null;
    return rules.find((r) => sameIdent(r, owner)) || null;
  }

  const api = { parseChannelInput, identFromHref, resolveOwner, findMatchingRule, sameIdent };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TMF_channel = api;
})(globalThis);
