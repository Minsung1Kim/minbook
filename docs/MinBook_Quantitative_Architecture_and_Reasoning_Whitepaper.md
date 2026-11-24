# MinBook Quantitative Decision Engine: Architecture, Thought Process & Operational Reasoning

**Document Version:** 3.0.0  
**Target Instrument:** CME E-mini Nasdaq-100 Futures (`NQ`) & Micro E-mini (`MNQ`)  
**Primary Strategy:** Higher-Timeframe Continuation & Opening Sweep Reversals on Retraces  
**Execution Window:** 09:34 AM – 09:50 AM ET (Hands-off 09:30–09:33 AM ET Observation Freeze; 10:00 AM ET Vertical Exit)  
**Execution Frequency:** Strictly Exactly 1 Trade Per Day  
**Risk Budget:** $200–$300 (Scaled Dynamically by Layer 1 Volatility Gates & PropProfile)  
**Target Bounds:** Reachability-Capped Scalps (TP1 [0.25, 0.45]x ATR_Open_15m, TP2 [0.50, 0.75]x ATR_Open_15m)  
**PDF Companion File:** [MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.pdf](file:///Users/minsung/Documents/GitHub/minbook/docs/MinBook_Quantitative_Architecture_and_Reasoning_Whitepaper.pdf)

---

## 1. Executive Philosophy & The 1-Trade-Per-Day Execution Mandate

MinBook was engineered from first principles to resolve the fundamental structural failure mode of discretionary futures traders: cognitive overtrading, psychological drift, and execution inside high-friction noise regimes. Rather than operating as an open-ended charting tool or a generic multi-indicator dashboard, MinBook operates as an action-first quantitative execution engine designed for a single, highly constrained operational objective:

> **Identify, validate, execute, and empirically document exactly one high-probability trade per session on the Nasdaq-100 futures market (NQ / MNQ) during the New York cash open execution window (09:34 AM to 09:50 AM Eastern Time), following a mandatory 09:30–09:33 AM ET observation freeze.**

### 1.1 Cognitive and Mathematical Rationale for the 1-Trade Constraint
* **Elimination of Tilt & Asymmetric Loss Accumulation:** Statistical analyses of retail futures traders demonstrate that portfolio degradation is rarely caused by the initial morning setup; it is almost universally driven by secondary, revenge, and boredom trades executed between 10:30 AM and 3:30 PM ET, when market liquidity transitions from directional auction into two-way institutional market-making churn.
* **Concentration of Daily Volatility:** In the Nasdaq-100, the first 30 minutes of the New York regular trading hours (RTH) session account for approximately 35% to 45% of total regular-hours price range expansion. Liquidity, volume delta, and directional velocity reach their daily zenith during this window as overnight order books collide with New York institutional cash allocations.
* **Preservation of Mathematical Expectancy:** By capping daily participation at exactly one execution, edge is maximized while trading transaction costs, exchange slippage, and psychological capital drawdowns are strictly minimized.

### 1.2 The Time-Decay Anatomy of the Open Window
MinBook divides the 09:30–10:00 AM ET execution window into four mathematically and behaviorally distinct sub-phases:

| Time Window (ET) | Sub-Phase Designation | Institutional Auction Mechanism | MinBook Execution Directive |
| :--- | :--- | :--- | :--- |
| **09:30 – 09:33 AM** | **Open Noise & Sweep Watch** | Institutional clearing houses match opening auction market-on-open (MOO) orders. Algorithmic liquidity sweeps deliberately trigger retail stop-loss clusters placed beyond overnight extremes. Bid-ask spreads are widest. | **HANDS OFF MOUSE.** Strict execution freeze. Observe the initial drive direction, establish 3m Opening Range (`ORH_3m`, `ORL_3m`), and confirm whether overnight extremes are swept. |
| **09:34 – 09:50 AM** | **Prime LTF Execution Window** | The initial 3-minute opening whipsaw exhausts. Institutional algorithms step in to defend fair value (Session VWAP, 1m FVG, or 40%–50% retrace). Passive absorption confirms structural support/resistance. | **ACTIONABLE TRADE CARD WINDOW.** Execute today's single trade exclusively off confirmed 1m retrace or sweep-reversal setups. Hard stops anchored to 1m structural swings. |
| **09:50 – 09:59 AM** | **Late Window Decay Caution** | The initial opening momentum begins to decelerate. The market prepares for potential 10:00 AM ET macroeconomic releases (e.g., ISM Manufacturing, JOLTS). | **DE-RISK & TRAIL RUNNERS.** If trade is active, trail stop to breakeven or lock in TP1 partials. Never open new risk after 09:50 AM. |
| **10:00 AM** | **Vertical Time Exit & Terminal Flat** | Cash open auction cycle terminates. Directional persistence deteriorates into midday algorithmic churn. | **FLATTEN REMAINING CONTRACTS.** Liquidate remaining contracts at 10:00 AM ET close price. Log trade in journal and auto-grade execution. |

---

## 2. Market Data Architecture, CME Session Clock & Execution Integrity

### 2.1 Centralized CME Futures Session Clock & Trade Date Rollover
Standard financial calendar applications operate on calendar midnight (12:00 AM ET). This causes catastrophic state errors in futures trading systems, where the CME trade date officially rolls over at the 5:00 PM / 6:00 PM ET Globex evening restart.

MinBook resolves this by anchoring all market calculations to a deterministic CME Session Clock:
* **Monday through Thursday (00:00 – 16:59 ET):** Active target trade date equals current calendar date.
* **Monday through Thursday (17:00 – 23:59 ET):** Active target trade date shifts to tomorrow's weekday trade date. The evening Globex session starting at 18:00 ET belongs entirely to tomorrow's business date.
* **Friday (17:00 ET) through Sunday (23:59 ET):** Active target trade date shifts to the upcoming Monday. Weekend closure states are explicitly handled.
* **Holiday Calendar Protection:** Full-closure CME holidays automatically increment the target trade date to the next valid operational session.

### 2.2 Synchronized Options Basis & Settlement Anchors
* **Timestamp Delta Enforcement ($\Delta t \le 60$s):** When translating NDX/QQQ option walls (GEX Call Wall, Put Wall, Gamma Flip) to NQ futures points, quote timestamps must synchronize within 60 seconds. If timestamps diverge, the basis ratio is frozen to the prior synchronous 16:00 ET settlement close, eliminating artificial 100+ point strike displacements.
* **Settlement PDC Anchor:** Prior Day Close is strictly anchored to the official 16:00 ET CME settlement close, never the 17:00 ET Globex last trade print.
* **Macro Rate Input:** Measures pre-market Treasury yields from 23-hour CME 10-Year Treasury Note futures (`ZN=F`), avoiding halted cash `^TNX` quotes.
* **Microstructure Labeling Honesty:** Bar-derived $CLV \times Volume$ is strictly labeled as **"Volume-Weighted Wick Rejection"** unless native CME AggressorSide tick flags are present. `CVD DIV` markers are disabled on synthetic bar data.

---

## 3. Multi-Session Structural Reference Levels

### 3.1 Prior-Day Reference Levels
* **Prior Day High (PDH) & Prior Day Low (PDL):** Primary institutional liquidity pools (BSL/SSL).
* **Prior Day Settlement Close (PDC):** Official 16:00 ET CME settlement price dividing net long from net short inventory.
* **Prior Day Volume Profile (VAH, POC, VAL):** Anchored volume-at-price structures that carry institutional structural priority over theoretical Fibonacci levels.

### 3.2 Overnight (Globex) Structural Reference Levels
* **Overnight High (ONH) & Low (ONL):** Globex range boundaries (18:00–09:30 ET).
* **Overnight 50% Midpoint (ON Mid):** $(ONH + ONL) / 2$, serving as overnight fair-value equilibrium.

### 3.3 Multi-Anchor VWAP
* **Session VWAP (09:30 ET anchor):** Primary institutional execution benchmark.
* **Globex VWAP (18:00 ET anchor):** Overnight fair-value anchor.
* **Prior Day RTH VWAP (09:30–16:00 ET anchor):** Multi-day institutional responsive support/resistance.
* **TWAP Fallback Protection:** Activates with explicit badge if volume feeds drop.

### 3.4 Rule of 16 Implied Volatility Bounds & Straddle Limits
Dividing Cboe 30-day volatility indices by $\sqrt{252}$ inflates daily expected move by +20.3%. MinBook strictly divides calendar-day indices by $\sqrt{365}$:

$$\text{Daily Expected Move (1-SD)} = \frac{\text{PDC} \times (VXN / 100)}{\sqrt{365}}$$
$$\text{Expected Straddle Move} = \text{Daily Expected Move} \times \sqrt{\frac{2}{\pi}} \approx 0.79788 \times \text{Daily Expected Move}$$

* **Honest Straddle Coverage:** Labeled honestly as **~57.5% Normal Distribution Coverage** (never deceptively as 68%).
* Where available, MinBook ingests `VOLQ` and `VIX1D` for same-day options pricing.

---

## 4. Volatility Surface, Realized Volatility & Macro Regime Engine

### 4.1 Dimensionless Variance Risk Premium (VRP Ratio)
Rather than linear point differences, MinBook formulates VRP as a dimensionless ratio using 5-minute intraday realized volatility:

$$VRP = \frac{IV_{30d}}{RV_{5m, 20d}}$$

* **Rich Volatility ($VRP > 1.15$):** Options IV trades at a healthy premium over realized volatility. Orderly, predictable mean-reversion retrace conditions.
* **Fair Volatility ($0.95 \le VRP \le 1.15$):** Options prices match realized variance.
* **Vol Dislocation ($VRP < 0.95$):** Intraday realized swings exceed options pricing. Triggers an automatic **STOP-RUN DISLOCATION WARNING** and scales Layer 1 position size to **0.5x**.

### 4.2 Diurnally Matched Open Range Volatility (`ATR_Open_15m`)
Pre-market 15m ATR during overnight hours (8–18 pts) drastically underestimates opening volatility (35–80 pts). MinBook calculates `ATR_Open_15m` as the median range of the trailing 15 sessions' 09:30–09:45 ET opening bar. All stop-loss buffers, reachability targets, and Anti-Chase thresholds scale directly from this diurnal anchor.

### 4.3 Volatility Term Structure & Shock Triggers
* **Term Ratio ($VIX / VIX3M$):** $> 1.00$ flags **Backwardation (Stress Regime)**, cutting size multiplier to 0.5x.
* **Short-Term Shock ($VIX9D / VIX$):** $> 1.15$ flags acute opening event volatility.
* **Vol-of-Vol ($VVIX$):** $\ge 110$ flags extreme tail-risk stop runs.

---

## 5. Two-Layer Gated Decision Engine

MinBook strictly separates non-directional volatility state from directional bias.

### Layer 1: Multiplicative Risk & Target Gates
Controls position size multiplier (1.0x / 0.5x / 0.0x), target caps, and volatility warnings. Never alters directional point scores.
* **VRP Ratio $< 0.95$:** Size $\times 0.5$.
* **Term Structure Backwardation ($VIX/VIX3M > 1.00$):** Size $\times 0.5$.
* **Vol-of-Vol ($VVIX \ge 110$):** Size $\times 0.5$.
* **Dealer Gamma Tilt (GEX):**
  * Positive Gamma ($+\Gamma$): Scales target caps down to 1.8R–2.2R (pinning/mean-reversion).
  * Negative Gamma ($-\Gamma$): Permits target expansion up to 2.5R–3.0R (volatility acceleration).
* **Macro News Blackout:** Size $\times 0.0$ if high-impact release falls within $\pm 2$ minutes of open.

### Layer 2: 4 Orthogonal Directional Signals
Aggregates exactly four orthogonal directional inputs with equal 1.0 baseline weights (score $-4$ to $+4$):
1. **Composite HTF & Auction Location:** Combines HTF trend, PDC position, Session VWAP, and Overnight Inventory. Enforces a conditional reversal-risk veto if inventory $\ge 70\%$ opens below ON Mid.
2. **Cross-Index SMT Divergence + Breadth:** Non-confirmations between `NQ` and `ES` swing extremes combined with mega-cap breadth.
3. **23h Macro Impulse:** Pre-market rate velocity via `ZN` and `DX` futures.
4. **Opening Flow:** Evaluates Volume-Weighted Wick Rejection at structural inflection levels.

---

## 6. Lower-Timeframe (1m) Execution Engine (`ltfExecution.ts`)

Operating during the **09:34–09:50 AM ET execution window** following the 09:30–09:33 ET observation freeze, the LTF Execution Engine outputs a concrete Trade Card:

### 6.1 Setup Archetypes
1. **Retrace Continuation Card:**
   * Computes the 40%–50% impulse retrace zone into 1m Fair Value Gaps (FVG) or Session VWAP.
   * Places 1m structural stop:
     $$SL = \text{1m Swing Extreme} \pm \max(3.0 \text{ pts}, 0.25 \times ATR_{1m})$$
   * Triggers an **ANTI-CHASE WARNING** if live price is $> 0.35 \times ATR\_Open\_15m$ from the invalidation stop.
2. **Sweep + MSS Reversal Card:**
   * Detects liquidity sweeps of `ORH_3m` / `ORL_3m` or `ONH` / `ONL` followed by a 1-minute displacement candle closing back inside range (Market Structure Shift).
   * Anchors stop loss strictly to the sweep wick extreme.

### 6.2 Reachability Target Engine
* Uses Brownian first-passage touch probability over 5m, 10m, and 15m horizons with $\sigma_{15m} = 0.50 \times ATR\_Open\_15m$:
  $$P(\text{Touch Target } L \text{ within time } T) = 2 \left( 1 - \Phi\left( \frac{|L - P_{\text{entry}}|}{\sigma \sqrt{T / 15}} \right) \right)$$
* **TP1:** Selected strictly from structural pivots inside $[0.25, 0.45] \times ATR\_Open\_15m$.
* **TP2:** Selected strictly inside $[0.50, 0.75] \times ATR\_Open\_15m$.
* **HTF Context Demotion:** Any HTF levels lying $> 0.75 \times ATR\_Open\_15m$ away are demoted to a collapsed `HTF Context Only` panel with their 10m touch probability badge.

### 6.3 1m MSS Exit / Kill-Switch Price
* If an active trade reaches $\ge 0.8R$ MFE and an opposing 1-minute candle subsequently closes back across the entry price, the system triggers an immediate **MSS Kill-Switch Exit** to protect locked partial profits.

---

## 7. Typed Prop Firm Profiles (`PropProfile`) & Dynamic Sizing

MinBook incorporates typed configurations for leading prop firm evaluation models:

| Profile Name | Drawdown Mode | Daily Target | Loss Limit | Consistency Cap | Fees (RT MNQ) | Slippage (pts) | Max MNQ |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Topstep_EOD** | EOD_SETTLEMENT | $600 | $400 | 40% ($240 max/day) | $1.30 | 0.75 (3 ticks) | 5 |
| **Tradeify_EOD** | EOD_SETTLEMENT | $600 | $400 | 40% ($240 max/day) | $1.24 | 0.75 (3 ticks) | 5 |
| **Apex_EOD** | EOD_SETTLEMENT | $600 | $400 | 35% ($210 max/day) | $1.20 | 0.75 (3 ticks) | 5 |
| **Apex_Intraday** | INTRADAY_UNREALIZED | $500 | $350 | 30% ($150 max/day) | $1.20 | 0.75 (3 ticks) | 4 |
| **TPT_PRO_Intraday**| INTRADAY_UNREALIZED | $500 | $350 | 30% ($150 max/day) | $1.26 | 0.75 (3 ticks) | 4 |
| **MFFU_Rapid_Intraday**| INTRADAY_UNREALIZED| $500 | $350 | 35% ($175 max/day) | $1.30 | 0.75 (3 ticks) | 4 |
| **MFFU_Pro_EOD** | EOD_SETTLEMENT | $600 | $400 | 40% ($240 max/day) | $1.30 | 0.75 (3 ticks) | 5 |

* **Intraday Unrealized Drawdown Guardrail:** If `drawdownMode === 'INTRADAY_UNREALIZED'`, TP is automatically capped at 1.3R–1.8R, breakeven runners are disabled, and a prominent phantom-drawdown alert is displayed.
* **Consistency Rule Profit Caps:** Daily profit targets are dynamically capped below the rule threshold (e.g., $0.38 \times \text{Target}$ on 40% rules).
* **Quantization & Contract Splitting:**
  * 1 MNQ: Partial scale-outs disabled; switches to single TP1 exit.
  * $\ge 2$ MNQ: Allocates scale-outs (50% at TP1, 50% runner at TP2).

---

## 8. Empirical Verification, Triple-Barrier Auto-Grading & Safe Calibration

### 8.1 1-Minute Path-Dependent Triple-Barrier R-Expectancy Grader
1. **Limit Entry Simulation:** Simulates limit entry at the predicted 40%–50% retrace zone between 09:34 and 09:48 ET. If price never retraces, outcome is recorded honestly as `NO_FILL`.
2. **Barrier 1 (Stop Loss):** Invalidation stop hit $\implies$ logs realized $-1.0R$ net of friction.
3. **Barrier 2 (Take Profit):** Scale-out 1 contract at TP1; exit remaining runner at TP2 or via 1m MSS kill-switch.
4. **Barrier 3 (Time Exit):** At 10:00 AM ET, any remaining active contracts are liquidated at the 10:00 AM close price.
5. **Friction Accounting:** Deducts exact round-trip commissions ($1.30 MNQ) plus 3-tick (0.75 pt / $1.50) opening slippage.
6. **Strictly Proper Scoring Rules:** Evaluates Brier score $(p - y)^2$ and Logarithmic scoring rule $-\sum y \ln(p)$.

### 8.2 Closed-Form Beta-Binomial Bayesian Shrinkage Optimizer
* Conjugate Beta prior: $\alpha_0 = 25, \beta_0 = 25$ (prior mean 50%, prior pseudo-sample size 50).
* Optional exponential forgetting factor: $\gamma = 0.99$.
* Posterior mean:
  $$\hat{\theta}_j^{\text{Bayes}} = \frac{k_j^{(\gamma)} + \alpha_0}{n_j^{(\gamma)} + \alpha_0 + \beta_0}$$
* Production weight clipping:
  $$w_j^* = \max\left( 0.6, \min\left( 1.5, 2.0 \times \hat{\theta}_j^{\text{Bayes}} \right) \right)$$
* **Strict Sample Size Gate ($N \ge 60$):** `EDGE ENHANCER` ($\ge +4\%$) and `NOISE DETRACTOR` ($\le -4\%$) tags remain suppressed (`NEUTRAL`) until effective sample size $N \ge 60$.

### 8.3 Non-Parametric Bootstrap MAE Stop Calibration
* **Dual Collection Gate ($N \ge 150$ total trades AND $\ge 75$ winning trades):** Prevents premature stop tightening based on small-sample curve fitting.
* When calibrated, computes the **upper 90% bootstrap confidence bound** of Winners' P90 MAE across 1,000 resamples:
  $$\text{Upper } 90\% \text{ Bootstrap Bound} = \text{Quantile}_{0.90}\left( \{ \text{P90 MAE}^{*(b)} \}_{b=1}^{1000} \right)$$
* Stop tightening is recommended only if the upper bootstrap bound demonstrates that 90% of resampled distributions experience adverse excursion within safe limits.

---

## 9. Resolutions of Previous Research Directives

With the release of MinBook v3.0, the core theoretical and empirical challenges outlined in v2.0 have been systematically resolved:
1. **Microstructure Honesty:** Synthetic bar CLV is rebranded to "Volume-Weighted Wick Rejection", and `CVD DIV` markers are deactivated in the absence of native aggressor side feeds.
2. **Synchronized Basis:** Option strike translation now enforces $\Delta t \le 60$s synchronization or freezes to 16:00 ET settlement.
3. **Decoupled Two-Layer Architecture:** Volatility state (VRP, term structure, gamma) has been decoupled into Layer 1 Multiplicative Risk Gates, preserving Layer 2 as 4 orthogonal directional signals.
4. **23h Macro Impulse:** Cash `^TNX` has been replaced with 23h CME ZN Treasury futures and DX Dollar futures.
5. **Bayesian Shrinkage:** The discrete 21/9 walk-forward optimizer has been replaced with closed-form Beta-Binomial Bayesian Shrinkage ($\alpha_0=25, \beta_0=25$, clip $[0.6, 1.5]$, $N \ge 60$ status gate).
6. **Path-Dependent Execution:** Replaced binary open-to-high ATR expansion with a 1-minute Triple-Barrier R-expectancy grader including limit fill, scale-outs, MSS kill-switch, and 10:00 AM vertical exit.
