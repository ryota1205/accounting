import { createContext, useContext, useState, ReactNode } from "react";

type Ctx = { fiscalYear: number; setFiscalYear: (y: number) => void };
const FiscalYearContext = createContext<Ctx | null>(null);

export function FiscalYearProvider({ children }: { children: ReactNode }) {
  const [fiscalYear, setFiscalYear] = useState(2026);
  return (
    <FiscalYearContext.Provider value={{ fiscalYear, setFiscalYear }}>
      {children}
    </FiscalYearContext.Provider>
  );
}

export function useFiscalYear() {
  const ctx = useContext(FiscalYearContext);
  if (!ctx) throw new Error("useFiscalYear must be used within FiscalYearProvider");
  return ctx;
}
