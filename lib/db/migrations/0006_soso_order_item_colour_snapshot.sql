ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS selected_colour_id text;
ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS selected_colour_label text;
ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS selected_colour_hex text;
ALTER TABLE soso_order_items ADD COLUMN IF NOT EXISTS custom_colour text;