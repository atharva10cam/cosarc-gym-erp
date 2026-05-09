create table if not exists members (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  phone text,
  gender text,
  age int,
  goal text,
  status text default 'Active',
  membership_start date,
  membership_end date,
  plan text,
  payment_status text default 'Pending',
  total_revenue numeric default 0,
  trainer text,
  salesperson text,
  engagement int default 60,
  notes text,
  diet_plan text,
  workout_plan text,
  frozen_until date,
  created_at timestamptz default now()
);

create table if not exists attendance (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  date date not null,
  check_in text,
  check_out text,
  duration int default 0,
  created_at timestamptz default now()
);

create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  member_id uuid references members(id) on delete cascade,
  date date not null,
  amount numeric not null default 0,
  gst numeric default 18,
  discount numeric default 0,
  status text default 'Pending',
  method text,
  invoice_no text,
  created_at timestamptz default now()
);

create table if not exists enquiries (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone text,
  interest text,
  temperature text default 'Warm',
  status text default 'New',
  owner text,
  salesperson text,
  probability numeric default 35,
  source text,
  next_follow_up date,
  notes text,
  follow_ups jsonb default '[]'::jsonb,
  created_at timestamptz default now()
);

create table if not exists trainers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  specialty text,
  commission_rate numeric default 0,
  sessions int default 0,
  rating numeric default 5,
  created_at timestamptz default now()
);

create table if not exists sales_team (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role text,
  target numeric default 0,
  revenue numeric default 0,
  conversions int default 0,
  leads int default 0,
  incentive_rate numeric default 0,
  created_at timestamptz default now()
);

create table if not exists inventory (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  stock int default 0,
  low_at int default 5,
  price numeric default 0,
  created_at timestamptz default now()
);

alter table members enable row level security;
alter table attendance enable row level security;
alter table payments enable row level security;
alter table enquiries enable row level security;
alter table trainers enable row level security;
alter table sales_team enable row level security;
alter table inventory enable row level security;

create policy "authenticated members access" on members for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated attendance access" on attendance for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated payments access" on payments for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated enquiries access" on enquiries for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated trainers access" on trainers for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated sales team access" on sales_team for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
create policy "authenticated inventory access" on inventory for all using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
