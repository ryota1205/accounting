# ログイン機能（担当者2名・ロール別アクセス制御）設計仕様

- 日付: 2026-06-19
- 対象: 研修売上管理アプリ（Backend: FastAPI + SQLModel + SQLite / Frontend: React + TypeScript + Vite）
- 方針: CLAUDE.md に準拠（MVP・最小差分・追加依存なし・ローカル/社内LAN前提）

## 1. 目的・背景
担当者2名（管理者・担当者）で運用するにあたり、次を実現する。
- **アクセス制限**: 関係者だけがアプリを使える（API はサーバー側で保護）
- **権限の使い分け**: ロールで見える/触れる範囲を変える

利用環境は「別々のPC／ネットワーク越し」のため、フロントだけのゲートでは不十分（API が素通りになる）。**サーバー側認証**を採用する。

## 2. スコープ
### やること
- ユーザー認証（ログイン/ログアウト）
- 2ロール（admin / staff）によるアクセス制御（フロント表示＋バックエンド強制）
- 本人によるパスワード変更
- 初期2アカウントの自動作成（シード）

### やらないこと（Phase2以降）
- 管理者によるユーザー追加・他人のパスワードリセット・ユーザー管理画面
- 監査ログ（誰がいつ何をしたか）
- HTTPS化、ブルートフォース対策（アカウントロック）、トークンの個別失効
- 記録者の自動記録（created_by 等）

## 3. ロール定義
- **admin（管理者）**: 全画面・全操作が可能
- **staff（担当者）**: 「案件一覧（登録/編集/削除）」「入金管理」のみ。経営数値（損益・月次・軸別・分析・年間）、設定（固定費）、営業活動、マスタの追加/編集/削除、Excel取込/出力、確度掛け率編集は不可。

> 案件の「削除」は staff に許可する（入力担当として自分の案件を管理する想定）。後から admin 限定に変更可能。

## 4. データモデル
新規テーブル `User`（SQLModel, table=True）:

| カラム | 型 | 説明 |
|---|---|---|
| id | int PK | |
| username | str unique index | ログインID |
| name | str | 表示名（トップバー表示用） |
| password_hash | str | pbkdf2_hmac(sha256) の16進 |
| salt | str | ユーザーごとのソルト（16進） |
| role | str | "admin" \| "staff" |
| created_at / updated_at | datetime | |

### シード（初回起動時・`init_db` 内、存在しなければ作成）
- admin: username=`admin`, name=`管理者`, role=`admin`, 初期PW=`admin1234`
- staff: username=`staff`, name=`担当者`, role=`staff`, 初期PW=`staff1234`

初期パスワードは README に記載し、ログイン後の「パスワード変更」で変更する運用とする。

## 5. 認証方式（HMAC署名トークン・標準ライブラリのみ）
### パスワードハッシュ
- `hashlib.pbkdf2_hmac("sha256", password, salt, 100_000)`
- ソルトは `secrets.token_hex(16)`。照合は `hmac.compare_digest` で定数時間比較。

### トークン
- 形式: `base64url(payload).base64url(signature)`
  - payload(JSON): `{ "u": username, "r": role, "exp": <epoch秒> }`
  - signature: `HMAC-SHA256(secret, payloadビット列)`
- 有効期限: 発行から **7日**
- secret key: 環境変数 `ACCOUNTING_SECRET` を優先。未設定なら初回に `secrets.token_hex(32)` を生成し `backend/.secret` に保存して以後再利用（`.gitignore` 追加）。再起動後もトークン有効。

### エンドポイント
- `POST /api/auth/login` … body `{username, password}` → 成功時 `{token, user: {username, name, role}}` / 失敗時 401
- `GET /api/auth/me` … トークンから現在のユーザー情報を返す（フロント起動時の検証用）
- `POST /api/auth/change-password` … body `{current_password, new_password}` → 本人のPW変更（要認証）

## 6. バックエンド アクセス制御
### 依存関数（`app/auth.py` 新規）
- `get_current_user(Authorization ヘッダ) -> User`: Bearer トークンを検証（署名・期限・ユーザー存在）。失敗で 401。
- `require_admin(user = Depends(get_current_user))`: `role != "admin"` なら 403。

### 適用方針
ルーター単位で `dependencies=[Depends(...)]` を付与し、各エンドポイントを最小改変で保護する。

