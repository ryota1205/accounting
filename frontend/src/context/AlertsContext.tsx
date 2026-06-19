import { createContext, useCallback, useContext, useEffect, useState, ReactNode } from "react";
import { useFiscalYear } from "./FiscalYearContext";
import { useAuth } from "./AuthContext";
import { api } from "../api/client";
import { paymentAlert } from "../lib/deal";

// 未入金アラート（＝遅延：overdue + long_overdue）の件数を全画面で共有する。
type Ctx = { alertCount: number; refresh: () => void };
const AlertsContext = createContext<Ctx>({ alertCount: 0, refresh: () => {} });

export function AlertsProvider({ children }: { children: ReactNode }) {
  const { fiscalYear } = useFiscalYear();
  const { user } = useAuth();
  const [alertCount, setAlertCount] = useState(0);

  const refresh = useCallback(() => {
    if (!user) { setAlertCount(0); return; }   // 未ログイン時は取得しない
    const today = new Date();
    api.listDeals({ fiscal_year: fiscalYear })
      .then((ds) => {
        const n = ds.filter((d) =>
          ["overdue", "long_overdue"].includes(paymentAlert(d, today))).length;
        setAlertCount(n);
      })
      .catch(() => { /* 失敗時はバッジを出さない */ });
  }, [fiscalYear, user]);

  useEffect(refresh, [refresh]);

  return (
    <AlertsContext.Provider value={{ alertCount, refresh }}>
      {children}
    </AlertsContext.Provider>
  );
}

export function useAlerts() {
  return useContext(AlertsContext);
}
