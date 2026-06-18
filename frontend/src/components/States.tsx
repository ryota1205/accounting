export function Loading({ label = "読み込み中…" }: { label?: string }) {
  return <div className="state">{label}</div>;
}
export function Empty({ label = "データがありません" }: { label?: string }) {
  return <div className="state">{label}</div>;
}
export function ErrorState({ message }: { message: string }) {
  return <div className="state err">エラー: {message}</div>;
}
