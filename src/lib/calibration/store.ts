import { DatabaseSync } from "node:sqlite";
import { getDb } from "../db/index";
import { createClient as createSupabaseClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  DailyPrediction,
  PredictionGrade,
  ModelWeightsRecord,
  PredictionStatus,
  ICalibrationRepository
} from "../../types/calibration";

export { type ICalibrationRepository };

export const DEFAULT_MODEL_WEIGHTS: Record<string, number> = {
  compositeLocation: 1.0,
  smtBreadth: 1.0,
  macroImpulse: 1.0,
  openingFlow: 1.0
};

export function isLegacySyntheticSeedPrediction(targetTradeDate: string, frozenAtEt?: string): boolean {
  return targetTradeDate < "2026-11-24" && frozenAtEt === `${targetTradeDate}T09:25:00.000Z`;
}

export class SqliteCalibrationRepository implements ICalibrationRepository {
  private db: DatabaseSync;

  constructor(db?: DatabaseSync) {
    this.db = db || getDb();
    this.initTables();
  }

  private initTables(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS daily_predictions (
        id TEXT PRIMARY KEY,
        target_trade_date TEXT NOT NULL UNIQUE,
        frozen_at_et TEXT NOT NULL,
        model_version TEXT NOT NULL,
        spot_at_freeze REAL NOT NULL,
        bias_verdict TEXT NOT NULL,
        confidence_tier TEXT NOT NULL,
        archetype TEXT NOT NULL,
        stop_hunt_likelihood TEXT NOT NULL,
        stop_hunt_target_level REAL DEFAULT NULL,
        primary_retrace_levels_json TEXT NOT NULL,
        liquidity_draws_json TEXT NOT NULL,
        regime_inputs_json TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'PENDING_GRADE',
        created_at TEXT NOT NULL
      );

      CREATE TABLE IF NOT EXISTS prediction_grades (
        id TEXT PRIMARY KEY,
        target_trade_date TEXT NOT NULL UNIQUE,
        prediction_id TEXT NOT NULL,
        open_price_930 REAL NOT NULL,
        window_high REAL NOT NULL,
        window_low REAL NOT NULL,
        window_close_1000 REAL NOT NULL,
        bias_correct INTEGER NOT NULL,
        favorable_excursion_pts REAL NOT NULL,
        adverse_excursion_pts REAL NOT NULL,
        retrace_tapped_json TEXT NOT NULL,
        stop_hunt_occurred INTEGER NOT NULL,
        liquidity_draw_hit_json TEXT NOT NULL,
        chop_warning_correct INTEGER NOT NULL,
        brier_score REAL NOT NULL,
        composite_score REAL NOT NULL,
        log_score REAL DEFAULT NULL,
        triple_barrier_outcome TEXT DEFAULT NULL,
        realized_net_r REAL DEFAULT NULL,
        net_pnl_dollars REAL DEFAULT NULL,
        fill_price REAL DEFAULT NULL,
        fill_time_et TEXT DEFAULT NULL,
        exit_price REAL DEFAULT NULL,
        exit_time_et TEXT DEFAULT NULL,
        graded_at TEXT NOT NULL,
        FOREIGN KEY (prediction_id) REFERENCES daily_predictions(id)
      );

      CREATE TABLE IF NOT EXISTS model_weights_history (
        id TEXT PRIMARY KEY,
        version TEXT NOT NULL UNIQUE,
        is_active INTEGER NOT NULL DEFAULT 0,
        weights_json TEXT NOT NULL,
        sample_size_used INTEGER NOT NULL DEFAULT 0,
        out_of_sample_accuracy REAL NOT NULL DEFAULT 0,
        change_summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );
    `);

    // Ensure default active model weights exist (v1.0)
    const countWeights = this.db.prepare(
      "SELECT COUNT(*) as cnt FROM model_weights_history"
    ).get() as { cnt: number } | undefined;

    if (!countWeights || countWeights.cnt === 0) {
      const now = new Date().toISOString();
      const insert = this.db.prepare(`
        INSERT INTO model_weights_history (id, version, is_active, weights_json, sample_size_used, out_of_sample_accuracy, change_summary, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      insert.run(
        "weight_v1.0",
        "v1.0",
        1,
        JSON.stringify(DEFAULT_MODEL_WEIGHTS),
        0,
        0,
        "Initial default baseline factor weights (all factors 1.0x).",
        now
      );
    }
  }

