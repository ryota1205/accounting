# ログイン機能 実装計画

- 対象仕様: [2026-06-19-login-authentication-design.md](../specs/2026-06-19-login-authentication-design.md)
- 方針: 最小差分・追加依存なし・各フェーズで検証してから次へ。バックエンドは `--reload` なしのため反映時は再起動。

## 進め方の原則
- バックエンド先行 → フロント。各フェーズ末で pytest / typecheck / 手動確認を通す。
- 既存APIレスポンス形式は変えない（ヘッダ追加と新規エンドポイントのみ）。

---

## Phase 0: 準備
**ファイル**: `backend/.gitignore`（or ルート `.gitignore`）
- `backend/.secret` を gitignore に追加（署名鍵ファイルをコミットしない）。
- 追加依存なし（`requirements.txt` 変更不要）。

**検証**: `git status` で `.secret` が追跡対象外になること（鍵生成後に確認）。

---

## Phase 1: バックエンド認証コア
**新規 `backend/app/auth.py`**
- `hash_password(password, salt=None) -> (hash_hex, salt_hex)`: `hashlib.pbkdf2_hmac("sha256", pw.encode(), bytes.fromhex(salt), 100_000)`。
- `verify_password(password, salt_hex, hash_hex) -> bool`: 再計算して `hmac.compare_digest`。
- `_secret() -> bytes`: env `ACCOUNTING_SECRET` 優先、無ければ `backend/.secret` を読み込み／無ければ `secrets.token_hex(32)` を生成して保存。
- `make_token(username, role, days=7) -> str`: payload=`{"u","r","exp"}` を JSON→base64url、`HMAC-SHA256` 署名を base64url 連結。
- `parse_token(token) -> dict | None`: 署名検証＋期限チェック。失敗は None。
- FastAPI 依存:
  - `get_current_user(authorization: str = Header(None), session=Depends(get_session)) -> User`: Bearer 抽出→`parse_token`→User 取得。失敗で `HTTPException(401)`。
  - `require_admin(user=Depends(get_current_user))`: `role != "admin"` で `HTTPException(403)`。

**`backend/app/models.py`**: `User` テーブル追加（username unique index, name, password_hash, salt, role, created_at, updated_at）。

**`backend/app/db.py`**: `init_db()` のシードに User 2件（admin/staff）を「存在しなければ作成」。`auth.hash_password` を使用。既存の簡易マイグレーション方針に追従（新規テーブルは `create_all` で作成される想定／必要なら明示作成）。

**テスト `backend/tests/test_auth_core.py`**（新規）
- hash/verify 正誤。
- make→parse 正常、署名改ざん→None、期限切れ→None。

**検証**: `.venv/Scripts/python.exe -m pytest tests/test_auth_core.py -q` 緑。

---

## Phase 2: 認証ルーター
**新規 `backend/app/routers/auth.py`** prefix `/api/auth`
- `POST /login` `{username,password}` → 照合成功で `{token, user:{username,name,role}}`、失敗 401。
- `GET /me`（要 `get_current_user`）→ `{username,name,role}`。
- `POST /change-password` `{current_password,new_password}`（要 `get_current_user`）→ 現PW照合→新PWで更新。失敗 400/401。

**`backend/app/main.py`**: `auth.router` を include。

**テスト `backend/tests/test_auth_api.py`**
- login 正常→token、誤PW→401。
- me: 有効token→200、無効→401。
- change-password: 正常後に新PWでlogin可・旧PW不可。

**検証**: pytest 緑。バックエンド再起動して `curl POST /api/auth/login` で token 取得を実機確認。

---

## Phase 3: ルーターにアクセス制御を付与
各ルーターに `dependencies=[Depends(...)]` を付与（最小改変）。
- 認証のみ（admin/staff 両方, `get_current_user`）:
  - `deals`（list/get/create/update/delete/pay）
  - `payments`（GET）
  - `masters` の **GET のみ**／`confidence` の **GET のみ**（エンドポイント単位で付与）
