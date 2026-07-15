-- The app-level syncPOsFromWeightAdjustment() (src/lib/po-lifecycle.ts) is now
-- the single source of truth for PO creation/sync on weight finalization and
-- correction. This DB trigger duplicated that logic with slightly different
-- PO-matching rules, creating a risk of line items splitting across two POs.
DROP TRIGGER IF EXISTS trg_sync_vendor_pos_on_finalize ON public.orders;
-- Function left in place (harmless, unused) in case we need to reference it later.
