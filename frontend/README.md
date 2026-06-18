# 研修売上管理 フロントエンド

## セットアップ
```powershell
cd accounting/frontend
npm install
```

## 開発起動（先にバックエンドを8000で起動しておく）
```powershell
npm run dev
```
ブラウザ: http://localhost:5173 （`/api` は 8000 のバックエンドへプロキシ）

## 本番ビルド
```powershell
npm run build
```
`dist/` を社内サーバで配信し、`/api` をバックエンドへリバースプロキシする（Phase2）。

## テスト
```powershell
npx vitest run
```
