-- ==============================================================================
-- MinBook Per-User AI API Key Storage (RLS-Scoped, Server-Managed)
-- ==============================================================================

create table if not exists public.user_ai_keys (
  user_id uuid primary key references auth.users(id) on delete cascade,
  gemini_api_key text not null,
  key_hint text not null,
  updated_at timestamptz not null default now()
);

alter table public.user_ai_keys enable row level security;

create policy "Users can view own AI key"
  on public.user_ai_keys for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own AI key"
  on public.user_ai_keys for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own AI key"
  on public.user_ai_keys for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own AI key"
  on public.user_ai_keys for delete
  to authenticated
  using ((select auth.uid()) = user_id);
