import { describe, it, expect } from "vitest";
import {
  classify, elapsedMonths, fiscalYearOf, annualize, laborEstimate, markerPosition,
} from "./kpi";
import { Benchmark } from "./benchmarks";

const higher: Benchmark = { key: "h", label: "h", unit: "pct", dir: "higher", warnLo: 0.4, safeLo: 0.5 };
const lower: Benchmark = { key: "l", label: "l", unit: "pct", dir: "lower", safeHi: 0.3, warnHi: 0.5 };
const band: Benchmark = { key: "b", label: "b", unit: "pct", dir: "band", warnLo: 0.1, safeLo: 0.2, safeHi: 0.35, warnHi: 0.5 };

describe("classify", () => {
  it("higher: 境界値を含めて安全/注意/危険を返す", () => {
    expect(classify(0.6, higher)).toBe("safe");
    expect(classify(0.5, higher)).toBe("safe");   // 安全域の下限は安全
    expect(classify(0.45, higher)).toBe("warn");
    expect(classify(0.4, higher)).toBe("warn");   // 注意域の下限は注意
    expect(classify(0.39, higher)).toBe("danger");
  });
  it("lower: 小さいほど良い", () => {
    expect(classify(0.2, lower)).toBe("safe");
    expect(classify(0.3, lower)).toBe("safe");
    expect(classify(0.4, lower)).toBe("warn");
    expect(classify(0.5, lower)).toBe("warn");
    expect(classify(0.51, lower)).toBe("danger");
  });
  it("band: 範囲内が安全、外側に向けて注意→危険", () => {
    expect(classify(0.28, band)).toBe("safe");
    expect(classify(0.15, band)).toBe("warn");   // safe未満だが warn域
    expect(classify(0.45, band)).toBe("warn");   // safe超だが warn域
    expect(classify(0.05, band)).toBe("danger"); // warnLo未満
    expect(classify(0.6, band)).toBe("danger");  // warnHi超
  });
  it("null/NaN は判定不能", () => {
    expect(classify(null, higher)).toBeNull();
    expect(classify(undefined, higher)).toBeNull();
    expect(classify(NaN, higher)).toBeNull();
  });
});

describe("markerPosition", () => {
  it("0〜1にクランプされる", () => {
    expect(markerPosition(-999, higher)).toBe(0);
    expect(markerPosition(999, higher)).toBe(1);
    const mid = markerPosition(0.45, higher);
    expect(mid).toBeGreaterThan(0);
    expect(mid).toBeLessThan(1);
  });
  it("null は null", () => {
    expect(markerPosition(null, higher)).toBeNull();
  });
});

describe("fiscalYearOf（4月開始）", () => {
  it("4月以降は当年、3月以前は前年", () => {
    expect(fiscalYearOf(new Date(2026, 6, 15))).toBe(2026);  // 7月
    expect(fiscalYearOf(new Date(2026, 3, 1))).toBe(2026);   // 4月
    expect(fiscalYearOf(new Date(2026, 2, 31))).toBe(2025);  // 3月
    expect(fiscalYearOf(new Date(2027, 0, 1))).toBe(2026);   // 1月
  });
});

describe("elapsedMonths", () => {
  const today = new Date(2026, 6, 15); // 2026-07 → FY2026, 4..7=4ヶ月
  it("現在年度は4月から当月まで", () => {
    expect(elapsedMonths(2026, today)).toBe(4);
  });
  it("過去年度は12", () => {
    expect(elapsedMonths(2025, today)).toBe(12);
  });
  it("未来年度は0", () => {
    expect(elapsedMonths(2027, today)).toBe(0);
  });
});

describe("annualize", () => {
  it("実績÷経過月×12", () => {
    expect(annualize(400, 4)).toBe(1200);
  });
  it("経過0は null", () => {
    expect(annualize(400, 0)).toBeNull();
  });
});

describe("laborEstimate", () => {
  it("粗利×労働分配率÷従業員数で1人当たりを出す", () => {
    const r = laborEstimate({ gross: 100_000_000, laborShare: 0.5, headcount: 5, bonusMonths: 2, execCompAnnual: 0 });
    expect(r.total).toBe(50_000_000);
    expect(r.employeePool).toBe(50_000_000);
    expect(r.perHeadAnnual).toBe(10_000_000);
    expect(r.monthly).toBeCloseTo(10_000_000 / 14, 5);
    expect(r.bonus).toBeCloseTo((10_000_000 / 14) * 2, 5);
  });
  it("役員報酬は総額から別枠で差し引く", () => {
    const r = laborEstimate({ gross: 100_000_000, laborShare: 0.5, headcount: 4, bonusMonths: 2, execCompAnnual: 10_000_000 });
    expect(r.total).toBe(50_000_000);
    expect(r.employeePool).toBe(40_000_000);
    expect(r.perHeadAnnual).toBe(10_000_000);
  });
  it("従業員数0なら1人当たりは null（総額のみ）", () => {
    const r = laborEstimate({ gross: 100_000_000, laborShare: 0.5, headcount: 0, bonusMonths: 2, execCompAnnual: 0 });
    expect(r.total).toBe(50_000_000);
    expect(r.perHeadAnnual).toBeNull();
    expect(r.monthly).toBeNull();
  });
  it("粗利0以下なら総額0", () => {
    const r = laborEstimate({ gross: -100, laborShare: 0.5, headcount: 5, bonusMonths: 2, execCompAnnual: 0 });
    expect(r.total).toBe(0);
    expect(r.perHeadAnnual).toBe(0);
  });
});
