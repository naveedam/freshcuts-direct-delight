import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Loader2, Package, Truck, MapPin, Phone, User, ExternalLink, Clock } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';

interface ShipmentTrackingModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
}

interface ShippingProvider {
  id: string;
  name: string;
  code: string;
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
  shipping_cost: number | null;
  created_at: string;
  updated_at: string;
}

interface ShipmentEvent {
  id: string;
  shipment_id: string;
  status: string;
  description: string | null;
  location: string | null;
  event_timestamp: string;
}

const SHIPMENT_STATUSES = [
  { value: 'pending', label: 'Pending Pickup' },
  { value: 'picked_up', label: 'Picked Up' },
  { value: 'in_transit', label: 'In Transit' },
  { value: 'out_for_delivery', label: 'Out for Delivery' },
  { value: 'delivered', label: 'Delivered' },
  { value: 'failed', label: 'Delivery Failed' },
  { value: 'returned', label: 'Returned' }
];

export function ShipmentTrackingModal({ open, onOpenChange, orderId }: ShipmentTrackingModalProps) {
  const queryClient = useQueryClient();
  const [isEditing, setIsEditing] = useState(false);

  // Form state
  const [providerId, setProviderId] = useState<string>('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [awbNumber, setAwbNumber] = useState('');
  const [status, setStatus] = useState('pending');
  const [riderName, setRiderName] = useState('');
  const [riderPhone, setRiderPhone] = useState('');
  const [trackingUrl, setTrackingUrl] = useState('');
  const [shippingCost, setShippingCost] = useState('');
  const [estimatedDelivery, setEstimatedDelivery] = useState('');
  const [eventDescription, setEventDescription] = useState('');
  const [eventLocation, setEventLocation] = useState('');

  // Fetch providers
  const { data: providers } = useQuery({
    queryKey: ['shipping-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_providers')
        .select('id, name, code')
        .eq('is_active', true);
      if (error) throw error;
      return data as ShippingProvider[];
    }
  });

  // Fetch existing shipment
  const { data: shipment, isLoading: shipmentLoading } = useQuery({
    queryKey: ['shipment', orderId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipments')
        .select('*')
        .eq('order_id', orderId)
        .maybeSingle();
      if (error) throw error;
      
      if (data) {
        // Populate form with existing data
        setProviderId(data.provider_id || '');
        setTrackingNumber(data.tracking_number || '');
        setAwbNumber(data.awb_number || '');
        setStatus(data.status || 'pending');
        setRiderName(data.rider_name || '');
        setRiderPhone(data.rider_phone || '');
        setTrackingUrl(data.tracking_url || '');
        setShippingCost(data.shipping_cost?.toString() || '');
        setEstimatedDelivery(data.estimated_delivery ? data.estimated_delivery.split('T')[0] : '');
      }
      
      return data as Shipment | null;
    },
    enabled: open
  });

  // Fetch shipment events
  const { data: events } = useQuery({
    queryKey: ['shipment-events', shipment?.id],
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

  // Create/Update shipment
  const saveShipmentMutation = useMutation({
    mutationFn: async () => {
      const shipmentData = {
        order_id: orderId,
        provider_id: providerId || null,
        tracking_number: trackingNumber || null,
        awb_number: awbNumber || null,
        status,
        rider_name: riderName || null,
        rider_phone: riderPhone || null,
        tracking_url: trackingUrl || null,
        shipping_cost: shippingCost ? parseFloat(shippingCost) : null,
        estimated_delivery: estimatedDelivery ? new Date(estimatedDelivery).toISOString() : null
      };

      if (shipment) {
        // Update existing
        const { error } = await supabase
          .from('shipments')
          .update(shipmentData)
          .eq('id', shipment.id);
        if (error) throw error;
      } else {
        // Create new
        const { error } = await supabase
          .from('shipments')
          .insert(shipmentData);
        if (error) throw error;
      }

      // Update order status based on shipment status
      let orderStatus = 'processing';
      if (status === 'picked_up' || status === 'in_transit' || status === 'out_for_delivery') {
        orderStatus = 'shipped';
      } else if (status === 'delivered') {
        orderStatus = 'delivered';
      }

      await supabase
        .from('orders')
        .update({ status: orderStatus })
        .eq('id', orderId);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment', orderId] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      toast.success(shipment ? 'Shipment updated' : 'Shipment created');
      setIsEditing(false);
    },
    onError: (error) => {
      toast.error('Failed to save shipment: ' + error.message);
    }
  });

  // Add shipment event
  const addEventMutation = useMutation({
    mutationFn: async () => {
      if (!shipment) throw new Error('No shipment found');

      const { error } = await supabase
        .from('shipment_events')
        .insert({
          shipment_id: shipment.id,
          status,
          description: eventDescription || null,
          location: eventLocation || null,
          event_timestamp: new Date().toISOString()
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipment-events', shipment?.id] });
      toast.success('Tracking event added');
      setEventDescription('');
      setEventLocation('');
    },
    onError: (error) => {
      toast.error('Failed to add event: ' + error.message);
    }
  });

  const getProviderName = (providerId: string | null) => {
    if (!providerId || !providers) return 'Not assigned';
    const provider = providers.find(p => p.id === providerId);
    return provider?.name || 'Unknown';
  };

  const getStatusBadge = (status: string) => {
    const statusConfig: Record<string, { label: string; variant: 'default' | 'secondary' | 'destructive' | 'outline' }> = {
      pending: { label: 'Pending', variant: 'outline' },
      picked_up: { label: 'Picked Up', variant: 'secondary' },
      in_transit: { label: 'In Transit', variant: 'default' },
      out_for_delivery: { label: 'Out for Delivery', variant: 'default' },
      delivered: { label: 'Delivered', variant: 'default' },
      failed: { label: 'Failed', variant: 'destructive' },
      returned: { label: 'Returned', variant: 'destructive' }
    };
    const config = statusConfig[status] || { label: status, variant: 'outline' as const };
    return <Badge variant={config.variant}>{config.label}</Badge>;
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Truck className="h-5 w-5" />
            Shipment Tracking
          </DialogTitle>
        </DialogHeader>

        {shipmentLoading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-primary" />
          </div>
        ) : !shipment && !isEditing ? (
          // No shipment yet - show create button
          <div className="text-center py-8">
            <Package className="h-12 w-12 mx-auto text-muted-foreground/50 mb-4" />
            <p className="text-muted-foreground mb-4">No shipment created for this order yet</p>
            <Button onClick={() => setIsEditing(true)}>
              <Truck className="h-4 w-4 mr-2" />
              Create Shipment
            </Button>
          </div>
        ) : isEditing ? (
          // Edit/Create form
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Shipping Provider</Label>
                <Select value={providerId} onValueChange={setProviderId}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select provider" />
                  </SelectTrigger>
                  <SelectContent>
                    {providers?.map((provider) => (
                      <SelectItem key={provider.id} value={provider.id}>
                        {provider.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <Label>Status</Label>
                <Select value={status} onValueChange={setStatus}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {SHIPMENT_STATUSES.map((s) => (
                      <SelectItem key={s.value} value={s.value}>
                        {s.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tracking Number</Label>
                <Input
                  value={trackingNumber}
                  onChange={(e) => setTrackingNumber(e.target.value)}
                  placeholder="e.g., 123456789"
                />
              </div>

              <div className="space-y-2">
                <Label>AWB Number</Label>
                <Input
                  value={awbNumber}
                  onChange={(e) => setAwbNumber(e.target.value)}
                  placeholder="Airway bill number"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Rider Name</Label>
                <Input
                  value={riderName}
                  onChange={(e) => setRiderName(e.target.value)}
                  placeholder="Delivery person name"
                />
              </div>

              <div className="space-y-2">
                <Label>Rider Phone</Label>
                <Input
                  value={riderPhone}
                  onChange={(e) => setRiderPhone(e.target.value)}
                  placeholder="+91 98765 43210"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estimated Delivery</Label>
                <Input
                  type="date"
                  value={estimatedDelivery}
                  onChange={(e) => setEstimatedDelivery(e.target.value)}
                />
              </div>

              <div className="space-y-2">
                <Label>Shipping Cost (₹)</Label>
                <Input
                  type="number"
                  value={shippingCost}
                  onChange={(e) => setShippingCost(e.target.value)}
                  placeholder="0.00"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Tracking URL</Label>
              <Input
                value={trackingUrl}
                onChange={(e) => setTrackingUrl(e.target.value)}
                placeholder="https://track.provider.com/..."
              />
            </div>

            <div className="flex gap-2 pt-4">
              <Button
                variant="outline"
                onClick={() => setIsEditing(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                onClick={() => saveShipmentMutation.mutate()}
                disabled={saveShipmentMutation.isPending}
                className="flex-1"
              >
                {saveShipmentMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                {shipment ? 'Update Shipment' : 'Create Shipment'}
              </Button>
            </div>
          </div>
        ) : (
          // View shipment details
          <div className="space-y-6">
            {/* Status and Provider */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                {getStatusBadge(shipment!.status)}
                <span className="text-sm text-muted-foreground">
                  via {getProviderName(shipment!.provider_id)}
                </span>
              </div>
              <Button variant="outline" size="sm" onClick={() => setIsEditing(true)}>
                Edit
              </Button>
            </div>

            {/* Tracking Info */}
            <div className="grid grid-cols-2 gap-4 text-sm">
              {shipment!.tracking_number && (
                <div>
                  <p className="text-muted-foreground">Tracking #</p>
                  <p className="font-mono font-medium">{shipment!.tracking_number}</p>
                </div>
              )}
              {shipment!.awb_number && (
                <div>
                  <p className="text-muted-foreground">AWB #</p>
                  <p className="font-mono font-medium">{shipment!.awb_number}</p>
                </div>
              )}
              {shipment!.estimated_delivery && (
                <div>
                  <p className="text-muted-foreground">Estimated Delivery</p>
                  <p className="font-medium">
                    {new Date(shipment!.estimated_delivery).toLocaleDateString()}
                  </p>
                </div>
              )}
              {shipment!.shipping_cost && (
                <div>
                  <p className="text-muted-foreground">Shipping Cost</p>
                  <p className="font-medium">₹{shipment!.shipping_cost}</p>
                </div>
              )}
            </div>

            {/* Rider Info */}
            {(shipment!.rider_name || shipment!.rider_phone) && (
              <div className="bg-muted/50 rounded-lg p-4">
                <p className="text-sm font-medium mb-2">Delivery Person</p>
                <div className="flex items-center gap-4 text-sm">
                  {shipment!.rider_name && (
                    <div className="flex items-center gap-2">
                      <User className="h-4 w-4 text-muted-foreground" />
                      {shipment!.rider_name}
                    </div>
                  )}
                  {shipment!.rider_phone && (
                    <a 
                      href={`tel:${shipment!.rider_phone}`}
                      className="flex items-center gap-2 text-primary hover:underline"
                    >
                      <Phone className="h-4 w-4" />
                      {shipment!.rider_phone}
                    </a>
                  )}
                </div>
              </div>
            )}

            {/* Tracking URL */}
            {shipment!.tracking_url && (
              <a 
                href={shipment!.tracking_url}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-2 text-sm text-primary hover:underline"
              >
                <ExternalLink className="h-4 w-4" />
                View on provider's tracking page
              </a>
            )}

            <Separator />

            {/* Add Event */}
            <div className="space-y-3">
              <p className="text-sm font-medium">Add Tracking Update</p>
              <div className="grid grid-cols-2 gap-2">
                <Input
                  value={eventLocation}
                  onChange={(e) => setEventLocation(e.target.value)}
                  placeholder="Location (optional)"
                />
                <Input
                  value={eventDescription}
                  onChange={(e) => setEventDescription(e.target.value)}
                  placeholder="Description"
                />
              </div>
              <Button
                size="sm"
                onClick={() => addEventMutation.mutate()}
                disabled={!eventDescription || addEventMutation.isPending}
              >
                {addEventMutation.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : null}
                Add Update
              </Button>
            </div>

            {/* Event Timeline */}
            {events && events.length > 0 && (
              <div className="space-y-3">
                <p className="text-sm font-medium">Tracking History</p>
                <div className="space-y-3">
                  {events.map((event, index) => (
                    <div key={event.id} className="flex gap-3 text-sm">
                      <div className="flex flex-col items-center">
                        <div className={`h-2 w-2 rounded-full ${index === 0 ? 'bg-primary' : 'bg-muted-foreground/30'}`} />
                        {index < events.length - 1 && (
                          <div className="w-px h-full bg-muted-foreground/20 mt-1" />
                        )}
                      </div>
                      <div className="flex-1 pb-3">
                        <div className="flex items-center gap-2 text-muted-foreground">
                          <Clock className="h-3 w-3" />
                          {new Date(event.event_timestamp).toLocaleString()}
                          {event.location && (
                            <>
                              <MapPin className="h-3 w-3 ml-2" />
                              {event.location}
                            </>
                          )}
                        </div>
                        <p className="text-foreground mt-0.5">{event.description}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}