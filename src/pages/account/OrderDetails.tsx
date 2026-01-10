import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Layout } from '@/components/layout/Layout';
import { useAuth } from '@/context/AuthContext';
import { Navigate, Link, useParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Separator } from '@/components/ui/separator';
import { 
  ArrowLeft, 
  Package, 
  Clock, 
  CheckCircle2, 
  Truck, 
  MapPin,
  Receipt,
  Phone,
  Mail
} from 'lucide-react';
import { ShipmentTimeline } from '@/components/tracking/ShipmentTimeline';

interface OrderItem {
  id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  total_price: number;
}

const ORDER_STATUSES = ['pending', 'processing', 'shipped', 'delivered'];

export default function OrderDetails() {
  const { orderId } = useParams<{ orderId: string }>();
  const { user, loading: authLoading } = useAuth();

  const { data: order, isLoading: orderLoading } = useQuery({
    queryKey: ['order', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('*')
        .eq('id', orderId!)
        .eq('user_id', user!.id)
        .maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!user && !!orderId
  });

  const { data: orderItems, isLoading: itemsLoading } = useQuery({
    queryKey: ['order-items', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('order_items')
        .select('*')
        .eq('order_id', orderId!);
      if (error) throw error;
      return data as OrderItem[];
    },
    enabled: !!user && !!orderId
  });

  if (authLoading || orderLoading) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12">
          <Skeleton className="h-6 w-32 mb-8" />
          <Skeleton className="h-8 w-64 mb-4" />
          <Skeleton className="h-24 w-full mb-6" />
          <Skeleton className="h-48 w-full" />
        </div>
      </Layout>
    );
  }

  if (!user) {
    return <Navigate to="/auth" replace />;
  }

  if (!order) {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-12 text-center">
          <Package className="h-16 w-16 mx-auto text-muted-foreground/50 mb-4" />
          <h2 className="font-heading text-xl font-bold text-foreground mb-2">Order not found</h2>
          <p className="font-body text-muted-foreground mb-6">
            This order doesn't exist or you don't have access to view it.
          </p>
          <Link to="/account/orders">
            <Button variant="hero">View All Orders</Button>
          </Link>
        </div>
      </Layout>
    );
  }

  const getStatusIndex = (status: string) => {
    const index = ORDER_STATUSES.indexOf(status);
    return index >= 0 ? index : 0;
  };

  const currentStatusIndex = getStatusIndex(order.status);
  const isCancelled = order.status === 'cancelled';

  const getStatusIcon = (status: string, index: number) => {
    const isCompleted = index <= currentStatusIndex && !isCancelled;
    const isCurrent = index === currentStatusIndex && !isCancelled;
    
    const iconClass = isCompleted 
      ? 'text-primary' 
      : 'text-muted-foreground/40';

    switch (status) {
      case 'pending':
        return <Clock className={`h-6 w-6 ${iconClass}`} />;
      case 'processing':
        return <Package className={`h-6 w-6 ${iconClass}`} />;
      case 'shipped':
        return <Truck className={`h-6 w-6 ${iconClass}`} />;
      case 'delivered':
        return <CheckCircle2 className={`h-6 w-6 ${iconClass}`} />;
      default:
        return <Clock className={`h-6 w-6 ${iconClass}`} />;
    }
  };

  const getStatusLabel = (status: string) => {
    switch (status) {
      case 'pending': return 'Order Placed';
      case 'processing': return 'Processing';
      case 'shipped': return 'Shipped';
      case 'delivered': return 'Delivered';
      default: return status;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        <Link to="/account/orders" className="inline-flex items-center gap-2 font-body text-muted-foreground hover:text-primary transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Orders
        </Link>

        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4 mb-8">
          <div>
            <h1 className="font-heading text-2xl md:text-3xl font-bold text-foreground">
              Order #{order.id.slice(0, 8)}
            </h1>
            <p className="text-muted-foreground mt-1">
              Placed on {new Date(order.created_at).toLocaleDateString('en-IN', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
              })}
            </p>
          </div>
          {order.invoice_number && (
            <div className="flex items-center gap-2 text-muted-foreground">
              <Receipt className="h-4 w-4" />
              <span className="font-mono text-sm">{order.invoice_number}</span>
            </div>
          )}
        </div>

        {/* Order Status Timeline */}
        <Card className="mb-8">
          <CardHeader>
            <CardTitle className="text-lg">Order Status</CardTitle>
          </CardHeader>
          <CardContent>
            {isCancelled ? (
              <div className="flex items-center gap-3 text-destructive">
                <div className="h-10 w-10 rounded-full bg-destructive/10 flex items-center justify-center">
                  <Package className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold">Order Cancelled</p>
                  <p className="text-sm text-muted-foreground">This order has been cancelled</p>
                </div>
              </div>
            ) : (
              <div className="relative">
                {/* Progress Line */}
                <div className="absolute left-5 top-5 bottom-5 w-0.5 bg-muted" />
                <div 
                  className="absolute left-5 top-5 w-0.5 bg-primary transition-all duration-500"
                  style={{ 
                    height: `${(currentStatusIndex / (ORDER_STATUSES.length - 1)) * 100}%`,
                    maxHeight: 'calc(100% - 2.5rem)'
                  }}
                />

                {/* Status Steps */}
                <div className="space-y-6">
                  {ORDER_STATUSES.map((status, index) => {
                    const isCompleted = index <= currentStatusIndex;
                    const isCurrent = index === currentStatusIndex;
                    
                    return (
                      <div key={status} className="flex items-start gap-4 relative">
                        <div className={`
                          h-10 w-10 rounded-full flex items-center justify-center z-10
                          ${isCompleted ? 'bg-primary/10' : 'bg-muted'}
                          ${isCurrent ? 'ring-2 ring-primary ring-offset-2' : ''}
                        `}>
                          {getStatusIcon(status, index)}
                        </div>
                        <div className="pt-2">
                          <p className={`font-medium ${isCompleted ? 'text-foreground' : 'text-muted-foreground'}`}>
                            {getStatusLabel(status)}
                          </p>
                          {isCurrent && (
                            <p className="text-sm text-primary">Current status</p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        <div className="grid md:grid-cols-2 gap-8">
          {/* Order Items */}
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Order Items</CardTitle>
            </CardHeader>
            <CardContent>
              {itemsLoading ? (
                <div className="space-y-3">
                  {[...Array(3)].map((_, i) => (
                    <Skeleton key={i} className="h-12 w-full" />
                  ))}
                </div>
              ) : orderItems && orderItems.length > 0 ? (
                <div className="space-y-4">
                  {orderItems.map((item) => (
                    <div key={item.id} className="flex justify-between items-start">
                      <div>
                        <p className="font-medium text-foreground">{item.product_name}</p>
                        <p className="text-sm text-muted-foreground">
                          Qty: {item.quantity} × ₹{Number(item.unit_price).toFixed(2)}
                        </p>
                      </div>
                      <p className="font-semibold text-foreground">
                        ₹{Number(item.total_price).toFixed(2)}
                      </p>
                    </div>
                  ))}
                  <Separator className="my-4" />
                  <div className="flex justify-between items-center">
                    <p className="font-heading font-bold text-lg">Total</p>
                    <p className="font-heading font-bold text-xl text-primary">
                      ₹{Number(order.total_amount).toFixed(2)}
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-muted-foreground">No items found</p>
              )}
            </CardContent>
          </Card>

          {/* Shipment Tracking */}
          <ShipmentTimeline orderId={orderId!} />
        </div>

        {/* Shipping & Contact Info */}
        <div className="grid md:grid-cols-2 gap-8 mt-8">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <MapPin className="h-5 w-5" />
                Shipping Address
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-1 text-foreground">
                {order.shipping_address && <p>{order.shipping_address}</p>}
                {order.shipping_city && <p>{order.shipping_city}</p>}
                {order.shipping_postal_code && <p>{order.shipping_postal_code}</p>}
                {!order.shipping_address && !order.shipping_city && (
                  <p className="text-muted-foreground">No shipping address provided</p>
                )}
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Contact Information</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {order.customer_email && (
                  <div className="flex items-center gap-3 text-foreground">
                    <Mail className="h-4 w-4 text-muted-foreground" />
                    <span>{order.customer_email}</span>
                  </div>
                )}
                {order.phone && (
                  <div className="flex items-center gap-3 text-foreground">
                    <Phone className="h-4 w-4 text-muted-foreground" />
                    <span>{order.phone}</span>
                  </div>
                )}
                {!order.customer_email && !order.phone && (
                  <p className="text-muted-foreground">No contact information provided</p>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {order.notes && (
          <Card className="mt-8">
            <CardHeader>
              <CardTitle className="text-lg">Order Notes</CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-foreground">{order.notes}</p>
            </CardContent>
          </Card>
        )}
      </div>
    </Layout>
  );
}
