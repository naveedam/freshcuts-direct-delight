import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/supabase-paginate';

// Vendor statement for a date range: every order line supplied by the vendor, with the vendor's
// quantity and rate taken from the order (the same figures the invoice and PO are built from),
// matched to its purchase order line, plus the vendor's ledger and the settlements paid.

const db = supabase as any;

export type LineStatus = 'paid' | 'partial' | 'pending' | 'no_po' | 'awaiting_weights';

export interface StatementLine {
  orderItemId: string;
  orderId: string;
  vendorId: string;
  vendorName: string;
  date: string; // YYYY-MM-DD, IST
  apartment: string;
  flat: string;
  item: string;
  qty: number;
  rate: number;
  amount: number;
  invoice: string | null;
  weightFinalized: boolean;
  po: null | {
    id: string;
    number: string;
    lineId: string;
    qty: number;
    rate: number;
    amount: number;
    taxAmount: number | null;
  };
  status: LineStatus;
  /** Order and PO line disagree on quantity, rate or amount. */
  mismatch: boolean;
  rateMissing: boolean;
}

export interface StatementPO {
  id: string;
  number: string;
  vendorId: string;
  date: string;
  total: number;
  paid: number;
  status: string;
  paymentStatus: string;
  /** Value of this PO's lines that belong to orders on this statement. */
  linesOnStatement: number;
}

export interface OrphanPOLine {
  poNumber: string;
  item: string;
  amount: number;
  reason: string;
}

export interface VendorPayment {
  id: string;
  vendorId: string;
  poId: string | null;
  amount: number;
  date: string;
  method: string;
  reference: string | null;
  notes: string | null;
  batchId: string | null;
  periodFrom: string | null;
  periodTo: string | null;
}

export interface Settlement {
  key: string;
  batchId: string | null;
  vendorId: string;
  date: string;
  amount: number;
  advance: number;
  method: string;
  reference: string | null;
  notes: string | null;
  periodFrom: string | null;
  periodTo: string | null;
  poCount: number;
}

// What's still owed, worked out the same way as the Vendors, Purchase Orders and Vendor Ledger tabs:
// for each purchase order, its total less what has been applied to it (never below zero).
export interface LedgerSummary {
  posToDate: number;      // purchase orders dated up to the end of the range
  paidToDate: number;     // paid against those purchase orders
  owedToDate: number;     // still owed on them
  owedAllDates: number;   // still owed on every purchase order, whatever its date
  advance: number;        // paid but not yet applied to any purchase order
}

export interface VendorStatement {
  from: string;
  to: string;
  lines: StatementLine[];
  pos: StatementPO[];
  orphans: OrphanPOLine[];
  settlements: Settlement[];
  ledger: LedgerSummary;
  totals: {
    statement: number;
    payable: number; // POs touched + lines without a PO
    paid: number;
    outstanding: number;
    noPoAmount: number;
    noPoCount: number;
    mismatchCount: number;
    mismatchDelta: number;
    rateMissingCount: number;
    orphanAmount: number;
  };
}

export const istDate = (iso: string) =>
  new Date(iso).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
// PO dates are IST calendar days (older POs were stored at midnight UTC, which is the same IST day).
const poDay = (iso: string) => istDate(iso);
const round2 = (n: number) => Math.round(n * 100) / 100;
const chunk = <T,>(a: T[], n = 200) => Array.from({ length: Math.ceil(a.length / n) }, (_, i) => a.slice(i * n, i * n + n));

export const vendorQty = (oi: any) =>
  Number(oi.vendor_supplied_weight ?? oi.actual_weight ?? oi.quantity ?? 0) || 0;

