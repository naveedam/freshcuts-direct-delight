DROP TRIGGER IF EXISTS trg_sync_vendor_pos_on_finalize ON public.orders;

CREATE TRIGGER trg_sync_vendor_pos_on_finalize
AFTER UPDATE OF weight_finalized ON public.orders
FOR EACH ROW
WHEN (OLD.weight_finalized IS DISTINCT FROM NEW.weight_finalized AND NEW.weight_finalized = true)
EXECUTE FUNCTION public.sync_vendor_pos_on_finalize();