| ルーター / エンドポイント | 必要権限 |
|---|---|
| `POST /api/auth/login` | 公開（認証不要） |
| `GET /api/health` | 公開 |
| `/api/deals/*`（list/get/create/update/delete/pay） | 認証（admin/staff 両方） |
| `/api/payments`（GET） | 認証（両方） |
| `GET /api/masters/{kind}` | 認証（両方）※フォームの datalist 用 |
| `GET /api/confidence`（掛け率一覧） | 認証（両方）※フォームの確度表示用 |
| `POST/PUT/DELETE /api/masters/*` | admin |
| `POST/PUT /api/confidence` | admin |
| `/api/settings/*`（固定費・月次固定費含む） | admin |
| `/api/summary/*`（monthly/annual/by/pl/analysis 等） | admin |
| `/api/activity/*`（営業活動） | admin |
| `/api/import/excel`, `/api/export/excel` | admin |

> マスタ参照と確度参照は staff も GET 可能だが、書き込み系は admin のみ。staff が案件保存時に企業/講師/代理店マスタが必要になった場合は、`create_deal` 内の `register_masters`（バックエンド側の副作用）で自動登録されるため業務に支障はない。

CORS は現状 `allow_origins=["*"]` のまま（`Authorization` ヘッダは `allow_headers=["*"]` で許可済み）。

## 7. フロントエンド
### API クライアント（`src/api/client.ts`）
- 既存の `req`/fetch に **Authorization ヘッダ自動付与**（localStorage の token）を組み込む。
- レスポンス **401 → token 破棄し `/login` へ遷移**（イベント or 共通ハンドラ）。
- `api.login`, `api.me`, `api.changePassword` を追加。

### 認証コンテキスト（`src/context/AuthContext.tsx` 新規）
- `user`（{username,name,role} | null）, `login()`, `logout()`, 起動時に token があれば `me()` で復元。
- token は localStorage（キー例 `auth_token`）。

### 画面・ルーティング
- **`/login`**: ID・パスワード入力、エラー表示（原因＋やり直し）。ローディング表示。
- **ProtectedRoute**: 未ログインは `/login` へ。ログイン済みかつ権限外URLは自分のホームへリダイレクト。
- ロール別ホーム: admin=`/dashboard` / staff=`/deals`。
- **メニュー出し分け**（`Layout.tsx`）: ロールで `MENU_GROUPS` をフィルタ。staff は「案件一覧」「入金管理」のみ。アイテムが空になったグループの見出しは非表示。
- **トップバー**: 表示名＋ロール＋「ログアウト」。年度プルダウンは既存どおり。
- **パスワード変更**: トップバーのメニュー or 簡易画面（本人のみ）。

### staff が直接アクセスできるルート
`/login`, `/deals`, `/deals/new`, `/deals/:id/edit`, `/payments`。それ以外は `/deals` へリダイレクト。

> 既存の `AlertsContext`（未入金アラート）はグローバルに `listDeals` を呼ぶが、これは認証必須・両ロール可のため staff でも動作する。バッジは staff が見る「入金管理」に表示される。

## 8. 状態・エラー設計（UI/UX）
- ログイン失敗: 「IDまたはパスワードが違います」を入力欄下に赤字＋原因提示。
- 期限切れ/未ログインでAPIアクセス: 自動で `/login` へ。「再度ログインしてください」をトースト/メッセージ表示。
- パスワード変更: 成功トースト、失敗時は原因（現在のPW不一致など）。
- ローディング: ログイン中・保存中インジケータ。

## 9. テスト
### バックエンド（pytest）
- パスワードハッシュ/照合（正/誤）。
- トークン発行→検証（正常）、改ざん署名→401、期限切れ→401。
- `POST /api/auth/login` 正常/失敗。
- 認可: staff トークンで `/api/summary/pl` → 403、`/api/deals` GET/POST → 200。admin は全て 200。
- 未認証で保護APIアクセス → 401。
- `change-password`: 正常変更後に新PWでログイン可、旧PWで不可。

### フロント（手動・必要に応じて vitest）
- 未ログインで保護ページ→ /login。
- admin ログイン→全メニュー表示・ダッシュボード。
- staff ログイン→案件一覧/入金管理のみ・他URLはリダイレクト。
- ログアウトで token 破棄・/login。

## 10. 移行・互換
- 既存 API レスポンス形式は不変（ヘッダ付与のみ）。
- 既存データへの影響なし（User テーブル追加のみ、`init_db` の簡易マイグレーションに追従）。
- バックエンドは `--reload` なしのため、反映には再起動が必要。

## 11. 影響範囲・戻し方
- 影響範囲: backend（main/db/models/新規 auth・auth ルーター・各ルーターに依存付与）、frontend（client/新規 AuthContext・Login・ProtectedRoute・Layout・App ルーティング）。
- 戻し方: 本機能のコミットを revert。

## 12. 既定値・調整余地（オープン事項は既定で確定済み）
- 案件削除: staff 可（既定）。→ admin 限定にしたい場合は `/api/deals/{id}` DELETE を `require_admin` に。
- トークン有効期限: 7日（既定）。
- 初期パスワード: `admin1234` / `staff1234`（既定、README 記載、変更前提）。
