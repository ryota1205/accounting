# 研修売上管理システム 設計書

- 作成日: 2026-06-18
- 対象: アカデミージャパン（研修会社）の売上管理
- 置き換え対象: `2026年度研修売上管理表_アカデミージャパン.xlsx`

## 1. 目的・ゴール

Excel で手作業集計している研修売上管理を、Web システム化する。
**案件を1件入力すると、月別売上・年間売上管理表（企業×12ヶ月）・講師別／代理店別／クライアント別集計・入金予定が自動で更新される**ことを中心ゴールとする。

- 利用形態: 社内 LAN 上の PC 1 台をサーバにして、複数人がブラウザから利用（MVP）。
- 既存 2026 年度データ（79件）を初期取り込みする。
- 将来はログイン/権限・請求書PDF・クラウド配備（PostgreSQL）へ拡張（Phase 2）。

## 2. 既存 Excel の構造（把握済み）

| シート | 役割 | 件数 |
|---|---|---|
| 案件入力 | 案件の生入力 | 79 |
| ①案件日付別管理 | 案件を日付順に並べたもの（**取り込み元**） | 79 |
| ②案件別売上 | 月別・クライアント別・講師別・代理店別・入金の集計（数式） | 24 |
| 年間売上管理表 | 企業×12ヶ月マトリクス（数式・派生） | 99 |
| クライアントリスト | 企業/講師/代理店のマスタ一覧 | 21 |

案件行の列構成（取り込み元）:
`売上月(月末日) | 実施日(日付け) | 代理店 | 企業名 | 研修名 | 講師 | 研修費用 | 交通費 | その他 | 消費税 | 請求額 | 講師料 | 入金予定日 | サポートスタッフ`

## 3. 確定した業務ルール

- **年度**: 4月〜翌3月（2026年度 = 2026-04 〜 2027-03）。全画面で年度切替可能。
- **消費税** = 研修費用 × 10%（交通費・その他は非課税扱い）。自動計算・手修正可。
- **請求額** = 研修費用 + 交通費 + その他 + 消費税。自動計算・手修正可。
- **売上月**: 実施日の属する月（月末日）を自動セット。手修正可（請求月がずれる場合に対応）。年間売上管理表の集計キー。
- **入金管理**: 入金予定日に加え「入金状況（未入金/入金済）」「入金日」を持ち、未入金一覧・入金予定（月別）を出す。
- **マスタ**: 企業/講師/代理店は「プルダウン選択＋その場で新規追加（自由入力）」の両対応。表記ゆれ防止しつつ柔軟。

## 4. 技術方式

**FastAPI（Python）+ React（TypeScript）+ SQLite**（CLAUDE.md 準拠）。

- Backend: FastAPI、SQLite（`accounting.db`）。ローカル保存箇所は後で差し替えやすいよう設定で分離。
- Frontend: React + TypeScript（Vite）。
- 同時利用: 社内 LAN の 1 台をサーバとして複数ブラウザから利用。SQLite は低書き込み量の社内利用に十分。将来 PostgreSQL へ移行可能な構成にする。
- 認証は Phase 2。MVP は社内 LAN 限定で認証なし。

## 5. データモデル

### 5.1 deals（案件）
| 項目 | 型 | 備考 |
|---|---|---|
| id | int PK | |
| fiscal_year | int | 年度（例: 2026）。売上月から導出して保存 |
| revenue_month | date | 売上月（月末日）。集計キー |
| held_on | date | 実施日 |
| agency | text null | 代理店名 |
| client | text | 企業名（必須） |
| training_name | text null | 研修名 |
| instructor | text null | 講師名 |
| fee | int | 研修費用 |
| transport | int default 0 | 交通費 |
| other | int default 0 | その他 |
| tax | int | 消費税（既定: fee×10%、手修正可） |
| billing | int | 請求額（既定: fee+transport+other+tax、手修正可） |
| instructor_fee | int default 0 | 講師料 |
| payment_due | date null | 入金予定日 |
| payment_status | text | 'unpaid' / 'paid'（既定 'unpaid'） |
| paid_on | date null | 入金日 |
| support_staff | text null | サポートスタッフ |
| note | text null | 備考 |
| created_at / updated_at | datetime | |

