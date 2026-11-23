import { describe, it, expect } from "vitest";
import { computeDirectionalMaeMfe } from "../lib/market/math";

describe("Directional MAE / MFE and Exit Efficiency", () => {
  it("calculates LONG trade MAE, MFE, and Exit Efficiency correctly", () => {
    // LONG: Entry 21000, Stop 20980 (20 pts risk), Exit 21050 (+50 pts profit = +2.50R)
    // Worst heat: dipped to 20992 (8 pts drawdown heat = 0.40R MAE)
    // Best run: peaked at 21060 (60 pts peak profit = 3.00R MFE)
    const res = computeDirectionalMaeMfe("LONG", 21000, 20980, 21050, 20992, 21060);

    expect(res.actualPnlR).toBe(2.5);
    expect(res.maeR).toBe(0.4);
    expect(res.mfeR).toBe(3.0);
    // Exit efficiency = (2.5 / 3.0) * 100 ≈ 83.3%
    expect(res.exitEfficiencyPercent).toBe(83.3);
  });

  it("calculates SHORT trade MAE, MFE, and Exit Efficiency correctly", () => {
    // SHORT: Entry 21050, Stop 21075 (25 pts risk), Exit 21000 (+50 pts profit = +2.00R)
    // Worst heat: spiked up to 21060 (10 pts adverse excursion = 0.40R MAE)
    // Best run: dipped down to 20990 (60 pts peak excursion = 2.40R MFE)
    const res = computeDirectionalMaeMfe("SHORT", 21050, 21075, 21000, 21060, 20990);

    expect(res.actualPnlR).toBe(2.0);
    expect(res.maeR).toBe(0.4);
    expect(res.mfeR).toBe(2.4);
    // Exit efficiency = (2.0 / 2.4) * 100 ≈ 83.3%
    expect(res.exitEfficiencyPercent).toBe(83.3);
  });

  it("handles stopped-out losses without negative efficiency", () => {
    // LONG: Entry 21000, Stop 20980 (20 pts risk), Exit 20980 (stopped out at -1.0R)
    // Worst heat: 20980 (20 pts adverse = 1.0R MAE)
    // Best run: reached 21005 (5 pts = 0.25R MFE)
    const res = computeDirectionalMaeMfe("LONG", 21000, 20980, 20980, 20980, 21005);

    expect(res.actualPnlR).toBe(-1.0);
    expect(res.maeR).toBe(1.0);
    expect(res.mfeR).toBe(0.25);
    expect(res.exitEfficiencyPercent).toBe(0);
  });
});