- admin 限定（`require_admin`）:
  - `masters` の POST/PUT/DELETE、`confidence` の POST/PUT
  - `settings`（月次固定費含む）、`summary`、`activity`、`io_excel`
- 公開: `auth/login`、`/api/health`

> マスタ/確度は GET と書込で必要権限が異なるため、ルーター全体ではなくエンドポイント単位で依存を付ける。

**テスト `backend/tests/test_authz.py`**
- staff token: `/api/deals` GET/POST=200、`/api/summary/pl`=403、`/api/settings`=403、`GET /api/masters/clients`=200、`POST /api/masters/clients`=403。
- admin token: 上記すべて 200。
- 未認証: 保護APIで 401。

**検証**: pytest 緑（既存テストも全て緑のまま＝認証導入で壊れないこと。既存テストはトークン付与のヘルパーを追加して対応）。

---

## Phase 4: フロント APIクライアント
**`frontend/src/api/client.ts`**
- token を localStorage（`auth_token`）から読み、全リクエストに `Authorization: Bearer` を付与。
- レスポンス 401 → token 破棄＋ `window.location` を `/login` へ（または共通イベント発火）。
- 追加: `api.login(username,password)`, `api.me()`, `api.changePassword(cur,next)`。
- 型 `AuthUser = {username,name,role:"admin"|"staff"}` を `types.ts` に追加。

**検証**: `npm run typecheck` 緑。

---

## Phase 5: 認証コンテキスト・ログイン画面・ルートガード
**新規 `frontend/src/context/AuthContext.tsx`**: `user|null`, `login()`, `logout()`, 起動時 token があれば `me()` で復元（復元中はローディング）。
**新規 `frontend/src/pages/Login.tsx`**: ID/PW入力・エラー表示・ローディング。成功でロール別ホームへ。
**新規 `frontend/src/components/ProtectedRoute.tsx`**: 未ログイン→/login、権限外URL→自分のホーム（admin=/dashboard, staff=/deals）。
**`frontend/src/main.tsx`**: `AuthProvider` を `FiscalYearProvider` の外側に追加。
**`frontend/src/App.tsx`**: `/login` ルート追加、各ページを `ProtectedRoute`（必要ロール指定）でラップ。

**検証**: 未ログインで `/dashboard`→`/login` に飛ぶこと、admin/staff でログインできること（手動・preview）。

---

## Phase 6: メニュー出し分け・トップバー・パスワード変更
**`frontend/src/components/Layout.tsx`**
- `useAuth()` でロール取得。`MENU_GROUPS` を許可ルートでフィルタ（staff=`/deals`,`/payments` のみ）。空グループの見出しは非表示。
- トップバーに「表示名・ロール・ログアウト」。
**パスワード変更**: トップバーから開く簡易フォーム（本人）。`api.changePassword`。成功/失敗トースト。
**`frontend/src/pages/Deals.tsx`**: 案件削除ボタンは staff も可（仕様どおり。変更不要）。

**検証**: admin=全メニュー、staff=2項目のみ＆他URLリダイレクト、ログアウトで /login（preview/DOM確認）。

---

## Phase 7: 仕上げ・ドキュメント
- `backend/README.md` に「初期アカウント（admin/staff・初期PW）」「ログイン手順」「ACCOUNTING_SECRET」を追記。
- バックエンド再起動、フロント typecheck、主要フロー手動確認（admin/staff ログイン→画面制限→ログアウト）。
- 既存の全 pytest 緑を最終確認。

---

## リスク・注意
- 既存 pytest はAPIを直接叩くため、認証導入で 401 になり得る。**テスト用の認証ヘルパー（トークン生成 or テスト時バイパス）**を用意して既存テストを通す（Phase 3 で対応）。
- バックエンドは `--reload` なし起動のため、各バックエンド変更後は再起動して検証。
- 署名鍵 `.secret` は gitignore。env `ACCOUNTING_SECRET` 指定時はそちら優先。

## 戻し方
- 本機能の各コミットを revert（仕様コミットは別）。