### 5.2 マスタ（clients / instructors / agencies）
各テーブル: `id, name(unique), active(bool), created_at`。
案件保存時、未登録の名称が来たら自動でマスタへ追加（自由入力対応）。

## 6. API（FastAPI）

- `GET /api/deals` … 一覧（query: fiscal_year, month, client, instructor, agency, payment_status, q）
- `POST /api/deals` / `PUT /api/deals/{id}` / `DELETE /api/deals/{id}`
- `POST /api/deals/{id}/pay` … 入金済みにする（paid_on セット）
- `GET /api/summary/monthly?fiscal_year=` … 月別売上（ダッシュボード用）
- `GET /api/summary/annual?fiscal_year=` … 年間売上管理表（企業×12ヶ月 + 合計/月計）
- `GET /api/summary/by?dim=instructor|agency|client&from=&to=` … 軸別集計
- `GET /api/payments?status=unpaid&fiscal_year=` … 入金管理
- `GET /api/masters/{clients|instructors|agencies}` / `POST` / `PUT` / `DELETE`
- `POST /api/import/excel` … 既存 xlsx 取り込み（初期1回）
- `GET /api/export/excel?fiscal_year=` … Excel エクスポート

金額の自動計算（tax/billing/fiscal_year/revenue_month）は backend のサービス層で一元化し、フロントは保存前プレビューに同じロジックを持つ（不一致を防ぐためルールは1箇所＝APIが正）。

## 7. 画面構成（Excel 各シートに対応）

1. **ダッシュボード**: 年度切替、月別売上グラフ（棒）、年度合計、未入金合計、今月の入金予定一覧。
2. **案件一覧**: 絞り込み（年度/月/企業/講師/代理店/入金状況）＋検索、行クリックで編集、入金状況バッジ。
3. **案件登録/編集**: フォーム。研修費用入力で消費税・請求額を即時プレビュー。企業/講師/代理店はマスタ選択＋新規追加。必須/任意明示、即時バリデーション。
4. **年間売上管理表**: 企業×12ヶ月マトリクス（Excelそのまま）、合計列・月計行。年度切替。
5. **集計ビュー**: 講師別／代理店別／クライアント別（期間指定、シェア率付き）。
6. **入金管理**: 未入金一覧、入金予定（月別）、「入金済みにする」操作。
7. **マスタ管理**: 企業/講師/代理店の一覧・追加・編集・無効化。
8. **Excel連携**: 既存xlsxの初期取り込み（1回）＋ Excelエクスポート。

UI 方針（CLAUDE.md 8章準拠）: 主CTAは1つ、状態表示（loading/empty/error）必須、エラーは原因＋直し方＋該当項目フォーカス、日本語業務用語（案件/見積/請求/備考）。

## 8. Excel 取り込み仕様

- 取り込み元: 「①案件日付別管理」シート（日付順、79件）。
- 各行を deals に変換。tax/billing が空なら自動計算、入っていればその値を尊重。
- 企業/講師/代理店はマスタへ自動登録。
- クライアントリストシートからマスタ（企業/講師/代理店）も補完登録。
- 取り込みは冪等になるよう、再実行時は全件洗い替え（初期化）オプションを用意。

## 9. エラー処理・テスト

- バリデーション: client 必須、金額は0以上の整数、日付妥当性。API でエラー時は項目名＋理由を返す。
- テスト: 金額計算（tax/billing）・売上月導出・年度導出・集計（月別/年間/軸別）・取り込み変換のユニットテストを backend に置く（pytest）。

## 10. フェーズ

- **Phase 1（今回）**: 第5〜9章すべて。ローカル/社内LANで動く完全版。
- **Phase 2（後日）**: ログイン/権限（RBAC）、請求書PDF出力、クラウド配備（PostgreSQL）、監査ログ。

## 11. 影響範囲・戻し方

- 新規プロジェクト（`accounting/` 配下）。既存コードへの影響なし。
- 戻し方: 当該コミットを revert、または `accounting/` を破棄。DB は `accounting.db` ファイル単位で退避/削除可能。
