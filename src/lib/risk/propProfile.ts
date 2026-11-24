import { PropProfile, DrawdownMode } from "@/types/market";

export type { PropProfile, DrawdownMode };

export const PROP_PRESETS: Record<string, PropProfile> = {
  Topstep_EOD: {
    id: "Topstep_EOD",
    firmName: "Topstep",
    accountName: "Topstep $50k Express",
    drawdownMode: "EOD_TRAILING",
    maxTrailingDrawdown: 2000,
    currentRemainingDrawdown: 2000,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 50,
    dailyLossLimit: 1000,
    mnqFeeRoundTrip: 1.40,
    nqFeeRoundTrip: 4.54,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 0, // Topstep allows trading news
    prohibitOvernight: true
  },
  Tradeify_EOD: {
    id: "Tradeify_EOD",
    firmName: "Tradeify",
    accountName: "Tradeify $50k Growth",
    drawdownMode: "EOD_TRAILING",
    maxTrailingDrawdown: 2500,
    currentRemainingDrawdown: 2500,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 40,
    dailyLossLimit: 1250,
    mnqFeeRoundTrip: 1.24,
    nqFeeRoundTrip: 4.20,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 0,
    prohibitOvernight: true
  },
  Apex_EOD: {
    id: "Apex_EOD",
    firmName: "Apex Trader Funding",
    accountName: "Apex $50k EOD",
    drawdownMode: "EOD_TRAILING",
    maxTrailingDrawdown: 2500,
    currentRemainingDrawdown: 2500,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 30,
    mnqFeeRoundTrip: 1.24,
    nqFeeRoundTrip: 4.20,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 0,
    prohibitOvernight: true
  },
  Apex_Intraday: {
    id: "Apex_Intraday",
    firmName: "Apex Trader Funding",
    accountName: "Apex $50k Intraday Trailing",
    drawdownMode: "INTRADAY_UNREALIZED",
    maxTrailingDrawdown: 2500,
    currentRemainingDrawdown: 2500,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 30,
    mnqFeeRoundTrip: 1.24,
    nqFeeRoundTrip: 4.20,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 0,
    prohibitOvernight: true
  },
  TPT_PRO_Intraday: {
    id: "TPT_PRO_Intraday",
    firmName: "Take Profit Trader",
    accountName: "TPT $50k Pro",
    drawdownMode: "INTRADAY_UNREALIZED",
    maxTrailingDrawdown: 2000,
    currentRemainingDrawdown: 2000,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 50,
    dailyLossLimit: 1100,
    mnqFeeRoundTrip: 1.30,
    nqFeeRoundTrip: 4.40,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 1, // ±1m Tier 1 blackout
    prohibitOvernight: true
  },
  MFFU_Rapid_Intraday: {
    id: "MFFU_Rapid_Intraday",
    firmName: "MyFundedFutures",
    accountName: "MFFU $50k Rapid",
    drawdownMode: "INTRADAY_UNREALIZED",
    maxTrailingDrawdown: 2000,
    currentRemainingDrawdown: 2000,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 40,
    dailyLossLimit: 1200,
    mnqFeeRoundTrip: 1.24,
    nqFeeRoundTrip: 4.20,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 2, // ±2m Tier 1 blackout
    prohibitOvernight: true
  },
  MFFU_Pro_EOD: {
    id: "MFFU_Pro_EOD",
    firmName: "MyFundedFutures",
    accountName: "MFFU $50k Pro EOD",
    drawdownMode: "EOD_TRAILING",
    maxTrailingDrawdown: 2000,
    currentRemainingDrawdown: 2000,
    cycleProfitTarget: 3000,
    consistencyRulePercent: 40,
    dailyLossLimit: 1200,
    mnqFeeRoundTrip: 1.24,
    nqFeeRoundTrip: 4.20,
    defaultSlippageTicks: 3,
    newsBlackoutMinutes: 2, // ±2m Tier 1 blackout
    prohibitOvernight: true
  }
};

export function getPropProfile(idOrKey: string): PropProfile {
  if (PROP_PRESETS[idOrKey]) {
    return PROP_PRESETS[idOrKey];
  }
  const key = Object.keys(PROP_PRESETS).find(
    (k) => k.toLowerCase() === idOrKey.toLowerCase()
  );
  if (key && PROP_PRESETS[key]) {
    return PROP_PRESETS[key];
  }
  return PROP_PRESETS.Topstep_EOD;
}
