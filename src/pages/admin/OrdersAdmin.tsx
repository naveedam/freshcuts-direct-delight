import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Eye, FileText, Truck, Receipt, Loader2, CheckCircle, MapPin, Plus } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { ShipmentTrackingModal } from '@/components/admin/ShipmentTrackingModal';
import { NewOrderDialog } from '@/components/admin/NewOrderDialog';

const statusOptions = ['pending', 'processing', 'shipped', 'delivered', 'cancelled'];

export default function OrdersAdmin() {
  const queryClient = useQueryClient();
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [processingAction, setProcessingAction] = useState<string | null>(null);
  const [trackingOrderId, setTrackingOrderId] = useState<string | null>(null);
  const [newOrderOpen, setNewOrderOpen] = useState(false);

  const { data: orders, isLoading } = useQuery({
    queryKey: ['admin', 'orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    }
  });

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

  const updateStatusMutation = useMutation({
    mutationFn: async ({ id, status }: { id: string; status: string }) => {
      const { error } = await supabase.from('orders').update({ status }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      toast.success('Order status updated');
    },
    onError: (error) => {
      toast.error('Failed to update status: ' + error.message);
    }
  });

  const convertToSaleMutation = useMutation({
    mutationFn: async (orderId: string) => {
      // Generate invoice number using database function
      const { data: invoiceNumber, error: invoiceError } = await supabase
        .rpc('generate_invoice_number');
      
      if (invoiceError) throw invoiceError;

      // Update order with invoice number and conversion status
      const { error: updateError } = await supabase
        .from('orders')
        .update({
          converted_to_sale: true,
          sale_converted_at: new Date().toISOString(),
          invoice_number: invoiceNumber,
          status: 'processing'
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
    setProcessingAction(`invoice-${orderId}`);
    try {
      const { data, error } = await supabase.functions.invoke('generate-invoice', {
        body: { orderId }
      });

      if (error) throw error;

      // Open invoice in new tab
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

  const handleGenerateShippingLabel = async (orderId: string) => {
    setProcessingAction(`label-${orderId}`);
    try {
      const { data, error } = await supabase.functions.invoke('generate-shipping-label', {
        body: { orderId }
      });

      if (error) throw error;

      // Mark shipping label as generated
      await supabase
        .from('orders')
        .update({ shipping_label_generated: true })
        .eq('id', orderId);

      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });

      // Open label in new tab
      const blob = new Blob([data], { type: 'text/html' });
      const url = URL.createObjectURL(blob);
      window.open(url, '_blank');
      toast.success('Shipping label generated');
    } catch (error: any) {
      toast.error('Failed to generate shipping label: ' + error.message);
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

        {/* New Order Dialog */}
        <NewOrderDialog open={newOrderOpen} onOpenChange={setNewOrderOpen} />

        {/* Orders Table */}
        <div className="bg-card border border-border rounded-lg overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Order ID</TableHead>
                <TableHead>Date</TableHead>
                <TableHead>Customer</TableHead>
                <TableHead>Total</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Delivery</TableHead>
                <TableHead>Sale</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                [...Array(5)].map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-6 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-24 ml-auto" /></TableCell>
                  </TableRow>
                ))
              ) : orders && orders.length > 0 ? (
                orders.map((order) => (
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
                      <div>
                        <p className="font-medium">{order.shipping_city || 'N/A'}</p>
                        <p className="text-xs text-muted-foreground">{order.customer_email || order.phone || 'No contact'}</p>
                      </div>
                    </TableCell>
                    <TableCell className="font-medium">₹{Number(order.total_amount).toFixed(0)}</TableCell>
                    <TableCell>
                      <Select 
                        value={order.status} 
                        onValueChange={(status) => updateStatusMutation.mutate({ id: order.id, status })}
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
                        {order.converted_to_sale ? (
                          <Badge variant="default" className="bg-green-600 text-xs">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Converted
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">Pending</Badge>
                        )}
                        {order.shipping_label_generated && (
                          <Badge variant="secondary" className="text-xs">
                            <Truck className="h-3 w-3" />
                          </Badge>
                        )}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex items-center justify-end gap-1">
                        <Button size="sm" variant="ghost" onClick={() => setSelectedOrder(order)}>
                          <Eye className="h-4 w-4" />
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
                        
                        {order.converted_to_sale && (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleGenerateInvoice(order.id)}
                            disabled={processingAction === `invoice-${order.id}`}
                            title="Generate Invoice"
                          >
                            {processingAction === `invoice-${order.id}` ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <FileText className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                        
                        <Button 
                          size="sm" 
                          variant="outline"
                          onClick={() => handleGenerateShippingLabel(order.id)}
                          disabled={processingAction === `label-${order.id}`}
                          title="Generate Shipping Label"
                        >
                          {processingAction === `label-${order.id}` ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Truck className="h-4 w-4" />
                          )}
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
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
                    <p className="text-muted-foreground">Status</p>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${getStatusColor(selectedOrder.status)}`}>
                      {selectedOrder.status}
                    </span>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Total</p>
                    <p className="font-bold">₹{Number(selectedOrder.total_amount).toFixed(0)}</p>
                  </div>
                  {selectedOrder.invoice_number && (
                    <div className="col-span-2">
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
                  <p className="text-sm text-muted-foreground">
                    {selectedOrder.shipping_address || 'N/A'}<br />
                    {selectedOrder.shipping_city}, {selectedOrder.shipping_postal_code}
                  </p>
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
                      onClick={() => handleGenerateInvoice(selectedOrder.id)}
                      disabled={processingAction === `invoice-${selectedOrder.id}`}
                      className="flex-1"
                    >
                      {processingAction === `invoice-${selectedOrder.id}` ? (
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      ) : (
                        <FileText className="h-4 w-4 mr-2" />
                      )}
                      Invoice
                    </Button>
                  )}
                  
                  <Button 
                    variant="outline"
                    onClick={() => handleGenerateShippingLabel(selectedOrder.id)}
                    disabled={processingAction === `label-${selectedOrder.id}`}
                    className="flex-1"
                  >
                    {processingAction === `label-${selectedOrder.id}` ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Truck className="h-4 w-4 mr-2" />
                    )}
                    Label
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
      </div>
    </AdminLayout>
  );
}
