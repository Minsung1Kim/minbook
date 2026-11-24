-- ==============================================================================
-- MinBook Database Initial Schema Migration
-- Quantitative NY Open Futures Decision Engine
-- ==============================================================================

-- 1. USER SETTINGS TABLE
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users(id) on delete cascade,
  risk_budget_dollars numeric not null default 250,
  target_budget_dollars numeric not null default 550,
  max_daily_trades integer not null default 1,
  max_daily_loss_dollars numeric not null default 350,
  trailing_drawdown_alert numeric not null default 2000,
  default_instrument text not null default 'NQ',
  notes text default '',
  updated_at timestamptz not null default now()
);

alter table public.user_settings enable row level security;

create policy "Users can view own settings"
  on public.user_settings for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own settings"
  on public.user_settings for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own settings"
  on public.user_settings for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own settings"
  on public.user_settings for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 2. JOURNAL TRADES TABLE
create table if not exists public.journal_trades (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  trade_date date not null,
  day_label text default '',
  symbol text not null default 'NQ',
  instrument text not null default 'NQ',
  direction text not null,
  contracts integer not null default 1,
  entry_time_et text not null,
  exit_time_et text not null,
  entry_price numeric not null,
  stop_price numeric not null,
  exit_price numeric not null,
  target_price numeric not null,
  worst_price numeric default null,
  best_price numeric default null,
  pnl_usd numeric not null,
  actual_pnl_dollars numeric not null,
  actual_r numeric not null,
  actual_pnl_r numeric not null,
  mae_r numeric not null,
  mfe_r numeric not null,
  exit_efficiency_pct numeric default null,
  exit_efficiency_percent numeric default null,
  stopped_out boolean not null default false,
  retrace_level_used text default '',
  setup_notes text default '',
  notes text default '',
  ai_grade text default '',
  screenshot_path text default null,
  regime_snapshot_json jsonb default null,
  session_bars_json jsonb default null,
  ai_coaching_json jsonb default null,
  created_at timestamptz not null default now()
);

create index if not exists idx_journal_trades_user_id on public.journal_trades(user_id);
create index if not exists idx_journal_trades_trade_date on public.journal_trades(trade_date desc);

alter table public.journal_trades enable row level security;

create policy "Users can view own trades"
  on public.journal_trades for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own trades"
  on public.journal_trades for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own trades"
  on public.journal_trades for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own trades"
  on public.journal_trades for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 3. SYSTEM CALIBRATION & AUDIT TABLES (SHARED SYSTEM PREDICTIONS)
create table if not exists public.daily_predictions (
  id text primary key,
  target_trade_date date not null unique,
  frozen_at_et text not null,
  model_version text not null,
  spot_at_freeze numeric not null,
  bias_verdict text not null,
  confidence_tier text not null,
  archetype text not null,
  stop_hunt_likelihood text not null,
  stop_hunt_target_level numeric default null,
  primary_retrace_levels_json jsonb not null,
  liquidity_draws_json jsonb not null,
  regime_inputs_json jsonb not null,
  status text not null default 'PENDING_GRADE',
  created_at timestamptz not null default now()
);

alter table public.daily_predictions enable row level security;

create policy "Anyone can view daily predictions"
  on public.daily_predictions for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert daily predictions"
  on public.daily_predictions for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update daily predictions"
  on public.daily_predictions for update
  to authenticated
  using (true)
  with check (true);

create table if not exists public.prediction_grades (
  id text primary key,
  target_trade_date date not null unique,
  prediction_id text not null references public.daily_predictions(id) on delete cascade,
  open_price_930 numeric not null,
  window_high numeric not null,
  window_low numeric not null,
  window_close_1000 numeric not null,
  bias_correct boolean not null,
  favorable_excursion_pts numeric not null,
  adverse_excursion_pts numeric not null,
  retrace_tapped_json jsonb not null,
  stop_hunt_occurred boolean not null,
  liquidity_draw_hit_json jsonb not null,
  chop_warning_correct boolean not null,
  brier_score numeric not null,
  composite_score numeric not null,
  graded_at timestamptz not null default now()
);

create index if not exists idx_prediction_grades_prediction_id on public.prediction_grades(prediction_id);

alter table public.prediction_grades enable row level security;

create policy "Anyone can view prediction grades"
  on public.prediction_grades for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert prediction grades"
  on public.prediction_grades for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update prediction grades"
  on public.prediction_grades for update
  to authenticated
  using (true)
  with check (true);

create table if not exists public.model_weights_history (
  id text primary key,
  version text not null unique,
  is_active boolean not null default false,
  weights_json jsonb not null,
  sample_size_used integer not null default 0,
  out_of_sample_accuracy numeric not null default 0,
  change_summary text not null default '',
  created_at timestamptz not null default now()
);

alter table public.model_weights_history enable row level security;

create policy "Anyone can view model weights history"
  on public.model_weights_history for select
  to anon, authenticated
  using (true);

create policy "Authenticated users can insert model weights history"
  on public.model_weights_history for insert
  to authenticated
  with check (true);

create policy "Authenticated users can update model weights history"
  on public.model_weights_history for update
  to authenticated
  using (true)
  with check (true);

-- Ensure initial v1.0 weights exist
insert into public.model_weights_history (id, version, is_active, weights_json, sample_size_used, out_of_sample_accuracy, change_summary)
values (
  'weight_v1.0',
  'v1.0',
  true,
  '{"htfTrend": 1.0, "vwapAlignment": 1.0, "overnightInventory": 1.0, "openingGap": 1.0, "smtDivergence": 1.0, "volatilitySurface": 1.0, "macroRegime": 1.0, "gexRegime": 1.0}'::jsonb,
  0,
  0.0,
  'Initial baseline factor scorecard weights'
)
on conflict (version) do nothing;

-- 4. PRIVATE STORAGE BUCKET FOR JOURNAL SCREENSHOTS
insert into storage.buckets (id, name, public)
values ('journal-screenshots', 'journal-screenshots', false)
on conflict (id) do nothing;

create policy "Users can upload their own journal screenshots"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'journal-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can view their own journal screenshots"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'journal-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update their own journal screenshots"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'journal-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'journal-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete their own journal screenshots"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'journal-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
