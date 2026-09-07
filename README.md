# HGU News — UIデザイン改変版

北海学園大学新聞 `hgunews.com` の公開情報を使う、GitHub Pages向けのUIデザイン改変版です。

## 特徴

- GitHub PagesのプロジェクトURL（`https://USER.github.io/REPO/`）で動くよう、内部遷移はハッシュルーティングを使用
- トップ、カテゴリー、記事、紙面、会長挨拶、新聞会について、部員募集、公式SNS、広告募集、お問い合わせ、検索を1つの静的サイトで表示
- 公開記事はクライアント側からFirestoreの公開データを読み込むため、サーバーは不要
- 記事本文HTMLはブラウザー側で許可要素だけにサニタイズ
- クラシックUI風のタイトルバー、メニュー、エクスプローラー、タブ、ダイアログ、タスクバーを実装
- `DotGothic16` をGoogle Fontsから読み込み、UIはTahoma / MS UI Gothic / MS PGothic系のフォントスタック
- `noindex,nofollow` で検索エンジンへの掲載を抑制

## 公開方法

1. このフォルダーをGitHubリポジトリの `main` ブランチへpushします。
2. GitHubの **Settings → Pages** を開きます。
3. **Build and deployment → Source** を **GitHub Actions** に設定します。
4. `.github/workflows/pages.yml` が自動実行され、Pages URLが発行されます。

以後は `main` へのpushで自動更新されます。


## モバイル表示

- 680px以下ではiPhone向け専用レイアウトに切り替わります。
- 下部タスクバーをモバイルナビゲーションとして使い、トップ・検索・紙面・新聞会へ片手で移動できます。
- タップ領域は原則44px以上、iPhoneのSafe Areaと横向き表示に対応しています。
- 記事は1カラム化し、本文の行間・見出し・メタ情報をスマートフォン向けに調整しています。
- 紙面ビューアは縮小しすぎず、横スクロールで紙面の文字を読めるようにしています。
- 検索・会長挨拶・募集・SNS・お問い合わせもスマートフォンでは縦1列に切り替わります。

## ルーティング

GitHub Pagesのリポジトリ名に依存しないよう、すべて `#/...` で遷移します。

- `#/` トップ
- `#/category/Campus` カテゴリー
- `#/articles/<Firestore document id>` 記事
- `#/viewer` 紙面
- `#/greeting` 会長挨拶
- `#/about` 新聞会について
- `#/recruit` 部員募集
- `#/social` 公式SNS
- `#/ads` 広告募集
- `#/contact` お問い合わせ
- `#/search?q=...` 検索

## データについて

Firestore project IDは公開クライアント設定から確認できる識別子です。認証情報や管理権限は含めていません。公開読み取りが許可されている記事・設定のみを取得します。データ取得に失敗した場合は、現行の `hgunews.com` へ移動できるエラー画面を表示します。

このリポジトリは仮サイト・UI検証用です。本番CMSの編集機能は含みません。
