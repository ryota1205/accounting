import { Role } from "../api/types";

// staff（担当者）がアクセスできるパス（前置一致。/deals は /deals/new・/deals/:id/edit も含む）
export const STAFF_PATHS = ["/deals", "/payments"];

export function canAccess(role: Role, path: string): boolean {
  if (role === "admin") return true;
  return STAFF_PATHS.some((p) => path === p || path.startsWith(p + "/"));
}

// ロール別のホーム（ログイン後の遷移先）
export function homeFor(role: Role): string {
  return role === "admin" ? "/dashboard" : "/deals";
}
