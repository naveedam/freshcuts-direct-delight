# Release Notes

## 2026-07-15

### Fixed
- **Vendor PO accuracy**: Removed a duplicate database trigger (`trg_sync_vendor_pos_on_finalize`) that ran alongside the app-level PO sync logic with slightly different matching rules, creating a risk of vendor line items splitting across two purchase orders for the same vendor/day. PO sync is now handled exclusively by `syncPOsFromWeightAdjustment()`.
- **Weight correction after finalization**: Previously, once an order's weights were finalized, all fields in the Weight Adjustment dialog were permanently locked — any correction (e.g. vendor-supplied weight entered incorrectly) required a direct database edit. Added a "Correct Weights" mode that unlocks the fields post-finalization, recalculates the order total, and resyncs the linked vendor PO on save.

### Verified
- Confirmed vendor POs for Aqsa Mutton Stall and Feroz Fish Stall are correctly computed from actual/vendor-supplied weight rather than customer-billed weight.
- Confirmed "Party Due" aggregation (grouped by flat + building, falling back to phone) is computing correctly; an earlier apparent discrepancy was a stale client-side cache, not a logic error.
