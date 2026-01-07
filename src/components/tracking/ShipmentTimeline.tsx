import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { 
  Truck, 
  Package, 
  MapPin, 
  Clock, 
  CheckCircle2, 
  Phone, 
  User,
  ExternalLink,
  AlertCircle
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface ShipmentTimelineProps {
  orderId: string;
}

interface Shipment {
  id: string;
  order_id: string;
  provider_id: string | null;
  tracking_number: string | null;
  awb_number: string | null;
  status: string;
  estimated_delivery: string | null;
  rider_name: string | null;
  rider_phone: string | null;
  tracking_url: string | null;
  created_at: string;
}

interface ShipmentEvent {
  id: string;
  shipment_id: string;
  status: string;
  description: string | null;
  location: string | null;
  event_timestamp: string;
}

interface ShippingProvider {
  id: string;
  name: string;
  code: string;
  logo_url: string | null;
}

const STATUS_CONFIG: Record<string, { label: string; icon: typeof Truck; color: string }> = {
  pending: { label: 'Pickup Pending', icon: Package, color: 'text-yellow-600' },
  picked_up: { label: 'Picked Up', icon: Package, color: 'text-blue-600' },
  in_transit: { label: 'In Transit', icon: Truck, color: 'text-blue-600' },
  out_for_delivery: { label: 'Out for Delivery', icon: Truck, color: 'text-primary' },
  delivered: { label: 'Delivered', icon: CheckCircle2, color: 'text-green-600' },
  failed: { label: 'Delivery Failed', icon: AlertCircle, color: 'text-red-600' },
  returned: { label: 'Returned', icon: AlertCircle, color: 'text-red-600' }
};

export function ShipmentTimeline({ orderId }: ShipmentTimelineProps) {
  // Fetch shipment
  const { data: shipment, isLoading: shipmentLoading } = useQuery({
    queryKey: ['customer-shipment', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      return data as Shipment | null;
    }
  });

  // Fetch provider
  const { data: provider } = useQuery({
    queryKey: ['shipping-provider', shipment?.provider_id],
    queryFn: async () => {
      if (!shipment?.provider_id) return null;
      const { data, error } = await supabase
        .from('shipping_providers')
        .select('id, name, code, logo_url')
        .eq('id', shipment.provider_id)
        .single();
      if (error) throw error;
      return data as ShippingProvider;
    },
    enabled: !!shipment?.provider_id
  });

  // Fetch shipment events
  const { data: events } = useQuery({
    queryKey: ['customer-shipment-events', shipment?.id],
    queryFn: async () => {
      if (!shipment) return [];
      const { data, error } = await supabase
        .from('shipment_events')
        .select('*')
        .eq('shipment_id', shipment.id)
        .order('event_timestamp', { ascending: false });
      if (error) throw error;
      return data as ShipmentEvent[];
    },
    enabled: !!shipment?.id
  });

  if (shipmentLoading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipment Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            <Skeleton className="h-16 w-full" />
            <Skeleton className="h-24 w-full" />
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!shipment) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipment Tracking
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-center py-6 text-muted-foreground">
            <Package className="h-10 w-10 mx-auto mb-3 opacity-50" />
            <p>Shipment details will appear here once your order is dispatched.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const statusConfig = STATUS_CONFIG[shipment.status] || STATUS_CONFIG.pending;
  const StatusIcon = statusConfig.icon;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-lg flex items-center gap-2">
          <Truck className="h-5 w-5" />
          Shipment Tracking
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Current Status */}
        <div className="bg-muted/50 rounded-lg p-4">
          <div className="flex items-center gap-4">
            <div className={`h-12 w-12 rounded-full bg-background flex items-center justify-center ${statusConfig.color}`}>
              <StatusIcon className="h-6 w-6" />
            </div>
            <div className="flex-1">
              <p className="font-semibold text-foreground">{statusConfig.label}</p>
              {provider && (
                <p className="text-sm text-muted-foreground">Via {provider.name}</p>
              )}
            </div>
            {shipment.estimated_delivery && shipment.status !== 'delivered' && (
              <div className="text-right">
                <p className="text-xs text-muted-foreground">Expected by</p>
                <p className="font-medium text-foreground">
                  {new Date(shipment.estimated_delivery).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric'
                  })}
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Tracking Numbers */}
        {(shipment.tracking_number || shipment.awb_number) && (
          <div className="flex flex-wrap gap-4 text-sm">
            {shipment.tracking_number && (
              <div>
                <p className="text-muted-foreground">Tracking #</p>
                <p className="font-mono font-medium">{shipment.tracking_number}</p>
              </div>
            )}
            {shipment.awb_number && (
              <div>
                <p className="text-muted-foreground">AWB #</p>
                <p className="font-mono font-medium">{shipment.awb_number}</p>
              </div>
            )}
          </div>
        )}

        {/* Rider Info - Only show when out for delivery */}
        {(shipment.status === 'out_for_delivery') && (shipment.rider_name || shipment.rider_phone) && (
          <div className="border rounded-lg p-4 bg-primary/5 border-primary/20">
            <p className="text-sm font-medium text-primary mb-2">Your Delivery Partner</p>
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {shipment.rider_name && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="h-4 w-4 text-muted-foreground" />
                    <span>{shipment.rider_name}</span>
                  </div>
                )}
              </div>
              {shipment.rider_phone && (
                <Button size="sm" variant="outline" asChild>
                  <a href={`tel:${shipment.rider_phone}`}>
                    <Phone className="h-4 w-4 mr-2" />
                    Call
                  </a>
                </Button>
              )}
            </div>
          </div>
        )}

        {/* External Tracking Link */}
        {shipment.tracking_url && (
          <Button variant="outline" className="w-full" asChild>
            <a href={shipment.tracking_url} target="_blank" rel="noopener noreferrer">
              <ExternalLink className="h-4 w-4 mr-2" />
              Track on {provider?.name || 'Provider'} Website
            </a>
          </Button>
        )}

        {/* Event Timeline */}
        {events && events.length > 0 && (
          <div className="space-y-1">
            <p className="text-sm font-medium text-foreground mb-3">Tracking Updates</p>
            <div className="space-y-0">
              {events.map((event, index) => (
                <div key={event.id} className="flex gap-3">
                  <div className="flex flex-col items-center">
                    <div className={`h-2.5 w-2.5 rounded-full mt-1.5 ${
                      index === 0 ? 'bg-primary' : 'bg-muted-foreground/30'
                    }`} />
                    {index < events.length - 1 && (
                      <div className="w-px flex-1 bg-muted-foreground/20 min-h-[2rem]" />
                    )}
                  </div>
                  <div className="flex-1 pb-4">
                    <p className="text-sm text-foreground">{event.description}</p>
                    <div className="flex items-center gap-2 mt-1 text-xs text-muted-foreground">
                      <Clock className="h-3 w-3" />
                      {new Date(event.event_timestamp).toLocaleString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                      {event.location && (
                        <>
                          <span className="mx-1">•</span>
                          <MapPin className="h-3 w-3" />
                          {event.location}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}