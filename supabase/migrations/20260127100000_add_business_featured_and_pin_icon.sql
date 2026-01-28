alter table businesses
  add column if not exists featured_item_name text,
  add column if not exists featured_item_price_cents integer,
  add column if not exists pin_icon_url text;
