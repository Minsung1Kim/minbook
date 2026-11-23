import { SizingGuidance } from "@/types/market";

export function computeSizingGuidance(
  userRiskDollars: number = 250,
  userTargetDollars: number = 550,
  selectedInstrument: "NQ" | "MNQ" = "NQ",
  atr15m: number = 24.5,
  atr14Daily: number = 160
): SizingGuidance {
  const nqPointValue = 20;
  const mnqPointValue = 2;

  // Max stop distance allowed by risk budget on 1 contract
  const maxStopPointsNQ = Math.round((userRiskDollars / nqPointValue) * 10) / 10;
  const maxStopPointsMNQ = Math.round((userRiskDollars / mnqPointValue) * 10) / 10;

  // Stop clipping vulnerability check
  // If the 15-minute ATR is greater than the max allowable stop distance on 1 NQ contract,
  // the trader is at extreme risk of being stopped out by random open noise.
  const noiseThreshold = Math.max(14, atr15m * 0.75);
  const stopClippingRisk = maxStopPointsNQ < noiseThreshold;

  let stopClippingReason = "";
  if (stopClippingRisk) {
    stopClippingReason = `15-min ATR is ${atr15m} pts. Your $${userRiskDollars} budget on 1 full NQ contract only allows a ${maxStopPointsNQ} pt stop, which is tighter than standard 2-minute opening chop noise (${Math.round(noiseThreshold)} pts). High risk of getting clipped on the initial retrace sweep!`;
  } else {
    stopClippingReason = `Your ${maxStopPointsNQ} pt stop on 1 NQ contract provides adequate buffer relative to current 15-min ATR (${atr15m} pts).`;
  }

  // Recommended sizing setup
  let recommendedSizing: SizingGuidance["recommendedSizing"];

  if (stopClippingRisk && selectedInstrument === "NQ") {
    // Recommend MNQ scaling for breathing room
    // Aim for ~25-30 pts stop buffer
    const mnqContracts = Math.max(1, Math.floor(userRiskDollars / (25 * mnqPointValue))); // e.g. 250 / (25 * 2) = 5 MNQ
    const stopPts = Math.round((userRiskDollars / (mnqContracts * mnqPointValue)) * 10) / 10;
    const targetPts = Math.round((userTargetDollars / (mnqContracts * mnqPointValue)) * 10) / 10;
    const rr = Math.round((targetPts / stopPts) * 10) / 10;

    recommendedSizing = {
      instrument: "MNQ",
      contracts: mnqContracts,
      stopPoints: stopPts,
      targetPoints: targetPts,
      riskDollars: userRiskDollars,
      targetDollars: userTargetDollars,
      rrRatio: rr,
      summary: `DOWNSCALE ADVICE: Trade ${mnqContracts} MNQ contracts instead of 1 NQ. This expands your stop buffer from ${maxStopPointsNQ} pts to ${stopPts} pts without risking a single dollar more than $${userRiskDollars}!`
    };
  } else {
    const targetPts = Math.round((userTargetDollars / nqPointValue) * 10) / 10;
    const rr = Math.round((targetPts / maxStopPointsNQ) * 10) / 10;

    recommendedSizing = {
      instrument: "NQ",
      contracts: 1,
      stopPoints: maxStopPointsNQ,
      targetPoints: targetPts,
      riskDollars: userRiskDollars,
      targetDollars: userTargetDollars,
      rrRatio: rr,
      summary: `Standard 1 NQ contract. Stop: ${maxStopPointsNQ} pts ($${userRiskDollars}), Target: ${targetPts} pts ($${userTargetDollars}, ${rr}R). Honor structural invalidation.`
    };
  }

  // MNQ alternatives matrix
  const mnqAlternatives: SizingGuidance["mnqAlternatives"] = [
    {
      contracts: 2,
      stopPoints: Math.round((userRiskDollars / (2 * mnqPointValue)) * 10) / 10, // 62.5 pts on $250
      riskDollars: userRiskDollars,
      comfortLevel: "CONSERVATIVE"
    },
    {
      contracts: 4,
      stopPoints: Math.round((userRiskDollars / (4 * mnqPointValue)) * 10) / 10, // 31.2 pts on $250
      riskDollars: userRiskDollars,
      comfortLevel: "RECOMMENDED"
    },
    {
      contracts: 6,
      stopPoints: Math.round((userRiskDollars / (6 * mnqPointValue)) * 10) / 10, // 20.8 pts on $250
      riskDollars: userRiskDollars,
      comfortLevel: "TIGHT"
    }
  ];

  return {
    userRiskDollars,
    userTargetDollars,
    selectedInstrument,
    nqPointValue,
    mnqPointValue,
    maxStopPointsNQ,
    maxStopPointsMNQ,
    stopClippingRisk,
    stopClippingReason,
    recommendedSizing,
    mnqAlternatives
  };
}
