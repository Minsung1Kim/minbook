# MinBook Quantitative Decision Engine: Architecture, Thought Process & Operational Reasoning

**Document Version:** 2.0.0  
**Target Instrument:** CME E-mini Nasdaq-100 Futures (`NQ`) & Micro E-mini (`MNQ`)  
**Primary Strategy:** Higher-Timeframe Continuation on Opening Retraces  
**Execution Window:** 09:30 AM – 10:00 AM ET (Prime Retrace: 09:34–09:48 AM ET)  
**Execution Frequency:** Strictly Exactly 1 Trade Per Day  
**Risk Budget:** $200–$300 (Scaled Dynamically by Volatility Surface)  
**Target Multiples:** 1.8R to 3.5R (Environment-Scaled by Dealer Gamma)  
**PDF Companion File:** [MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.pdf](file:///Users/minsung/Documents/GitHub/minbook/docs/MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.pdf)

---

## 1. Executive Philosophy & The 1-Trade-Per-Day Execution Mandate

MinBook was engineered from first principles to resolve the fundamental structural failure mode of discretionary futures traders: cognitive overtrading, psychological drift, and execution inside high-friction noise regimes. Rather than operating as an open-ended charting tool or a generic multi-indicator dashboard, MinBook operates as an action-first quantitative execution engine designed for a single, highly constrained operational objective:

> **Identify, validate, execute, and empirically document exactly one high-probability, higher-timeframe (HTF) continuation trade per session on the Nasdaq-100 futures market (NQ / MNQ) during the New York cash open window (09:30 AM to 10:00 AM Eastern Time).**

### 1.1 Cognitive and Mathematical Rationale for the 1-Trade Constraint
* **Elimination of Tilt & Asymmetric Loss Accumulation:** Statistical analyses of retail futures traders demonstrate that portfolio degradation is rarely caused by the initial morning setup; it is almost universally driven by secondary, revenge, and boredom trades executed between 10:30 AM and 3:30 PM ET, when market liquidity transitions from directional auction into two-way institutional market-making churn.
* **Concentration of Daily Volatility:** In the Nasdaq-100, the first 30 minutes of the New York regular trading hours (RTH) session (09:30–10:00 AM ET) account for approximately 35% to 45% of total regular-hours price range expansion. Liquidity, volume delta, and directional velocity reach their daily zenith during this window as overnight order books collide with New York institutional cash allocations.
* **Preservation of Mathematical Expectancy:** By capping daily participation at exactly one execution, edge is maximized while trading transaction costs, exchange slippage, and psychological capital drawdowns are strictly minimized.

### 1.2 The Time-Decay Anatomy of the 30-Minute Open Window
MinBook divides the 09:30–10:00 AM ET execution window into three mathematically and behaviorally distinct sub-phases:

| Time Window (ET) | Sub-Phase Designation | Institutional Auction Mechanism | MinBook Execution Directive |
| :--- | :--- | :--- | :--- |
| **09:30 – 09:33 AM** | **Open Noise & Sweep Watch** | Institutional clearing houses match opening auction market-on-open (MOO) orders. Algorithmic liquidity sweeps deliberately trigger retail stop-loss clusters placed beyond overnight extremes. Bid-ask spreads are widest. | **HANDS OFF MOUSE.** Strict execution freeze. Observe the initial drive direction, spread stabilization, and whether Overnight High (ONH) or Overnight Low (ONL) gets swept. Do not chase tick 1. |
| **09:34 – 09:48 AM** | **Prime Retrace Window** | The initial 3-minute opening whipsaw exhausts. Institutional algorithms step in to defend fair value (Session VWAP and Overnight 50% Midpoint). Aggressive liquidity demands subside into passive absorption. | **THE 1-TRADE RETRACE WINDOW.** Execute today's single trade exclusively upon confirmed candle absorption (wick rejection) into defined discount/premium confluence zones. |
| **09:49 – 09:59 AM** | **Late Window Decay Caution** | The initial opening momentum begins to decelerate. The market prepares for potential 10:00 AM ET macroeconomic releases (e.g., ISM Manufacturing, JOLTS, New Home Sales). | **DE-RISK & TRAIL RUNNERS.** If trade is active and up $\ge 1.5R$, trail stop-loss to breakeven or lock in partial profits. Never open new risk after 09:50 AM. |
| **10:00 AM+** | **Post-Window Recap & Lock** | Cash open auction cycle terminates. Directional persistence deteriorates into midday algorithmic chop. | **TERMINAL FLAT / LOG IN JOURNAL.** The day's trading is complete regardless of outcome. Record Maximum Adverse Excursion (MAE) and Maximum Favorable Excursion (MFE) in the empirical database. |

---

## 2. Market Data Architecture, CME Session Clock & Execution Integrity

### 2.1 Centralized CME Futures Session Clock & Trade Date Rollover
Standard financial calendar applications operate on calendar midnight (12:00 AM ET). This causes catastrophic state errors in futures trading systems, where the CME trade date officially rolls over at the 5:00 PM / 6:00 PM ET Globex evening restart.

MinBook resolves this by anchoring all market calculations to a deterministic CME Session Clock that models the exact trade date transition:
* **Monday through Thursday (00:00 – 16:59 ET):** Active target trade date equals current calendar date.
* **Monday through Thursday (17:00 – 23:59 ET):** Active target trade date shifts to tomorrow's weekday trade date. The evening Globex session starting at 18:00 ET belongs entirely to tomorrow's business date.
* **Friday (17:00 ET) through Sunday (23:59 ET):** Active target trade date shifts to the upcoming Monday. Weekend closure states are explicitly handled.
* **Holiday Calendar Protection:** Full-closure CME holidays (New Year's Day, MLK Day, Presidents' Day, Good Friday, Memorial Day, Juneteenth, Independence Day, Labor Day, Thanksgiving, Christmas) automatically increment the target trade date to the next valid operational session, preventing dead session calculations.

### 2.2 The 5 Operational Phases of the 24-Hour Futures Cycle
1. **CME_BREAK_OR_WEEKEND:** Mon–Thu 17:00–17:59 ET (daily maintenance halt) and Fri 17:00 – Sun 17:59 ET (weekend closure). Market data feeds are offline. Platform displays market closed countdown and invites trade logging.
2. **DEVELOPING_OVERNIGHT:** Sun–Thu 18:00–23:59 ET and Mon–Fri 00:00–08:29 ET. Sub-segmented into *Asia Session* (18:00–02:59 ET) and *London Session* (03:00–08:29 ET). Key levels develop dynamically, with warnings that European participation and 8:30 AM macro reports are pending.
3. **PRE_MARKET_LOCK:** Mon–Fri 08:30–09:29 ET. 8:30 AM US macroeconomic prints (CPI, PPI, Initial Jobless Claims) have crossed. Structural levels lock into static, finalized state.
4. **NY_OPEN_WINDOW:** Mon–Fri 09:30–09:59 ET. Live execution mode active. Open noise, prime retrace, and late window sub-phases run with live second-by-second countdowns.
5. **POST_WINDOW_RECAP:** Mon–Fri 10:00–16:59 ET. Execution window is closed. Daily directive enforces flat posture, trade journal entry, and post-trade analytics.

### 2.3 Handling Free CME Exchange Delay Realities with Pure Structural Integrity
CME Group enforces a mandatory 10-to-15 minute latency on all unauthenticated public futures quotes (`NQ=F`, `ES=F`). Many amateur systems attempt to generate live breakout buy/sell signals on top of delayed candles, creating disastrous slippage where the trader attempts to buy a price that occurred 15 minutes prior.

MinBook solves this problem through an uncompromising engineering separation:
* **Deterministic Pre-Open Structural Anchors:** All primary execution levels—Prior Day High/Low/Close, Overnight High/Low/Mid, Session VWAP, HTF Fibonacci Zones, and Implied Volatility Straddles—are calculated, finalized, and locked strictly *before* 09:30 AM ET. These reference prices are absolute mathematical facts that do not change based on delayed intraday ticks.
* **Mandatory Delayed Feed Warning Banner:** When the delayed futures feed is detected during 09:30–10:00 AM ET, the platform displays an alert: `DELAYED FUTURES FEED (10–15m LAG) — USE PRE-OPEN PLAN + LIVE BROKER CHART`. Dynamic unverified live-candle triggers are locked so the trader executes strictly off pre-calculated structural reference levels and their live broker platform.
* **Un-Delayed Equity Proxy (QQQ) Integration:** The Invesco QQQ Trust ETF operates on public stock exchanges without mandatory 15-minute CME delays. MinBook ingests real-time QQQ quotes during regular hours to provide real-time directional momentum, opening drive confirmation, and un-delayed VWAP trajectory.

---

## 3. Multi-Session Structural Reference Levels & Their Specific Roles

In the auction market theory of modern electronic futures, price does not move at random; it auctions between known institutional liquidity pools, historical fair-value benchmarks, and volatility boundaries. MinBook computes a deterministic hierarchy of reference levels designed specifically for NQ day traders:

### 3.1 Deterministic Prior-Day Reference Levels (Zero Overnight Contamination)
A common flaw in automated charting algorithms is indexing the daily bar array blindly. When an evening Globex session opens at 18:00 ET, data vendors frequently spawn an in-progress daily candle for the following trade date, corrupting the prior day's true High, Low, and Settlement Close.

MinBook enforces deterministic prior-day selection by matching daily bars completed strictly before the target trade date:
* **Prior Day High (PDH):** The absolute highest price of the preceding regular trading hours and Globex session. It represents the major resting buy-side liquidity pool (BSL). On bullish trend continuation days, PDH serves as the primary multi-target expansion magnet.
* **Prior Day Low (PDL):** The absolute lowest price of the preceding session. It represents resting sell-side liquidity (SSL). On bearish trend days, PDL serves as the primary short expansion magnet.
* **Prior Day Settlement Close (PDC):** The official 16:00 ET CME settlement price. PDC serves as the ultimate line-in-the-sand for daily order flow. When price auctions above PDC, overnight and intraday inventory is net long; when below PDC, inventory is net short.
* **Prior Day Midpoint (PD Mid):** The exact 50% mathematical center between PDH and PDL. Serves as secondary multi-day fair value equilibrium.

### 3.2 Overnight (Globex) Structural Reference Levels
The Globex session spans from 18:00 ET of the preceding evening to 09:30 ET of the active trade date. This includes the critical 09:15–09:30 ET pre-open cash positioning period:
* **Overnight High (ONH):** The peak price established during Globex. Retail breakout traders habitually place stop-loss buy orders just above ONH. Consequently, ONH is the primary target for opening liquidity sweeps (fakeout breakouts) before downward continuation.
* **Overnight Low (ONL):** The trough established during Globex. Retail breakdown traders place stop-loss sell orders just beneath ONL. It is the primary target for opening bear traps before upward continuation.
* **Overnight 50% Midpoint (ON Mid):** Calculated as $(ONH + ONL) / 2$. This represents the overnight equilibrium. In an open-test-drive scenario, price frequently pulls back exactly to ON Mid to retest balance before expanding. Confluence between ON Mid and Session VWAP forms the highest-probability discount execution zone in the entire playbook.

### 3.3 Sub-Session Reference Windows: London & Asia Extremes
* **London Session High & Low (03:00 to 08:30 ET):** European institutional order flow establishes structural liquidity pivots that frequently act as the initial support or resistance during the US pre-market. A breach of the London Low that immediately reclaims is a classic bullish institutional accumulation signature.
* **Asian Session High & Low (18:00 to 03:00 ET):** Represents lower-volume baseline range boundaries, frequently swept during the London open.

### 3.4 Multi-Anchor Volume-Weighted Average Price (VWAP)
Standard VWAP indicators reset at calendar midnight or session open, obscuring institutional fair value. MinBook maintains three distinctly anchored VWAPs:
1. **Session VWAP (Anchored at 09:30 ET):** The primary institutional execution benchmark for the cash session. Large institutional algorithmic execution algorithms (e.g., VWAP cross and volume-participation algorithms) actively defend this level. When price trades above Session VWAP, buyers have positive expectancy; when below, sellers dominate.
2. **Globex VWAP (Anchored at 18:00 ET):** The volume-weighted fair value of the entire overnight session. Acts as a crucial structural pivot during pre-market positioning.
3. **Prior Day RTH VWAP (09:30 to 16:00 ET of Prior Session):** Historical institutional fair value. Re-testing Prior Day VWAP from above or below offers powerful responsive support/resistance.

> **TWAP Fallback Protection:** If futures market data feeds drop tick volume or provide flat volume metrics, MinBook automatically falls back to Time-Weighted Average Price (TWAP) and explicitly badges the level `TWAP FALLBACK`, ensuring mathematical integrity is never compromised by corrupted volume feeds.

### 3.5 Higher-Timeframe (HTF) Fibonacci Retracements & Dynamic Impulse Direction
Standard Fibonacci tools require discretionary manual drawing. MinBook automates HTF Fibonacci calculation over a trailing 5-day daily swing window.

Crucially, the system determines impulse direction algorithmically by comparing the timestamps of the 5-day swing low and swing high:
* **Bullish Impulse (Timestamp of Swing Low < Timestamp of Swing High):** Price expanded upward from low to high; retracements pull down into *discount*. Levels project downward from swing high:
  $$\text{Shallow Retrace (38.2\%)} = \text{SwingHigh} - 0.382 \times \text{Range}$$
  $$\text{Equilibrium (50.0\%)} = \text{SwingHigh} - 0.500 \times \text{Range}$$
  $$\text{Golden Pocket (61.8\%)} = \text{SwingHigh} - 0.618 \times \text{Range}$$
  $$\text{Optimal Trade Entry OTE (70.5\%)} = \text{SwingHigh} - 0.705 \times \text{Range}$$
* **Bearish Impulse (Timestamp of Swing High < Timestamp of Swing Low):** Price expanded downward from high to low; retracements bounce upward into *premium*:
  $$\text{Shallow Retrace (38.2\%)} = \text{SwingLow} + 0.382 \times \text{Range}$$
  $$\text{Equilibrium (50.0\%)} = \text{SwingLow} + 0.500 \times \text{Range}$$
  $$\text{Golden Pocket (61.8\%)} = \text{SwingLow} + 0.618 \times \text{Range}$$
  $$\text{Optimal Trade Entry OTE (70.5\%)} = \text{SwingLow} + 0.705 \times \text{Range}$$

### 3.6 Rule of 16 Implied Volatility Bounds & Straddle Limits
Options markets price expected daily range expansion through implied volatility. Using the Cboe Nasdaq-100 Volatility Index ($VXN$, fallback $VIX$), MinBook computes the market-implied daily standard deviation using the standard Rule of 16:

$$\text{Daily Expected Move (1-SD)} = \frac{\text{PDC} \times (VXN / 100)}{\sqrt{252}}$$
$$\text{Expected Straddle Move} = \text{Daily Expected Move} \times \sqrt{\frac{2}{\pi}} \approx 0.79788 \times \text{Daily Expected Move}$$

These calculations generate two critical structural envelopes:
* **Upper & Lower Expected Straddle Bands:** Represent the statistically priced intraday boundary within which 68% of standard sessions terminate. A test of the Upper or Lower Straddle band between 09:30 and 10:00 AM represents an extreme statistical deviation, drastically increasing the probability of mean-reversion.
* **Overnight Range Consumed Percentage (% Consumed):**
  $$\% \text{ Consumed} = \left[ \frac{\text{Overnight Range}}{2 \times \text{Expected Straddle Move}} \right] \times 100$$
  When % Consumed is below 30%, the overnight session has compressed abnormally, signaling elevated risk of explosive opening whipsaws and false breakout sweeps.

### 3.7 The Level Vitality & Hit Likelihood Algorithm
A static high-to-low price ladder forces the trader to scan dozens of price lines during the heat of the opening bell. MinBook solves this through its **Hit Likelihood & Structural Vitality** engine, which resorts all reference levels dynamically based on institutional relevance and mathematical proximity:

$$\text{Proximity Score} = \max\left(5, \min\left(100, \text{round}\left(100 - \frac{\text{DistancePts}}{160} \times 100\right)\right)\right)$$
$$\text{Composite Hit Probability} = \text{round}(\text{Proximity Score} \times 0.65 + \text{Structural Weight} \times 0.35)$$

The institutional structural weights are assigned strictly according to market hierarchy:
* **Tier 1 (Execution Gravity 85–100):** Session VWAP (100), Overnight High/Low (95), Prior Day Close (90), Overnight 50% Midpoint (85).
* **Tier 2 (Structural Confirmation 68–78):** HTF 50% & 61.8% Golden Pocket (78), London High/Low (72), Prior Day High/Low (68).
* **Tier 3 (Outer Volatility Boundaries 30):** Expected Straddle Bands & 1-SD Boundaries (30).

This sorts the most vital, actionable levels to the top of the trader's interface, categorized by actionable status badges:
`TAP IMMINENT` ($\le 8$ pts away), `HIGH HIT PROB` (72%+), `MODERATE HIT PROB` (48%+), `EXPANSION MAGNET` (30%+), or `OUTER BOUNDARY`.

---

## 4. Options Market Structure & Dealer Gamma Exposure (GEX)

Futures price action is heavily dictated by option dealer inventory hedging in the underlying cash and index markets (NDX and QQQ). Market makers who sell options are dynamically obliged to hedge their delta by buying or selling underlying futures contracts as price moves.

### 4.1 Theoretical Foundations of Dealer Gamma Hedging
MinBook computes dealer gamma exposure across the full options chain surface, adhering to public market conventions:
* **Positive Gamma ($+\Gamma$) Regime:** When the aggregate options market is long calls or short out-of-the-money puts, dealers operate in positive gamma. As price rises, dealers must sell futures to maintain delta neutrality; as price falls, dealers must buy futures.
  * *Market Consequence:* Positive gamma dampens volatility, pins price near high-open-interest strikes, and creates mean-reversion chop. Runaway expansions are rare. MinBook automatically scales trader profit targets down to 1.8R–2.2R.
* **Negative Gamma ($-\Gamma$) Regime:** When heavy put buying forces dealers short gamma, dealers must sell futures into falling markets and buy futures into rising markets.
  * *Market Consequence:* Dealer hedging accelerates price velocity, triggering aggressive trend continuation, violent stop sweeps, and runaway momentum. MinBook automatically expands trader runner targets to 2.5R–3.5R.

### 4.2 Key Gamma Reference Levels & Basis Translation
Using Black-Scholes gamma calculations on Cboe delayed options JSON feeds (`_NDX.json` with fallback to `QQQ.json`), MinBook identifies three vital gamma levels:
1. **Gamma Flip Point:** The exact price strike where aggregate dealer gamma transitions from positive (mean-reverting) to negative (trend-accelerating). When price trades below the Gamma Flip, volatility expands exponentially.
2. **Call Wall:** The strike with the largest positive Call GEX. Serves as a major upside pinning level and institutional resistance ceiling.
3. **Put Wall:** The strike with the largest negative Put GEX. Serves as a major downside structural magnet and support floor.

> **NQ Basis Translation:** Because options trade on the NDX spot index and QQQ ETF, MinBook translates all option strike levels into active NQ=F futures points by multiplying strikes by the real-time basis ratio:
> $$\text{Basis Ratio} = \frac{\text{Live NQ Futures Price}}{\text{Spot Index Price}}$$
> This ensures the trader observes Call Walls, Put Walls, and the Gamma Flip directly on their NQ futures price scale.

---

## 5. The Volatility Surface & Macro Regime Engine

MinBook avoids the trap of viewing price in a vacuum. It contextualizes the 9:30 AM open through a multi-dimensional volatility surface and macro correlation engine:

### 5.1 The 6-Dimensional Volatility Surface
The system monitors six volatility metrics simultaneously:
`^VXN` (Nasdaq-100 30-day IV), `^VIX` (S&P 500 30-day IV), `^VIX3M` (3-month IV), `^VIX9D` (9-day short-term IV), `^VIX1D` (0DTE intraday IV), and `^VVIX` (volatility of volatility).
* **Term Structure Ratio (VIX / VIX3M):** Normal markets trade in *Contango* ($VIX / VIX3M < 0.95$), where longer-dated options are more expensive than short-dated options. When the ratio exceeds 1.00, the market enters *Backwardation* (an inverted volatility term structure). Backwardation signals severe institutional hedging demand; directional continuation becomes unpredictable, whipsaw probability spikes, and MinBook automatically cuts recommended position size to 0.5x.
* **Short-Term Volatility Shock (VIX9D / VIX):** A ratio $> 1.15$ flags acute opening event volatility, typically preceding major economic releases.
* **Vol-of-Vol Risk (^VVIX $\ge 110$):** Indicates violent repricing of tail risk, warning of wide stop hunts and liquidity gaps.

### 5.2 Realized Volatility Estimators & The Variance Risk Premium (VRP)
Standard close-to-close volatility estimators fail in intraday futures because they ignore overnight price gaps, intraday trading range variance, and drift. MinBook implements two rigorous realized volatility models:
1. **Garman-Klass Volatility:** Incorporates OHLC data to capture intraday range variance without being blinded by opening jumps.
2. **Yang-Zhang Volatility (10-Day & 20-Day):** An advanced minimum-variance estimator that combines overnight jump variance, open-to-close drift, and continuous Rogers-Satchell intraday variance:
   $$k = \frac{0.34}{1.34 + \frac{N+1}{N-1}}$$
   $$\sigma_{YZ}^2 = \sigma_{\text{open}}^2 + k \cdot \sigma_{\text{close}}^2 + (1 - k) \cdot \sigma_{RS}^2$$

MinBook subtracts 20-day annualized Yang-Zhang realized volatility from the Nasdaq-100 implied volatility index (VXN) to calculate the **Variance Risk Premium (VRP)**:
$$\text{Variance Risk Premium (VRP)} = VXN - \text{RealizedVol}_{YZ, 20d}$$

> **Negative VRP Dislocation Trigger:** Under normal conditions, implied volatility carries a premium over realized volatility ($VRP > 0$). When VRP flips negative ($\text{Realized Volatility} > \text{Implied Volatility}$), the market is in an acute structural dislocation where realized price swings are outstripping options pricing. MinBook treats negative VRP as a major **STOP-RUN DISLOCATION WARNING** and automatically throttles position risk to 0.5x.

### 5.3 Macro Stock-Bond Correlation Engine
The Nasdaq-100 is hypersensitive to the US 10-Year Treasury Yield (`^TNX`). MinBook computes a rolling 60-day Pearson correlation between daily percentage returns of NQ and TNX:
* **Inflation / Rate-Sensitive Regime (Correlation $< -0.20$):** Rising yields act as a severe equity headwind. If pre-market 10Y yields spike by $\ge 3$ basis points, long continuation setups face immediate institutional selling resistance.
* **Growth-Scare / Flight-to-Safety Regime (Correlation $> +0.20$):** Falling yields accompany equity liquidations, signaling economic growth contraction.

### 5.4 Standardized Overnight Inventory Imbalance Skew
MinBook measures overnight inventory skew strictly as the **percentage of Globex bars closing above Prior Day Settlement Close (PDC)**:
* **Net Long Imbalance ($\ge 70\%$):** Overnight participants have heavily accumulated long exposure. If the 09:30 AM open fails to immediately drive higher, trapped overnight longs are forced to liquidate market sell orders, precipitating a violent morning flush down to PDC.
* **Net Short Imbalance ($\le 30\%$):** Overnight participants are short. Failure to break lower triggers an aggressive short-squeeze acceleration higher.
* **Balanced Inventory ($30\%$ to $70\%$):** Two-way auction equilibrium; directional continuation depends strictly on cash open order flow.

---

## 6. Microstructure & Order Flow: Footprint & SMT Divergence

### 6.1 1-Minute Derived Footprint & Close Location Value (CLV)
To evaluate order flow without requiring paid Level 2 tick infrastructure, MinBook reconstructs intraday order flow through 1-minute OHLCV constituent bars:
* **Close Location Value (CLV):** Quantifies where each candle closes relative to its absolute high-low range, bound within $[-1.0, +1.0]$:
  $$\text{CLV} = \frac{(Close - Low) - (High - Close)}{High - Low}$$
* **Intrabar Delta Proxy:** Multiplies candle volume by CLV to approximate institutional buying versus selling delta.
* **Point of Control (POC) Binning:** Sub-bar volume is dynamically bucketed into 2.5-point price bins to isolate the exact high-volume price node of each parent candle.
* **Dual Cumulative Volume Delta (CVD):** Tracks running session CVD (resetting at 18:00 ET Globex open) alongside RTH CVD (resetting at 09:30 ET NY open).

### 6.2 Automated Footprint Markers
MinBook evaluates parent candles (5m and 15m) and renders automated institutional markers directly on the chart:
* `ABS BUY` / `ABS SELL` **(Passive Absorption):** Triggered when candle volume $\ge 1.8\times$ the 20-bar average, the candle body is compressed ($\le 35\%$ of total range), wick rejection $\ge 40\%$, and price is within $0.5\times \text{ATR}_{15m}$ of a major structural level. Indicates institutional limit orders absorbing market aggressive orders.
* `IMP+` / `IMP-` **(Initiative Momentum Sweep):** Triggered when volume $\ge 1.5\times$ average and delta ratio ($|\Delta| / V$) $\ge 0.65$. Confirms aggressive institutional initiative buying or selling.
* `CVD DIV` **(CVD Divergence):** Detects multi-bar absorption where price prints a higher high but CVD prints a lower high (or price prints a lower low while CVD prints a higher low), signaling momentum exhaustion.

### 6.3 Cross-Index Smart Money Technique (SMT) Divergence
Institutional market makers frequently accumulate or distribute contracts across correlated indices before a trend develops. MinBook monitors real-time swing-point non-confirmation between tech futures (NQ) and broad-market futures (ES):

| SMT Pattern | NQ Price Action | ES Price Action | Institutional Mechanism | Execution Directive |
| :--- | :--- | :--- | :--- | :--- |
| **Bullish SMT (ES Leads)** | Sweeps below Overnight Low (prints Lower Low) | Holds firmly above Overnight Low (prints Higher Low) | Institutions are aggressively absorbing broad market futures (ES) while allowing NQ to trigger retail sell stops beneath ONL. The NQ breakdown is a bear trap. | Do not short the NQ breakdown. Wait for NQ to reclaim its low and print a Market Structure Shift (MSS) displacement, then buy the retrace to VWAP. |
| **Bullish SMT (NQ Leads)** | Holds firmly above Overnight Low (prints Higher Low) | Sweeps below Overnight Low (prints Lower Low) | Tech sector shows relative institutional strength. Smart money refuses to let NQ break discount. | Strongest bullish confirmation. Enter long on NQ discount retrace. |
| **Bearish SMT (ES Leads)** | Sweeps above Overnight High (prints Higher High) | Fails to reach Overnight High (prints Lower High) | Institutions distribute broad market equity while using NQ to trigger retail buy stops above ONH. The NQ breakout is a bull trap. | Do not chase the NQ breakout. Wait for NQ to fall back below ONH, confirming an MSS shift downward, then short the retrace to VWAP. |
| **Bearish SMT (NQ Leads)** | Fails to reach Overnight High (prints Lower High) | Sweeps above Overnight High (prints Higher High) | Tech sector shows relative weakness and institutional selling pressure. | Execute short on NQ upon rejection at Session VWAP. |

---

## 7. The Decision Engine, Factor Scorecard & Archetype Synthesis

### 7.1 The 8-Factor Scorecard
Rather than relying on un-inspectable black-box machine learning predictions, MinBook evaluates market state through an inspectable, deterministic 8-factor scorecard (+1 / 0 / -1):
1. **HTF Trend Alignment:** +1 if 5-day daily close structure is Bullish; -1 if Bearish; 0 if Neutral.
2. **Prior Day Close (PDC) Position:** +1 if price > PDC (defending long inventory); -1 if price < PDC.
3. **Session VWAP Benchmark:** +1 if holding above 09:30 VWAP (fair value support); -1 if below.
4. **Overnight Inventory Skew:** +1 if $\ge 70\%$ above PDC; -1 if $\le 30\%$; 0 if balanced.
5. **Cross-Index SMT Divergence:** +1 if Bullish SMT detected; -1 if Bearish SMT; 0 if moving in sync.
6. **Volatility Surface & VRP:** +1 if Contango term structure and positive VRP; -1 if Backwardation or Negative VRP dislocation.
7. **Macro Yields & Dollar:** +1 if 10Y yield and DXY changes represent equity tailwinds; -1 if headwinds.
8. **Dealer Gamma Tilt (GEX):** +1 if Negative Gamma amplifies an active bullish trend; -1 if Negative Gamma amplifies a bearish trend; 0 if Positive Gamma pins range.

The net weighted score defines the session conviction tier:
* **HIGH CONVICTION:** Net Score $\ge +3$ or $\le -3$ with multi-factor structural alignment.
* **MODERATE CONVICTION:** Net Score +1 to +2 or -1 to -2.
* **LOW CONVICTION / CHOP:** Net Score $\approx 0$ (conflicting structural forces; stand aside recommended).

### 7.2 Volatility-Normalized Session Archetypes
MinBook eliminates all hardcoded point thresholds, replacing them with dynamic multiples of 15-minute ATR ($\text{ATR}_{15m}$) and Expected Straddle Move:

| Session Archetype | Mathematical Trigger Condition | Market Behavior | Actionable Directive |
| :--- | :--- | :--- | :--- |
| **OPEN-TEST-DRIVE** (High Retrace Probability) | Price opens within Globex range, above PDC, with distance to VWAP $\le 1.75 \times \text{ATR}_{15m}$ | Normal institutional open. Initial 3-minute noise settles, followed by an orderly 09:34–09:48 AM test of VWAP / ON Mid before strong continuation. | **PRIME RETRACE SETUP.** Set alerts for VWAP / ON Mid confluence zone. Enter long on 1m candle wick absorption. Hard stop below swing low. Target ONH and PDH. |
| **OPEN-DRIVE** (Runaway / Shallow Retrace Only) | Price opens above ONH with distance to VWAP $> 1.75 \times \text{ATR}_{15m}$ | Aggressive institutional imbalance. Buying is urgent; market makers will NOT allow price to pull back deeply to VWAP. | **DO NOT WAIT FOR VWAP.** Waiting for VWAP will cause the trader to get left behind. Enter exclusively on a shallow 8–15 pt pullback to the 3-minute candle high, or stand aside if overextended. |
| **OPEN-REVERSAL** (Inventory Flush) | Overnight Inventory $\ge 70\%$ net long, but price opens below Overnight Midpoint | Overnight retail longs are trapped offside. Cash open order flow forces rapid long liquidation down to PDC. | **DO NOT BUY THE EARLY DIP.** Allow the inventory liquidation flush to complete near PDC before looking for responsive buyer absorption. |
| **OPEN-AUCTION** (Chop Pinch) | $\|P - VWAP\| < 0.35 \times \text{ATR}_{15m}$ AND $\|P - PDC\| < 0.45 \times \text{ATR}_{15m}$ | Price is tightly compressed between fair value and prior settlement. Neither buyers nor sellers have directional control. | **PATIENCE MANDATORY.** Whipsaw risk is extreme. Demand a clean 15-minute directional expansion outside the pinch zone before risking capital. |

### 7.3 The 5 Core Trader Answers
To ensure instantaneous comprehension, MinBook synthesizes all quantitative models into five plain-English answers:
1. **Direction & Conviction:** Exact bias verdict (e.g., *BULLISH CONTINUATION • 82% HIGH CONVICTION*) backed by structural rationale.
2. **Opening Stop-Hunt Trap:** Identifies which side of the market will be hunted at 09:30 AM (e.g., *Buy Stops Above Overnight High*), the exact price level, and the trap mechanics.
3. **Prime Retrace Levels:** Confluence-ranked execution prices (Primary: Session VWAP; Secondary: Overnight Midpoint; Deep Value: HTF 61.8% Golden Pocket).
4. **Draws on Liquidity:** The institutional magnets where price is being pulled (Magnet #1: ONH; Magnet #2: PDH; Secondary: Daily Upper Straddle).
5. **Session R:R Plan:** Dynamic target recommendation scaled to volatility and dealer gamma (e.g., *2.5R–3.0R Runner Target* under Negative Gamma; *1.8R–2.0R Quick Scalp* under Positive Gamma).

### 7.4 The 3-Step ICT Execution Blueprint
For discretionary traders following Inner Circle Trader (ICT) concepts, MinBook translates quantitative calculations into a 3-step procedural rule:
1. **Step 1: The Fakeout (Retail Breakout Trap):** Retail traders buy the first green impulse above ONH at 09:30:15 AM believing it is a runaway breakout, providing smart money with exit liquidity.
2. **Step 2: Reversal Confirmation (Market Structure Shift):** Price wicks above ONH, traps breakout buyers, and swiftly displaces back below ONH within 1 to 3 minutes, confirming a Market Structure Shift (MSS) on the 1m/5m chart.
3. **Step 3: Exactly What You Do:** Stand aside during the sweep. Once MSS displacement occurs, place a limit or market order on the pullback into Session VWAP, anchoring the invalidation stop-loss strictly below the sweep wick.

---

## 8. Risk Management, Dynamic Sizing & Economic Buffers

### 8.1 Volatility-Normalized Contract Sizing
Fixed contract sizing is mathematically fatal in futures trading because daily market volatility fluctuates widely. MinBook calculates exact contract sizing for Micro E-mini (MNQ, $2/pt) and E-mini (NQ, $20/pt) contracts dynamically:

$$\text{Adjusted Risk Budget} = \text{Base Risk Dollars (\$250)} \times \text{Regime Multiplier}$$
$$\text{Recommended MNQ Contracts} = \left\lfloor \frac{\text{Adjusted Risk Budget}}{\text{Stop Distance In Points} \times 2} \right\rfloor$$

The **Regime Multiplier** throttles exposure based on market safety:
* **1.0x (Normal):** Positive VRP, Contango term structure, synchronized market structure.
* **0.5x (Defensive):** Negative VRP dislocation, Backwardation ($VIX/VIX3M > 1.0$), $VVIX \ge 110$, or high-impact macroeconomic event.
* **0.0x (Stand Aside):** Severe conflicting signals, chop pinch, or extreme market closure.

### 8.2 Prop Firm Drawdown Boundary & Stop-Too-Tight Filters
* **Prop Drawdown Boundary:** The system computes $\text{Drawdown Risk \%} = (\text{Actual Dollar Risk} / \text{Trailing Prop Drawdown}) \times 100$. If the trade risks $> 12.5\%$ of remaining prop firm drawdown, an alert is triggered.
* **Stop-Too-Tight Filter:** In NQ futures, standard 1-minute opening volatility generates 10 to 14 points of random spread noise. If a trader's planned stop distance is **$< 0.5\times \text{ATR}_{15m}$**, MinBook triggers a warning: *STOP TOO TIGHT • Standard opening noise will clip this stop before direction establishes.*
* **Round-Trip Fee Accounting:** Deducts exact round-trip commission fees (\$1.24/rt MNQ, \$4.50/rt NQ) from profit calculations, presenting true net R:R instead of deceptive gross metrics.

### 8.3 Macroeconomic News Buffers
High-impact US macroeconomic releases (Non-Farm Payrolls, CPI, PPI, Retail Sales) released at 08:30 AM ET are already priced into the market by the 09:30 AM open.

However, releases crossing at **09:45 AM ET (Flash Manufacturing/Services PMI)** or **10:00 AM ET (ISM Manufacturing, JOLTS Job Openings, University of Michigan Consumer Sentiment)** pose catastrophic headline risk to active trades.

MinBook scans its live economic calendar feed and enforces an automated **NEWS BUFFER WARNING**:
> If a red-folder release occurs at 09:45 or 10:00 AM ET on the active trade date, MinBook alerts the trader to trail stops to breakeven or lock in runner profits before 09:45 AM, completely flattening before the 10:00 AM print.

---

## 9. Empirical Verification, Auto-Grading & Walk-Forward Self-Correction

A quantitative decision engine is worthless if it cannot evaluate its own performance objectively. MinBook incorporates an automated verification, grading, and self-calibration loop:

### 9.1 Directional Maximum Adverse Excursion (MAE) and Maximum Favorable Excursion (MFE)
In the empirical trade journal (`/journal`), MinBook tracks the exact price excursions of every trade relative to initial risk (R):
* **Maximum Adverse Excursion (MAE in R):** The peak drawdown experienced while the trade was active. Measuring winning trades' MAE isolates whether stops are set too wide or too tight.
* **Maximum Favorable Excursion (MFE in R):** The absolute peak theoretical profit achieved by the market before exit.
* **MFE Exit Efficiency:**
  $$\text{Exit Efficiency \%} = \frac{\text{Actual Realized PnL in R}}{\text{MFE in R}} \times 100$$
  Institutional benchmarks target 65% to 80% exit efficiency. A trader capturing $< 50\%$ exit efficiency is exiting prematurely out of fear; a trader capturing $> 90\%$ is curve-fitting exits.
* **50-Trade Sample Calibration Gate:** Prevents premature statistical optimization by locking empirical percentile adjustments until a minimum statistically valid sample of 50 trades is accumulated.

### 9.2 Immutable Pre-Market Snapshot Freezing
Hindsight bias is the primary disease of trading research. MinBook enforces absolute immutability:
* Between **09:15 AM and 09:29 AM ET** (or upon first morning load), MinBook automatically captures and freezes today's pre-market brief—including spot price, bias verdict, conviction tier, stop-hunt forecast, primary retrace levels, liquidity targets, and all 8 factor scores—into an immutable SQLite table (`daily_predictions`).
* Once frozen, the prediction is locked. Any subsequent price action cannot alter what the model predicted before the bell.

### 9.3 Deterministic Post-Session Auto-Grading
After 10:20 AM ET (accounting for CME feed delay), an automated grading pipeline evaluates actual 1-minute and 5-minute NQ candles across the 09:30–10:00 AM ET window:
* **Directional Bias Verification:** The bias is graded as CORRECT if price expanded in the predicted direction by at least **$0.75\times \text{ATR}_{15m}$** before breaching a **$1.00\times \text{ATR}_{15m}$** invalidation stop.
* **Retrace Tapping Verification:** Checks whether actual intraday low/high touched predicted VWAP, ON Mid, PDC, or HTF Fibonacci levels within a 2.5-point tolerance.
* **Stop-Hunt Realization:** Evaluates whether the predicted sweep level was breached and immediately rejected back inside range.
* **Liquidity Magnet Hit Rate:** Checks whether primary liquidity targets (ONH/ONL, PDH/PDL) were tagged during the window.
* **Brier Calibration Score:** Computes the quadratic probability error $(p - y)^2$ to assess confidence calibration.

### 9.4 Walk-Forward Calibration & Safe Self-Improvement Engine
MinBook incorporates an automated self-audit engine (`/performance`) that tracks the individual performance and lift of each quantitative factor:
$$\text{Factor Lift \%} = \text{Factor Win Rate} - \text{Baseline Overall Bias Accuracy}$$

Factors generating $\ge +4\%$ lift are classified as `EDGE ENHANCER`; factors generating $\le -4\%$ lift are flagged as `NOISE DETRACTOR`.

To prevent curve-fitting, MinBook enforces a **Strict Walk-Forward Optimization Guardrail**:
1. **Sample Size Gate ($N \ge 30$):** Factor weights remain strictly locked at baseline (1.0) until at least 30 sessions are graded.
2. **70/30 In-Sample vs. Out-of-Sample Time Split:** When $N \ge 30$, the engine divides historical sessions chronologically into a 70% Training set and a 30% held-out Test set.
3. **Bounded Weight Updates:** In-sample lift proposes weight adjustments bounded strictly within $[0.2, 2.4]$.
4. **Anti-Overfitting Gate:** Proposed weights are surfaced to the trader *only if out-of-sample prediction accuracy or Brier score strictly improves on the held-out 30% test data*. The trader retains final approval via one-click Apply or Rollback controls.

---

## 10. Theoretical Gaps & Direct Research Mandates for Gemini Deep Research

While MinBook v2.0 provides an institutional decision framework, several fundamental theoretical and empirical challenges remain. The following research directives are formulated specifically for Gemini Deep Research to explore:

### Research Directive 1: Synthetic 1-Minute Intrabar Delta vs. True CME Level 2 Order Book Depth
* **Problem:** MinBook approximates intrabar delta using Close Location Value (CLV) applied to delayed 1-minute OHLCV bars. While effective for zero-cost retail traders, this method cannot observe passive limit order replenishment, iceberg order absorption, or book spoofing.
* **Investigation Mandate:** Investigate mathematical and statistical models capable of extracting true order flow toxicity (e.g., Volume-Synchronized Probability of Toxicity, VPIN) from low-frequency bar data. How closely does CLV-derived cumulative volume delta correlate with actual CME Market By Order (MBO) order book delta during the 09:30–10:00 AM window? What algorithmic adjustments improve delta accuracy without requiring expensive raw tick infrastructure?

### Research Directive 2: Intraday 0DTE Options Skew & Volatility Surface Dynamics
* **Problem:** MinBook evaluates dealer gamma exposure (GEX) from delayed 15-minute Cboe options JSON snapshots, translating NDX/QQQ strikes into NQ futures basis. However, 0DTE (zero days to expiration) options volume now represents over 50% of total index options turnover, creating rapid midday shifts in the Gamma Flip and Wall strikes.
* **Investigation Mandate:** Model the intraday elasticity of the Gamma Flip strike as 0DTE options decay throughout the morning session. Can high-frequency changes in 0DTE implied volatility skew predict the timing and magnitude of opening stop hunts?

### Research Directive 3: Non-Linear Machine Learning vs. Linear Factor Scorecards
* **Problem:** MinBook aggregates its 8 quantitative factors into a linear scorecard (+1 / 0 / -1). In reality, market factors interact non-linearly; for example, a negative Variance Risk Premium combined with backwardation may completely nullify an otherwise bullish HTF Fibonacci alignment.
* **Investigation Mandate:** Design and benchmark non-linear regime-switching classifiers (such as Hidden Markov Models, Gaussian Process Classifiers, or LightGBM models with SHAP value interpretability) trained on MinBook's exact feature set. How can non-linear factor interactions be modeled while strictly maintaining the zero-overfitting, inspectable, plain-English directive style required for real-time discretionary trading?

### Research Directive 4: Cross-Asset Flow Transmission (Treasury Futures, Dollar, & Mega-Cap Tech)
* **Problem:** The Nasdaq-100 is highly concentrated in top mega-cap equities (NVDA, AAPL, MSFT, AMZN, META, GOOGL, TSLA) and inversely tethered to US interest rate expectations.
* **Investigation Mandate:** Quantify the lead-lag relationship between CME 10-Year Treasury Note Futures (ZN), US Dollar Futures (DX), mega-cap equity pre-market auctions, and NQ opening price discovery. Can a real-time order flow imbalance index across these related assets provide earlier warning of opening stop hunts than NQ vs. ES SMT divergence alone?

### Research Directive 5: Bayesian Dynamic Factor Weighting
* **Problem:** MinBook's walk-forward optimizer updates factor weights in discrete chronological batches (70/30 time-split).
* **Investigation Mandate:** Formulate an online Bayesian updating framework (e.g., Recursive Bayesian Estimation or Kalman Filtering) that dynamically updates factor credibility weights session-by-session, automatically adapting to structural regime shifts without small-sample instability.