/** Sunday-to-Saturday week containing the given IST date (YYYY-MM-DD). */
export function weekOf(day: string, offsetWeeks = 0): { from: string; to: string } {
  const d = new Date(`${day}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - d.getUTCDay() + offsetWeeks * 7);
  const end = new Date(d);
  end.setUTCDate(end.getUTCDate() + 6);
  return { from: d.toISOString().slice(0, 10), to: end.toISOString().slice(0, 10) };
}
export const todayIST = () => istDate(new Date().toISOString());

export async function loadVendorStatement(vendorId: string | 'all', from: string, to: string,
  vendorNames: Record<string, string>): Promise<VendorStatement> {
  // 1. Order lines supplied by the vendor, for orders placed in the range (IST).
  const items = await fetchAllRows<any>(() => {
    let q = db.from('order_items')
      .select(`id, order_id, vendor_id, product_name, quantity, actual_weight, vendor_supplied_weight, vendor_cost,
        orders!inner(id, created_at, invoice_number, building_name, flat_number, shipping_address, status, invoice_cancelled, weight_finalized)`)
      .not('vendor_id', 'is', null)
      .gte('orders.created_at', `${from}T00:00:00+05:30`)
      .lte('orders.created_at', `${to}T23:59:59.999+05:30`)
      .order('id');
    if (vendorId !== 'all') q = q.eq('vendor_id', vendorId);
    return q;
  });
  const live = items.filter((i) => i.orders && i.orders.status !== 'cancelled' && !i.orders.invoice_cancelled);
  const itemIds = live.map((i) => i.id);

  // 2. Their purchase order lines.
  const poLines: any[] = [];
  for (const ids of chunk(itemIds)) {
    const { data, error } = await db.from('purchase_order_items').select('*').in('order_item_id', ids);
    if (error) throw error;
    poLines.push(...(data || []));
  }
  const lineByItem = new Map<string, any>();
  poLines.forEach((l) => lineByItem.set(l.order_item_id, l));

  // 3. Every PO of the vendor(s): the ones on this statement, plus the ledger.
  const allPOs = await fetchAllRows<any>(() => {
    let q = db.from('purchase_orders')
      .select('id, po_number, vendor_id, order_date, total_amount, paid_amount, status, payment_status')
      .neq('status', 'cancelled').order('order_date').order('id');
    if (vendorId !== 'all') q = q.eq('vendor_id', vendorId);
    return q;
  });
  const poById = new Map<string, any>(allPOs.map((p) => [p.id, p]));

  // 4. Payments of the vendor(s).
  const payRows = await fetchAllRows<any>(() => {
    let q = db.from('vendor_payments').select('*').order('payment_date').order('id');
    if (vendorId !== 'all') q = q.eq('vendor_id', vendorId);
    return q;
  });
  const payments: VendorPayment[] = payRows.map((p) => ({
    id: p.id, vendorId: p.vendor_id, poId: p.purchase_order_id, amount: Number(p.amount) || 0,
    date: istDate(p.payment_date), method: p.payment_method, reference: p.reference_number, notes: p.notes,
    batchId: p.batch_id ?? null, periodFrom: p.period_from ?? null, periodTo: p.period_to ?? null,
  }));
  // Paid on each PO: the PO's own paid amount, the figure every other vendor screen uses.
  const paidByPO = new Map<string, number>();
  allPOs.forEach((po) => paidByPO.set(po.id, Number(po.paid_amount) || 0));

  // Build statement lines.
  const lines: StatementLine[] = live.map((oi) => {
    const o = oi.orders;
    const qty = round2(vendorQty(oi));
    const rate = Number(oi.vendor_cost) || 0;
    const amount = round2(qty * rate);
    const pl = lineByItem.get(oi.id);
    const po = pl ? poById.get(pl.purchase_order_id) : null;
    const poInfo = pl && po ? {
      id: po.id, number: po.po_number, lineId: pl.id,
      qty: Number(pl.quantity) || 0, rate: Number(pl.unit_cost) || 0, amount: Number(pl.total_cost) || 0,
      taxAmount: pl.tax_amount == null ? null : Number(pl.tax_amount),
    } : null;
    const paid = po ? (paidByPO.get(po.id) || 0) : 0;
    const poTotal = po ? Number(po.total_amount) || 0 : 0;
    const status: LineStatus = !poInfo ? (o.weight_finalized ? 'no_po' : 'awaiting_weights')
      : paid <= 0.009 ? 'pending' : paid + 0.009 >= poTotal ? 'paid' : 'partial';
    return {
      orderItemId: oi.id, orderId: oi.order_id, vendorId: oi.vendor_id, vendorName: vendorNames[oi.vendor_id] || '—',
      date: istDate(o.created_at),
      apartment: (o.building_name || o.shipping_address || '').trim(),
      flat: (o.flat_number || '').trim(),
      item: oi.product_name, qty, rate, amount,
      invoice: o.invoice_number || null,
      weightFinalized: !!o.weight_finalized,
      po: poInfo, status,
      mismatch: !!poInfo && (Math.abs(poInfo.amount - amount) > 0.5 || Math.abs(poInfo.qty - qty) > 0.005
        || Math.abs(poInfo.rate - rate) > 0.005),
      rateMissing: rate <= 0,
    };
  }).sort((a, b) => a.date.localeCompare(b.date) || a.apartment.localeCompare(b.apartment) || a.item.localeCompare(b.item));

  // POs on this statement.
  const posOnStatement = new Map<string, StatementPO>();
  lines.forEach((l) => {
    if (!l.po) return;
    const po = poById.get(l.po.id);
    const cur = posOnStatement.get(po.id) || {
      id: po.id, number: po.po_number, vendorId: po.vendor_id, date: poDay(po.order_date),
      total: Number(po.total_amount) || 0, paid: paidByPO.get(po.id) || 0,
      status: po.status, paymentStatus: po.payment_status, linesOnStatement: 0,
    };
    cur.linesOnStatement = round2(cur.linesOnStatement + l.po.amount);
    posOnStatement.set(po.id, cur);
  });
  const pos = [...posOnStatement.values()].sort((a, b) => a.date.localeCompare(b.date));

  // PO lines that sit in those POs, or in POs dated in the range, but match no order line here.
  const rangePOIds = new Set([
    ...pos.map((p) => p.id),
    ...allPOs.filter((p) => { const d = poDay(p.order_date); return d >= from && d <= to; }).map((p) => p.id),
  ]);
  const orphans: OrphanPOLine[] = [];
  const known = new Set(lines.map((l) => l.po?.lineId).filter(Boolean));
  for (const ids of chunk([...rangePOIds])) {
    const { data, error } = await db.from('purchase_order_items').select('*').in('purchase_order_id', ids);
    if (error) throw error;
    (data || []).forEach((pl: any) => {
      if (known.has(pl.id)) return;
      const po = poById.get(pl.purchase_order_id);
      const onOther = items.find((i) => i.id === pl.order_item_id);
      orphans.push({
        poNumber: po?.po_number || '—', item: pl.product_name, amount: Number(pl.total_cost) || 0,
        reason: !pl.order_item_id ? 'Added to the PO by hand (no order line)'
          : onOther ? 'Order is cancelled or its invoice was cancelled'
          : 'Order is outside this date range or no longer exists',
      });
    });
  }

  // Ledger: what's owed on purchase orders up to the end of the range, and on all of them.
  const poAmt = (p: any) => Number(p.total_amount) || 0;
  const poPaid = (p: any) => Math.min(Number(p.paid_amount) || 0, poAmt(p));
  const upTo = allPOs.filter((p) => poDay(p.order_date) <= to);
  const posToDate = upTo.reduce((s, p) => s + poAmt(p), 0);
  const paidToDate = upTo.reduce((s, p) => s + poPaid(p), 0);
  const owedAllDates = allPOs.reduce((s, p) => s + (poAmt(p) - poPaid(p)), 0);
  const advance = payments.filter((p) => !p.poId).reduce((s, p) => s + p.amount, 0);

  // Settlements touching this range: paid for an overlapping period, or paid within it.
  const groups = new Map<string, Settlement>();
  payments.filter((p) => (p.periodFrom && p.periodTo ? p.periodFrom <= to && p.periodTo >= from
      : p.date >= from && p.date <= to))
    .forEach((p) => {
      const key = p.batchId || p.id;
      const g = groups.get(key) || {
        key, batchId: p.batchId, vendorId: p.vendorId, date: p.date, amount: 0, advance: 0, method: p.method,
        reference: p.reference, notes: p.notes, periodFrom: p.periodFrom, periodTo: p.periodTo, poCount: 0,
      };
      g.amount = round2(g.amount + p.amount);
      if (p.poId) g.poCount += 1; else g.advance = round2(g.advance + p.amount);
      groups.set(key, g);
    });

  const noPo = lines.filter((l) => !l.po);
  const statement = round2(lines.reduce((s, l) => s + l.amount, 0));
  const poTotal = pos.reduce((s, p) => s + p.total, 0);
  const paid = round2(pos.reduce((s, p) => s + Math.min(p.paid, p.total), 0));
  const noPoAmount = round2(noPo.reduce((s, l) => s + l.amount, 0));
  const payable = round2(poTotal + noPoAmount);
  const mism = lines.filter((l) => l.mismatch);

  return {
    from, to, lines, pos, orphans,
    settlements: [...groups.values()].sort((a, b) => b.date.localeCompare(a.date)),
    ledger: {
      posToDate: round2(posToDate), paidToDate: round2(paidToDate), owedToDate: round2(posToDate - paidToDate),
      owedAllDates: round2(owedAllDates), advance: round2(advance),
    },
    totals: {
      statement, payable, paid, outstanding: round2(payable - paid),
      noPoAmount, noPoCount: noPo.length,
      mismatchCount: mism.length,
      mismatchDelta: round2(mism.reduce((s, l) => s + (l.po!.amount - l.amount), 0)),
      rateMissingCount: lines.filter((l) => l.rateMissing).length,
      orphanAmount: round2(orphans.reduce((s, o) => s + o.amount, 0)),
    },
  };
}

export const STATUS_LABEL: Record<LineStatus, string> = {
  paid: 'Paid', partial: 'Part paid', pending: 'Unpaid', no_po: 'No PO yet', awaiting_weights: 'Weights pending',
};

export const fmtDay = (d: string) =>
  new Date(`${d}T00:00:00+05:30`).toLocaleDateString('en-GB', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: '2-digit' }).replace(/ /g, '-');

// ---------- Excel ----------
export async function downloadStatementExcel(st: VendorStatement, vendorLabel: string) {
  const ExcelJS = (await import('exceljs')).default;
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Statement');
  const multi = new Set(st.lines.map((l) => l.vendorId)).size > 1;
  const cols = [
    { h: 'Date', w: 12 }, ...(multi ? [{ h: 'Vendor', w: 22 }] : []), { h: 'Apartment', w: 26 }, { h: 'Flat No.', w: 10 },
    { h: 'Item', w: 22 }, { h: 'Quantity', w: 10 }, { h: 'Vendor Rate', w: 12 }, { h: 'Amount', w: 12 },
    { h: 'Linked Invoice', w: 16 }, { h: 'Linked PO', w: 16 }, { h: 'Status', w: 14 },
  ];
  ws.columns = cols.map((c) => ({ width: c.w }));
  const bold = { bold: true } as const;
  const border = { top: { style: 'thin' }, left: { style: 'thin' }, bottom: { style: 'thin' }, right: { style: 'thin' } } as any;

  ws.addRow([vendorLabel, '', '', 'Period', `${fmtDay(st.from)} to ${fmtDay(st.to)}`]).font = bold;
  ws.addRow([]);
  const head = ws.addRow(cols.map((c) => c.h));
  head.eachCell((c) => { c.font = bold; c.border = border; c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFAF5EE' } }; });
  st.lines.forEach((l) => {
    const r = ws.addRow([
      fmtDay(l.date), ...(multi ? [l.vendorName] : []), l.apartment, l.flat, l.item, l.qty, l.rate, l.amount,
      l.invoice || '', l.po?.number || '', STATUS_LABEL[l.status],
    ]);
    r.eachCell({ includeEmpty: true }, (c) => { c.border = border; });
  });
  const qtyCol = multi ? 6 : 5;
  ws.getColumn(qtyCol).numFmt = '0.00';
  ws.getColumn(qtyCol + 1).numFmt = '#,##0';
  ws.getColumn(qtyCol + 2).numFmt = '#,##0';
  const total = ws.addRow([]);
  total.getCell(qtyCol + 1).value = 'Total';
  total.getCell(qtyCol + 2).value = st.totals.statement;
  total.font = bold;

  ws.addRow([]);
  const sum = (label: string, v: number) => { const r = ws.addRow([label, '', '', '', v]); r.getCell(5).numFmt = '#,##0'; return r; };
  ws.addRow(['Summary']).font = bold;
  sum('Payable for the period (POs + lines without a PO)', st.totals.payable);
  sum('Paid', st.totals.paid);
  sum('Outstanding', st.totals.outstanding).font = bold;
  ws.addRow([]);
  ws.addRow(['Vendor ledger']).font = bold;
  sum(`Purchase orders up to ${fmtDay(st.to)}`, st.ledger.posToDate);
  sum('Paid against them', st.ledger.paidToDate);
  sum(`Owed up to ${fmtDay(st.to)}`, st.ledger.owedToDate).font = bold;
  sum('Owed on all purchase orders (any date)', st.ledger.owedAllDates);
  if (st.ledger.advance > 0) sum('Paid in advance (not yet on a PO)', st.ledger.advance);

  if (st.settlements.length) {
    const ps = wb.addWorksheet('Payments');
    ps.columns = [{ width: 12 }, { width: 12 }, { width: 14 }, { width: 18 }, { width: 24 }, { width: 40 }];
    const h = ps.addRow(['Paid on', 'Amount', 'Method', 'Reference', 'For period', 'Notes']);
    h.font = bold;
    st.settlements.forEach((s) => ps.addRow([
      fmtDay(s.date), s.amount, s.method, s.reference || '',
      s.periodFrom && s.periodTo ? `${fmtDay(s.periodFrom)} to ${fmtDay(s.periodTo)}` : '', s.notes || '',
    ]));
  }

  const buf = await wb.xlsx.writeBuffer();
  const url = URL.createObjectURL(new Blob([buf], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = `${vendorLabel.replace(/[^\w]+/g, '_')}_${st.from}_to_${st.to}.xlsx`;
  a.click();
  URL.revokeObjectURL(url);
}

// ---------- PDF ----------
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const inr = (n: number) => `₹${Math.round(n).toLocaleString('en-IN')}`;

export async function downloadStatementPdf(st: VendorStatement, vendorLabel: string, logoDataUrl?: string) {
  const multi = new Set(st.lines.map((l) => l.vendorId)).size > 1;
  const th = (t: string, right = false) => `<th style="text-align:${right ? 'right' : 'left'};padding:5px 6px;border:1px solid #d9cfc4;background:#FAF5EE">${t}</th>`;
  const td = (t: string, right = false) => `<td style="text-align:${right ? 'right' : 'left'};padding:4px 6px;border:1px solid #e5ddd3">${t}</td>`;
  const rows = st.lines.map((l) => `<tr>${td(fmtDay(l.date))}${multi ? td(esc(l.vendorName)) : ''}${td(esc(l.apartment))}${td(esc(l.flat))}${td(esc(l.item))}${td(l.qty.toFixed(2), true)}${td(String(l.rate), true)}${td(inr(l.amount), true)}${td(esc(l.invoice || ''))}${td(esc(l.po?.number || ''))}${td(STATUS_LABEL[l.status])}</tr>`).join('');
  const kv = (k: string, v: number, strong = false) => `<tr><td style="padding:3px 8px">${k}</td><td style="padding:3px 8px;text-align:right;${strong ? 'font-weight:700' : ''}">${inr(v)}</td></tr>`;
  const html = `
  <div style="font-family:Arial,Helvetica,sans-serif;color:#2b2420;font-size:11px;padding:4px">
    <div style="display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #6D281A;padding-bottom:8px;margin-bottom:10px">
      <div style="display:flex;align-items:center;gap:10px">
        ${logoDataUrl ? `<img src="${logoDataUrl}" style="height:46px" />` : ''}
        <div><div style="font-size:18px;font-weight:700;color:#6D281A">Vendor Statement</div>
        <div style="font-size:13px">${esc(vendorLabel)}</div></div>
      </div>
      <div style="text-align:right"><div>Period</div><div style="font-weight:700;font-size:13px">${fmtDay(st.from)} to ${fmtDay(st.to)}</div></div>
    </div>
    <table style="border-collapse:collapse;width:100%">
      <thead><tr>${th('Date')}${multi ? th('Vendor') : ''}${th('Apartment')}${th('Flat No.')}${th('Item')}${th('Quantity', true)}${th('Vendor Rate', true)}${th('Amount', true)}${th('Linked Invoice')}${th('Linked PO')}${th('Status')}</tr></thead>
      <tbody>${rows || `<tr><td colspan="11" style="padding:10px;text-align:center">No orders in this period</td></tr>`}
      <tr><td colspan="${multi ? 7 : 6}" style="padding:5px 6px;text-align:right;font-weight:700">Total</td><td style="padding:5px 6px;text-align:right;font-weight:700">${inr(st.totals.statement)}</td><td colspan="3"></td></tr></tbody>
    </table>
    <div style="display:flex;gap:24px;margin-top:14px">
      <table style="border-collapse:collapse;min-width:260px"><tr><td colspan="2" style="font-weight:700;color:#6D281A;padding:3px 8px">For this period</td></tr>
        ${kv('Payable', st.totals.payable)}${kv('Paid', st.totals.paid)}${kv('Outstanding', st.totals.outstanding, true)}</table>
      <table style="border-collapse:collapse;min-width:260px"><tr><td colspan="2" style="font-weight:700;color:#6D281A;padding:3px 8px">Vendor ledger</td></tr>
        ${kv(`POs up to ${fmtDay(st.to)}`, st.ledger.posToDate)}${kv('Paid against them', st.ledger.paidToDate)}${kv(`Owed up to ${fmtDay(st.to)}`, st.ledger.owedToDate, true)}${kv('Owed, all dates', st.ledger.owedAllDates)}</table>
    </div>
    ${st.settlements.length ? `<div style="margin-top:12px"><div style="font-weight:700;color:#6D281A;margin-bottom:4px">Payments</div>
      ${st.settlements.map((s) => `<div>${fmtDay(s.date)} · ${inr(s.amount)} · ${esc(s.method)}${s.reference ? ` · ${esc(s.reference)}` : ''}${s.periodFrom && s.periodTo ? ` · for ${fmtDay(s.periodFrom)} to ${fmtDay(s.periodTo)}` : ''}</div>`).join('')}</div>` : ''}
    <div style="margin-top:14px;color:#8a7f76;font-size:9px">Quantities and rates are the vendor's, as recorded on each order. Generated ${new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })}.</div>
  </div>`;
  const holder = document.createElement('div');
  holder.style.cssText = 'position:fixed;left:-10000px;top:0;width:1100px;background:#fff';
  holder.innerHTML = html;
  document.body.appendChild(holder);
  try {
    const html2pdf = (await import('html2pdf.js')).default;
    await html2pdf().from(holder.firstElementChild as HTMLElement).set({
      margin: [8, 8, 8, 8],
      filename: `${vendorLabel.replace(/[^\w]+/g, '_')}_${st.from}_to_${st.to}.pdf`,
      image: { type: 'jpeg', quality: 0.95 },
      html2canvas: { scale: 2, useCORS: true, logging: false },
      jsPDF: { unit: 'mm', format: 'a4', orientation: 'landscape' },
      pagebreak: { mode: ['css', 'legacy'] },
    }).save();
  } finally {
    holder.remove();
  }
}
