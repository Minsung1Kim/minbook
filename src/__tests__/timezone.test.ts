import { describe, it, expect } from "vitest";
import {
  getTimezoneConfig,
  getTimezoneCode,
  convertETTimeStringToZone,
  formatTimeWithZone,
  SupportedTimezone
} from "../lib/market/timezone";
import { getCMESessionInfo } from "../lib/market/sessionClock";

describe("Timezone Engine (ET, CT, PT)", () => {
  it("provides correct metadata for all three US timezones", () => {
    const et = getTimezoneConfig("America/New_York");
    expect(et.code).toBe("ET");
    expect(et.openTimeStr).toBe("9:30 AM");
    expect(et.retraceWindowRange).toBe("09:30–10:00 ET");

    const ct = getTimezoneConfig("America/Chicago");
    expect(ct.code).toBe("CT");
    expect(ct.openTimeStr).toBe("8:30 AM");
    expect(ct.retraceWindowRange).toBe("08:30–09:00 CT");

    const pt = getTimezoneConfig("America/Los_Angeles");
    expect(pt.code).toBe("PT");
    expect(pt.openTimeStr).toBe("6:30 AM");
    expect(pt.retraceWindowRange).toBe("06:30–07:00 PT");
  });

  it("converts ET economic calendar release times across timezones", () => {
    // 8:30 AM ET Macro Release
    const inET = convertETTimeStringToZone("08:30 AM", "America/New_York", "2026-11-24");
    expect(inET).toBe("8:30 AM ET");

    const inCT = convertETTimeStringToZone("08:30 AM", "America/Chicago", "2026-11-24");
    expect(inCT).toBe("7:30 AM CT");

    const inPT = convertETTimeStringToZone("08:30 AM", "America/Los_Angeles", "2026-11-24");
    expect(inPT).toBe("5:30 AM PT");

    // 10:00 AM ET ISM Release
    expect(convertETTimeStringToZone("10:00 AM", "America/New_York", "2026-11-24")).toBe("10:00 AM ET");
    expect(convertETTimeStringToZone("10:00 AM", "America/Chicago", "2026-11-24")).toBe("9:00 AM CT");
    expect(convertETTimeStringToZone("10:00 AM", "America/Los_Angeles", "2026-11-24")).toBe("7:00 AM PT");
  });

  it("aligns getCMESessionInfo session labels and milestones with selected timezone", () => {
    // Mon 20:20 ET = 19:20 CT = 17:20 PT
    const testDate = new Date("2026-11-23T20:20:00-05:00");

    const etInfo = getCMESessionInfo(testDate, "America/New_York");
    expect(etInfo.targetTradeDateFormatted).toContain("9:30 AM ET OPEN");
    expect(etInfo.nextMilestoneLabel).toBe("9:30 AM ET Open");

    const ctInfo = getCMESessionInfo(testDate, "America/Chicago");
    expect(ctInfo.targetTradeDateFormatted).toContain("8:30 AM CT OPEN");
    expect(ctInfo.nextMilestoneLabel).toBe("8:30 AM CT Open");

    const ptInfo = getCMESessionInfo(testDate, "America/Los_Angeles");
    expect(ptInfo.targetTradeDateFormatted).toContain("6:30 AM PT OPEN");
    expect(ptInfo.nextMilestoneLabel).toBe("6:30 AM PT Open");
  });
});
