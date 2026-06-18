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
