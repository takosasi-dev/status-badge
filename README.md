# Status Badge

Obsidian で仕様書や説明書を開くと、そのノートの「実装状況」を見出し部の右に印で出すプラグインです。
状態は [SpecStatus](https://github.com/takosasi-dev/spec-status)(仕様書の実装状況ボード)の JSON と、ノートの frontmatter から**写すだけ**で、自分では決めず、vault のファイルを1つも書き換えません。PC と iPhone・Android で動きます。

![仕様書を開いたところ。右上の印を押すとメニューが出る](docs/images/badge.png)

*English summary is at the bottom.*

## できること

- **仕様書の印**: 開いたノートのパスが SpecStatus の JSON(`00_実装状況.json`)の文書に当たれば、その状態(実装完了・一部未実装・着手済・未着手・撤退・証拠なし)を色とアイコンと文字で出します。
- **説明書の印**: 設定したフォルダのノートは、frontmatter の `状態:` の値をそのまま出します。
- **押すとメニュー**: 状態・根拠・食い違い・一覧を作った日時・メモに加えて、SpecStatus の JSON にあれば 待ち・Phase・受け入れ基準のチェック・脆弱な依存(一番重い物と上げる先の版)・仕様が変わった日・止まっている日数・GitHub の版も出します。「一覧ノートを開く」「根拠のノートを開く」「読み直す」もここから。
- **食い違い・古さ**: SpecStatus が食い違いを見つけた物は下線、一覧が設定の日数より古いと薄く出します。
- **自動で読み直す**: SpecStatus が JSON を書き直すと、操作なしに印が新しくなります。説明書の `状態:` を書き換えたときも同じです。
- コマンド: 「状態を読み直す」「実装状況の一覧ノートを開く」(既定のホットキーは無し)。

## 使い方の前提

- 仕様書の印には、[SpecStatus](https://github.com/takosasi-dev/spec-status) が vault の中に出す JSON が要ります(既定の場所 `仕様書MDファイル/00_実装状況.json`。設定で変えられます)。SpecStatus が無くても、説明書の印(frontmatter の `状態:`)だけで使えます。
- iPhone などで使うときは、JSON がその端末にも届いている必要があります。Obsidian Sync なら「他のすべてのタイプのファイルを同期」をオンにしてください。

## 入れ方

### BRAT で入れる(おすすめ)

1. コミュニティプラグインの「BRAT」(Obsidian42 - BRAT)を入れて有効にする。
2. BRAT の設定 → 「Add Beta plugin」に `takosasi-dev/status-badge` を入れる。
3. コミュニティプラグインの一覧で「Status Badge」を有効にする。

BRAT は新しい版が出ると自動で取ってきます。iPhone・Android でも同じ手順で入れられます。

### 手で入れる

[Releases](https://github.com/takosasi-dev/status-badge/releases) から `main.js`・`manifest.json`・`styles.css` を落とし、vault の `.obsidian/plugins/status-badge/` に置いて、コミュニティプラグインの一覧で有効にします。

## 設定

| 項目 | 既定 | 内容 |
| --- | --- | --- |
| SpecStatus の JSON | `仕様書MDファイル/00_実装状況.json` | vault からのパス |
| 一覧ノート | `仕様書MDファイル/00_実装状況.md` | メニューから開くノート |
| 説明書にも印を出す | オン | |
| 説明書のフォルダ | 空 | 1行に1つ。配下のフォルダも含む。frontmatter の状態を出したいフォルダを書く(例 `説明書/ツール`) |
| 状態のプロパティ名 | `状態` | |
| 印に状態の文字を添える | オン | 見出しが詰まる端末では切る |
| 一覧が古いとみなす日数 | 7 | 空なら古さの印を出さない |
| 値ごとのアイコンと色 | 6状態+導入済み | 1行に「値 \| アイコン名 \| 色の系統」。アイコンは Lucide の名前、系統は ok・partial・progress・todo・stopped・other |
| 「一覧に無い」の印を出すフォルダ | 空(出さない) | JSON に無い md に「一覧に無い」の印を出す |

## 安全のための決まり

- vault のファイルを作らない・変えない・消さない。書くのはこのプラグインの設定(`data.json`)だけ。
- 状態は JSON か frontmatter の文字をそのまま出す。言い換えたり推測したりしない。
- ネットワークに出ない。Obsidian の画面の中身(ファイル一覧など)には手を出さず、公開 API の `addAction` で自分の印を付けるだけ。
- Node.js や Electron の機能を使わない(モバイルでも動く)。

## 開発

```
npm install
npm run build        # main.js を作る(型チェックつき)
npm test             # vitest
npm run lint         # eslint-plugin-obsidianmd
SB_DEV_PLUGIN_DIR=<開発用 vault>/.obsidian/plugins/status-badge npm run deploy:dev
```

## ライセンス

MIT。[LICENSE](LICENSE) を見てください。

---

## English summary

**Status Badge** shows the implementation status of the open note as a badge in the view header.

- For specification notes, it reads the JSON written by [SpecStatus](https://github.com/takosasi-dev/spec-status) and shows the status exactly as written (no re-mapping or guessing). Clicking the badge shows the reason, conflicts, when the list was generated, and extra fields such as waiting, phase, acceptance-criteria checks, vulnerable dependencies (with the version to upgrade to), spec changes, stale days and the GitHub release.
- For other notes in configured folders, it shows the value of a frontmatter property (default `状態`).
- Read-only: it never creates, modifies or deletes vault files (only its own `data.json`), makes no network requests, and does not touch Obsidian's DOM beyond its own `addAction` element. Works on desktop and mobile.
- Install with [BRAT](https://github.com/TfTHacker/obsidian42-brat) (`takosasi-dev/status-badge`) or copy `main.js`, `manifest.json` and `styles.css` from the latest release into `.obsidian/plugins/status-badge/`.
- The UI is in Japanese.
