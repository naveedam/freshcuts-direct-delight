import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import {
  generateMonthOptions,
  generateGSTR1,
  generateGSTR3B,
  validateGSTR1,
  validateGSTR3B,
  reconcileData,
  exportGSTR1AsJSON,
  exportGSTR3BAsJSON,
} from '@/lib/gst-reports';
import type { InvoiceForReport, GSTR1Data, GSTR3BData, ValidationResult, ReconciliationData } from '@/types/gst-reports';
import {
  FileText,
  Download,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Shield,
  FileSpreadsheet,
  FileJson,
  Calendar,
  IndianRupee,
  CalendarDays,
} from 'lucide-react';
import { writeExcelFile } from '@/lib/excel-utils';
import { useFinancialYears } from '@/hooks/useFinancialYears';
import { GSTReconciliationDialog } from '@/components/admin/GSTReconciliationDialog';
import { Search } from 'lucide-react';

export default function GSTReportsAdmin() {
  const monthOptions = useMemo(() => generateMonthOptions(), []);
  const [selectedMonth, setSelectedMonth] = useState(monthOptions[0]?.value || '');
  const { data: financialYears } = useFinancialYears();
  const [fyFilter, setFyFilter] = useState<string>('all');
  const [reconOpen, setReconOpen] = useState(false);
  
  // Fetch business settings
  const { data: businessSettings } = useQuery({
    queryKey: ['admin', 'businessSettings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Parse selected month for date filtering
  const { startDate, endDate } = useMemo(() => {
    if (!selectedMonth) return { startDate: null, endDate: null };
    const month = parseInt(selectedMonth.substring(0, 2));
    const year = parseInt(selectedMonth.substring(2));
    const start = new Date(year, month - 1, 1);
    const end = new Date(year, month, 0, 23, 59, 59);
    return { startDate: start.toISOString(), endDate: end.toISOString() };
  }, [selectedMonth]);

  // Fetch invoices for the selected period
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['admin', 'gstReportInvoices', selectedMonth, fyFilter],
    queryFn: async () => {
      if (!startDate || !endDate) return [];
      
      let query = supabase
        .from('orders')
        .select('*')
        .not('invoice_number', 'is', null)
        .eq('invoice_cancelled', false)
        .neq('status', 'cancelled')
        .gte('created_at', startDate)
        .lte('created_at', endDate);
      
      if (fyFilter && fyFilter !== 'all') {
        query = query.eq('financial_year_id', fyFilter);
      }
      
      const { data: orders, error: ordersError } = await query;
      if (ordersError) throw ordersError;
      
      if (!orders?.length) return [];
      
      // Fetch order items for all orders
      const orderIds = orders.map(o => o.id);
      const { data: items, error: itemsError } = await supabase
        .from('order_items')
        .select('*')
        .in('order_id', orderIds);
      
      if (itemsError) throw itemsError;
      
      // Map to InvoiceForReport format
      const invoiceData: InvoiceForReport[] = orders.map(order => ({
        id: order.id,
        invoice_number: order.invoice_number,
        created_at: order.created_at,
        total_amount: order.total_amount,
        is_igst: order.is_igst,
        place_of_supply: order.place_of_supply,
        items: (items || [])
          .filter(item => item.order_id === order.id)
          .map(item => ({
            id: item.id,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.total_price,
            hsn_code: item.hsn_code,
            gst_type: item.gst_type,
            gst_rate: item.gst_rate,
            taxable_value: item.taxable_value,
            cgst_amount: item.cgst_amount,
            sgst_amount: item.sgst_amount,
            igst_amount: item.igst_amount,
          })),
      }));
      
      return invoiceData;
    },
    enabled: !!startDate && !!endDate,
  });

  // Fetch credit notes issued in the selected period (GST-safe reversal of prior invoices)
  const { data: creditNotes } = useQuery({
    queryKey: ['admin', 'gstReportCreditNotes', selectedMonth, fyFilter],
    queryFn: async () => {
      if (!startDate || !endDate) return [];
      const { data, error } = await supabase
        .from('credit_notes')
        .select('id, credit_note_number, invoice_number, amount, reason, created_at, order_id')
        .gte('created_at', startDate)
        .lte('created_at', endDate)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data || [];
    },
    enabled: !!startDate && !!endDate,
  });

  const creditNotesTotal = useMemo(
    () => (creditNotes || []).reduce((sum, cn: any) => sum + Number(cn.amount || 0), 0),
    [creditNotes]
  );

  // Generate reports
  const gstr1: GSTR1Data | null = useMemo(() => {
    if (!invoices?.length || !businessSettings?.gstin) return null;
    return generateGSTR1(invoices, businessSettings.gstin, selectedMonth);
  }, [invoices, businessSettings?.gstin, selectedMonth]);

  const gstr3b: GSTR3BData | null = useMemo(() => {
    if (!invoices?.length || !businessSettings?.gstin) return null;
    return generateGSTR3B(invoices, businessSettings.gstin, selectedMonth);
  }, [invoices, businessSettings?.gstin, selectedMonth]);

  // Validate reports
  const gstr1Validation: ValidationResult | null = useMemo(() => {
    return gstr1 ? validateGSTR1(gstr1) : null;
  }, [gstr1]);

  const gstr3bValidation: ValidationResult | null = useMemo(() => {
    return gstr3b ? validateGSTR3B(gstr3b) : null;
  }, [gstr3b]);

  // Reconciliation
  const reconciliation: ReconciliationData | null = useMemo(() => {
    if (!invoices?.length || !gstr1 || !gstr3b) return null;
    return reconcileData(invoices, gstr1, gstr3b);
  }, [invoices, gstr1, gstr3b]);

  // Check if GST safe
  const isGSTSafe = useMemo(() => {
    return (
      gstr1Validation?.isValid &&
      gstr3bValidation?.isValid &&
      reconciliation?.is_reconciled
    );
  }, [gstr1Validation, gstr3bValidation, reconciliation]);

  // Export handlers
  const handleExportGSTR1Excel = () => {
    if (!gstr1) return;
    
    const table4Data = gstr1.table_4.map(row => ({
      'Rate (%)': row.rate,
      'Taxable Value': row.taxable_value,
      'CGST': row.cgst,
      'SGST': row.sgst,
      'IGST': row.igst,
      'Cess': row.cess,
    }));
    
    const table8Data = gstr1.table_8.map(row => ({
      'Description': row.description,
      'Nil Rated': row.nil_rated,
      'Exempted': row.exempted,
      'Non-GST': row.non_gst,
    }));
    
    const hsnData = gstr1.hsn_summary.map(row => ({
      'HSN Code': row.hsn_code,
      'Description': row.description,
      'Quantity': row.quantity,
      'Unit': row.unit,
      'Rate (%)': row.rate,
      'Taxable Value': row.taxable_value,
      'IGST': row.integrated_tax,
      'CGST': row.central_tax,
      'SGST': row.state_tax,
      'Cess': row.cess,
    }));
    
    const b2csData = gstr1.b2cs.map(row => ({
      'Place of Supply': row.place_of_supply,
      'Rate (%)': row.rate,
      'Taxable Value': row.taxable_value,
      'Cess': row.cess,
    }));
    
    writeExcelFile(`GSTR1_${selectedMonth}.xlsx`, [
      { name: 'Table 4 - Taxable Supplies', data: table4Data },
      { name: 'Table 8 - Nil/Exempt', data: table8Data },
      { name: 'HSN Summary', data: hsnData },
      { name: 'B2CS - Small Invoices', data: b2csData },
    ]);
  };

  const handleExportGSTR1JSON = () => {
    if (!gstr1) return;
    const json = exportGSTR1AsJSON(gstr1);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR1_${selectedMonth}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleExportGSTR3BExcel = () => {
    if (!gstr3b) return;
    
    const summaryData = [
      { 'Description': 'Table 3.1(a) - Taxable Outward Supplies', 'Amount': '' },
      { 'Description': 'Taxable Value', 'Amount': gstr3b.table_3_1_a.taxable_value },
      { 'Description': 'Integrated Tax (IGST)', 'Amount': gstr3b.table_3_1_a.integrated_tax },
      { 'Description': 'Central Tax (CGST)', 'Amount': gstr3b.table_3_1_a.central_tax },
      { 'Description': 'State Tax (SGST)', 'Amount': gstr3b.table_3_1_a.state_tax },
      { 'Description': 'Cess', 'Amount': gstr3b.table_3_1_a.cess },
      { 'Description': '', 'Amount': '' },
      { 'Description': 'Table 3.1(c) - Exempt/Nil Supplies', 'Amount': '' },
      { 'Description': 'Nil Rated', 'Amount': gstr3b.table_3_1_c.nil_rated },
      { 'Description': 'Exempted', 'Amount': gstr3b.table_3_1_c.exempted },
      { 'Description': 'Non-GST', 'Amount': gstr3b.table_3_1_c.non_gst },
      { 'Description': '', 'Amount': '' },
      { 'Description': 'Tax Payable', 'Amount': '' },
      { 'Description': 'IGST', 'Amount': gstr3b.tax_payable.igst },
      { 'Description': 'CGST', 'Amount': gstr3b.tax_payable.cgst },
      { 'Description': 'SGST', 'Amount': gstr3b.tax_payable.sgst },
      { 'Description': 'Total', 'Amount': gstr3b.tax_payable.total },
    ];
    
    writeExcelFile(`GSTR3B_${selectedMonth}.xlsx`, [
      { name: 'GSTR-3B Summary', data: summaryData }
    ]);
  };

  const handleExportGSTR3BJSON = () => {
    if (!gstr3b) return;
    const json = exportGSTR3BAsJSON(gstr3b);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GSTR3B_${selectedMonth}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">GST Reports</h1>
            <p className="font-body text-muted-foreground">Generate GSTR-1 and GSTR-3B reports</p>
          </div>
          
          <div className="flex items-center gap-4 flex-wrap">
            {/* Financial Year Filter */}
            {financialYears && financialYears.length > 0 && (
              <div className="flex items-center gap-2">
                <CalendarDays className="h-4 w-4 text-muted-foreground" />
                <Select value={fyFilter} onValueChange={setFyFilter}>
                  <SelectTrigger className="w-48">
                    <SelectValue placeholder="Financial Year" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Financial Years</SelectItem>
                    {financialYears.map((fy) => (
                      <SelectItem key={fy.id} value={fy.id}>{fy.name}{fy.is_active ? ' (Active)' : ''}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
            {/* Month Selector */}
            <div className="flex items-center gap-2">
              <Calendar className="h-4 w-4 text-muted-foreground" />
              <Select value={selectedMonth} onValueChange={setSelectedMonth}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Select month" />
                </SelectTrigger>
                <SelectContent>
                  {monthOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            
            {/* GST Safe Indicator */}
            {invoices && invoices.length > 0 && (
              <Badge
                variant={isGSTSafe ? 'default' : 'destructive'}
                className={`gap-1 ${isGSTSafe ? 'bg-green-600' : ''}`}
              >
                {isGSTSafe ? (
                  <>
                    <Shield className="h-3 w-3" />
                    GST Safe
                  </>
                ) : (
                  <>
                    <AlertTriangle className="h-3 w-3" />
                    Review Required
                  </>
                )}
              </Badge>
            )}
          </div>
        </div>

        {/* GSTIN Display */}
        {businessSettings?.gstin && (
          <Card>
            <CardContent className="pt-4">
              <div className="flex items-center gap-4">
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">GSTIN:</span>
                  <span className="font-mono font-medium">{businessSettings.gstin}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">State:</span>
                  <span>{businessSettings.state_name || 'Not set'}</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-muted-foreground text-sm">Period:</span>
                  <span>{monthOptions.find(m => m.value === selectedMonth)?.label}</span>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* No GSTIN Warning */}
        {!businessSettings?.gstin && (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>GSTIN Not Configured</AlertTitle>
            <AlertDescription>
              Please configure your GSTIN in Business Settings to generate GST reports.
            </AlertDescription>
          </Alert>
        )}

        {/* Loading State */}
        {invoicesLoading && (
          <div className="space-y-4">
            <Skeleton className="h-32 w-full" />
            <Skeleton className="h-64 w-full" />
          </div>
        )}

        {/* No Data */}
        {!invoicesLoading && (!invoices || invoices.length === 0) && businessSettings?.gstin && (
          <Card>
            <CardContent className="py-12 text-center">
              <FileText className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
              <h3 className="font-heading text-lg font-semibold mb-2">No Invoices Found</h3>
              <p className="text-muted-foreground">
                No invoices were generated in {monthOptions.find(m => m.value === selectedMonth)?.label}.
              </p>
            </CardContent>
          </Card>
        )}

        {/* Reports */}
        {invoices && invoices.length > 0 && gstr1 && gstr3b && (
          <>
            {/* Reconciliation Summary */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <IndianRupee className="h-5 w-5" />
                  Reconciliation Summary
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Total Invoices</p>
                    <p className="text-2xl font-bold">{gstr1.total_invoices}</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">Invoice Value</p>
                    <p className="text-2xl font-bold">{formatCurrency(reconciliation?.total_invoice_value || 0)}</p>
                  </div>
                  <div className="text-center p-4 bg-muted/50 rounded-lg">
                    <p className="text-sm text-muted-foreground">GSTR-1 Total</p>
                    <p className="text-2xl font-bold">{formatCurrency(reconciliation?.gstr1_total || 0)}</p>
                  </div>
                  <div className={`text-center p-4 rounded-lg ${reconciliation?.is_reconciled ? 'bg-green-100' : 'bg-red-100'}`}>
                    <p className="text-sm text-muted-foreground">Difference</p>
                    <p className={`text-2xl font-bold ${reconciliation?.is_reconciled ? 'text-green-700' : 'text-red-700'}`}>
                      {formatCurrency(reconciliation?.difference || 0)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex justify-end">
                  <Button
                    variant={reconciliation?.is_reconciled ? 'outline' : 'destructive'}
                    onClick={() => setReconOpen(true)}
                    className="gap-2"
                  >
                    <Search className="h-4 w-4" />
                    View Differences
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* Validation Alerts */}
            {(gstr1Validation?.errors.length || gstr1Validation?.warnings.length || 
              gstr3bValidation?.errors.length || gstr3bValidation?.warnings.length) && (
              <div className="space-y-2">
                {gstr1Validation?.errors.map((error, i) => (
                  <Alert key={`gstr1-error-${i}`} variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>GSTR-1 Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ))}
                {gstr1Validation?.warnings.map((warning, i) => (
                  <Alert key={`gstr1-warning-${i}`}>
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle>GSTR-1 Warning</AlertTitle>
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
                {gstr3bValidation?.errors.map((error, i) => (
                  <Alert key={`gstr3b-error-${i}`} variant="destructive">
                    <XCircle className="h-4 w-4" />
                    <AlertTitle>GSTR-3B Error</AlertTitle>
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                ))}
                {gstr3bValidation?.warnings.map((warning, i) => (
                  <Alert key={`gstr3b-warning-${i}`}>
                    <AlertTriangle className="h-4 w-4 text-yellow-600" />
                    <AlertTitle>GSTR-3B Warning</AlertTitle>
                    <AlertDescription>{warning}</AlertDescription>
                  </Alert>
                ))}
              </div>
            )}

            {/* Report Tabs */}
            <Tabs defaultValue="gstr1" className="space-y-4">
              {creditNotes && creditNotes.length > 0 && (
                <Alert>
                  <FileText className="h-4 w-4" />
                  <AlertTitle>
                    {creditNotes.length} credit note{creditNotes.length === 1 ? '' : 's'} this period
                    — {formatCurrency(creditNotesTotal)}
                  </AlertTitle>
                  <AlertDescription>
                    Final reported value = invoice total − credit notes total. Credit notes
                    reverse previously filed invoices in a GST-safe way.
                  </AlertDescription>
                </Alert>
              )}
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="gstr1" className="gap-2">
                  <FileText className="h-4 w-4" />
                  GSTR-1 (Outward Supplies)
                </TabsTrigger>
                <TabsTrigger value="gstr3b" className="gap-2">
                  <FileText className="h-4 w-4" />
                  GSTR-3B (Summary)
                </TabsTrigger>
              </TabsList>

              {/* GSTR-1 Tab */}
              <TabsContent value="gstr1" className="space-y-4">
                {/* Export Buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportGSTR1Excel} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button variant="outline" onClick={handleExportGSTR1JSON} className="gap-2">
                    <FileJson className="h-4 w-4" />
                    Export JSON (GSTN)
                  </Button>
                </div>

                {/* Table 4: Taxable Outward Supplies */}
                <Card>
                  <CardHeader>
                    <CardTitle>Table 4: Taxable Outward Supplies</CardTitle>
                    <CardDescription>Supplies to registered and unregistered persons (including 0% if any)</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Rate (%)</TableHead>
                          <TableHead className="text-right">Taxable Value</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                          <TableHead className="text-right">IGST</TableHead>
                          <TableHead className="text-right">Cess</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1.table_4.length > 0 ? gstr1.table_4.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.rate}%</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.taxable_value)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.cgst)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.sgst)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.igst)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.cess)}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={6} className="text-center text-muted-foreground">
                              No taxable supplies
                            </TableCell>
                          </TableRow>
                        )}
                        {gstr1.table_4.length > 0 && (
                          <TableRow className="font-bold bg-muted/50">
                            <TableCell>Total</TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(gstr1.table_4.reduce((s, r) => s + r.taxable_value, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(gstr1.table_4.reduce((s, r) => s + r.cgst, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(gstr1.table_4.reduce((s, r) => s + r.sgst, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(gstr1.table_4.reduce((s, r) => s + r.igst, 0))}
                            </TableCell>
                            <TableCell className="text-right">
                              {formatCurrency(gstr1.table_4.reduce((s, r) => s + r.cess, 0))}
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* Table 8: Nil-rated / Exempt Supplies */}
                <Card>
                  <CardHeader>
                    <CardTitle>Table 8: Nil-rated / Exempt / Non-GST Supplies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Nil Rated</TableHead>
                          <TableHead className="text-right">Exempted</TableHead>
                          <TableHead className="text-right">Non-GST</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1.table_8.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell>{row.description}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.nil_rated)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.exempted)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.non_gst)}</TableCell>
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>

                {/* HSN Summary */}
                <Card>
                  <CardHeader>
                    <CardTitle>HSN Summary</CardTitle>
                    <CardDescription>Summary of outward supplies by HSN code</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Table>
                      <TableHeader>
                        <TableRow>
                          <TableHead>HSN Code</TableHead>
                          <TableHead>Description</TableHead>
                          <TableHead className="text-right">Qty</TableHead>
                          <TableHead className="text-right">Rate (%)</TableHead>
                          <TableHead className="text-right">Taxable Value</TableHead>
                          <TableHead className="text-right">IGST</TableHead>
                          <TableHead className="text-right">CGST</TableHead>
                          <TableHead className="text-right">SGST</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {gstr1.hsn_summary.length > 0 ? gstr1.hsn_summary.map((row, i) => (
                          <TableRow key={i}>
                            <TableCell className="font-mono">{row.hsn_code}</TableCell>
                            <TableCell className="max-w-32 truncate">{row.description}</TableCell>
                            <TableCell className="text-right">{row.quantity}</TableCell>
                            <TableCell className="text-right">{row.rate}%</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.taxable_value)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.integrated_tax)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.central_tax)}</TableCell>
                            <TableCell className="text-right">{formatCurrency(row.state_tax)}</TableCell>
                          </TableRow>
                        )) : (
                          <TableRow>
                            <TableCell colSpan={8} className="text-center text-muted-foreground">
                              No HSN data
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </CardContent>
                </Card>
              </TabsContent>

              {/* GSTR-3B Tab */}
              <TabsContent value="gstr3b" className="space-y-4">
                {/* Export Buttons */}
                <div className="flex gap-2">
                  <Button variant="outline" onClick={handleExportGSTR3BExcel} className="gap-2">
                    <FileSpreadsheet className="h-4 w-4" />
                    Export Excel
                  </Button>
                  <Button variant="outline" onClick={handleExportGSTR3BJSON} className="gap-2">
                    <FileJson className="h-4 w-4" />
                    Export JSON (GSTN)
                  </Button>
                </div>

                {/* Table 3.1(a): Taxable Outward Supplies */}
                <Card>
                  <CardHeader>
                    <CardTitle>Table 3.1(a): Taxable Outward Supplies</CardTitle>
                    <CardDescription>Details of outward supplies and tax liability</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Taxable Value</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.table_3_1_a.taxable_value)}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">IGST</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.table_3_1_a.integrated_tax)}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">CGST</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.table_3_1_a.central_tax)}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">SGST</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.table_3_1_a.state_tax)}</p>
                      </div>
                      <div className="p-4 bg-muted/50 rounded-lg">
                        <p className="text-sm text-muted-foreground">Cess</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.table_3_1_a.cess)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Table 3.1(c): Exempt/Nil Supplies */}
                <Card>
                  <CardHeader>
                    <CardTitle>Table 3.1(c): Exempt / Nil-Rated / Non-GST Supplies</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-3 gap-4">
                      <div className="p-4 bg-blue-50 rounded-lg">
                        <p className="text-sm text-blue-700">Nil Rated</p>
                        <p className="text-xl font-bold text-blue-900">{formatCurrency(gstr3b.table_3_1_c.nil_rated)}</p>
                      </div>
                      <div className="p-4 bg-yellow-50 rounded-lg">
                        <p className="text-sm text-yellow-700">Exempted</p>
                        <p className="text-xl font-bold text-yellow-900">{formatCurrency(gstr3b.table_3_1_c.exempted)}</p>
                      </div>
                      <div className="p-4 bg-gray-50 rounded-lg">
                        <p className="text-sm text-gray-700">Non-GST</p>
                        <p className="text-xl font-bold text-gray-900">{formatCurrency(gstr3b.table_3_1_c.non_gst)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                {/* Tax Payable Summary */}
                <Card className="border-primary">
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <IndianRupee className="h-5 w-5" />
                      Tax Payable
                    </CardTitle>
                    <CardDescription>Total tax liability for the period</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <div className="p-4 bg-primary/10 rounded-lg">
                        <p className="text-sm text-muted-foreground">IGST Payable</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.tax_payable.igst)}</p>
                      </div>
                      <div className="p-4 bg-primary/10 rounded-lg">
                        <p className="text-sm text-muted-foreground">CGST Payable</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.tax_payable.cgst)}</p>
                      </div>
                      <div className="p-4 bg-primary/10 rounded-lg">
                        <p className="text-sm text-muted-foreground">SGST Payable</p>
                        <p className="text-xl font-bold">{formatCurrency(gstr3b.tax_payable.sgst)}</p>
                      </div>
                      <div className="p-4 bg-primary rounded-lg text-primary-foreground">
                        <p className="text-sm opacity-90">Total Payable</p>
                        <p className="text-2xl font-bold">{formatCurrency(gstr3b.tax_payable.total)}</p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </TabsContent>
            </Tabs>
          </>
        )}
      </div>
    </AdminLayout>
  );
}
