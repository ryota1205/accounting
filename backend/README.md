# 研修売上管理 バックエンド

FastAPI + SQLModel + SQLite の REST API。

## セットアップ
```powershell
cd backend
python -m venv .venv
.\.venv\Scripts\python.exe -m pip install -r requirements.txt
```

## 起動
```powershell
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```
- API ドキュメント: http://localhost:8000/docs
- DB ファイル: `accounting.db`（環境変数 `ACCOUNTING_DB` で変更可、例: `sqlite:///./accounting.db`）
- 起動時に lifespan で `init_db()` が走り、テーブルを自動作成します。

## テスト
```powershell
.\.venv\Scripts\python.exe -m pytest -q
```

## 既存Excelの取り込み
`/docs` の `POST /api/import/excel`（`wipe=true` で洗い替え）に
`2026年度研修売上管理表_アカデミージャパン.xlsx` をアップロードします。
「①案件日付別管理」シートを読み込み、案件と企業/講師/代理店マスタを登録します。

PowerShell からの例:
```powershell
$f = "C:\Users\川西竜太\Downloads\2026年度研修売上管理表_アカデミージャパン.xlsx"
curl.exe -F "file=@$f" "http://localhost:8000/api/import/excel?wipe=true"
```

## ログイン / 認証
- 起動時に2アカウントを自動作成（初回のみ）。**初期パスワードはログイン後に変更してください。**
  - 管理者: `admin` / `admin1234`（全権）
  - 担当者: `staff` / `staff1234`（案件一覧・入金管理のみ）
- ログイン: `POST /api/auth/login`（`{username, password}` → `{token, user}`）。以後の API は `Authorization: Bearer <token>` が必要。
- 自分情報: `GET /api/auth/me` / パスワード変更: `POST /api/auth/change-password`。
- トークンは HMAC 署名（有効7日・ステートレス）。署名鍵は環境変数 `ACCOUNTING_SECRET` を優先し、未設定なら `backend/.secret` を自動生成して再利用（gitignore 済み）。
- 権限: `admin` は全 API、`staff` は案件(`/api/deals`)・入金(`/api/payments`)・マスタ/確度の参照(GET)のみ。損益/集計/設定/Excel/マスタ書込は admin 限定。

## 外部公開（インターネット）で使う場合のセキュリティ
外部から使うときは必ず以下を満たすこと。

1. **HTTPS 必須**：HTTP のままだとパスワード/トークンが盗聴され得る。リバースプロキシで TLS 終端する。
   - 例（Caddy なら自動で Let's Encrypt 証明書取得・更新）。`Caddyfile`:
     ```
     your-domain.example.com {
         handle /api/* {
             reverse_proxy 127.0.0.1:8000
         }
         handle {
             reverse_proxy 127.0.0.1:5173   # 本番は frontend を build して静的配信を推奨
         }
     }
     ```
   - Cloudflare Tunnel を使う場合は、Tunnel が TLS を担うのでオリジンは HTTP のままでよい（さらに Cloudflare Access でメール認証ゲートも追加可能）。
2. **初期パスワードを変更**：`admin1234`/`staff1234` は推測されやすい。初回ログイン後に**変更が強制**される（変更するまで操作不可）。
3. **署名鍵を固定**：`ACCOUNTING_SECRET`（32文字以上推奨）を環境変数で設定する。未設定だと `backend/.secret` を自動生成。
4. **総当たり対策**：ログイン5回失敗で15分ロック（実装済み）。
5. 余力があれば：アクセス元 IP 制限、VPN 内のみ公開、`noindex`（実装済み）。

## 本番デプロイ（同一サブドメイン・推奨構成）
フロントとバックを**1つのサブドメイン**の裏で同居させる（同一オリジン＝CORS不要・コード変更不要）。
例：`accounting.example.com`。

### 1) フロントをビルド（静的ファイル）
```powershell
cd frontend
npm install
npm run build      # frontend/dist/ に出力
```

### 2) バックエンドを起動（署名鍵を固定して常駐）
```powershell
cd backend
$env:ACCOUNTING_SECRET = "（32文字以上のランダム文字列）"
.\.venv\Scripts\python.exe -m uvicorn app.main:app --host 127.0.0.1 --port 8000
```
- DB は `accounting.db`。バックアップ対象にする。
- 常駐化は Windows なら「タスク スケジューラ」や NSSM 等でサービス化。

### 3) Caddy で HTTPS 終端＋ルーティング（`Caddyfile`）
```
accounting.example.com {
    encode gzip

    # API はバックエンドへ
    handle /api/* {
        reverse_proxy 127.0.0.1:8000
    }

    # それ以外はビルド済みフロントを配信（SPA なので未知パスは index.html へ）
    handle {
        root * /path/to/frontend/dist
        try_files {path} /index.html
        file_server
    }
}
```
- Caddy が Let's Encrypt 証明書を**自動取得・自動更新**（DNS の A/AAAA をサーバーに向けておく）。
- フロントは相対パス `/api/...` を叩くため、ドメインが変わっても**コード変更不要**。

### 4) さらに堅くするなら（任意）
- **Cloudflare Tunnel + Access**：サーバーを直接公開せず、Cloudflare 側でメール認証ゲートを追加（ログインの手前にもう一枚）。
- IP 許可リスト（Caddy の `@allowed` matcher 等）。

## 主なエンドポイント
- 案件: `GET/POST /api/deals`, `GET/PUT/DELETE /api/deals/{id}`, `POST /api/deals/{id}/pay`
- マスタ: `GET/POST /api/masters/{clients|instructors|agencies}`, `PUT/DELETE .../{id}`
- 設定(月額固定費): `GET/PUT /api/settings/{fiscal_year}`
- 集計: `GET /api/summary/{monthly|annual|by|pl}`
- 入金: `GET /api/payments?status=unpaid&fiscal_year=`
- Excel: `POST /api/import/excel`, `GET /api/export/excel?fiscal_year=`

## 計算ルール
- 消費税 = 研修費用 × 10%（円未満切り捨て）
- 請求額 = 研修費用 + 交通費 + その他 + 消費税
- 売上月 = 実施日の月末（未指定時）。年度 = 4月〜翌3月
- 損益: 売上(税抜)=研修費用+交通費+その他 / 変動費=講師料 / 年間固定費=月額×12
