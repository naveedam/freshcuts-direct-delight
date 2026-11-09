import { StickyTop } from '@/components/admin/TabbedAdminPage';
import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Download, Eye, Search, Receipt, ClipboardList, Loader2, Building2, Home } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface DocumentRecord {
  id: string;
  flat_number: string | null;
  building_name: string | null;
  order_id: string | null;
  document_type: string;
  file_url: string;
  file_name: string;
  invoice_number: string | null;
  customer_name: string | null;
  created_at: string;
}

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  sale_date: string;
  total_amount: number;
  customer_email: string | null;
  flat_number: string | null;
  building_name: string | null;
  payment_status: string;
}

interface PurchaseOrderDoc {
  id: string;
  po_number: string;
  vendor_name: string;
  order_date: string;
  total_amount: number;
  status: string;
  payment_status: string;
}

export default function DocumentsAdmin() {
  const [activeTab, setActiveTab] = useState('flat-view');
  const [searchQuery, setSearchQuery] = useState('');
  const [flatSearch, setFlatSearch] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  // Fetch documents from the documents table
  const { data: documents, isLoading: docsLoading } = useQuery({
    queryKey: ['admin', 'documents', 'records', flatSearch, typeFilter],
    queryFn: async () => {
      let query = supabase
        .from('documents')
        .select('*')
        .order('created_at', { ascending: false });

      if (flatSearch) {
        query = query.ilike('flat_number', `%${flatSearch}%`);
      }
      if (typeFilter && typeFilter !== 'all') {
        query = query.eq('document_type', typeFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as DocumentRecord[];
    }
  });

  // Group documents by flat
  const flatGroups = useMemo(() => {
    if (!documents) return {};
    const groups: Record<string, DocumentRecord[]> = {};
    for (const doc of documents) {
      const key = doc.flat_number
        ? `${doc.flat_number}${doc.building_name ? ' — ' + doc.building_name : ''}`
        : 'No Flat Assigned';
      if (!groups[key]) groups[key] = [];
      groups[key].push(doc);
    }
    return groups;
  }, [documents]);

  // Fetch invoices (sales)
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['admin', 'documents', 'invoices', dateFrom, dateTo, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          id, invoice_number, order_id, sale_date, payment_status,
          order:orders!inner(id, total_amount, customer_email, flat_number, building_name)
        `)
        .order('sale_date', { ascending: false });

      if (dateFrom) query = query.gte('sale_date', dateFrom);
      if (dateTo) query = query.lte('sale_date', dateTo);
      if (searchQuery) query = query.ilike('invoice_number', `%${searchQuery}%`);

      const { data, error } = await query;
      if (error) throw error;

      return data.map((sale: any) => ({
        id: sale.id,
        invoice_number: sale.invoice_number,
        order_id: sale.order_id,
        sale_date: sale.sale_date,
        total_amount: sale.order?.total_amount || 0,
        customer_email: sale.order?.customer_email,
        flat_number: sale.order?.flat_number,
        building_name: sale.order?.building_name,
        payment_status: sale.payment_status,
      })) as Invoice[];
    }
  });

  // Fetch purchase orders
  const { data: purchaseOrders, isLoading: posLoading } = useQuery({
    queryKey: ['admin', 'documents', 'purchase-orders', dateFrom, dateTo, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('purchase_orders')
        .select(`id, po_number, order_date, total_amount, status, payment_status, vendor:vendors(name)`)
        .order('order_date', { ascending: false });

      if (dateFrom) query = query.gte('order_date', dateFrom);
      if (dateTo) query = query.lte('order_date', dateTo);
      if (searchQuery) query = query.ilike('po_number', `%${searchQuery}%`);

      const { data, error } = await query;
      if (error) throw error;

      return data.map((po: any) => ({
        id: po.id, po_number: po.po_number,
        vendor_name: po.vendor?.name || 'Unknown',
        order_date: po.order_date, total_amount: po.total_amount,
        status: po.status, payment_status: po.payment_status,
      })) as PurchaseOrderDoc[];
    }
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['admin', 'documents', 'stats'],
    queryFn: async () => {
      const [salesResult, posResult, docsResult] = await Promise.all([
        supabase.from('sales').select('id, order:orders(total_amount)'),
        supabase.from('purchase_orders').select('id, total_amount'),
        supabase.from('documents').select('id, flat_number'),
      ]);

      const totalInvoiceValue = (salesResult.data || []).reduce(
        (sum: number, s: any) => sum + (s.order?.total_amount || 0), 0
      );
      const totalPOValue = (posResult.data || []).reduce(
        (sum: number, po: any) => sum + (po.total_amount || 0), 0
      );
      const uniqueFlats = new Set((docsResult.data || []).filter(d => d.flat_number).map(d => d.flat_number));

      return {
        invoiceCount: salesResult.data?.length || 0,
        poCount: posResult.data?.length || 0,
        totalInvoiceValue,
        totalPOValue,
        docCount: docsResult.data?.length || 0,
        flatCount: uniqueFlats.size,
      };
    }
  });

  const viewInvoice = async (orderId: string) => {
    setLoadingDoc(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please log in'); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ orderId }),
        }
      );
      if (!response.ok) throw new Error('Failed to generate invoice');

      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      window.open(URL.createObjectURL(blob), '_blank');
    } catch (error: any) {
      toast.error('Failed: ' + error.message);
    } finally {
      setLoadingDoc(null);
    }
  };

  const viewPurchaseOrder = async (poId: string) => {
    setLoadingDoc(poId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { toast.error('Please log in'); return; }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-purchase-order`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${session.access_token}` },
          body: JSON.stringify({ purchaseOrderId: poId }),
        }
      );
      if (!response.ok) throw new Error('Failed to generate PO');

      const html = await response.text();
      window.open(URL.createObjectURL(new Blob([html], { type: 'text/html' })), '_blank');
    } catch (error: any) {
      toast.error('Failed: ' + error.message);
    } finally {
      setLoadingDoc(null);
    }
  };

  const getPaymentBadge = (status: string) => {
    const styles: Record<string, string> = {
      pending: 'bg-yellow-100 text-yellow-800 hover:bg-yellow-100',
      partial: 'bg-orange-100 text-orange-800 hover:bg-orange-100',
      paid: 'bg-green-100 text-green-800 hover:bg-green-100',
    };
    return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{status}</Badge>;
  };

  const getStatusBadge = (status: string) => {
    const styles: Record<string, string> = {
      draft: 'bg-gray-100 text-gray-800', sent: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-indigo-100 text-indigo-800', received: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{status.replace('_', ' ')}</Badge>;
  };

  const getTypeBadge = (type: string) => {
    const styles: Record<string, string> = {
      invoice: 'bg-blue-100 text-blue-800',
      order: 'bg-green-100 text-green-800',
      po: 'bg-purple-100 text-purple-800',
      grn: 'bg-orange-100 text-orange-800',
    };
    return <Badge className={styles[type] || 'bg-gray-100 text-gray-800'}>{type.toUpperCase()}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <StickyTop>
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Document Repository</h1>
          <p className="font-body text-muted-foreground">View and manage all documents — organized by flat, invoice, or PO</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Receipt className="h-4 w-4" />Invoices</CardDescription>
              <CardTitle className="text-2xl">{stats?.invoiceCount || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Invoice Value</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats?.totalInvoiceValue || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><ClipboardList className="h-4 w-4" />Purchase Orders</CardDescription>
              <CardTitle className="text-2xl">{stats?.poCount || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>PO Value</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats?.totalPOValue || 0)}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2"><Building2 className="h-4 w-4" />Flats Served</CardDescription>
              <CardTitle className="text-2xl">{stats?.flatCount || 0}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        </StickyTop>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="flat-view" className="gap-2">
              <Home className="h-4 w-4" />
              By Flat
            </TabsTrigger>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Invoices ({invoices?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Purchase Orders ({purchaseOrders?.length || 0})
            </TabsTrigger>
          </TabsList>

          {/* Flat View Tab */}
          <TabsContent value="flat-view" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end mb-6">
                  <div className="flex-1 min-w-[200px]">
                    <label className="text-sm text-muted-foreground mb-1 block">Search by Flat Number</label>
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="e.g. A2303, B1201..."
                        value={flatSearch}
                        onChange={(e) => setFlatSearch(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <div className="w-[160px]">
                    <label className="text-sm text-muted-foreground mb-1 block">Document Type</label>
                    <Select value={typeFilter} onValueChange={setTypeFilter}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="all">All Types</SelectItem>
                        <SelectItem value="invoice">Invoice</SelectItem>
                        <SelectItem value="order">Order</SelectItem>
                        <SelectItem value="po">Purchase Order</SelectItem>
                        <SelectItem value="grn">GRN</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <Button variant="outline" onClick={() => { setFlatSearch(''); setTypeFilter('all'); }}>
                    Clear
                  </Button>
                </div>

                {docsLoading ? (
                  <div className="space-y-4">
                    {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 w-full" />)}
                  </div>
                ) : Object.keys(flatGroups).length === 0 ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Building2 className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No documents found</p>
                    <p className="text-sm mt-1">Documents will appear here after invoices are shared or generated</p>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {Object.entries(flatGroups).map(([flat, docs]) => (
                      <Card key={flat}>
                        <CardHeader className="pb-2">
                          <CardTitle className="text-lg flex items-center gap-2">
                            <Home className="h-4 w-4" />
                            {flat}
                            <Badge variant="secondary" className="ml-auto">{docs.length} docs</Badge>
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <Table>
                            <TableHeader>
                              <TableRow>
                                <TableHead>Type</TableHead>
                                <TableHead>File</TableHead>
                                <TableHead>Invoice #</TableHead>
                                <TableHead>Date</TableHead>
                                <TableHead className="text-right">Actions</TableHead>
                              </TableRow>
                            </TableHeader>
                            <TableBody>
                              {docs.map(doc => (
                                <TableRow key={doc.id}>
                                  <TableCell>{getTypeBadge(doc.document_type)}</TableCell>
                                  <TableCell className="font-mono text-sm">{doc.file_name}</TableCell>
                                  <TableCell>{doc.invoice_number || '-'}</TableCell>
                                  <TableCell>{format(new Date(doc.created_at), 'dd MMM yyyy')}</TableCell>
                                  <TableCell className="text-right">
                                    <Button
                                      variant="ghost" size="sm"
                                      onClick={() => window.open(doc.file_url, '_blank')}
                                    >
                                      <Eye className="h-4 w-4 mr-1" />
                                      View
                                    </Button>
                                    <Button
                                      variant="ghost" size="sm"
                                      onClick={() => {
                                        const a = document.createElement('a');
                                        a.href = doc.file_url;
                                        a.download = doc.file_name;
                                        a.click();
                                      }}
                                    >
                                      <Download className="h-4 w-4 mr-1" />
                                      Download
                                    </Button>
                                  </TableCell>
                                </TableRow>
                              ))}
                            </TableBody>
                          </Table>
                        </CardContent>
                      </Card>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Invoices Tab */}
          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                <div className="flex flex-wrap gap-4 items-end mb-4">
                  <div className="flex-1 min-w-[200px]">
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search by invoice number..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>
                  <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-[160px]" />
                  <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-[160px]" />
                  <Button variant="outline" onClick={() => { setSearchQuery(''); setDateFrom(''); setDateTo(''); }}>Clear</Button>
                </div>

                {invoicesLoading ? (
                  <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !invoices?.length ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No invoices found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice #</TableHead>
                        <TableHead>Flat</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((inv) => (
                        <TableRow key={inv.id}>
                          <TableCell className="font-mono font-medium">{inv.invoice_number}</TableCell>
                          <TableCell>
                            {inv.flat_number ? (
                              <span className="text-sm">{inv.flat_number}{inv.building_name ? `, ${inv.building_name}` : ''}</span>
                            ) : '-'}
                          </TableCell>
                          <TableCell>{format(new Date(inv.sale_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{inv.customer_email || '-'}</TableCell>
                          <TableCell>{getPaymentBadge(inv.payment_status)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(inv.total_amount)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => viewInvoice(inv.order_id)} disabled={loadingDoc === inv.order_id}>
                              {loadingDoc === inv.order_id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4 mr-1" />View</>}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Purchase Orders Tab */}
          <TabsContent value="purchase-orders" className="mt-4">
            <Card>
              <CardContent className="pt-6">
                {posLoading ? (
                  <div className="space-y-4">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
                ) : !purchaseOrders?.length ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <ClipboardList className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No purchase orders found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>PO Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Vendor</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {purchaseOrders.map((po) => (
                        <TableRow key={po.id}>
                          <TableCell className="font-mono font-medium">{po.po_number}</TableCell>
                          <TableCell>{format(new Date(po.order_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{po.vendor_name}</TableCell>
                          <TableCell>{getStatusBadge(po.status)}</TableCell>
                          <TableCell>{getPaymentBadge(po.payment_status)}</TableCell>
                          <TableCell className="text-right font-medium">{formatCurrency(po.total_amount)}</TableCell>
                          <TableCell className="text-right">
                            <Button variant="ghost" size="sm" onClick={() => viewPurchaseOrder(po.id)} disabled={loadingDoc === po.id}>
                              {loadingDoc === po.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <><Eye className="h-4 w-4 mr-1" />View</>}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
