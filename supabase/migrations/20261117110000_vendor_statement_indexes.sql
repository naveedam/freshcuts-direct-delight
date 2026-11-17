-- Indexes for the vendor screens (Statements & Payments over long date ranges, Vendor Ledger, Purchase Orders).
-- Only adds indexes that don't exist yet; changes no data. Safe to run more than once.
CREATE INDEX IF NOT EXISTS idx_orders_created_at                ON public.orders (created_at);
CREATE INDEX IF NOT EXISTS idx_order_items_order_id             ON public.order_items (order_id);
CREATE INDEX IF NOT EXISTS idx_order_items_vendor_id            ON public.order_items (vendor_id) WHERE vendor_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_po_items_order_item_id           ON public.purchase_order_items (order_item_id);
CREATE INDEX IF NOT EXISTS idx_po_items_purchase_order_id       ON public.purchase_order_items (purchase_order_id);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_vendor_date      ON public.purchase_orders (vendor_id, order_date);
CREATE INDEX IF NOT EXISTS idx_purchase_orders_order_date       ON public.purchase_orders (order_date);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_vendor_date      ON public.vendor_payments (vendor_id, payment_date);
CREATE INDEX IF NOT EXISTS idx_vendor_payments_purchase_order   ON public.vendor_payments (purchase_order_id);
ANALYZE public.orders, public.order_items, public.purchase_order_items, public.purchase_orders, public.vendor_payments;
