alter table supplier_docs add column if not exists order_id uuid references orders(id) on delete cascade;
