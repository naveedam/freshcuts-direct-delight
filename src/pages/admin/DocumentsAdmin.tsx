import { useState } from 'react';
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
import { FileText, Download, Eye, Search, Calendar, Receipt, ClipboardList, Loader2 } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';
import { formatCurrency } from '@/lib/currency';
import { format } from 'date-fns';
import { toast } from 'sonner';

interface Invoice {
  id: string;
  invoice_number: string;
  order_id: string;
  sale_date: string;
  total_amount: number;
  customer_email: string | null;
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
  const [activeTab, setActiveTab] = useState('invoices');
  const [searchQuery, setSearchQuery] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [viewingInvoice, setViewingInvoice] = useState<string | null>(null);
  const [viewingPO, setViewingPO] = useState<string | null>(null);
  const [loadingDoc, setLoadingDoc] = useState<string | null>(null);

  // Fetch invoices (sales with invoice numbers)
  const { data: invoices, isLoading: invoicesLoading } = useQuery({
    queryKey: ['admin', 'documents', 'invoices', dateFrom, dateTo, searchQuery],
    queryFn: async () => {
      let query = supabase
        .from('sales')
        .select(`
          id,
          invoice_number,
          order_id,
          sale_date,
          payment_status,
          order:orders!inner(
            id,
            total_amount,
            customer_email
          )
        `)
        .order('sale_date', { ascending: false });

      if (dateFrom) {
        query = query.gte('sale_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('sale_date', dateTo);
      }
      if (searchQuery) {
        query = query.ilike('invoice_number', `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((sale: any) => ({
        id: sale.id,
        invoice_number: sale.invoice_number,
        order_id: sale.order_id,
        sale_date: sale.sale_date,
        total_amount: sale.order?.total_amount || 0,
        customer_email: sale.order?.customer_email,
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
        .select(`
          id,
          po_number,
          order_date,
          total_amount,
          status,
          payment_status,
          vendor:vendors(name)
        `)
        .order('order_date', { ascending: false });

      if (dateFrom) {
        query = query.gte('order_date', dateFrom);
      }
      if (dateTo) {
        query = query.lte('order_date', dateTo);
      }
      if (searchQuery) {
        query = query.ilike('po_number', `%${searchQuery}%`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data.map((po: any) => ({
        id: po.id,
        po_number: po.po_number,
        vendor_name: po.vendor?.name || 'Unknown',
        order_date: po.order_date,
        total_amount: po.total_amount,
        status: po.status,
        payment_status: po.payment_status,
      })) as PurchaseOrderDoc[];
    }
  });

  // Stats
  const { data: stats } = useQuery({
    queryKey: ['admin', 'documents', 'stats'],
    queryFn: async () => {
      const [salesResult, posResult] = await Promise.all([
        supabase.from('sales').select('id, order:orders(total_amount)'),
        supabase.from('purchase_orders').select('id, total_amount'),
      ]);

      const totalInvoiceValue = (salesResult.data || []).reduce(
        (sum: number, s: any) => sum + (s.order?.total_amount || 0), 0
      );
      const totalPOValue = (posResult.data || []).reduce(
        (sum: number, po: any) => sum + (po.total_amount || 0), 0
      );

      return {
        invoiceCount: salesResult.data?.length || 0,
        poCount: posResult.data?.length || 0,
        totalInvoiceValue,
        totalPOValue,
      };
    }
  });

  const viewInvoice = async (orderId: string) => {
    setLoadingDoc(orderId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to view invoices');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-invoice`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ orderId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate invoice');
      }

      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error: any) {
      toast.error('Failed to load invoice: ' + error.message);
      console.error(error);
    } finally {
      setLoadingDoc(null);
    }
  };

  const viewPurchaseOrder = async (poId: string) => {
    setLoadingDoc(poId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        toast.error('Please log in to view purchase orders');
        return;
      }

      const response = await fetch(
        `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/generate-purchase-order`,
        {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${session.access_token}`,
          },
          body: JSON.stringify({ purchaseOrderId: poId }),
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || 'Failed to generate PO document');
      }

      const html = await response.text();
      const blob = new Blob([html], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
    } catch (error: any) {
      toast.error('Failed to load purchase order: ' + error.message);
      console.error(error);
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
      draft: 'bg-gray-100 text-gray-800',
      sent: 'bg-blue-100 text-blue-800',
      confirmed: 'bg-indigo-100 text-indigo-800',
      partially_received: 'bg-amber-100 text-amber-800',
      received: 'bg-green-100 text-green-800',
      cancelled: 'bg-red-100 text-red-800',
    };
    return <Badge className={styles[status] || 'bg-gray-100 text-gray-800'}>{status.replace('_', ' ')}</Badge>;
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground">Document Repository</h1>
          <p className="font-body text-muted-foreground">View and manage invoices & purchase orders for GST compliance</p>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription className="flex items-center gap-2">
                <Receipt className="h-4 w-4" />
                Total Invoices
              </CardDescription>
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
              <CardDescription className="flex items-center gap-2">
                <ClipboardList className="h-4 w-4" />
                Purchase Orders
              </CardDescription>
              <CardTitle className="text-2xl">{stats?.poCount || 0}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>PO Value</CardDescription>
              <CardTitle className="text-2xl">{formatCurrency(stats?.totalPOValue || 0)}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Filters */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-wrap gap-4 items-end">
              <div className="flex-1 min-w-[200px]">
                <label className="text-sm text-muted-foreground mb-1 block">Search</label>
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="Search by invoice/PO number..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-9"
                  />
                </div>
              </div>
              <div className="w-[160px]">
                <label className="text-sm text-muted-foreground mb-1 block">From Date</label>
                <Input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                />
              </div>
              <div className="w-[160px]">
                <label className="text-sm text-muted-foreground mb-1 block">To Date</label>
                <Input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                />
              </div>
              <Button 
                variant="outline" 
                onClick={() => {
                  setSearchQuery('');
                  setDateFrom('');
                  setDateTo('');
                }}
              >
                Clear
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList>
            <TabsTrigger value="invoices" className="gap-2">
              <Receipt className="h-4 w-4" />
              Invoices ({invoices?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="purchase-orders" className="gap-2">
              <ClipboardList className="h-4 w-4" />
              Purchase Orders ({purchaseOrders?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="invoices" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {invoicesLoading ? (
                  <div className="p-6 space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
                ) : !invoices?.length ? (
                  <div className="p-12 text-center text-muted-foreground">
                    <Receipt className="h-12 w-12 mx-auto mb-4 opacity-50" />
                    <p>No invoices found</p>
                  </div>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Invoice Number</TableHead>
                        <TableHead>Date</TableHead>
                        <TableHead>Customer</TableHead>
                        <TableHead>Payment</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                        <TableHead className="text-right">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {invoices.map((invoice) => (
                        <TableRow key={invoice.id}>
                          <TableCell className="font-mono font-medium">{invoice.invoice_number}</TableCell>
                          <TableCell>{format(new Date(invoice.sale_date), 'dd MMM yyyy')}</TableCell>
                          <TableCell>{invoice.customer_email || '-'}</TableCell>
                          <TableCell>{getPaymentBadge(invoice.payment_status)}</TableCell>
                          <TableCell className="text-right font-medium">
                            {formatCurrency(invoice.total_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewInvoice(invoice.order_id)}
                              disabled={loadingDoc === invoice.order_id}
                            >
                              {loadingDoc === invoice.order_id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 mr-1" />
                                  View PDF
                                </>
                              )}
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

          <TabsContent value="purchase-orders" className="mt-4">
            <Card>
              <CardContent className="p-0">
                {posLoading ? (
                  <div className="p-6 space-y-4">
                    {[...Array(5)].map((_, i) => (
                      <Skeleton key={i} className="h-12 w-full" />
                    ))}
                  </div>
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
                          <TableCell className="text-right font-medium">
                            {formatCurrency(po.total_amount)}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => viewPurchaseOrder(po.id)}
                              disabled={loadingDoc === po.id}
                            >
                              {loadingDoc === po.id ? (
                                <Loader2 className="h-4 w-4 animate-spin" />
                              ) : (
                                <>
                                  <Eye className="h-4 w-4 mr-1" />
                                  View PDF
                                </>
                              )}
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
