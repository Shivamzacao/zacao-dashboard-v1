-- GENERATED FILE — do not edit by hand.
-- Source of truth: the input workbook's Data_Dictionary (see generate-contracts.mjs).

create table if not exists import_batches (
  id uuid primary key default gen_random_uuid(),
  upload_id uuid not null,
  tab_name text not null,
  filename text not null,
  uploaded_at timestamptz not null default now(),
  row_count integer not null,
  issue_count integer not null,
  workbook_state text not null,
  committed boolean not null default true
);

create index if not exists import_batches_tab_uploaded_idx
  on import_batches (tab_name, uploaded_at desc);

create or replace view latest_committed_batches as
  select distinct on (tab_name)
    tab_name,
    id as batch_id,
    upload_id,
    filename,
    uploaded_at,
    row_count
  from import_batches
  where committed
  order by tab_name, uploaded_at desc, id desc;

create table if not exists sku_master (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  sku_id text,
  canonical_name text,
  recipe_doc_name text,
  po_sales_order_name text,
  shopify_product_title text,
  shopify_variant_title text,
  shopify_variant_sku text,
  pack_size_bars integer,
  is_active text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists sku_master_batch_id_idx on sku_master (batch_id);

create table if not exists location_master (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  location_id text,
  location_name text,
  location_type text,
  shopify_location_name text,
  address text,
  is_active text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists location_master_batch_id_idx on location_master (batch_id);

create table if not exists source_registry (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  source_id text,
  source_system text,
  source_name text,
  file_id_or_account text,
  tab_name text,
  allowlisted text,
  refresh_frequency text,
  max_staleness text,
  owner text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists source_registry_batch_id_idx on source_registry (batch_id);

create table if not exists channel_mapping (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  source_system text,
  source_channel_or_name text,
  order_tag text,
  discount_code text,
  utm_source text,
  utm_medium text,
  dashboard_channel text,
  sop_channel text,
  effective_from date,
  effective_to date,
  status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists channel_mapping_batch_id_idx on channel_mapping (batch_id);

create table if not exists inventory_snapshots (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  snapshot_at timestamp,
  warehouse text,
  sku text,
  on_hand integer,
  committed integer,
  available integer,
  damaged integer,
  incoming integer,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists inventory_snapshots_batch_id_idx on inventory_snapshots (batch_id);

create table if not exists inventory_lots (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  warehouse text,
  sku text,
  lot_number text,
  production_date date,
  received_date date,
  best_by_date date,
  quantity_received integer,
  quantity_remaining integer,
  status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists inventory_lots_batch_id_idx on inventory_lots (batch_id);

create table if not exists sales_forecast (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  forecast_version text,
  week_start date,
  sku text,
  channel text,
  forecast_units integer,
  forecast_revenue_usd numeric(14,2),
  status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists sales_forecast_batch_id_idx on sales_forecast (batch_id);

create table if not exists production_orders (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  po_number text,
  sku text,
  units integer,
  supplier text,
  order_date date,
  expected_date date,
  received_date date,
  status text,
  unit_cost_usd numeric(14,2),
  freight_usd numeric(14,2),
  deposit_usd numeric(14,2),
  balance_usd numeric(14,2),
  payment_due_date date,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists production_orders_batch_id_idx on production_orders (batch_id);

create table if not exists production_schedule (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  production_run text,
  sku text,
  planned_start date,
  planned_end date,
  actual_start date,
  actual_end date,
  planned_units integer,
  completed_units integer,
  status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists production_schedule_batch_id_idx on production_schedule (batch_id);

create table if not exists additional_depletions (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  movement_date date,
  warehouse text,
  sku text,
  quantity integer,
  reason text,
  recipient_or_project text,
  reference text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists additional_depletions_batch_id_idx on additional_depletions (batch_id);

create table if not exists cogs_by_sku (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  sku text,
  effective_from date,
  effective_to date,
  cost_basis text,
  production_cost_usd numeric(14,2),
  packaging_usd numeric(14,2),
  freight_usd numeric(14,2),
  fulfillment_usd numeric(14,2),
  total_unit_cost_usd numeric(14,2),
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists cogs_by_sku_batch_id_idx on cogs_by_sku (batch_id);

create table if not exists finance_actuals (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  period text,
  account_code text,
  category text,
  actual_amount_usd numeric(14,2),
  cash_or_accrual text,
  status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists finance_actuals_batch_id_idx on finance_actuals (batch_id);

create table if not exists cash_position (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  as_of_date date,
  cash_balance_usd numeric(14,2),
  restricted_cash_usd numeric(14,2),
  expected_inflow_usd numeric(14,2),
  expected_outflow_usd numeric(14,2),
  due_date date,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists cash_position_batch_id_idx on cash_position (batch_id);

create table if not exists marketing_spend (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  date date,
  platform text,
  account text,
  campaign_id text,
  campaign_name text,
  spend_usd numeric(14,2),
  impressions integer,
  clicks integer,
  conversions integer,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists marketing_spend_batch_id_idx on marketing_spend (batch_id);

create table if not exists social_metrics (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  snapshot_date date,
  platform text,
  account text,
  followers integer,
  reach integer,
  impressions integer,
  engagements integer,
  link_clicks integer,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists social_metrics_batch_id_idx on social_metrics (batch_id);

create table if not exists affiliate_ambassador_perf (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  period text,
  partner_id text,
  partner_name text,
  platform text,
  code_or_link text,
  orders integer,
  revenue_usd numeric(14,2),
  commission_usd numeric(14,2),
  posts integer,
  reach integer,
  clicks integer,
  payout_status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists affiliate_ambassador_perf_batch_id_idx on affiliate_ambassador_perf (batch_id);

create table if not exists growth_pipeline (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  pipeline_type text,
  opportunity text,
  stage text,
  status text,
  value_usd numeric(14,2),
  probability_manual numeric(7,4),
  created_date date,
  last_activity_date date,
  next_action text,
  next_action_date date,
  closed_date date,
  actual_value_usd numeric(14,2),
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists growth_pipeline_batch_id_idx on growth_pipeline (batch_id);

create table if not exists metric_targets (
  id bigserial primary key,
  batch_id uuid not null references import_batches(id) on delete cascade,
  row_num integer not null,
  record_id text,
  metric_key text,
  period_start date,
  period_end date,
  target_value numeric,
  unit text,
  scope_type text,
  scope_value text,
  status text,
  source_status text,
  data_as_of date,
  created_at timestamp,
  updated_at timestamp,
  updated_by text,
  source_reference text,
  notes text
);
create index if not exists metric_targets_batch_id_idx on metric_targets (batch_id);
