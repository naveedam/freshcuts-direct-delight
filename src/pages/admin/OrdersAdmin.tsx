import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, FileText, Receipt, Loader2, CheckCircle, MapPin, Plus, Scale, MessageCircle, Pencil, Building2, Search, CalendarDays, FileEdit, CreditCard, BookOpen, Send, Wallet, AlertTriangle, IndianRupee, Tag } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ShipmentTrackingModal } from '@/components/admin/ShipmentTrackingModal';
import { NewOrderDialog } from '@/components/admin/NewOrderDialog';
import { WeightAdjustmentDialog } from '@/components/admin/WeightAdjustmentDialog';
import { EditOrderDialog } from '@/components/admin/EditOrderDialog';
import { InvoiceEditDialog } from '@/components/admin/InvoiceEditDialog';
import { OrderPaymentDialog } from '@/components/admin/OrderPaymentDialog';
import { PartyLedgerSheet, type PartyKey } from '@/components/admin/PartyLedgerSheet';
import { Card, CardContent } from '@/components/ui/card';
import { formatCurrency } from '@/lib/currency';
import { markPOsPayableOnInvoice } from '@/lib/po-lifecycle';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { useFinancialYears } from '@/hooks/useFinancialYears';
import { fetchAllRows } from '@/lib/supabase-paginate';

