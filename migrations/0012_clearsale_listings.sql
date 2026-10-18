-- Durable seller-owned ClearSale listings. Public inventory is a deliberate
-- projection of rows explicitly approved as published and storage-complete.
create table if not exists clearsale_listings (
  id varchar(64) primary key,
  seller_user_id varchar(255) not null,
  seller_name text not null,
  seller_email text not null,
  seller_phone text,
  vehicle_year integer not null,
  make text not null,
  model text not null,
  trim text,
  vin text,
  mileage integer not null,
  asking_price_cents integer not null,
  title_status text not null,
  runs_and_drives text not null,
  known_issues text not null,
  recent_repairs text,
  seller_notes text,
  internal_evidence jsonb not null default '{}'::jsonb,
  status text not null default 'draft' check (status in ('draft', 'pending_review', 'published', 'withdrawn', 'rejected')),
  storage_status text not null default 'not_requested' check (storage_status in ('not_requested', 'persisted', 'failed')),
  rejection_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clearsale_listings_seller_idx on clearsale_listings (seller_user_id, updated_at desc);
create index if not exists clearsale_listings_public_idx on clearsale_listings (status, storage_status, updated_at desc);
