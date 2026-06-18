import { describe, it, expect } from "vitest";
import { previewTax, previewBilling } from "./calc";

describe("calc preview", () => {
  it("税は研修費用の10%(切り捨て)", () => {
    expect(previewTax(450000)).toBe(45000);
    expect(previewTax(92600)).toBe(9260);
  });
  it("請求額は税抜合計+税", () => {
    expect(previewBilling(300000, 50000, 0, 30000)).toBe(380000);
  });
});