const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function OrdersAdmin() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);
  const [weightAdjustOrder, setWeightAdjustOrder] = useState<any>(null);
  const [editOrder, setEditOrder] = useState<any>(null);
  const [invoiceEditOrder, setInvoiceEditOrder] = useState<any>(null);
  const [buildingFilter, setBuildingFilter] = useState('');
  const [fyFilter, setFyFilter] = useState<string>('all');
  const [paymentOrder, setPaymentOrder] = useState<any>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [paymentStatusFilter, setPaymentStatusFilter] = useState<string>('all');
  const [dateFrom, setDateFrom] = useState<string>('');
  const [dateTo, setDateTo] = useState<string>('');
  const [cancelTarget, setCancelTarget] = useState<any>(null);
  const [cancelReason, setCancelReason] = useState<string>('');
  const [ledgerParty, setLedgerParty] = useState<{ key: PartyKey; title: string } | null>(null);
  const { data: financialYears } = useFinancialYears();

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: async () => {
      return await fetchAllRows<any>(() =>
        supabase.from('orders').select('*').order('created_at', { ascending: false })
      );
    }
  });

  // All customer payments (used for dashboard widgets + party summary)
  const { data: allPayments } = useQuery({
    queryKey: ['admin', 'all-customer-payments'],
    queryFn: async () => {
      return await fetchAllRows<any>(() =>
        supabase.from('customer_payments').select('order_id, amount, payment_date')
      );
    },
    refetchInterval: 60000,
  });

  // Dashboard widgets — global
  const widgets = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayMs = today.getTime();
    const todayStr = new Date().toISOString().split('T')[0];
    const todaysCollection = (allPayments || [])
      .filter((p) => p.payment_date && p.payment_date.slice(0, 10) === todayStr)
      .reduce((s, p) => s + Number(p.amount || 0), 0);

    let outstanding = 0;
    let overdue = 0;
    const now = Date.now();
    for (const o of orders || []) {
      if (o.invoice_cancelled) continue;
      if (o.status === 'cancelled') continue;
      const out = Number(o.balance_due) || Math.max(0, (Number(o.total_amount) || 0) - (Number(o.amount_paid) || 0));
      if (out <= 0.01) continue;
      outstanding += out;
      const days = (now - new Date(o.created_at).getTime()) / 86400000;
      if (days > 30) overdue += out;
    }
    return { todaysCollection, outstanding, overdue };
  }, [orders, allPayments]);

  // Get unique building names for filtering
  const buildingNames = useMemo(() => {
    if (!orders) return [];
    const names = orders
      .map((o: any) => o.building_name)
      .filter((n: string | null): n is string => !!n);
    return [...new Set(names)].sort();
  }, [orders]);

  // Filtered orders
  const filteredOrders = useMemo(() => {
    if (!orders) return [];
    let filtered = orders;
    if (buildingFilter) {
      filtered = filtered.filter((o: any) => o.building_name === buildingFilter);
    }
    if (fyFilter && fyFilter !== 'all') {
      filtered = filtered.filter((o: any) => o.financial_year_id === fyFilter);
    }
    if (paymentStatusFilter !== 'all') {
      filtered = filtered.filter((o: any) => o.payment_status === paymentStatusFilter);
    }
    if (dateFrom) {
      const from = new Date(dateFrom).getTime();
      filtered = filtered.filter((o: any) => new Date(o.created_at).getTime() >= from);
    }
    if (dateTo) {
      const to = new Date(dateTo).getTime() + 24 * 60 * 60 * 1000 - 1;
      filtered = filtered.filter((o: any) => new Date(o.created_at).getTime() <= to);
    }
    if (searchQuery.trim()) {
      const q = searchQuery.trim().toLowerCase();
      filtered = filtered.filter((o: any) => {
        const blob = [
          o.invoice_number,
          o.customer_email,
          o.phone,
          o.flat_number,
          o.building_name,
        ]
          .filter(Boolean)
          .join(' ')
          .toLowerCase();
        return blob.includes(q);
      });
    }
    return filtered;
  }, [orders, buildingFilter, fyFilter, paymentStatusFilter, dateFrom, dateTo, searchQuery]);

  // Party summary — when any filter narrows the list
  const filtersActive = !!(buildingFilter || searchQuery.trim() || paymentStatusFilter !== 'all' || dateFrom || dateTo);
  const partySummary = useMemo(() => {
    if (!filtersActive) return null;
    const ids = new Set(filteredOrders.map((o: any) => o.id));
    const billed = filteredOrders
      .filter((o: any) => !o.invoice_cancelled)
      .reduce((s: number, o: any) => s + (Number(o.total_amount) || 0), 0);
    const pays = (allPayments || []).filter((p) => ids.has(p.order_id));
    const paid = pays.reduce((s, p) => s + Number(p.amount || 0), 0);
    const lastPayment = pays
      .map((p) => new Date(p.payment_date).getTime())
      .sort((a, b) => b - a)[0];
    return {
      orderCount: filteredOrders.length,
      billed,
      paid,
      outstanding: filteredOrders.reduce((s: number, o: any) => s + (Number(o.balance_due) || Math.max(0, (Number(o.total_amount) || 0) - (Number(o.amount_paid) || 0))), 0),
      lastPayment: lastPayment ? new Date(lastPayment) : null,
    };
  }, [filtersActive, filteredOrders, allPayments]);

  // Party outstanding map: aggregates unpaid balance across all invoices for the same party.
  // Key resolution priority: phone -> flat+building -> customer_email.
  const partyKeyForOrder = (o: any): string | null => {
    if (o?.phone) return `phone:${String(o.phone).trim().toLowerCase()}`;
    if (o?.flat_number) return `flat:${(o.building_name || '').trim().toLowerCase()}|${String(o.flat_number).trim().toLowerCase()}`;
    if (o?.customer_email) return `email:${String(o.customer_email).trim().toLowerCase()}`;
    return null;
  };
  const partyOutstandingMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders || []) {
      if (o.invoice_cancelled) continue;
      if (o.status === 'cancelled') continue;
      const out = Number(o.balance_due) || ((Number(o.total_amount) || 0) - (Number(o.amount_paid) || 0));
      if (Math.abs(out) <= 0.01) continue; // skip only true zero, not credits (negative) or dues (positive)
      const k = partyKeyForOrder(o);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + out);
    }
    return m;
  }, [orders]);
  const partyCreditMap = useMemo(() => {
    const m = new Map<string, number>();
    for (const o of orders || []) {
      if (o.invoice_cancelled) continue;
      if (o.status === 'cancelled') continue;
      const out = Number(o.balance_due) || ((Number(o.total_amount) || 0) - (Number(o.amount_paid) || 0));
      if (out >= -0.01) continue; // only accumulate credit (negative balance_due)
      const k = partyKeyForOrder(o);
      if (!k) continue;
      m.set(k, (m.get(k) || 0) + Math.abs(out));
    }
    return m;
  }, [orders]);
  const ledgerKeyForOrder = (o: any): PartyKey | null => {
    if (o?.phone) return { type: 'phone', value: o.phone };
    if (o?.flat_number) return { type: 'flat', building: o.building_name, flat: o.flat_number };
    if (o?.customer_email) return { type: 'email', value: o.customer_email };
    return null;
  };

  const sendWhatsAppReminder = (order: any) => {
    const phoneRaw = (order.phone || '').replace(/\D/g, '');
    if (!phoneRaw) {
      toast.error('No phone number on this order');
      return;
    }
    const phone = phoneRaw.length === 10 ? `91${phoneRaw}` : phoneRaw;
    const balance = Number(order.balance_due) || ((Number(order.total_amount) || 0) - (Number(order.amount_paid) || 0));
    const inv = order.invoice_number ? ` for invoice ${order.invoice_number}` : '';
    const msg = `Hi, your pending amount${inv} is ₹${balance.toFixed(0)}. Please clear dues at your earliest convenience. Thank you!`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  };

  // Check if an order belongs to a closed FY
  const isOrderInClosedFY = (order: any): boolean => {
    if (!order.financial_year_id || !financialYears) return false;
    const fy = financialYears.find(f => f.id === order.financial_year_id);
    return fy ? !fy.is_active : false;
  };

  const { data: orderItems } = useQuery({
    queryKey: ['admin', 'orderItems', selectedOrder?.id],
    queryFn: async () => {
      if (!selectedOrder) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', selectedOrder.id);
      if (error) throw error;
      return data;
    },
    enabled: !!selectedOrder
  });

  const { data: weightAdjustItems } = useQuery({
    queryKey: ['admin', 'orderItems', weightAdjustOrder?.id],
    queryFn: async () => {
      if (!weightAdjustOrder) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', weightAdjustOrder.id);
      if (error) throw error;
      return data;
    },
    enabled: !!weightAdjustOrder
  });

  const { data: editOrderItems } = useQuery({
    queryKey: ['admin', 'orderItems', editOrder?.id],
    queryFn: async () => {
      if (!editOrder) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', editOrder.id);
      if (error) throw error;
      return data;
    },
    enabled: !!editOrder
  });

  const { data: invoiceEditItems } = useQuery({
    queryKey: ['admin', 'orderItems', invoiceEditOrder?.id],
    queryFn: async () => {
      if (!invoiceEditOrder) return [];
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', invoiceEditOrder.id);
      if (error) throw error;
      return data;
    },
    enabled: !!invoiceEditOrder
  });

  const updateStatusMutation = useMutation({
    mutationFn: async ({
      id,
      status,
      cancelInvoice,
      mode,
      reason,
    }: {
      id: string;
      status: string;
      cancelInvoice?: boolean;
      mode?: 'void' | 'credit_note';
      reason?: string;
    }) => {
      const updates: Record<string, any> = { status };
      if (status === 'cancelled') updates.invoice_cancelled = true;
      if (status === 'cancelled' && cancelInvoice) {
        updates.invoice_cancelled = true;
        updates.invoice_cancelled_at = new Date().toISOString();
        if (reason) updates.invoice_cancelled_reason = reason;
        const {
          data: { user },
        } = await supabase.auth.getUser();
        if (user) updates.invoice_cancelled_by = user.id;
      }

      if (status === 'cancelled' && cancelInvoice) {
        // If issuing a credit note, create it BEFORE flipping order flags so we can link it
        if (mode === 'credit_note') {
          const { data: order, error: orderFetchError } = await supabase
            .from('orders')
            .select('total_amount, invoice_number')
            .eq('id', id)
            .single();
          if (orderFetchError) throw orderFetchError;

          const { data: cnNumber, error: cnNumberError } = await supabase
            .rpc('generate_credit_note_number');
          if (cnNumberError) throw cnNumberError;

          const { data: { user } } = await supabase.auth.getUser();

          const { data: cn, error: cnError } = await supabase
            .from('credit_notes')
            .insert({
              order_id: id,
              invoice_number: order?.invoice_number ?? null,
              credit_note_number: cnNumber,
              amount: Number(order?.total_amount) || 0,
              reason: reason || null,
              status: 'issued',
              created_by: user?.id ?? null,
            })
            .select('id')
            .single();
          if (cnError) throw cnError;

          updates.credit_note_id = cn.id;
        }

        const { error } = await supabase.from('orders').update(updates).eq('id', id);
        if (error) throw error;

        // Mark linked sale as cancelled (preserve audit trail, do not delete)
        const { error: salesError } = await supabase
          .from('sales')
          .update({
            payment_status: 'cancelled',
            cancelled_at: new Date().toISOString(),
          })
          .eq('order_id', id);
        if (salesError) throw salesError;
      } else {
        const { error } = await supabase.from('orders').update(updates).eq('id', id);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'creditNotes'] });
      toast.success('Order status updated');
      setCancelTarget(null);
      setCancelReason('');
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    }
  });

  const handleStatusChange = (order: any, status: string) => {
    if (status === 'cancelled' && order.converted_to_sale && !order.invoice_cancelled) {
      setCancelTarget(order);
      return;
    }
    updateStatusMutation.mutate({ id: order.id, status });
  };

  const convertToSaleMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // Generate invoice number using database function
      const { data: invoiceNumber, error: invoiceError } = await supabase
        .rpc('generate_invoice_number');
      
      if (invoiceError) throw invoiceError;

      // Update order with invoice number and conversion status
      const order = await supabase.from('orders').select('total_amount, amount_paid').eq('id', orderId).single();
      const totalAmount = Number(order.data?.total_amount) || 0;
      const amountPaid = Number(order.data?.amount_paid) || 0;

      const { error: updateError } = await supabase
        .from('orders')
        .update({
          converted_to_sale: true,
          sale_converted_at: new Date().toISOString(),
          invoice_number: invoiceNumber,
          status: 'processing',
          balance_due: Math.max(0, totalAmount - amountPaid),
          payment_status: amountPaid >= totalAmount ? 'paid' : amountPaid > 0 ? 'partial' : 'unpaid',
        })
        .eq('id', orderId);

      if (updateError) throw updateError;

      // Create sales record
      const { error: salesError } = await supabase
        .from('sales')
        .insert({
          order_id: orderId,
          invoice_number: invoiceNumber,
          payment_status: 'confirmed'
        });

      if (salesError) throw salesError;

      // Transition any linked purchase orders to "payable" — additive, no
      // change to invoice numbering or sale conversion logic.
      try {
        // markPOsPayableOnInvoice is statically imported at top of file
        await markPOsPayableOnInvoice(orderId);
      } catch (e) { /* best-effort */ }

      return invoiceNumber;
    },
    onSuccess: (invoiceNumber) => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      toast.success(`Order converted to sale. Invoice: ${invoiceNumber}`);
      setProcessingAction(null);
    },
    onError: (error) => {
      toast.error('Failed to convert to sale: ' + error.message);
      setProcessingAction(null);
    }
  });

  const handleConvertToSale = async (orderId: string) => {
    setProcessingAction(`convert-${orderId}`);
    convertToSaleMutation.mutate(orderId);
  };

  const handleGenerateInvoice = async (orderId: string) => {
    const order = orders?.find((o: any) => o.id === orderId);
    if (order && !order.flat_number && !order.building_name) {
      toast.error('Cannot generate invoice: Flat/House Number and Building/Apartment Name are required. Please edit the order first.');
      return;
    }
    setProcessingAction(`invoice-${orderId}`);
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice', {
        body: { orderId }
      });

      if (error) throw error;

      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('Invoice generated');
    } catch (error: any) {
      toast.error('Failed to generate invoice: ' + error.message);
    } finally {
      setProcessingAction(null);
    }
  };

  const handleGeneratePackingLabels = async (orderId: string) => {
    setProcessingAction(`packing-${orderId}`);
    try {
      const { data, error } = await supabase.functions.invoke('generate-packing-labels', {
        body: { orderId }
      });
      if (error) throw error;
      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('Packing labels generated');
    } catch (error: any) {
      toast.error('Failed to generate packing labels: ' + error.message);
    } finally {
      setProcessingAction(null);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'pending': return 'bg-yellow-100 text-yellow-800';
      case 'processing': return 'bg-blue-100 text-blue-800';
      case 'shipped': return 'bg-purple-100 text-purple-800';
      case 'delivered': return 'bg-green-100 text-green-800';
      case 'cancelled': return 'bg-red-100 text-red-800';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getOrderSourceBadge = (source: string | null) => {
    if (source === 'whatsapp-website') {
      return (
        <Badge variant="outline" className="bg-[#25D366]/10 text-[#25D366] border-[#25D366]/30 text-xs gap-1">
          <MessageCircle className="h-3 w-3" />
          WhatsApp
        </Badge>
      );
    }
    return (
      <Badge variant="outline" className="text-xs">
        Website
      </Badge>
    );
  };

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Orders</h1>
            <p className="font-body text-muted-foreground">View and manage customer orders</p>
          </div>
          <Button onClick={() => setNewOrderOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            New Order
          </Button>
        </div>

        {/* Dashboard widgets */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-green-100 text-green-700"><Wallet className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Today's Collection</p>
                <p className="text-lg font-bold">{formatCurrency(widgets.todaysCollection)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-yellow-100 text-yellow-700"><IndianRupee className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Total Outstanding</p>
                <p className="text-lg font-bold">{formatCurrency(widgets.outstanding)}</p>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-md bg-red-100 text-red-700"><AlertTriangle className="h-5 w-5" /></div>
              <div>
                <p className="text-xs text-muted-foreground">Overdue (30+ days)</p>
                <p className="text-lg font-bold">{formatCurrency(widgets.overdue)}</p>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Filters */}
        <div className="flex items-center gap-3 flex-wrap">
          <div className="relative w-full sm:w-[280px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search flat, customer, phone, invoice..."
              className="pl-9 h-9"
            />
          </div>
          {financialYears && financialYears.length > 0 && (
            <>
              <CalendarDays className="h-4 w-4 text-muted-foreground" />
              <Select value={fyFilter} onValueChange={setFyFilter}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="Financial Year" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Financial Years</SelectItem>
                  {financialYears.map((fy) => (
                    <SelectItem key={fy.id} value={fy.id}>{fy.name}{fy.is_active ? ' (Active)' : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}
          {buildingNames.length > 0 && (
            <>
              <Building2 className="h-4 w-4 text-muted-foreground" />
              <Select value={buildingFilter || 'all'} onValueChange={(v) => setBuildingFilter(v === 'all' ? '' : v)}>
                <SelectTrigger className="w-[260px]">
                  <SelectValue placeholder="Filter by Building / Apartment" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Buildings</SelectItem>
                  {buildingNames.map((name) => (
                    <SelectItem key={name} value={name}>{name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {buildingFilter && (
                <Button variant="ghost" size="sm" onClick={() => setBuildingFilter('')}>
                  Clear
                </Button>
              )}
            </>
          )}
          <Select value={paymentStatusFilter} onValueChange={setPaymentStatusFilter}>
            <SelectTrigger className="w-[160px]">
              <SelectValue placeholder="Payment" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Payments</SelectItem>
              <SelectItem value="unpaid">Unpaid</SelectItem>
              <SelectItem value="partial">Partial</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <div className="flex items-center gap-1">
            <Input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="h-9 w-[150px]"
              aria-label="From date"
            />
            <span className="text-xs text-muted-foreground">to</span>
            <Input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="h-9 w-[150px]"
              aria-label="To date"
            />
          </div>
          {(searchQuery || paymentStatusFilter !== 'all' || dateFrom || dateTo || buildingFilter) && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setPaymentStatusFilter('all');
                setDateFrom('');
                setDateTo('');
                setBuildingFilter('');
              }}
            >
              Reset filters
            </Button>
          )}
        </div>

        {/* New Order Dialog */}
        <NewOrderDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} />

        {/* Party summary bar */}
        {partySummary && (
          <Card className="border-primary/30">
            <CardContent className="p-4 flex flex-wrap items-center justify-between gap-4">
              <div className="flex flex-wrap gap-6">
                <SummaryStat label="Orders" value={String(partySummary.orderCount)} />
                <SummaryStat label="Invoice Value" value={formatCurrency(partySummary.billed)} />
                <SummaryStat label="Paid" value={formatCurrency(partySummary.paid)} tone="green" />
                <SummaryStat label="Outstanding" value={formatCurrency(partySummary.outstanding)} tone={partySummary.outstanding > 0 ? 'red' : 'green'} />
                <SummaryStat label="Last Payment" value={partySummary.lastPayment ? partySummary.lastPayment.toLocaleDateString('en-IN') : '—'} />
              </div>
              {(() => {
                if (buildingFilter) {
                  return (
                    <Button variant="outline" size="sm" onClick={() => setLedgerParty({ key: { type: 'building', value: buildingFilter }, title: buildingFilter })}>
                      <BookOpen className="h-4 w-4 mr-1" /> View ledger
                    </Button>
                  );
                }
                const firstOrder = filteredOrders?.[0];
                if (searchQuery.trim() && firstOrder) {
                  if (firstOrder.flat_number) {
                    const title = firstOrder.building_name
                      ? `${firstOrder.building_name} · Flat ${firstOrder.flat_number}`
                      : `Flat ${firstOrder.flat_number}`;
                    return (
                      <Button variant="outline" size="sm" onClick={() => setLedgerParty({ key: { type: 'flat', building: firstOrder.building_name, flat: firstOrder.flat_number }, title })}>
                        <BookOpen className="h-4 w-4 mr-1" /> View ledger
                      </Button>
                    );
                  } else if (firstOrder.building_name) {
                    return (
                      <Button variant="outline" size="sm" onClick={() => setLedgerParty({ key: { type: 'building', value: firstOrder.building_name }, title: firstOrder.building_name })}>
                        <BookOpen className="h-4 w-4 mr-1" /> View ledger
                      </Button>
                    );
                  }
                }
                return null;
              })()}
            </CardContent>
          </Card>
        )}

        {/* Orders Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Source</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Weight</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead>Payment</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : filteredOrders && filteredOrders.length > 0 ? (
                filteredOrders.map((order: any) => (
                  <TableRow key={order.id}>
                    <TableCell>
                      <div>
                        <p className="font-mono text-sm">#{order.id.slice(0, 8)}</p>
                        {order.invoice_number && (
                          <p className="text-xs text-primary font-medium">{order.invoice_number}</p>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>{new Date(order.created_at).toLocaleDateString()}</TableCell>
                    <TableCell>
                      {getOrderSourceBadge(order.order_source)}
                    </TableCell>
                    <TableCell>
                      <div>
                        {order.building_name && (
                          <button
                            type="button"
                            className="text-xs text-muted-foreground hover:underline text-left"
                            onClick={() => setLedgerParty({ key: { type: 'building', value: order.building_name }, title: order.building_name })}
                          >
                            {order.building_name}
                          </button>
                        )}
                        {order.flat_number && (
                          <button
                            type="button"
                            className="font-medium text-sm text-blue-600 hover:text-blue-800 underline block text-left"
                            onClick={() => setLedgerParty({ key: { type: 'flat', building: order.building_name, flat: order.flat_number }, title: `${order.building_name || ''} · Flat ${order.flat_number}` })}
                          >
                            Flat: {order.flat_number}
                          </button>
                        )}
                        <p className="text-xs text-muted-foreground">
                          {[order.shipping_address, order.shipping_postal_code].filter(Boolean).join(' – ') || 'N/A'}
                        </p>
                        <p className="text-xs text-muted-foreground">{order.customer_email || order.phone || 'No contact'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">₹{Number(order.total_amount).toFixed(0)}</TableCell>
                    <TableCell>
                      <Select 
                        value={order.status} 
                        onValueChange={(status) => handleStatusChange(order, status)}
                      >
                        <SelectTrigger className={`w-32 h-8 text-xs ${getStatusColor(order.status)}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {statusOptions.map((status) => (
                            <SelectItem key={status} value={status} className="capitalize">
                              {status}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      {order.weight_finalized ? (
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 gap-1 text-xs p-1"
                          onClick={() => setWeightAdjustOrder(order)}
                          title="Click to correct finalized weights"
                        >
                          <Badge variant="default" className="bg-green-600 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Finalized
                          </Badge>
                        </Button>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-8 gap-1 text-xs"
                          onClick={() => setWeightAdjustOrder(order)}
                        >
                          <Scale className="h-3 w-3" />
                          Adjust
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-8 gap-1 text-xs"
                        onClick={() => setTrackingOrderId(order.id)}
                      >
                        <MapPin className="h-3 w-3" />
                        Track
                      </Button>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        {order.invoice_cancelled ? (
                          <Badge variant="destructive" className="text-xs">
                            Cancelled Invoice
                          </Badge>
                        ) : order.converted_to_sale ? (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Converted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell>
                      {(() => {
                        const invoiceDue = Math.max(0, Number(order.balance_due) || ((Number(order.total_amount) || 0) - (Number(order.amount_paid) || 0)));
                        const pk = partyKeyForOrder(order);
                        const partyDue = pk ? (partyOutstandingMap.get(pk) || 0) : invoiceDue;
                        const otherPartyDue = Math.abs(partyDue - invoiceDue) > 0.01 ? Math.max(0, partyDue) : 0;
                        const partyCredit = pk ? (partyCreditMap.get(pk) || 0) : 0;
                        const lk = ledgerKeyForOrder(order);
                        return (
                          <TooltipProvider delayDuration={150}>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-8 gap-1 text-xs"
                              onClick={() => setPaymentOrder(order)}
                              disabled={order.invoice_cancelled}
                              title={order.invoice_cancelled ? 'Invoice cancelled — payments disabled' : 'Manage payment'}
                            >
                              <CreditCard className="h-3 w-3" />
                              {order.payment_status === 'paid' ? (
                                <Badge className="bg-green-600 text-xs">Paid</Badge>
                              ) : order.payment_status === 'partial' ? (
                                <Badge className="bg-yellow-500 text-xs">Partial</Badge>
                              ) : (
                                <Badge variant="destructive" className="text-xs">Pending</Badge>
                              )}
                            </Button>
                            {!order.invoice_cancelled && invoiceDue > 0.01 && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <p className="text-[11px] font-semibold text-destructive mt-0.5 leading-tight cursor-help">
                                    Inv Due: {formatCurrency(invoiceDue)}
                                  </p>
                                </TooltipTrigger>
                                <TooltipContent>Amount pending for this invoice</TooltipContent>
                              </Tooltip>
                            )}
                            {!order.invoice_cancelled && otherPartyDue > 0.01 && lk && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setLedgerParty({ key: lk, title: order.building_name || order.flat_number || order.phone || order.customer_email || 'Party' }); }}
                                    className="text-[11px] font-medium text-orange-600 hover:text-orange-800 hover:underline mt-0.5 leading-tight block"
                                  >
                                    Party Due: {formatCurrency(partyDue)}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Total pending across all invoices for this party — click to view ledger</TooltipContent>
                              </Tooltip>
                            )}
                            {!order.invoice_cancelled && partyCredit > 0.01 && lk && (
                              <Tooltip>
                                <TooltipTrigger asChild>
                                  <button
                                    type="button"
                                    onClick={(e) => { e.stopPropagation(); setLedgerParty({ key: lk, title: order.building_name || order.flat_number || order.phone || order.customer_email || 'Party' }); }}
                                    className="text-[11px] font-medium text-green-600 hover:text-green-800 hover:underline mt-0.5 leading-tight block"
                                  >
                                    Credit: {formatCurrency(partyCredit)}
                                  </button>
                                </TooltipTrigger>
                                <TooltipContent>Credit balance from excess payment — click to view ledger</TooltipContent>
                              </Tooltip>
                            )}
                          </TooltipProvider>
                        );
                      })()}
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-4 w-4" />
                        </Button>

                        {!order.invoice_cancelled && order.phone && Number(order.balance_due || (Number(order.total_amount) - Number(order.amount_paid || 0))) > 0.01 && (
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => sendWhatsAppReminder(order)}
                            title="Send WhatsApp payment reminder"
                            className="text-[#25D366]"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                        )}
                        
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => setEditOrder(order)}
                          title={isOrderInClosedFY(order) ? 'Closed FY – cannot edit' : order.converted_to_sale ? 'Invoiced – cannot edit' : order.status === 'delivered' ? 'Delivered – cannot edit' : 'Edit Order'}
                          disabled={isOrderInClosedFY(order) || !!order.converted_to_sale || order.status === 'delivered' || order.status === 'cancelled'}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        
                        {!order.converted_to_sale && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleConvertToSale(order.id)}
                            disabled={processingAction === `convert-${order.id}`}
                            title="Convert to Sale"
                          >
                            {processingAction === `convert-${order.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Receipt className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        
                        {order.converted_to_sale && !order.invoice_cancelled && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => setInvoiceEditOrder(order)}
                            title="Preview & Edit Invoice"
                          >
                            <FileEdit className="h-4 w-4" />
                          </Button>
                        )}
                        
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleGeneratePackingLabels(order.id)}
                          disabled={processingAction === `packing-${order.id}`}
                          title="Print Packing Labels (one per item)"
                        >
                          {processingAction === `packing-${order.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Tag className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={11} className="text-center py-8 text-muted-foreground">
                    No orders yet
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Order Details Dialog */}
        <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Order Details</DialogTitle>
            </DialogHeader>
            {selectedOrder && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <p className="text-muted-foreground">Order ID</p>
                    <p className="font-mono">{selectedOrder.id.slice(0, 8)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date</p>
                    <p>{new Date(selectedOrder.created_at).toLocaleString()}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Source</p>
                    {getOrderSourceBadge(selectedOrder.order_source)}
                  </div>
                  <div>
                    <p className="text-muted-foreground">Status</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-bold">₹{Number(selectedOrder.total_amount).toFixed(0)}</p>
                    {Number(selectedOrder.discount_amount) > 0 && (
                      <p className="text-xs text-destructive">
                        Discount: −₹{Number(selectedOrder.discount_amount).toFixed(0)}
                        {selectedOrder.discount_type === 'percentage' ? ` (${selectedOrder.discount_value}%)` : ''}
                      </p>
                    )}
                  </div>
                  {Number(selectedOrder.shipping_cost) > 0 && (
                    <div>
                      <p className="text-muted-foreground">Shipping Cost</p>
                      <p className="font-medium text-sm">₹{Number(selectedOrder.shipping_cost).toFixed(0)}</p>
                    </div>
                  )}
                  {selectedOrder.invoice_number && (
                    <div>
                      <p className="text-muted-foreground">Invoice Number</p>
                      <p className="font-mono text-primary">{selectedOrder.invoice_number}</p>
                    </div>
                  )}
                </div>

                <div className="border-t pt-4">
                  <p className="font-medium mb-2">Customer Contact</p>
                  <p className="text-sm text-muted-foreground">
                    {selectedOrder.customer_email && <span className="block">{selectedOrder.customer_email}</span>}
                    {selectedOrder.phone && <span className="block">Phone: {selectedOrder.phone}</span>}
                  </p>
                </div>

                <div className="border-t pt-4">
                  <p className="font-medium mb-2">Shipping Address</p>
                  <div className="text-sm text-muted-foreground">
                    {selectedOrder.building_name && <p className="font-medium text-foreground">{selectedOrder.building_name}</p>}
                    {selectedOrder.flat_number && <p>Flat: {selectedOrder.flat_number}</p>}
                    <p>{selectedOrder.shipping_address || 'N/A'}</p>
                    <p>{selectedOrder.shipping_city}, {selectedOrder.shipping_postal_code}</p>
                  </div>
                </div>

                {selectedOrder.notes && (
                  <div className="border-t pt-4">
                    <p className="font-medium mb-2">Notes</p>
                    <p className="text-sm text-muted-foreground">{selectedOrder.notes}</p>
                  </div>
                )}

                <div className="border-t pt-4">
                  <p className="font-medium mb-2">Items</p>
                  {orderItems && orderItems.length > 0 ? (
                    <div className="space-y-2">
                      {orderItems.map((item) => (
                        <div key={item.id} className="flex justify-between text-sm">
                          <span>
                            {item.product_name} × {item.quantity}
                          </span>
                          <span className="font-medium">₹{Number(item.total_price).toFixed(0)}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">Loading items...</p>
                  )}
                </div>

                <div className="border-t pt-4 flex gap-2">
                  {!selectedOrder.converted_to_sale && (
                    <Button 
                      onClick={() => handleConvertToSale(selectedOrder.id)}
                      disabled={processingAction === `convert-${selectedOrder.id}`}
                      className="flex-1"
                    >
                      {processingAction === `convert-${selectedOrder.id}` ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <Receipt className="h-4 w-4 mr-2" />
                      )}
                      Convert to Sale
                    </Button>
                  )}
                  
                  {selectedOrder.converted_to_sale && (
                    <Button 
                      variant="outline"
                      onClick={() => { setSelectedOrder(null); setInvoiceEditOrder(selectedOrder); }}
                      className="flex-1"
                    >
                      <FileEdit className="h-4 w-4 mr-2" />
                      Invoice
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline"
                    onClick={() => handleGeneratePackingLabels(selectedOrder.id)}
                    disabled={processingAction === `packing-${selectedOrder.id}`}
                    className="flex-1"
                  >
                    {processingAction === `packing-${selectedOrder.id}` ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Tag className="h-4 w-4 mr-2" />
                    )}
                    Packing Labels
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>

        {/* Shipment Tracking Modal */}
        {trackingOrderId && (
          <ShipmentTrackingModal
            open={!!trackingOrderId}
            onOpenChange={(open) => !open && setTrackingOrderId(null)}
            orderId={trackingOrderId}
          />
        )}

        {/* Weight Adjustment Dialog */}
        <WeightAdjustmentDialog
          open={!!weightAdjustOrder}
          onOpenChange={(open) => !open && setWeightAdjustOrder(null)}
          order={weightAdjustOrder}
          orderItems={weightAdjustItems || []}
        />

        {/* Edit Order Dialog */}
        <EditOrderDialog
          open={!!editOrder}
          onOpenChange={(open) => !open && setEditOrder(null)}
          order={editOrder}
          orderItems={editOrderItems || []}
        />

        {/* Invoice Edit Dialog */}
        <InvoiceEditDialog
          open={!!invoiceEditOrder}
          onOpenChange={(open) => !open && setInvoiceEditOrder(null)}
          order={invoiceEditOrder}
          orderItems={invoiceEditItems || []}
        />

        {/* Payment Dialog */}
        <OrderPaymentDialog
          open={!!paymentOrder}
          onOpenChange={(open) => !open && setPaymentOrder(null)}
          order={paymentOrder}
        />

        {/* Party Ledger Sheet */}
        <PartyLedgerSheet
          open={!!ledgerParty}
          onOpenChange={(o) => !o && setLedgerParty(null)}
          party={ledgerParty?.key || null}
          title={ledgerParty?.title}
        />

        {/* Cancel Order + Invoice Confirmation */}
        <Dialog
          open={!!cancelTarget}
          onOpenChange={(open) => {
            if (!open) {
              setCancelTarget(null);
              setCancelReason('');
            }
          }}
        >
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Cancel order with invoice?</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 text-sm">
              <p className="text-muted-foreground">
                This order has a generated invoice
                {cancelTarget?.invoice_number ? (
                  <> <span className="font-mono text-foreground">{cancelTarget.invoice_number}</span></>
                ) : null}.
                Choose how to reverse it for GST-safe accounting.
              </p>
              <ul className="text-xs text-muted-foreground list-disc pl-4 space-y-1">
                <li><b>Cancel Invoice</b> — void the invoice (use only if not yet reported in GSTR).</li>
                <li><b>Cancel with Credit Note</b> — issues a credit note equal to invoice value (use if already filed).</li>
              </ul>
              <div className="space-y-1">
                <Label htmlFor="cancel-reason">Reason</Label>
                <Textarea
                  id="cancel-reason"
                  rows={3}
                  placeholder="e.g. Customer cancelled, wrong item, return…"
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-2">
              <Button
                variant="ghost"
                onClick={() => {
                  setCancelTarget(null);
                  setCancelReason('');
                }}
              >
                Keep Order
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  cancelTarget &&
                  updateStatusMutation.mutate({
                    id: cancelTarget.id,
                    status: 'cancelled',
                    cancelInvoice: false,
                    reason: cancelReason || undefined,
                  })
                }
                disabled={updateStatusMutation.isPending}
              >
                Cancel Order Only
              </Button>
              <Button
                variant="outline"
                onClick={() =>
                  cancelTarget &&
                  updateStatusMutation.mutate({
                    id: cancelTarget.id,
                    status: 'cancelled',
                    cancelInvoice: true,
                    mode: 'void',
                    reason: cancelReason || undefined,
                  })
                }
                disabled={updateStatusMutation.isPending}
              >
                Cancel Invoice
              </Button>
              <Button
                variant="destructive"
                onClick={() =>
                  cancelTarget &&
                  updateStatusMutation.mutate({
                    id: cancelTarget.id,
                    status: 'cancelled',
                    cancelInvoice: true,
                    mode: 'credit_note',
                    reason: cancelReason || undefined,
                  })
                }
                disabled={updateStatusMutation.isPending}
              >
                Cancel with Credit Note
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}

function SummaryStat({ label, value, tone }: { label: string; value: string; tone?: 'green' | 'red' }) {
  const color = tone === 'green' ? 'text-green-600' : tone === 'red' ? 'text-destructive' : 'text-foreground';
  return (
    <div>
      <p className="text-[10px] uppercase text-muted-foreground tracking-wide">{label}</p>
      <p className={`text-base font-semibold ${color}`}>{value}</p>
    </div>
  );
}
