# 調査記録と未確認事項

調査日: 2026-10-27。以下は公式ヘルプ・公式技術資料・開発元資料を確認した記録であり、YouTube実画面のDOM調査や拡張の実行結果ではない。

## 1. YouTube公式機能について

| 項目 | 確認した内容 | 出典 |
|---|---|---|
| チャンネルをおすすめに表示しない | ホームや次のおすすめ等で使う推薦調整。通常利用者が任意チャンネルを検索結果まで一律に消す設定としては説明されていない | [おすすめと検索結果を管理する](https://support.google.com/youtube/answer/6342839?hl=ja) |
| おすすめへの反映 | YouTubeは、このフィードバックを好みの判断材料として使用すると説明している。効果ゼロ、永久排除、全画面での排除のいずれも、この説明だけから断定しない | [おすすめ動画の仕組み](https://support.google.com/youtube/answer/16089387?hl=ja) |
| チャンネルのブロック | コメント・チャット・メンションでのやり取りが対象。投稿動画全体を検索等から消す機能とは区別される | [チャンネルをブロックする](https://support.google.com/youtube/answer/7663906?hl=ja) |
| チャンネルから非表示 | 自分のチャンネルでのコメント等を管理する機能 | [ユーザーを非表示にする](https://support.google.com/youtube/answer/9482361?hl=ja) |
| 子ども向けブロック | YouTube Kids・子どもの管理対象アカウントには保護者のチャンネルブロックがある | [コンテンツのブロックと共有](https://support.google.com/youtubekids/answer/7178746?hl=ja) |

結論の範囲: 調査した公式資料では、通常の成人アカウントの視聴者向けに、任意チャンネルの動画を全画面から排除する設定は確認できなかった。「YouTubeに一切ブロック機能がない」という言い方はしない。

## 2. 既存拡張の調査は機能の参考に限定

ユーザーはこれらの第三者製拡張を使わず自作する方針。導入やコード流用は今回の前提にしない。ストア掲載や更新日を、安全性・正常動作の証明として扱わない。

| 拡張 | 公開情報 | 確認先 |
|---|---|---|
| YTBlock | チャンネル等の非表示。Chrome版の表示は6.1.2、2026-10-20更新 | [Chrome Web Store](https://chromewebstore.google.com/detail/ytblock-block-any-content/nedcanggplmbbgmlpcjiafgjcpdimpea) |
| BlockTube | チャンネルID等でブロック。開いた対象動画のページ遮断または次動画への移動を説明している。2026-10-23付の一部ブロック不具合報告もある | [開発元README](https://github.com/amitbl/blocktube#faq)、[報告 #712](https://github.com/amitbl/blocktube/issues/712) |
| FilterTube | チャンネルID・ハンドル・キーワードや許可リスト。Chrome版は3.4.0、2026-10-02更新 | [Chrome Web Store](https://chromewebstore.google.com/detail/filtertube/cjmdggnnpmpchholgnkfokibidbbnfgc) |

検索結果の要約には古いバージョン情報が残っていた例があるため、上記は直接開いた掲載ページの値を優先した。これらの拡張が採る内部実装を、本プロジェクトの実装方式と同一視しない。

## 3. 技術資料で確認したこと

- Content scriptはDOMを読み書きでき、既定の隔離された実行環境とページ本体のJavaScript環境には違いがある。今回のDOM中心の案の土台となる。[Chrome Content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)
- 静的content scriptの対象サイトとAPI権限はmanifestで宣言する。対象サイトの指定も権限警告に関係するため、YouTubeだけに絞る。[Chromeの権限宣言](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions)
- 拡張専用のローカル保存にはStorage APIがあり、使用にはstorage権限が必要。localとsyncを区別する。[Chrome Storage API](https://developer.chrome.com/docs/extensions/reference/api/storage)
- ローカル拡張は開発者モードから読み込める。content script更新時は拡張とホストページを再読み込みする。[Chromeのローカル読み込み](https://developer.chrome.com/docs/extensions/get-started/tutorial/hello-world)
- DOMの変更を監視する標準APIとしてMutationObserverがある。YouTubeのどの要素を監視すれば足りるかは、別途調査が必要。[MDN MutationObserver](https://developer.mozilla.org/en-US/docs/Web/API/MutationObserver)

## 4. 実画面で未確認の仮説

| 調査ID | 仮説・問い | 確認方法・次の判断 |
|---|---|---|
| H01 | 通常動画カードの投稿者をDOMから識別できるか | 実DOMの投稿者リンク・属性を確認。取れないカードは未判定にする |
| H02 | IDとハンドルを結び付けられるか | 同一チャンネルと確認できる画面上の根拠を調べる。取得できなければハンドルとIDを別々に扱う |
| H03 | 検索・ホーム・関連動画で同じ構造か | 各画面のサンプルを別々に観察。同じとは仮定しない |
| H04 | 属性差し替えやノード再利用があるか | スクロール・SPA遷移で追跡。合成fixtureで反対チャンネルへの差し替えも試す |
| H05 | 隠すまでの一瞬の表示を抑えられるか | 設定読込と識別のタイミングを測り、実際のフレームと比較する |
| H06 | 複数チャンネルの共同投稿を扱えるか | 投稿者の表現とID取得方法を観察。初期は不明なものを隠さない |
| H07 | 関連動画の非表示が自動再生にも影響するか | 非表示とプレイヤーの選択を分けて観察。効果を推定だけで報告しない |
| H08 | 操作環境でunpacked拡張を読み込めるか | Chrome/Edgeの実ブラウザと利用可能な操作手段を確認する |

初期案は「通信を改変せずDOMで隠す」。これは調査結果として最良と証明された方式ではなく、コードと権限を小さく保つための設計選択である。限界が見つかったら、実測に基づいて変更案を検討する。

## 5. M0 実画面調査（2026-10-27）

実験ID: M0-01。読み取り専用のJavaScriptをClaude in Chrome経由でページに実行して観察した。拡張はまだ存在しない。チャンネル名・動画タイトル・動画IDは記録していない。

| 条件 | 値 |
|---|---|
| ブラウザ | Google Chrome 156.0.8078.48（Windows 64bit, UA上 Windows NT 10.0） |
| ページ | `www.youtube.com/results`、検索語は一般語1件、言語 ja-JP、画面幅 1746px |
| ログイン | あり（アカウント情報は未記録） |
| 干渉する拡張 | 未確認（Claude in Chrome拡張は動作中） |

### 観察した事実

| 項目 | 結果 |
|---|---|
| 検索結果の構造 | `ytd-search` 内の `ytd-item-section-renderer #contents` 直下に、`ytd-video-renderer`（通常動画）、`grid-shelf-view-model`（Shorts棚）、`ytd-ad-slot-renderer`・`ytd-search-pyv-renderer`（広告）、`ytd-channel-renderer`（チャンネル）が並ぶ。初期表示の通常動画は4件だけで、他は広告・棚だった |
| 投稿者リンクの位置 | `ytd-video-renderer` 内の `#channel-info a#channel-thumbnail`、`#channel-info ytd-channel-name a`、`ytd-video-meta-block ytd-channel-name a` の3箇所。いずれも同じhref |
| 投稿者リンクの形式 | 42カード中39件が `/@ハンドル`、3件が `/channel/UC…`。1カード内で両形式が並ぶ例は0件 → **検索カードのDOMからはIDとハンドルの対応を取れない**（H02） |
| DOM属性中のチャンネルID | `UC` + 22文字のパターンは、広告URL内の偶然一致以外に出現しなかった |
| ハンドルの表記 | 日本語ハンドルはパーセントエンコードされたhref（84リンク中2件）。大文字を含むハンドルあり（30件）。`/@h/...` のような後続パスはなし |
| 識別不能カード | 投稿者リンクのない通常動画カード 0/42、複数投稿者 0/42（このサンプルでは共同投稿未観測、H06未解決） |
| Shorts棚 | `ytm-shorts-lockup-view-model` に `/shorts/…` リンクのみ。投稿者リンクなし → DOMでは識別不能（対象外のまま） |
| 追加読み込み | スクロールで `ytd-item-section-renderer` が追加され、その中に新しいカードノードが入る。既存カードの内容変化 0件。追加カード12件はMutationObserverのコールバック時点で全件投稿者リンクを持っていた |
| SPA遷移 | ロゴでホームへ移動すると `ytd-search` は `hidden` 属性付きでDOMに残る。戻ると同じ42ノードが同じ内容で再表示された（新規ノード0、差し替え0） |
| ページ側JSデータ（参考） | ページのメインワールドでは各カードの `.data.shortBylineText.runs[0].navigationEndpoint.browseEndpoint` に `browseId`（UC形式、42/42件）と `canonicalBaseUrl`（DOMのhrefと42/42一致）がある。**拡張の既定の隔離環境（ISOLATED）からは読めない** |
| ホーム（M2参考） | `ytd-rich-item-renderer` 内は `yt-lockup-view-model` 系の別構造。投稿者リンクは `/@` 形式を観測。検索と同じアダプターは使えない（H03） |

### 未確認・制約

- **SPA内で別の検索をしたときのノード再利用（H04/T08）は未確認。** ログイン中の検索は検索履歴に残るため、追加検索を控えた。M0-01の検索1件と観測用のホーム表示は履歴等に残った可能性がある。
- `/channel/UC…` 形式になる条件（ハンドル未設定チャンネルか等）は未確認。
- 未ログイン状態・別の画面幅・他の検索語での構造差は未確認。
- サンプルは1検索語・42カード。人による対象/非対象の正解付けはまだしていない。

### 設計への影響（判断待ち）

DOMだけで判定する方針（SPEC 6章）では、識別子は実質「ハンドル」になる。チャンネルIDのルールは `/channel/UC…` 形式で出るカードにしか一致しない。選択肢:

1. **DOMのみ（現方針）**: ハンドル完全一致を主とし、IDルールは補助。利用者はハンドルで登録する。改名には弱いが、ページのJS環境に触れない。
2. **メインワールドからの読み取り**: `world: "MAIN"` のcontent scriptで `.data` からIDを読み、DOM属性等で隔離側へ渡す。ID完全一致が可能になるが、ページ内部構造への依存と、ページ環境で動くコードが増える。AGENTS.mdの初期方針から外れるため、利用者の判断が必要。

## 6. M2 ホーム実画面調査（2026-10-27）

実験ID: M2-H01。条件はM0-01と同じ（Chrome 156 / Windows / ja-JP / ログインあり）。ホームを開いてスクロールし、カテゴリチップを1回切り替えた。動画の再生、検索、「興味なし」等の操作はしていない。タイトル・チャンネル名は記録していない。

| 項目 | 結果 |
|---|---|
| ルート | `ytd-browse[page-subtype="home"]`。他画面へ移ると `hidden` 付きで残る点は検索と同じ（想定。ホームからの遷移は未計測） |
| グリッド | `ytd-rich-grid-renderer #contents` 直下に `ytd-rich-item-renderer`（セル）、`ytd-rich-section-renderer`（Shorts棚 `ytd-rich-shelf-renderer` 等）、`ytd-continuation-item-renderer` |
| セルの中身 | 通常動画・ミックスは `yt-lockup-view-model`、Shortsは `ytm-shorts-lockup-view-model-v2`。広告 `ytd-ad-slot-renderer` は今回0件 |
| 投稿者リンク | `yt-lockup-view-model` 内 `yt-content-metadata-view-model` の `a[href]`（1件）。アバター `yt-decorated-avatar-view-model` はリンクではない。クラス名 `ytLockupViewModel…` 等は使わない |
| リンク形式 | スクロール後150 lockup中: 投稿者リンク1件=146（`/@`=144、`/channel/UC…`=2）、0件=4 |
| リンクなし4件の内訳 | ミックスリスト3件（主リンクが `/watch?…&list=RD…&start_radio=1`）、共同投稿と見られる通常動画1件（重なったアバター5件、メタデータ行に複数名、リンクなし）→ H06の実例。未判定で残す |
| セルの再利用（H04/T08） | チップ切替で、残った `ytd-rich-item-renderer` 24件すべてが同じノードのまま、中の `yt-lockup-view-model` が別ノードに差し替わった。hrefの属性変更は0回。→ セルに付けた印は中身の差し替え（childList）で再判定が必要 |
| セレクタ検証 | 新しいホームアダプターと同じ判定をページ上で実行: 103セル中、対象外15、識別88/88、未判定0、69チャンネル |

設計への反映: ホームはセル `ytd-rich-item-renderer` を隠す単位にする（中身だけ隠すと空のセルが残るため）。通常動画は「主リンクが `/watch?` で `list` を含まない lockup」と定義し、Shorts・ミックス・再生リストは対象外（skip）とする。

## 7. M2 関連動画（再生ページ）実画面調査（2026-10-28）

実験ID: M2-W01。条件はM0-01と同じ。利用者の許可を得て、ホームに出ていた登録対象外チャンネルの動画を1本開き、200ms間隔でミュート・一時停止した（再生位置0秒を確認）。視聴履歴に1件残った可能性がある。

| 項目 | 結果 |
|---|---|
| 位置 | `ytd-watch-flexy #secondary ytd-watch-next-secondary-results-renderer #items > ytd-item-section-renderer #contents` 直下に `yt-lockup-view-model` 20件と `ytd-continuation-item-renderer`。`ytd-compact-video-renderer` は0件、広告0件 |
| 主リンク | `/watch?` 19件、`list` 付き（ミックス等）1件 |
| **投稿者リンク** | **0/20件。** チャンネル名はリンクのない `span` の文字列、アバターは `img` のみ（リンクなし） |
| DOMにある手がかり | 表示名の文字列、アバター画像のURL、aria-label。表示名での判定はAGENTS.md・SPECで禁止。画像URLからチャンネルを特定するには外部情報が必要 |
| ページ側データ（参考） | `ytd-item-section-renderer` の `.data.contents[].lockupViewModel` に、20/20件で `browseEndpoint.browseId`（UC形式）と `canonicalBaseUrl`（`/@…`）がある。場所は `metadata.lockupMetadataViewModel.image.decoratedAvatarViewModel…onTap.innertubeCommand`。`contentId`（動画ID）でDOMのカードと20/20件対応づけられ、1件あたりのチャンネルは1つ |
| 自動再生 | 自動再生トグルはオン。関連カードを隠しても次の動画の選択には影響しない見込み（M3の範囲、未検証） |

結論: **関連動画は、DOMだけ（方式1）では投稿者を識別できない。** 対応するには方式2（メインワールドでの読み取り）が必要。表示名での判定はしない。
