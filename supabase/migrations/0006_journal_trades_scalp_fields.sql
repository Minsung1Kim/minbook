-- ==============================================================================
-- MinBook Scalping Co-Pilot Journal Migration
-- Extends public.journal_trades for Google Slides PDF / CSV / JSON trade logs
-- ==============================================================================

alter table public.journal_trades
  add column if not exists slide_number integer default null,
  add column if not exists session_window text default '',
  add column if not exists setup_archetype text default '',
  add column if not exists stop_pts numeric default null,
  add column if not exists tp1_pts numeric default null,
  add column if not exists realized_r numeric default null,
  add column if not exists mfe_pts numeric default null,
  add column if not exists mae_pts numeric default null,
  add column if not exists gex_regime text default '',
  add column if not exists playbook_archetype text default '',
  add column if not exists execution_grade text default '',
  add column if not exists mistake_tags text[] not null default '{}',
  add column if not exists trader_notes text default '',
  add column if not exists import_source text default 'MANUAL';

create index if not exists idx_journal_trades_user_setup
  on public.journal_trades(user_id, setup_archetype, gex_regime, session_window);
