import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { UserProfile, TradeLogEntry, JournalAnalytics, SavedDailyBrief, ChecklistState } from "../../types/app";
import { OpenBriefData } from "../../types/market";

const DB_DIR = path.join(process.cwd(), "data");
const legacyDbPath = path.join(DB_DIR, "openpulse.db");
const defaultDbPath =
  fs.existsSync(legacyDbPath) && !fs.existsSync(path.join(DB_DIR, "minbook.db"))
    ? legacyDbPath
    : path.join(DB_DIR, "minbook.db");
const DB_PATH = process.env.DATABASE_PATH || defaultDbPath;

let dbInstance: DatabaseSync | null = null;

export function getDb(): DatabaseSync {
  if (dbInstance) {
    return dbInstance;
  }

  if (!fs.existsSync(DB_DIR)) {
    fs.mkdirSync(DB_DIR, { recursive: true });
  }

  const db = new DatabaseSync(DB_PATH);

  // Enable WAL mode for performance and concurrent reads
  try {
    db.exec("PRAGMA journal_mode = WAL;");
    db.exec("PRAGMA foreign_keys = ON;");
  } catch (err) {
    console.warn("Notice: could not set PRAGMA journal_mode", err);
  }

  // Initialize schema
  db.exec(`
    CREATE TABLE IF NOT EXISTS profiles (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      default_instrument TEXT NOT NULL DEFAULT 'NQ',
      risk_budget_dollars REAL NOT NULL DEFAULT 250,
      target_budget_dollars REAL NOT NULL DEFAULT 550,
      max_daily_trades INTEGER NOT NULL DEFAULT 1,
      max_daily_loss_dollars REAL NOT NULL DEFAULT 350,
      trailing_drawdown_alert REAL NOT NULL DEFAULT 2000,
      notes TEXT DEFAULT '',
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS trades (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL DEFAULT 'default',
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL DEFAULT 'NQ',
      direction TEXT NOT NULL,
      entry_price REAL NOT NULL,
      stop_price REAL NOT NULL,
      target_price REAL NOT NULL,
      exit_price REAL NOT NULL,
      worst_price REAL DEFAULT NULL,
      best_price REAL DEFAULT NULL,
      contracts INTEGER NOT NULL DEFAULT 1,
      planned_risk_dollars REAL NOT NULL,
      planned_target_dollars REAL NOT NULL,
      actual_pnl_dollars REAL NOT NULL,
      actual_pnl_r REAL NOT NULL,
      mae_r REAL NOT NULL,
      mfe_r REAL NOT NULL,
      exit_efficiency_percent REAL DEFAULT NULL,
      stopped_out INTEGER NOT NULL DEFAULT 0,
      entry_time_et TEXT NOT NULL,
      exit_time_et TEXT NOT NULL,
      retrace_level_used TEXT DEFAULT '',
      notes TEXT DEFAULT '',
      vxn_snapshot REAL DEFAULT NULL,
      term_ratio_snapshot REAL DEFAULT NULL,
      vvix_snapshot REAL DEFAULT NULL,
      vrp_snapshot REAL DEFAULT NULL,
      inventory_percent_snapshot REAL DEFAULT NULL,
      smt_snapshot TEXT DEFAULT '',
      bias_verdict_snapshot TEXT DEFAULT '',
      session_bars_json TEXT DEFAULT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS daily_briefs (
      id TEXT PRIMARY KEY,
      trade_date TEXT NOT NULL,
      symbol TEXT NOT NULL,
      brief_json TEXT NOT NULL,
      notes TEXT DEFAULT '',
      created_by TEXT NOT NULL DEFAULT 'system',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS checklists (
      trade_date TEXT NOT NULL,
      user_id TEXT NOT NULL,
      state_json TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      PRIMARY KEY (trade_date, user_id)
    );
  `);

  // Auto-migrate schema for v2.0
  try {
    const tableInfo = db.prepare("PRAGMA table_info(trades)").all() as Array<{ name: string }>;
    const colNames = new Set(tableInfo.map((c) => c.name));
    if (!colNames.has("worst_price")) db.exec("ALTER TABLE trades ADD COLUMN worst_price REAL DEFAULT NULL;");
    if (!colNames.has("best_price")) db.exec("ALTER TABLE trades ADD COLUMN best_price REAL DEFAULT NULL;");
    if (!colNames.has("exit_efficiency_percent")) db.exec("ALTER TABLE trades ADD COLUMN exit_efficiency_percent REAL DEFAULT NULL;");
    if (!colNames.has("vxn_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN vxn_snapshot REAL DEFAULT NULL;");
    if (!colNames.has("term_ratio_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN term_ratio_snapshot REAL DEFAULT NULL;");
    if (!colNames.has("vvix_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN vvix_snapshot REAL DEFAULT NULL;");
    if (!colNames.has("vrp_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN vrp_snapshot REAL DEFAULT NULL;");
    if (!colNames.has("inventory_percent_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN inventory_percent_snapshot REAL DEFAULT NULL;");
    if (!colNames.has("smt_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN smt_snapshot TEXT DEFAULT '';");
    if (!colNames.has("bias_verdict_snapshot")) db.exec("ALTER TABLE trades ADD COLUMN bias_verdict_snapshot TEXT DEFAULT '';");
    if (!colNames.has("session_bars_json")) db.exec("ALTER TABLE trades ADD COLUMN session_bars_json TEXT DEFAULT NULL;");
  } catch (err) {
    console.warn("Notice: trades table migration:", err);
  }

  // Seed default user profiles if empty
  const countRow = db.prepare("SELECT COUNT(*) as cnt FROM profiles").get() as { cnt: number } | undefined;
  if (!countRow || countRow.cnt === 0) {
    const insertProfile = db.prepare(`
      INSERT INTO profiles (id, name, default_instrument, risk_budget_dollars, target_budget_dollars, max_daily_trades, max_daily_loss_dollars, trailing_drawdown_alert, notes, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const now = new Date().toISOString();
    insertProfile.run("default", "Primary Trader", "NQ", 250, 550, 1, 300, 2500, "1 trade/day NQ continuation specialist. Enforce $250 stop discipline.", now);
    insertProfile.run("prop-eval", "Prop Evaluation", "MNQ", 200, 500, 1, 200, 1500, "MNQ precision scaling. 2-4 contracts with 25pt buffer.", now);
    insertProfile.run("conservative", "Conservative Account", "NQ", 300, 600, 1, 400, 2000, "50k Prop account evaluation rule-set. Hard 1-trade rule.", now);
  }

  // Seed initial trades if empty so MAE/MFE analytics are immediately useful
  const tradeCount = db.prepare("SELECT COUNT(*) as cnt FROM trades").get() as { cnt: number } | undefined;
  if (!tradeCount || tradeCount.cnt === 0) {
    seedInitialTrades(db);
  }

  dbInstance = db;
  return dbInstance;
}

function seedInitialTrades(db: DatabaseSync) {
  const insert = db.prepare(`
    INSERT INTO trades (
      id, user_id, trade_date, symbol, direction, entry_price, stop_price, target_price,
      exit_price, contracts, planned_risk_dollars, planned_target_dollars, actual_pnl_dollars,
      actual_pnl_r, mae_r, mfe_r, stopped_out, entry_time_et, exit_time_et, retrace_level_used, notes, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const initialTrades = [
    {
      id: "tr-001",
      userId: "default",
      tradeDate: "2026-11-19",
      symbol: "NQ" as const,
      direction: "LONG" as const,
      entryPrice: 20950.0,
      stopPrice: 20937.5, // 12.5 pts = $250
      targetPrice: 20980.0, // 30 pts = $600 = 2.4R
      exitPrice: 20980.0,
      contracts: 1,
      plannedRiskDollars: 250,
      plannedTargetDollars: 600,
      actualPnlDollars: 600,
      actualPnlR: 2.4,
      maeR: 0.28, // pulled back only 0.28R before launching
      mfeR: 2.5,
      stoppedOut: 0,
      entryTimeET: "09:34:10",
      exitTimeET: "09:48:22",
      retraceLevelUsed: "Overnight Mid + Session VWAP",
      notes: "Waited 4 mins for first drive to fail into VWAP. Clean bounce into PDH target.",
      createdAt: "2026-11-19T10:05:00Z"
    },
    {
      id: "tr-002",
      userId: "default",
      tradeDate: "2026-11-20",
      symbol: "NQ" as const,
      direction: "SHORT" as const,
      entryPrice: 20880.0,
      stopPrice: 20893.0, // 13 pts = $260
      targetPrice: 20850.0, // 30 pts = $600
      exitPrice: 20850.0,
      contracts: 1,
      plannedRiskDollars: 260,
      plannedTargetDollars: 600,
      actualPnlDollars: 600,
      actualPnlR: 2.31,
      maeR: 0.35,
      mfeR: 2.6,
      stoppedOut: 0,
      entryTimeET: "09:36:45",
      exitTimeET: "09:52:10",
      retraceLevelUsed: "PDC Rejection",
      notes: "London low broken pre-market. Retrace to PDC held as resistance.",
      createdAt: "2026-11-20T10:01:00Z"
    },
    {
      id: "tr-003",
      userId: "default",
      tradeDate: "2026-11-21",
      symbol: "NQ" as const,
      direction: "LONG" as const,
      entryPrice: 21020.0,
      stopPrice: 21007.5,
      targetPrice: 21055.0,
      exitPrice: 21007.5,
      contracts: 1,
      plannedRiskDollars: 250,
      plannedTargetDollars: 700,
      actualPnlDollars: -250,
      actualPnlR: -1.0,
      maeR: 1.0,
      mfeR: 0.45,
      stoppedOut: 1,
      entryTimeET: "09:32:15",
      exitTimeET: "09:35:50",
      retraceLevelUsed: "ONH breakout retest",
      notes: "Chased entry too early at 9:32 AM. Faked out by opening volatility whip. Need to wait for 9:34+.",
      createdAt: "2026-11-21T09:40:00Z"
    },
    {
      id: "tr-004",
      userId: "default",
      tradeDate: "2026-11-22",
      symbol: "NQ" as const,
      direction: "LONG" as const,
      entryPrice: 21105.0,
      stopPrice: 21092.5,
      targetPrice: 21135.0,
      exitPrice: 21135.0,
      contracts: 1,
      plannedRiskDollars: 250,
      plannedTargetDollars: 600,
      actualPnlDollars: 600,
      actualPnlR: 2.4,
      maeR: 0.22,
      mfeR: 2.7,
      stoppedOut: 0,
      entryTimeET: "09:38:00",
      exitTimeET: "09:56:40",
      retraceLevelUsed: "HTF 50% Equilibrium Zone",
      notes: "Patient entry at 9:38 AM after 10-point retrace into 50% discount zone.",
      createdAt: "2026-11-22T10:15:00Z"
    }
  ];

  for (const t of initialTrades) {
    insert.run(
      t.id, t.userId, t.tradeDate, t.symbol, t.direction, t.entryPrice, t.stopPrice,
      t.targetPrice, t.exitPrice, t.contracts, t.plannedRiskDollars, t.plannedTargetDollars,
      t.actualPnlDollars, t.actualPnlR, t.maeR, t.mfeR, t.stoppedOut, t.entryTimeET,
      t.exitTimeET, t.retraceLevelUsed, t.notes, t.createdAt
    );
  }
}

// ----------------- Profile Repositories -----------------

export function getProfiles(): UserProfile[] {
  const db = getDb();
  const rows = db.prepare("SELECT * FROM profiles ORDER BY id = 'default' DESC, name ASC").all() as any[];
  return rows.map((r) => ({
    id: r.id,
    name: r.name,
    defaultInstrument: r.default_instrument,
    riskBudgetDollars: r.risk_budget_dollars,
    targetBudgetDollars: r.target_budget_dollars,
    maxDailyTrades: r.max_daily_trades,
    maxDailyLossDollars: r.max_daily_loss_dollars,
    trailingDrawdownAlert: r.trailing_drawdown_alert,
    notes: r.notes || "",
    updatedAt: r.updated_at
  }));
}

export function getProfile(id: string): UserProfile | null {
  const db = getDb();
  const r = db.prepare("SELECT * FROM profiles WHERE id = ?").get(id) as any;
  if (!r) return null;
  return {
    id: r.id,
    name: r.name,
    defaultInstrument: r.default_instrument,
    riskBudgetDollars: r.risk_budget_dollars,
    targetBudgetDollars: r.target_budget_dollars,
    maxDailyTrades: r.max_daily_trades,
    maxDailyLossDollars: r.max_daily_loss_dollars,
    trailingDrawdownAlert: r.trailing_drawdown_alert,
    notes: r.notes || "",
    updatedAt: r.updated_at
  };
}

export function upsertProfile(p: Partial<UserProfile> & { id: string; name: string }): UserProfile {
  const db = getDb();
  const existing = getProfile(p.id);
  const now = new Date().toISOString();

  const full: UserProfile = {
    id: p.id,
    name: p.name,
    defaultInstrument: p.defaultInstrument ?? existing?.defaultInstrument ?? "NQ",
    riskBudgetDollars: p.riskBudgetDollars ?? existing?.riskBudgetDollars ?? 250,
    targetBudgetDollars: p.targetBudgetDollars ?? existing?.targetBudgetDollars ?? 550,
    maxDailyTrades: p.maxDailyTrades ?? existing?.maxDailyTrades ?? 1,
    maxDailyLossDollars: p.maxDailyLossDollars ?? existing?.maxDailyLossDollars ?? 350,
    trailingDrawdownAlert: p.trailingDrawdownAlert ?? existing?.trailingDrawdownAlert ?? 2000,
    notes: p.notes ?? existing?.notes ?? "",
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO profiles (id, name, default_instrument, risk_budget_dollars, target_budget_dollars, max_daily_trades, max_daily_loss_dollars, trailing_drawdown_alert, notes, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      name = excluded.name,
      default_instrument = excluded.default_instrument,
      risk_budget_dollars = excluded.risk_budget_dollars,
      target_budget_dollars = excluded.target_budget_dollars,
      max_daily_trades = excluded.max_daily_trades,
      max_daily_loss_dollars = excluded.max_daily_loss_dollars,
      trailing_drawdown_alert = excluded.trailing_drawdown_alert,
      notes = excluded.notes,
      updated_at = excluded.updated_at
  `).run(
    full.id, full.name, full.defaultInstrument, full.riskBudgetDollars,
    full.targetBudgetDollars, full.maxDailyTrades, full.maxDailyLossDollars,
    full.trailingDrawdownAlert, full.notes ?? "", full.updatedAt
  );

  return full;
}

// ----------------- Trade Log & MAE / MFE Repositories -----------------

export function getTrades(userId?: string): TradeLogEntry[] {
  const db = getDb();
  const query = userId
    ? "SELECT * FROM trades WHERE user_id = ? ORDER BY trade_date DESC, created_at DESC"
    : "SELECT * FROM trades ORDER BY trade_date DESC, created_at DESC";

  const rows = (userId ? db.prepare(query).all(userId) : db.prepare(query).all()) as any[];

  return rows.map((r) => ({
    id: r.id,
    userId: r.user_id,
    tradeDate: r.trade_date,
    symbol: r.symbol,
    direction: r.direction,
    entryPrice: r.entry_price,
    stopPrice: r.stop_price,
    targetPrice: r.target_price,
    exitPrice: r.exit_price,
    worstPrice: r.worst_price ?? undefined,
    bestPrice: r.best_price ?? undefined,
    contracts: r.contracts,
    plannedRiskDollars: r.planned_risk_dollars,
    plannedTargetDollars: r.planned_target_dollars,
    actualPnlDollars: r.actual_pnl_dollars,
    actualPnlR: r.actual_pnl_r,
    maeR: r.mae_r,
    mfeR: r.mfe_r,
    exitEfficiencyPercent: r.exit_efficiency_percent ?? undefined,
    stoppedOut: Boolean(r.stopped_out),
    entryTimeET: r.entry_time_et,
    exitTimeET: r.exit_time_et,
    retraceLevelUsed: r.retrace_level_used || "",
    notes: r.notes || "",
    vxnSnapshot: r.vxn_snapshot ?? undefined,
    termRatioSnapshot: r.term_ratio_snapshot ?? undefined,
    vvixSnapshot: r.vvix_snapshot ?? undefined,
    vrpSnapshot: r.vrp_snapshot ?? undefined,
    inventoryPercentSnapshot: r.inventory_percent_snapshot ?? undefined,
    smtSnapshot: r.smt_snapshot || "",
    biasVerdictSnapshot: r.bias_verdict_snapshot || "",
    sessionBarsJson: r.session_bars_json ?? undefined,
    createdAt: r.created_at
  }));
}

export function addTrade(trade: Omit<TradeLogEntry, "id" | "createdAt">): TradeLogEntry {
  const db = getDb();
  const id = `tr-${Date.now().toString(36)}-${Math.random().toString(36).substring(2, 6)}`;
  const createdAt = new Date().toISOString();

  db.prepare(`
    INSERT INTO trades (
      id, user_id, trade_date, symbol, direction, entry_price, stop_price, target_price,
      exit_price, worst_price, best_price, contracts, planned_risk_dollars, planned_target_dollars, actual_pnl_dollars,
      actual_pnl_r, mae_r, mfe_r, exit_efficiency_percent, stopped_out, entry_time_et, exit_time_et, retrace_level_used, notes,
      vxn_snapshot, term_ratio_snapshot, vvix_snapshot, vrp_snapshot, inventory_percent_snapshot, smt_snapshot, bias_verdict_snapshot, session_bars_json, created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id, trade.userId, trade.tradeDate, trade.symbol, trade.direction,
    trade.entryPrice, trade.stopPrice, trade.targetPrice, trade.exitPrice,
    trade.worstPrice ?? null, trade.bestPrice ?? null,
    trade.contracts, trade.plannedRiskDollars, trade.plannedTargetDollars,
    trade.actualPnlDollars, trade.actualPnlR, trade.maeR, trade.mfeR,
    trade.exitEfficiencyPercent ?? null,
    trade.stoppedOut ? 1 : 0, trade.entryTimeET, trade.exitTimeET,
    trade.retraceLevelUsed, trade.notes,
    trade.vxnSnapshot ?? null, trade.termRatioSnapshot ?? null, trade.vvixSnapshot ?? null,
    trade.vrpSnapshot ?? null, trade.inventoryPercentSnapshot ?? null,
    trade.smtSnapshot ?? "", trade.biasVerdictSnapshot ?? "", trade.sessionBarsJson ?? null, createdAt
  );

  return {
    ...trade,
    id,
    createdAt
  };
}

export function deleteTrade(id: string): boolean {
  const db = getDb();
  const res = db.prepare("DELETE FROM trades WHERE id = ?").run(id);
  return res.changes > 0;
}

/**
 * Computes upper confidence bound of the 90th percentile using non-parametric bootstrap resampling.
 */
export function computeBootstrapUpperP90(data: number[], numReplications = 1000, confidence = 0.90): number {
  if (data.length === 0) return 1.0;
  const bEstimates: number[] = [];
  const n = data.length;
  for (let i = 0; i < numReplications; i++) {
    const sample: number[] = new Array(n);
    for (let j = 0; j < n; j++) {
      const randIdx = Math.floor(Math.random() * n);
      sample[j] = data[randIdx];
    }
    sample.sort((a, b) => a - b);
    bEstimates.push(sample[Math.floor(n * 0.90)]);
  }
  bEstimates.sort((a, b) => a - b);
  const upperIdx = Math.min(bEstimates.length - 1, Math.floor(bEstimates.length * confidence));
  return Math.round(bEstimates[upperIdx] * 100) / 100;
}

export function computeJournalAnalytics(userId?: string): JournalAnalytics {
  const trades = getTrades(userId);

  if (trades.length === 0) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      scratches: 0,
      winRatePercent: 0,
      totalPnlDollars: 0,
      avgPnlR: 0,
      profitFactor: 0,
      expectancyR: 0,
      avgMaeWinningTradesR: 0,
      avgMaeLosingTradesR: 0,
      avgMfeTradesR: 0,
      avgExitEfficiencyPercent: 0,
      sampleSizeGate: {
        isCalibrated: false,
        targetSampleSize: 150,
        currentCount: 0,
        targetWinningTrades: 75,
        currentWinningTrades: 0,
        statusMessage: "COLLECTING SAMPLE (0/150 TRADES, 0/75 WINS) — DO NOT TIGHTEN STOPS YET"
      },
      deepHeatDistribution: {
        under25PctR: 0,
        under50PctR: 0,
        under75PctR: 0,
        severeDrawdown: 0
      },
      recommendation: "Log your first 5-10 trades to build a genuine baseline."
    };
  }

  let wins = 0;
  let losses = 0;
  let scratches = 0;
  let grossWinsDollars = 0;
  let grossLossesDollars = 0;
  let totalPnlDollars = 0;
  let sumPnlR = 0;

  let sumMaeWinners = 0;
  let sumMaeLosers = 0;
  let sumMfe = 0;
  let sumExitEfficiency = 0;
  let exitEfficiencyCount = 0;

  const winnerMaes: number[] = [];

  const distribution = {
    under25PctR: 0,
    under50PctR: 0,
    under75PctR: 0,
    severeDrawdown: 0
  };

  for (const t of trades) {
    totalPnlDollars += t.actualPnlDollars;
    sumPnlR += t.actualPnlR;
    sumMfe += t.mfeR;

    if (t.actualPnlDollars > 0) {
      wins++;
      grossWinsDollars += t.actualPnlDollars;
      sumMaeWinners += t.maeR;
      winnerMaes.push(t.maeR);

      if (t.exitEfficiencyPercent !== undefined && t.exitEfficiencyPercent > 0) {
        sumExitEfficiency += t.exitEfficiencyPercent;
        exitEfficiencyCount++;
      } else if (t.mfeR > 0 && t.actualPnlR > 0) {
        sumExitEfficiency += Math.min(100, (t.actualPnlR / t.mfeR) * 100);
        exitEfficiencyCount++;
      }

      if (t.maeR <= 0.25) {
        distribution.under25PctR++;
      } else if (t.maeR <= 0.50) {
        distribution.under50PctR++;
      } else if (t.maeR <= 0.75) {
        distribution.under75PctR++;
      } else {
        distribution.severeDrawdown++;
      }
    } else if (t.actualPnlDollars < 0) {
      losses++;
      grossLossesDollars += Math.abs(t.actualPnlDollars);
      sumMaeLosers += t.maeR;
    } else {
      scratches++;
    }
  }

  const isCalibrated = trades.length >= 150 && wins >= 75;
  const sampleSizeGate = {
    isCalibrated,
    targetSampleSize: 150,
    currentCount: trades.length,
    targetWinningTrades: 75,
    currentWinningTrades: wins,
    statusMessage:
      !isCalibrated
        ? `COLLECTING SAMPLE (${trades.length}/150 TRADES, ${wins}/75 WINS) — DO NOT TIGHTEN STOPS YET`
        : `SAMPLE CALIBRATED (${trades.length} TRADES, ${wins} WINS) — BOOTSTRAP P90 MAE ACTIVE`
  };

  const winRate = (wins / trades.length) * 100;
  const profitFactor = grossLossesDollars > 0 ? grossWinsDollars / grossLossesDollars : grossWinsDollars > 0 ? 99 : 0;
  const avgPnlR = sumPnlR / trades.length;
  const avgMaeWinners = wins > 0 ? sumMaeWinners / wins : 0;
  const avgMaeLosers = losses > 0 ? sumMaeLosers / losses : 0;
  const avgMfe = sumMfe / trades.length;
  const avgExitEfficiencyPercent = exitEfficiencyCount > 0 ? sumExitEfficiency / exitEfficiencyCount : 0;

  let percentile85MaeWinners: number | undefined;
  let percentile90MaeWinners: number | undefined;
  let upper90BootstrapMaeWinners: number | undefined;

  if (winnerMaes.length >= 20) {
    winnerMaes.sort((a, b) => a - b);
    percentile85MaeWinners = winnerMaes[Math.floor(winnerMaes.length * 0.85)];
    percentile90MaeWinners = winnerMaes[Math.floor(winnerMaes.length * 0.90)];
  }

  if (isCalibrated && winnerMaes.length >= 75) {
    upper90BootstrapMaeWinners = computeBootstrapUpperP90(winnerMaes, 1000, 0.90);
  }

  let recommendation = "";
  if (!isCalibrated) {
    recommendation = `Collecting sample (${trades.length}/150 trades, ${wins}/75 winners). Do NOT prematurely tighten stops based on small-sample curve fitting. Honor your structural stop level.`;
  } else if (upper90BootstrapMaeWinners !== undefined) {
    if (upper90BootstrapMaeWinners <= 0.70) {
      recommendation = `Calibrated (${trades.length} trades, ${wins} winners): Upper 90% bootstrap bound of winners' P90 MAE is ${upper90BootstrapMaeWinners.toFixed(2)}R (Point P90: ${percentile90MaeWinners?.toFixed(2) || "0.65"}R). Stops beyond ${upper90BootstrapMaeWinners.toFixed(2)}R can be tightened safely without truncating valid continuation trades.`;
    } else {
      recommendation = `Calibrated (${trades.length} trades, ${wins} winners): Upper 90% bootstrap bound of winners' P90 MAE is ${upper90BootstrapMaeWinners.toFixed(2)}R (Point P90: ${percentile90MaeWinners?.toFixed(2) || "0.65"}R). Retain standard structural stop — tightening would induce premature stop-outs during normal opening noise.`;
    }
  } else {
    recommendation = "Maintain 1-trade discipline across your morning execution window.";
  }

  return {
    totalTrades: trades.length,
    wins,
    losses,
    scratches,
    winRatePercent: Math.round(winRate * 10) / 10,
    totalPnlDollars: Math.round(totalPnlDollars),
    avgPnlR: Math.round(avgPnlR * 100) / 100,
    profitFactor: Math.round(profitFactor * 100) / 100,
    expectancyR: Math.round(avgPnlR * 100) / 100,
    avgMaeWinningTradesR: Math.round(avgMaeWinners * 100) / 100,
    avgMaeLosingTradesR: Math.round(avgMaeLosers * 100) / 100,
    avgMfeTradesR: Math.round(avgMfe * 100) / 100,
    avgExitEfficiencyPercent: Math.round(avgExitEfficiencyPercent * 10) / 10,
    sampleSizeGate,
    percentile85MaeWinners,
    percentile90MaeWinners,
    upper90BootstrapMaeWinners,
    winningTradesCount: wins,
    deepHeatDistribution: distribution,
    recommendation
  };
}

// ----------------- Daily Brief Repositories -----------------

export function getDailyBrief(tradeDate: string, symbol: string = "NQ"): SavedDailyBrief | null {
  const db = getDb();
  const row = db.prepare("SELECT * FROM daily_briefs WHERE trade_date = ? AND symbol = ?").get(tradeDate, symbol) as any;
  if (!row) return null;
  return {
    id: row.id,
    tradeDate: row.trade_date,
    symbol: row.symbol,
    data: JSON.parse(row.brief_json),
    notes: row.notes || "",
    createdBy: row.created_by,
    createdAt: row.created_at
  };
}

export function saveDailyBrief(brief: {
  tradeDate: string;
  symbol: "NQ" | "MNQ";
  data: OpenBriefData;
  notes?: string;
  createdBy?: string;
}): SavedDailyBrief {
  const db = getDb();
  const id = `brief-${brief.tradeDate}-${brief.symbol.toLowerCase()}`;
  const now = new Date().toISOString();

  db.prepare(`
    INSERT INTO daily_briefs (id, trade_date, symbol, brief_json, notes, created_by, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      brief_json = excluded.brief_json,
      notes = excluded.notes,
      created_at = excluded.created_at
  `).run(
    id, brief.tradeDate, brief.symbol, JSON.stringify(brief.data),
    brief.notes || "", brief.createdBy || "system", now
  );

  return {
    id,
    tradeDate: brief.tradeDate,
    symbol: brief.symbol,
    data: brief.data,
    notes: brief.notes || "",
    createdBy: brief.createdBy || "system",
    createdAt: now
  };
}

export function getRecentBriefs(limit = 10): Array<{ id: string; tradeDate: string; symbol: string; createdAt: string; verdict: string }> {
  const db = getDb();
  const rows = db.prepare("SELECT id, trade_date, symbol, brief_json, created_at FROM daily_briefs ORDER BY trade_date DESC LIMIT ?").all(limit) as any[];

  return rows.map((r) => {
    let verdict = "NEUTRAL";
    try {
      const parsed = JSON.parse(r.brief_json);
      verdict = parsed?.bias?.verdict || "RECORDED";
    } catch {}
    return {
      id: r.id,
      tradeDate: r.trade_date,
      symbol: r.symbol,
      createdAt: r.created_at,
      verdict
    };
  });
}

// ----------------- Checklist Repositories -----------------

export function getChecklist(tradeDate: string, userId: string = "default"): ChecklistState | null {
  const db = getDb();
  const row = db.prepare("SELECT state_json FROM checklists WHERE trade_date = ? AND user_id = ?").get(tradeDate, userId) as any;
  if (!row) return null;
  try {
    return JSON.parse(row.state_json);
  } catch {
    return null;
  }
}

export function saveChecklist(tradeDate: string, userId: string = "default", state: ChecklistState): void {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare(`
    INSERT INTO checklists (trade_date, user_id, state_json, updated_at)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(trade_date, user_id) DO UPDATE SET
      state_json = excluded.state_json,
      updated_at = excluded.updated_at
  `).run(tradeDate, userId, JSON.stringify(state), now);
}