  // ---------------------------------------------------------------------------
  // Predictions
  // ---------------------------------------------------------------------------
  async savePrediction(pred: DailyPrediction): Promise<DailyPrediction> {
    // Check for immutable freeze: if already exists, do not overwrite
    const existing = await this.getPredictionByDate(pred.targetTradeDate);
    if (existing) {
      throw new Error(
        `Immutable Freeze Error: Prediction already exists and is frozen for trade date ${pred.targetTradeDate}. Overwriting is forbidden to prevent hindsight bias.`
      );
    }

    const stmt = this.db.prepare(`
      INSERT INTO daily_predictions (
        id, target_trade_date, frozen_at_et, model_version, spot_at_freeze,
        bias_verdict, confidence_tier, archetype, stop_hunt_likelihood,
        stop_hunt_target_level, primary_retrace_levels_json, liquidity_draws_json,
        regime_inputs_json, status, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      pred.id,
      pred.targetTradeDate,
      pred.frozenAtEt,
      pred.modelVersion,
      pred.spotAtFreeze,
      pred.biasVerdict,
      pred.confidenceTier,
      pred.archetype,
      pred.stopHuntLikelihood,
      pred.stopHuntTargetLevel,
      JSON.stringify(pred.primaryRetraceLevels),
      JSON.stringify(pred.liquidityDraws),
      JSON.stringify(pred.regimeInputs),
      pred.status,
      pred.createdAt
    );

    return pred;
  }

  async getPredictionByDate(targetTradeDate: string): Promise<DailyPrediction | null> {
    const row = this.db.prepare(
      "SELECT * FROM daily_predictions WHERE target_trade_date = ?"
    ).get(targetTradeDate) as any;

    if (!row) return null;
    return this.mapPredictionRow(row);
  }

  async getAllPredictions(limit: number = 100): Promise<DailyPrediction[]> {
    const rows = this.db.prepare(
      "SELECT * FROM daily_predictions ORDER BY target_trade_date DESC LIMIT ?"
    ).all(limit) as any[];

    return rows.map((r) => this.mapPredictionRow(r));
  }

  async getPendingPredictions(): Promise<DailyPrediction[]> {
    const rows = this.db.prepare(
      "SELECT * FROM daily_predictions WHERE status = 'PENDING_GRADE' ORDER BY target_trade_date ASC"
    ).all() as any[];

    return rows.map((r) => this.mapPredictionRow(r));
  }

  async updatePredictionStatus(id: string, status: PredictionStatus): Promise<void> {
    const stmt = this.db.prepare("UPDATE daily_predictions SET status = ? WHERE id = ?");
    stmt.run(status, id);
  }

  // ---------------------------------------------------------------------------
  // Grades
  // ---------------------------------------------------------------------------
  async saveGrade(grade: PredictionGrade): Promise<PredictionGrade> {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO prediction_grades (
        id, target_trade_date, prediction_id, open_price_930, window_high,
        window_low, window_close_1000, bias_correct, favorable_excursion_pts,
        adverse_excursion_pts, retrace_tapped_json, stop_hunt_occurred,
        liquidity_draw_hit_json, chop_warning_correct, brier_score,
        composite_score, log_score, triple_barrier_outcome, realized_net_r,
        net_pnl_dollars, fill_price, fill_time_et, exit_price, exit_time_et, graded_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      grade.id,
      grade.targetTradeDate,
      grade.predictionId,
      grade.openPrice930,
      grade.windowHigh,
      grade.windowLow,
      grade.windowClose1000,
      grade.biasCorrect ? 1 : 0,
      grade.favorableExcursionPts,
      grade.adverseExcursionPts,
      JSON.stringify(grade.retraceTapped),
      grade.stopHuntOccurred ? 1 : 0,
      JSON.stringify(grade.liquidityDrawHit),
      grade.chopWarningCorrect ? 1 : 0,
      grade.brierScore,
      grade.compositeScore,
      grade.logScore ?? null,
      grade.tripleBarrierOutcome ?? null,
      grade.realizedNetR ?? null,
      grade.netPnlDollars ?? null,
      grade.fillPrice ?? null,
      grade.fillTimeET ?? null,
      grade.exitPrice ?? null,
      grade.exitTimeET ?? null,
      grade.gradedAt
    );

    // Update status on daily_predictions to GRADED_OPEN_WINDOW
    await this.updatePredictionStatus(grade.predictionId, "GRADED_OPEN_WINDOW");

    return grade;
  }

  async getGradeByDate(targetTradeDate: string): Promise<PredictionGrade | null> {
    const row = this.db.prepare(
      "SELECT * FROM prediction_grades WHERE target_trade_date = ?"
    ).get(targetTradeDate) as any;

    if (!row) return null;
    return this.mapGradeRow(row);
  }

  async getAllGrades(): Promise<PredictionGrade[]> {
    const rows = this.db.prepare(
      "SELECT * FROM prediction_grades ORDER BY target_trade_date DESC"
    ).all() as any[];

    return rows.map((r) => this.mapGradeRow(r));
  }

  async getGradedHistory(): Promise<Array<{ prediction: DailyPrediction; grade: PredictionGrade }>> {
    const rows = this.db.prepare(`
      SELECT p.*, g.id as g_id, g.target_trade_date as g_target_trade_date,
             g.prediction_id as g_prediction_id, g.open_price_930 as g_open_price_930,
             g.window_high as g_window_high, g.window_low as g_window_low,
             g.window_close_1000 as g_window_close_1000, g.bias_correct as g_bias_correct,
             g.favorable_excursion_pts as g_favorable_excursion_pts,
             g.adverse_excursion_pts as g_adverse_excursion_pts,
             g.retrace_tapped_json as g_retrace_tapped_json,
             g.stop_hunt_occurred as g_stop_hunt_occurred,
             g.liquidity_draw_hit_json as g_liquidity_draw_hit_json,
             g.chop_warning_correct as g_chop_warning_correct,
             g.brier_score as g_brier_score, g.log_score as g_log_score,
             g.composite_score as g_composite_score,
             g.triple_barrier_outcome as g_triple_barrier_outcome,
             g.realized_net_r as g_realized_net_r,
             g.net_pnl_dollars as g_net_pnl_dollars,
             g.fill_price as g_fill_price, g.fill_time_et as g_fill_time_et,
             g.exit_price as g_exit_price, g.exit_time_et as g_exit_time_et,
             g.graded_at as g_graded_at
      FROM daily_predictions p
      INNER JOIN prediction_grades g ON p.target_trade_date = g.target_trade_date
      ORDER BY p.target_trade_date ASC
    `).all() as any[];

    return rows.map((r) => {
      const pred = this.mapPredictionRow(r);
      const grade = this.mapGradeRow({
        id: r.g_id,
        target_trade_date: r.g_target_trade_date,
        prediction_id: r.g_prediction_id,
        open_price_930: r.g_open_price_930,
        window_high: r.g_window_high,
        window_low: r.g_window_low,
        window_close_1000: r.g_window_close_1000,
        bias_correct: r.g_bias_correct,
        favorable_excursion_pts: r.g_favorable_excursion_pts,
        adverse_excursion_pts: r.g_adverse_excursion_pts,
        retrace_tapped_json: r.g_retrace_tapped_json,
        stop_hunt_occurred: r.g_stop_hunt_occurred,
        liquidity_draw_hit_json: r.g_liquidity_draw_hit_json,
        chop_warning_correct: r.g_chop_warning_correct,
        brier_score: r.g_brier_score,
        log_score: r.g_log_score,
        composite_score: r.g_composite_score,
        triple_barrier_outcome: r.g_triple_barrier_outcome,
        realized_net_r: r.g_realized_net_r,
        net_pnl_dollars: r.g_net_pnl_dollars,
        fill_price: r.g_fill_price,
        fill_time_et: r.g_fill_time_et,
        exit_price: r.g_exit_price,
        exit_time_et: r.g_exit_time_et,
        graded_at: r.g_graded_at
      });
      return { prediction: pred, grade };
    });
  }

  async getAuditHistory(limit: number = 60): Promise<Array<{ prediction: DailyPrediction; grade: PredictionGrade | null }>> {
    const predictions = await this.getAllPredictions(limit);
    const results: Array<{ prediction: DailyPrediction; grade: PredictionGrade | null }> = [];

    for (const pred of predictions) {
      const grade = await this.getGradeByDate(pred.targetTradeDate);
      results.push({ prediction: pred, grade });
    }

    return results;
  }

  // ---------------------------------------------------------------------------
  // Model Weights
  // ---------------------------------------------------------------------------
  async getActiveModelWeights(): Promise<ModelWeightsRecord> {
    const row = this.db.prepare(
      "SELECT * FROM model_weights_history WHERE is_active = 1 ORDER BY created_at DESC LIMIT 1"
    ).get() as any;

    if (!row) {
      return {
        id: "weight_v1.0",
        version: "v1.0",
        isActive: true,
        weights: DEFAULT_MODEL_WEIGHTS,
        sampleSizeUsed: 0,
        outOfSampleAccuracy: 0,
        changeSummary: "Default factor weights.",
        createdAt: new Date().toISOString()
      };
    }

    return this.mapWeightsRow(row);
  }

  async saveModelWeights(
    record: Omit<ModelWeightsRecord, "id" | "createdAt">
  ): Promise<ModelWeightsRecord> {
    const id = `weight_${record.version}`;
    const now = new Date().toISOString();

    if (record.isActive) {
      this.db.prepare("UPDATE model_weights_history SET is_active = 0").run();
    }

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO model_weights_history (
        id, version, is_active, weights_json, sample_size_used,
        out_of_sample_accuracy, change_summary, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      record.version,
      record.isActive ? 1 : 0,
      JSON.stringify(record.weights),
      record.sampleSizeUsed,
      record.outOfSampleAccuracy,
      record.changeSummary,
      now
    );

    return {
      id,
      version: record.version,
      isActive: record.isActive,
      weights: record.weights,
      sampleSizeUsed: record.sampleSizeUsed,
      outOfSampleAccuracy: record.outOfSampleAccuracy,
      changeSummary: record.changeSummary,
      createdAt: now
    };
  }

  async getAllModelWeightsHistory(): Promise<ModelWeightsRecord[]> {
    const rows = this.db.prepare(
      "SELECT * FROM model_weights_history ORDER BY created_at DESC"
    ).all() as any[];

    return rows.map((r) => this.mapWeightsRow(r));
  }

  async setActiveModelWeights(version: string): Promise<void> {
    this.db.prepare("UPDATE model_weights_history SET is_active = 0").run();
    this.db.prepare("UPDATE model_weights_history SET is_active = 1 WHERE version = ?").run(version);
  }

  // ---------------------------------------------------------------------------
  // Seeding (Disabled to keep audit 100% real and uncontaminated)
  // ---------------------------------------------------------------------------
  async seedSampleArchiveIfEmpty(): Promise<boolean> {
    return false;
  }

  // ---------------------------------------------------------------------------
  // Row Mappers
  // ---------------------------------------------------------------------------
  private mapPredictionRow(row: any): DailyPrediction {
    return {
      id: row.id,
      targetTradeDate: row.target_trade_date,
      frozenAtEt: row.frozen_at_et,
      modelVersion: row.model_version,
      spotAtFreeze: row.spot_at_freeze,
      biasVerdict: row.bias_verdict,
      confidenceTier: row.confidence_tier,
      archetype: row.archetype,
      stopHuntLikelihood: row.stop_hunt_likelihood,
      stopHuntTargetLevel: row.stop_hunt_target_level,
      primaryRetraceLevels: JSON.parse(row.primary_retrace_levels_json),
      liquidityDraws: JSON.parse(row.liquidity_draws_json),
      regimeInputs: JSON.parse(row.regime_inputs_json),
      status: row.status as PredictionStatus,
      createdAt: row.created_at
    };
  }

  private mapGradeRow(row: any): PredictionGrade {
    return {
      id: row.id,
      targetTradeDate: row.target_trade_date,
      predictionId: row.prediction_id,
      openPrice930: Number(row.open_price_930),
      windowHigh: Number(row.window_high),
      windowLow: Number(row.window_low),
      windowClose1000: Number(row.window_close_1000),
      biasCorrect: Boolean(row.bias_correct),
      favorableExcursionPts: Number(row.favorable_excursion_pts),
      adverseExcursionPts: Number(row.adverse_excursion_pts),
      retraceTapped: JSON.parse(row.retrace_tapped_json || "[]"),
      stopHuntOccurred: Boolean(row.stop_hunt_occurred),
      liquidityDrawHit: JSON.parse(row.liquidity_draw_hit_json || "[]"),
      chopWarningCorrect: Boolean(row.chop_warning_correct),
      brierScore: Number(row.brier_score),
      logScore: row.log_score != null ? Number(row.log_score) : undefined,
      compositeScore: Number(row.composite_score),
      tripleBarrierOutcome: row.triple_barrier_outcome || undefined,
      realizedNetR: row.realized_net_r != null ? Number(row.realized_net_r) : undefined,
      netPnlDollars: row.net_pnl_dollars != null ? Number(row.net_pnl_dollars) : undefined,
      fillPrice: row.fill_price != null ? Number(row.fill_price) : undefined,
      fillTimeET: row.fill_time_et || undefined,
      exitPrice: row.exit_price != null ? Number(row.exit_price) : undefined,
      exitTimeET: row.exit_time_et || undefined,
      gradedAt: row.graded_at
    };
  }

  private mapWeightsRow(row: any): ModelWeightsRecord {
    return {
      id: row.id,
      version: row.version,
      isActive: Boolean(row.is_active),
      weights: JSON.parse(row.weights_json),
      sampleSizeUsed: row.sample_size_used,
      outOfSampleAccuracy: row.out_of_sample_accuracy,
      changeSummary: row.change_summary,
      createdAt: row.created_at
    };
  }
}

export class SupabaseCalibrationRepository implements ICalibrationRepository {
  private client: SupabaseClient;

  constructor(client: SupabaseClient) {
    this.client = client;
  }

  async savePrediction(pred: DailyPrediction): Promise<DailyPrediction> {
    const existing = await this.getPredictionByDate(pred.targetTradeDate);
    if (existing) {
      throw new Error(
        `Immutable Freeze Error: Prediction already exists and is frozen for trade date ${pred.targetTradeDate}. Overwriting is forbidden to prevent hindsight bias.`
      );
    }

    const record = {
      id: pred.id,
      target_trade_date: pred.targetTradeDate,
      frozen_at_et: pred.frozenAtEt,
      model_version: pred.modelVersion,
      spot_at_freeze: pred.spotAtFreeze,
      bias_verdict: pred.biasVerdict,
      confidence_tier: pred.confidenceTier,
      archetype: pred.archetype,
      stop_hunt_likelihood: pred.stopHuntLikelihood,
      stop_hunt_target_level: pred.stopHuntTargetLevel ?? null,
      primary_retrace_levels_json: pred.primaryRetraceLevels,
      liquidity_draws_json: pred.liquidityDraws,
      regime_inputs_json: pred.regimeInputs,
      status: pred.status,
      created_at: pred.createdAt || new Date().toISOString()
    };

    const { error } = await this.client
      .from("daily_predictions")
      .insert(record);

    if (error) {
      console.error("Supabase savePrediction error:", error);
      throw new Error(`Failed to save prediction: ${error.message}`);
    }

    return pred;
  }

  async getPredictionByDate(targetTradeDate: string): Promise<DailyPrediction | null> {
    const { data, error } = await this.client
      .from("daily_predictions")
      .select("*")
      .eq("target_trade_date", targetTradeDate)
      .maybeSingle();

    if (error || !data) return null;
    const mapped = this.mapPredictionRow(data);
    if (isLegacySyntheticSeedPrediction(mapped.targetTradeDate, mapped.frozenAtEt)) {
      return null;
    }
    return mapped;
  }

  async getAllPredictions(limit = 100): Promise<DailyPrediction[]> {
    const { data, error } = await this.client
      .from("daily_predictions")
      .select("*")
      .order("target_trade_date", { ascending: false })
      .limit(limit);

    if (error || !data) return [];
    return data
      .map((r) => this.mapPredictionRow(r))
      .filter((p) => !isLegacySyntheticSeedPrediction(p.targetTradeDate, p.frozenAtEt));
  }

  async getPendingPredictions(): Promise<DailyPrediction[]> {
    const { data, error } = await this.client
      .from("daily_predictions")
      .select("*")
      .eq("status", "PENDING_GRADE")
      .order("target_trade_date", { ascending: true });

    if (error || !data) return [];
    return data
      .map((r) => this.mapPredictionRow(r))
      .filter((p) => !isLegacySyntheticSeedPrediction(p.targetTradeDate, p.frozenAtEt));
  }

  async updatePredictionStatus(id: string, status: PredictionStatus): Promise<void> {
    await this.client
      .from("daily_predictions")
      .update({ status })
      .eq("id", id);
  }

  async saveGrade(grade: PredictionGrade): Promise<PredictionGrade> {
    const record = {
      id: grade.id,
      target_trade_date: grade.targetTradeDate,
      prediction_id: grade.predictionId,
      open_price_930: grade.openPrice930,
      window_high: grade.windowHigh,
      window_low: grade.windowLow,
      window_close_1000: grade.windowClose1000,
      bias_correct: grade.biasCorrect,
      favorable_excursion_pts: grade.favorableExcursionPts,
      adverse_excursion_pts: grade.adverseExcursionPts,
      retrace_tapped_json: grade.retraceTapped,
      stop_hunt_occurred: grade.stopHuntOccurred,
      liquidity_draw_hit_json: grade.liquidityDrawHit,
      chop_warning_correct: grade.chopWarningCorrect,
      brier_score: grade.brierScore,
      log_score: grade.logScore ?? null,
      composite_score: grade.compositeScore,
      triple_barrier_outcome: grade.tripleBarrierOutcome ?? null,
      realized_net_r: grade.realizedNetR ?? null,
      net_pnl_dollars: grade.netPnlDollars ?? null,
      fill_price: grade.fillPrice ?? null,
      fill_time_et: grade.fillTimeET ?? null,
      exit_price: grade.exitPrice ?? null,
      exit_time_et: grade.exitTimeET ?? null,
      graded_at: grade.gradedAt || new Date().toISOString()
    };

    const { error } = await this.client
      .from("prediction_grades")
      .upsert(record, { onConflict: "target_trade_date" });

    if (error) {
      console.error("Supabase saveGrade error:", error);
      throw new Error(`Failed to save grade: ${error.message}`);
    }

    await this.updatePredictionStatus(grade.predictionId, "GRADED_OPEN_WINDOW");

    return grade;
  }

  async getGradeByDate(targetTradeDate: string): Promise<PredictionGrade | null> {
    const { data, error } = await this.client
      .from("prediction_grades")
      .select("*")
      .eq("target_trade_date", targetTradeDate)
      .maybeSingle();

    if (error || !data) return null;
    return this.mapGradeRow(data);
  }

  async getAllGrades(): Promise<PredictionGrade[]> {
    const { data, error } = await this.client
      .from("prediction_grades")
      .select("*")
      .order("target_trade_date", { ascending: false });

    if (error || !data) return [];
    const preds = await this.getAllPredictions(200);
    const validDates = new Set(preds.map((p) => p.targetTradeDate));
    return data
      .map((r) => this.mapGradeRow(r))
      .filter((g) => validDates.has(g.targetTradeDate));
  }

  async getGradedHistory(): Promise<Array<{ prediction: DailyPrediction; grade: PredictionGrade }>> {
    const [preds, grades] = await Promise.all([
      this.getAllPredictions(200),
      this.getAllGrades()
    ]);

    const gradeMap = new Map(grades.map((g) => [g.targetTradeDate, g]));
    const result: Array<{ prediction: DailyPrediction; grade: PredictionGrade }> = [];

    for (const pred of preds) {
      const grade = gradeMap.get(pred.targetTradeDate);
      if (grade) {
        result.push({ prediction: pred, grade });
      }
    }

    return result;
  }

  async getAuditHistory(limit = 50): Promise<Array<{ prediction: DailyPrediction; grade: PredictionGrade | null }>> {
    const [preds, grades] = await Promise.all([
      this.getAllPredictions(limit),
      this.getAllGrades()
    ]);

    const gradeMap = new Map(grades.map((g) => [g.targetTradeDate, g]));
    return preds.map((pred) => ({
      prediction: pred,
      grade: gradeMap.get(pred.targetTradeDate) || null
    }));
  }

  async getActiveModelWeights(): Promise<ModelWeightsRecord> {
    const { data } = await this.client
      .from("model_weights_history")
      .select("*")
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data) {
      return this.mapWeightsRow(data);
    }

    return {
      id: "weight_v1.0",
      version: "v1.0",
      isActive: true,
      weights: { ...DEFAULT_MODEL_WEIGHTS },
      sampleSizeUsed: 0,
      outOfSampleAccuracy: 0,
      changeSummary: "Default baseline model weights",
      createdAt: new Date().toISOString()
    };
  }

  async saveModelWeights(record: Omit<ModelWeightsRecord, "id" | "createdAt">): Promise<ModelWeightsRecord> {
    const id = `weight_${record.version}`;
    const createdAt = new Date().toISOString();

    if (record.isActive) {
      await this.client
        .from("model_weights_history")
        .update({ is_active: false })
        .neq("id", "");
    }

    const newRecord = {
      id,
      version: record.version,
      is_active: record.isActive,
      weights_json: record.weights,
      sample_size_used: record.sampleSizeUsed,
      out_of_sample_accuracy: record.outOfSampleAccuracy,
      change_summary: record.changeSummary,
      created_at: createdAt
    };

    const { error } = await this.client
      .from("model_weights_history")
      .upsert(newRecord, { onConflict: "version" });

    if (error) {
      throw new Error(`Failed to save model weights: ${error.message}`);
    }

    return {
      ...record,
      id,
      createdAt
    };
  }

  async getAllModelWeightsHistory(): Promise<ModelWeightsRecord[]> {
    const { data } = await this.client
      .from("model_weights_history")
      .select("*")
      .order("created_at", { ascending: false });

    if (!data) return [];
    return data.map((r) => this.mapWeightsRow(r));
  }

  async setActiveModelWeights(version: string): Promise<void> {
    await this.client
      .from("model_weights_history")
      .update({ is_active: false })
      .neq("id", "");

    await this.client
      .from("model_weights_history")
      .update({ is_active: true })
      .eq("version", version);
  }

  async seedSampleArchiveIfEmpty(): Promise<boolean> {
    return false;
  }

  private mapPredictionRow(row: any): DailyPrediction {
    return {
      id: row.id,
      targetTradeDate: typeof row.target_trade_date === "string" ? row.target_trade_date : new Date(row.target_trade_date).toISOString().split("T")[0],
      frozenAtEt: row.frozen_at_et,
      modelVersion: row.model_version,
      spotAtFreeze: Number(row.spot_at_freeze),
      biasVerdict: row.bias_verdict,
      confidenceTier: row.confidence_tier,
      archetype: row.archetype,
      stopHuntLikelihood: row.stop_hunt_likelihood,
      stopHuntTargetLevel: row.stop_hunt_target_level != null ? Number(row.stop_hunt_target_level) : null,
      primaryRetraceLevels: typeof row.primary_retrace_levels_json === "string" ? JSON.parse(row.primary_retrace_levels_json) : row.primary_retrace_levels_json,
      liquidityDraws: typeof row.liquidity_draws_json === "string" ? JSON.parse(row.liquidity_draws_json) : row.liquidity_draws_json,
      regimeInputs: typeof row.regime_inputs_json === "string" ? JSON.parse(row.regime_inputs_json) : row.regime_inputs_json,
      status: row.status as PredictionStatus,
      createdAt: row.created_at
    };
  }

  private mapGradeRow(row: any): PredictionGrade {
    return {
      id: row.id,
      targetTradeDate: typeof row.target_trade_date === "string" ? row.target_trade_date : new Date(row.target_trade_date).toISOString().split("T")[0],
      predictionId: row.prediction_id,
      openPrice930: Number(row.open_price_930),
      windowHigh: Number(row.window_high),
      windowLow: Number(row.window_low),
      windowClose1000: Number(row.window_close_1000),
      biasCorrect: Boolean(row.bias_correct),
      favorableExcursionPts: Number(row.favorable_excursion_pts),
      adverseExcursionPts: Number(row.adverse_excursion_pts),
      retraceTapped: typeof row.retrace_tapped_json === "string" ? JSON.parse(row.retrace_tapped_json) : row.retrace_tapped_json,
      stopHuntOccurred: Boolean(row.stop_hunt_occurred),
      liquidityDrawHit: typeof row.liquidity_draw_hit_json === "string" ? JSON.parse(row.liquidity_draw_hit_json) : row.liquidity_draw_hit_json,
      chopWarningCorrect: Boolean(row.chop_warning_correct),
      brierScore: Number(row.brier_score),
      logScore: row.log_score != null ? Number(row.log_score) : undefined,
      compositeScore: Number(row.composite_score),
      tripleBarrierOutcome: row.triple_barrier_outcome || undefined,
      realizedNetR: row.realized_net_r != null ? Number(row.realized_net_r) : undefined,
      netPnlDollars: row.net_pnl_dollars != null ? Number(row.net_pnl_dollars) : undefined,
      fillPrice: row.fill_price != null ? Number(row.fill_price) : undefined,
      fillTimeET: row.fill_time_et || undefined,
      exitPrice: row.exit_price != null ? Number(row.exit_price) : undefined,
      exitTimeET: row.exit_time_et || undefined,
      gradedAt: row.graded_at
    };
  }

  private mapWeightsRow(row: any): ModelWeightsRecord {
    return {
      id: row.id,
      version: row.version,
      isActive: Boolean(row.is_active),
      weights: typeof row.weights_json === "string" ? JSON.parse(row.weights_json) : row.weights_json,
      sampleSizeUsed: Number(row.sample_size_used || 0),
      outOfSampleAccuracy: Number(row.out_of_sample_accuracy || 0),
      changeSummary: row.change_summary || "",
      createdAt: row.created_at
    };
  }
}

// Global Singleton Instance
let repoInstance: ICalibrationRepository | null = null;
export function getCalibrationRepository(): ICalibrationRepository {
  if (!repoInstance) {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const supabaseKey =
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

    if (supabaseUrl && supabaseKey) {
      const client = createSupabaseClient(supabaseUrl, supabaseKey);
      repoInstance = new SupabaseCalibrationRepository(client);
    } else {
      repoInstance = new SqliteCalibrationRepository();
    }
  }
  return repoInstance;
}

/**
 * Seeds 35 realistic historical graded trading sessions so that
 * the N >= 30 walk-forward optimizer, weight diff review, factor attribution
 * leaderboard, and historical audit table are immediately testable.
 */
export async function seedSampleCalibrationArchive(repo: ICalibrationRepository): Promise<void> {
  // 35 weekdays leading up to current date
  const baseSpot = 20850;
  const startDate = new Date(Date.now() - 52 * 24 * 3600 * 1000);

  let sessionCount = 0;
  let curr = new Date(startDate);

  while (sessionCount < 35 && curr < new Date()) {
    const dayOfWeek = curr.getUTCDay();
    // Weekdays only (1 = Mon, 5 = Fri)
    if (dayOfWeek >= 1 && dayOfWeek <= 5) {
      sessionCount++;
      const dateStr = curr.toISOString().split("T")[0];
      const frozenAtEt = `${dateStr}T09:25:00.000Z`;

      // Deterministic pseudo-random generation based on session index
      const isBull = (sessionCount * 7) % 10 < 6; // 60% Bullish
      const isCaution = sessionCount % 8 === 0; // 12% Caution
      const verdict = isCaution
        ? "CAUTION_STAND_ASIDE"
        : isBull
        ? "LONG_CONTINUATION"
        : "SHORT_CONTINUATION";
      const confidence = sessionCount % 4 === 0 ? "HIGH" : sessionCount % 2 === 0 ? "MODERATE" : "LOW";

      const spot = Math.round(baseSpot + Math.sin(sessionCount * 0.4) * 550);
      const vwap = Math.round(spot - (isBull ? 22 : -22));
      const onMid = Math.round(spot - (isBull ? 35 : -35));
      const pdc = Math.round(spot - (isBull ? 45 : -45));
      const onh = Math.round(spot + (isBull ? 65 : 25));
      const onl = Math.round(spot - (isBull ? 25 : 65));
      const pdh = onh + 30;
      const pdl = onl - 30;

      // Factors
      const smtHit = (sessionCount * 3) % 10 < 7;
      const vwapAlign = (sessionCount * 5) % 10 < 6;
      const inventorySkew = (sessionCount * 2) % 10 < 5;
      const gexNeg = sessionCount % 3 === 0;

      const factorScores: Record<string, number> = {
        htfTrend: isBull ? 1 : -1,
        vwapAlignment: vwapAlign ? (isBull ? 1 : -1) : 0,
        overnightInventory: inventorySkew ? (isBull ? 1 : -1) : 0,
        openingGap: (sessionCount % 5 === 0) ? (isBull ? 1 : -1) : 0,
        smtDivergence: smtHit ? (isBull ? 1 : -1) : 0,
        volatilitySurface: (sessionCount % 7 === 0) ? -1 : 1,
        macroRegime: (sessionCount % 4 === 0) ? (isBull ? 1 : -1) : 0,
        gexRegime: gexNeg ? (isBull ? 1 : -1) : 0
      };

      const pred: DailyPrediction = {
        id: `pred_${dateStr}`,
        targetTradeDate: dateStr,
        frozenAtEt,
        modelVersion: "v1.0",
        spotAtFreeze: spot,
        biasVerdict: verdict,
        confidenceTier: confidence,
        archetype: isCaution
          ? "OPEN-AUCTION / CHOP PINCH"
          : isBull
          ? "OPEN-TEST-DRIVE (HIGH RETRACE PROBABILITY)"
          : "OPEN-REVERSAL / INVENTORY FLUSH",
        stopHuntLikelihood: sessionCount % 3 === 0 ? "HIGH" : "LOW",
        stopHuntTargetLevel: sessionCount % 3 === 0 ? (isBull ? onl - 6 : onh + 6) : null,
        primaryRetraceLevels: {
          vwap,
          onMid,
          pdc,
          htf50: Math.round((onh + onl) / 2),
          htf618: Math.round(isBull ? onl + (onh - onl) * 0.382 : onh - (onh - onl) * 0.382)
        },
        liquidityDraws: { onh, onl, pdh, pdl },
        regimeInputs: {
          vxn: 21.5 + (sessionCount % 6),
          vix: 18.0 + (sessionCount % 5),
          vixTermRatio: 0.92 + (sessionCount % 5) * 0.03,
          vvix: 92 + (sessionCount % 15),
          vrp: 2.5 - (sessionCount % 5),
          gexRegime: gexNeg ? "NEGATIVE_GAMMA" : "POSITIVE_GAMMA",
          gammaFlipNq: spot - 40,
          overnightInventoryPct: isBull ? 65 : 35,
          smtStatus: smtHit ? "BULLISH_SMT (NQ SWEPT LOW, ES HELD)" : "NONE (SYNCED)",
          stockBondCorr: -0.22,
          newsFlag: sessionCount % 6 === 0,
          factorScores
        },
        status: "GRADED_OPEN_WINDOW",
        createdAt: frozenAtEt
      };

      // Outcome
      // SMT + GEX + HTF trend have highest correlation with biasCorrect
      const biasCorrect = isCaution
        ? true
        : smtHit && vwapAlign
        ? true
        : (sessionCount % 3 !== 0);

      const open930 = spot;
      const mfe = biasCorrect ? Math.round(45 + (sessionCount % 5) * 12) : Math.round(15 + (sessionCount % 3) * 6);
      const mae = biasCorrect ? Math.round(12 + (sessionCount % 4) * 4) : Math.round(35 + (sessionCount % 4) * 10);

      const windowHigh = isBull ? open930 + mfe : open930 + mae;
      const windowLow = isBull ? open930 - mae : open930 - mfe;
      const windowClose = isBull ? open930 + (mfe * 0.7) : open930 - (mfe * 0.7);

      const retraceTapped: string[] = ["VWAP"];
      if (mae >= 25) retraceTapped.push("ON Mid");
      if (mae >= 35) retraceTapped.push("PDC");

      const stopHuntOccurred = pred.stopHuntTargetLevel !== null && (sessionCount % 3 === 0);
      const liquidityDrawHit: string[] = [];
      if (mfe >= 40) liquidityDrawHit.push(isBull ? "ONH" : "ONL");
      if (mfe >= 70) liquidityDrawHit.push(isBull ? "PDH" : "PDL");

      const pConfidence = confidence === "HIGH" ? 0.8 : confidence === "MODERATE" ? 0.65 : 0.5;
      const yActual = biasCorrect ? 1 : 0;
      const brierScore = Math.round(Math.pow(pConfidence - yActual, 2) * 1000) / 1000;
      const compositeScore = Math.round(
        (biasCorrect ? 50 : 10) +
        (retraceTapped.length > 0 ? 20 : 0) +
        (liquidityDrawHit.length > 0 ? 15 : 0) +
        Math.min(15, Math.round((mfe / (mfe + mae + 0.001)) * 15))
      );

      const grade: PredictionGrade = {
        id: `grade_${dateStr}`,
        targetTradeDate: dateStr,
        predictionId: pred.id,
        openPrice930: open930,
        windowHigh,
        windowLow,
        windowClose1000: Math.round(windowClose * 100) / 100,
        biasCorrect,
        favorableExcursionPts: mfe,
        adverseExcursionPts: mae,
        retraceTapped,
        stopHuntOccurred,
        liquidityDrawHit,
        chopWarningCorrect: isCaution,
        brierScore,
        compositeScore,
        gradedAt: `${dateStr}T10:20:00.000Z`
      };

      try {
        await repo.savePrediction(pred);
        await repo.saveGrade(grade);
      } catch (err: any) {
        console.error("Seed error for date", dateStr, err?.message || err);
      }
    }
    curr.setUTCDate(curr.getUTCDate() + 1);
  }
}
