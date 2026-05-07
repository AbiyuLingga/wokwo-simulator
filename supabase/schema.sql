create table if not exists public.circuits (
  relay_index integer primary key check (relay_index between 1 and 32),
  name text not null,
  relay_on boolean not null default false,
  tariff_idr_per_kwh numeric(12, 2) not null default 1444.70,
  command_nonce bigint not null default 0,
  updated_at timestamptz not null default now()
);

create table if not exists public.power_readings (
  id bigserial primary key,
  relay_index integer not null references public.circuits(relay_index) on delete cascade,
  voltage_rms numeric(10, 2) not null default 0,
  current_rms numeric(10, 4) not null default 0,
  power_watts numeric(12, 3) not null default 0,
  apparent_va numeric(12, 3) not null default 0,
  power_factor numeric(6, 4) not null default 0,
  energy_wh numeric(14, 6) not null default 0,
  relay_on boolean not null default false,
  estimated_cost_idr_per_hour numeric(12, 2),
  measured_at timestamptz not null default now()
);

create index if not exists power_readings_latest_idx
  on public.power_readings (relay_index, measured_at desc);

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists set_circuits_updated_at on public.circuits;
create trigger set_circuits_updated_at
before update on public.circuits
for each row
execute function public.set_updated_at();

alter table public.circuits enable row level security;
alter table public.power_readings enable row level security;

drop policy if exists "anon can read circuits" on public.circuits;
create policy "anon can read circuits"
on public.circuits
for select
to anon
using (true);

drop policy if exists "anon can insert circuits" on public.circuits;
create policy "anon can insert circuits"
on public.circuits
for insert
to anon
with check (true);

drop policy if exists "anon can update circuits" on public.circuits;
create policy "anon can update circuits"
on public.circuits
for update
to anon
using (true)
with check (true);

drop policy if exists "anon can read power readings" on public.power_readings;
create policy "anon can read power readings"
on public.power_readings
for select
to anon
using (true);

drop policy if exists "anon can insert power readings" on public.power_readings;
create policy "anon can insert power readings"
on public.power_readings
for insert
to anon
with check (true);

insert into public.circuits (relay_index, name, relay_on, tariff_idr_per_kwh, command_nonce)
values
  (1, 'Rangkaian 1', true, 1444.70, 0),
  (2, 'Rangkaian 2', true, 1444.70, 0),
  (3, 'Rangkaian 3', true, 1444.70, 0),
  (4, 'Rangkaian 4', true, 1444.70, 0)
on conflict (relay_index) do nothing;
