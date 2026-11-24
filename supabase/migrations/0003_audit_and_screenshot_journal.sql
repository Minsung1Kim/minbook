-- ==============================================================================
-- MinBook v3.1 Migration: Clean Audit Schema + Screenshot-Only P&L Journal
-- ==============================================================================

-- 1. Add missing Triple-Barrier & Log Score columns to prediction_grades
alter table public.prediction_grades
  add column if not exists log_score numeric default null,
  add column if not exists triple_barrier_outcome text default null,
  add column if not exists realized_net_r numeric default null,
  add column if not exists net_pnl_dollars numeric default null,
  add column if not exists fill_price numeric default null,
  add column if not exists fill_time_et text default null,
  add column if not exists exit_price numeric default null,
  add column if not exists exit_time_et text default null;

-- 2. Update journal_trades for Screenshot-Only P&L entries (no manual trade logging required)
alter table public.journal_trades
  add column if not exists overlay_color text default null,
  add column if not exists raw_ocr_text text default null,
  add column if not exists ocr_confidence text default null;

alter table public.journal_trades
  alter column direction set default 'SCREENSHOT',
  alter column entry_time_et set default '',
  alter column exit_time_et set default '',
  alter column entry_price set default 0,
  alter column stop_price set default 0,
  alter column exit_price set default 0,
  alter column target_price set default 0,
  alter column actual_r set default 0,
  alter column actual_pnl_r set default 0,
  alter column mae_r set default 0,
  alter column mfe_r set default 0;
