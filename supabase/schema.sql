-- Plak dit in Supabase > SQL Editor > New query > Run.
-- Eén rij per leerling per soort gegevens (DSW-overzicht, planning, vrije momenten).
create table if not exists public.gebruikersdata (
  user_id uuid not null references auth.users (id) on delete cascade,
  sleutel text not null,
  waarde jsonb not null,
  bijgewerkt timestamptz not null default now(),
  primary key (user_id, sleutel)
);

alter table public.gebruikersdata enable row level security;

-- Iedereen ziet en wijzigt alleen zijn eigen gegevens.
create policy "eigen data lezen" on public.gebruikersdata for select using (auth.uid() = user_id);
create policy "eigen data toevoegen" on public.gebruikersdata for insert with check (auth.uid() = user_id);
create policy "eigen data wijzigen" on public.gebruikersdata for update using (auth.uid() = user_id) with check (auth.uid() = user_id);
create policy "eigen data verwijderen" on public.gebruikersdata for delete using (auth.uid() = user_id);
