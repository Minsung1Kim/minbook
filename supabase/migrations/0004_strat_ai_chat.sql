-- ==============================================================================
-- MinBook Strat & Research AI Chat Schema Migration
-- Tables: chat_threads, chat_messages
-- Storage: chart-screenshots (private bucket scoped to auth.uid())
-- ==============================================================================

-- 1. CHAT THREADS TABLE
create table if not exists public.chat_threads (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null default 'New NQ Strat Session',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_chat_threads_user_updated
  on public.chat_threads(user_id, updated_at desc);

alter table public.chat_threads enable row level security;

create policy "Users can view own chat threads"
  on public.chat_threads for select
  to authenticated
  using ((select auth.uid()) = user_id);

create policy "Users can insert own chat threads"
  on public.chat_threads for insert
  to authenticated
  with check ((select auth.uid()) = user_id);

create policy "Users can update own chat threads"
  on public.chat_threads for update
  to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy "Users can delete own chat threads"
  on public.chat_threads for delete
  to authenticated
  using ((select auth.uid()) = user_id);

-- 2. CHAT MESSAGES TABLE
create table if not exists public.chat_messages (
  id text primary key default gen_random_uuid()::text,
  thread_id uuid not null references public.chat_threads(id) on delete cascade,
  role text not null check (role in ('user', 'assistant', 'system')),
  content text not null default '',
  image_urls text[] not null default '{}',
  market_context_snapshot jsonb default null,
  created_at timestamptz not null default now()
);

create index if not exists idx_chat_messages_thread_created
  on public.chat_messages(thread_id, created_at asc);

alter table public.chat_messages enable row level security;

create policy "Users can view messages in own chat threads"
  on public.chat_messages for select
  to authenticated
  using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "Users can insert messages in own chat threads"
  on public.chat_messages for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "Users can update messages in own chat threads"
  on public.chat_messages for update
  to authenticated
  using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = (select auth.uid())
    )
  )
  with check (
    exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = (select auth.uid())
    )
  );

create policy "Users can delete messages in own chat threads"
  on public.chat_messages for delete
  to authenticated
  using (
    exists (
      select 1
      from public.chat_threads t
      where t.id = thread_id
        and t.user_id = (select auth.uid())
    )
  );

-- Touch thread updated_at automatically when a message is inserted
create or replace function public.touch_chat_thread_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  update public.chat_threads
  set updated_at = now()
  where id = new.thread_id;
  return new;
end;
$$;

drop trigger if exists trg_touch_chat_thread_updated_at on public.chat_messages;
create trigger trg_touch_chat_thread_updated_at
  after insert on public.chat_messages
  for each row
  execute function public.touch_chat_thread_updated_at();

-- 3. PRIVATE STORAGE BUCKET FOR CHART SCREENSHOTS
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'chart-screenshots',
  'chart-screenshots',
  false,
  10485760,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "Users can upload own chart screenshots"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'chart-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can view own chart screenshots"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'chart-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can update own chart screenshots"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'chart-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  )
  with check (
    bucket_id = 'chart-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

create policy "Users can delete own chart screenshots"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'chart-screenshots'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
