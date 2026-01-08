import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2, Truck, Clock, IndianRupee, Star, Check, AlertCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ShippingRateComparisonProps {
  orderId: string;
  destinationCity: string | null;
  destinationPincode: string | null;
  orderTotal: number;
  onSelectRate: (providerId: string, rate: ShippingRate) => void;
  onClose: () => void;
}

interface ShippingProvider {
  id: string;
  name: string;
  code: string;
  supported_cities: string[] | null;
  is_active: boolean;
}

export interface ShippingRate {
  providerId: string;
  providerName: string;
  providerCode: string;
  baseRate: number;
  deliveryDays: number;
  estimatedDelivery: Date;
  serviceable: boolean;
  serviceType: 'standard' | 'express' | 'same_day';
  features: string[];
}

// Mock rate calculation - in production, this would call actual provider APIs
function calculateMockRates(
  providers: ShippingProvider[],
  destinationCity: string | null,
  orderTotal: number
): ShippingRate[] {
  const rates: ShippingRate[] = [];
  const baseRates: Record<string, { base: number; perKg: number; deliveryDays: number }> = {
    delhivery: { base: 45, perKg: 12, deliveryDays: 3 },
    porter: { base: 35, perKg: 8, deliveryDays: 1 },
    rapido: { base: 25, perKg: 5, deliveryDays: 0 },
  };

  const cityMultipliers: Record<string, number> = {
    Mumbai: 1.0,
    Delhi: 1.1,
    Bangalore: 1.15,
    Kolkata: 1.2,
    Chennai: 1.1,
    Hyderabad: 1.05,
  };

  const multiplier = cityMultipliers[destinationCity || ''] || 1.3;
  const estimatedWeight = Math.max(1, orderTotal / 500); // Rough weight estimate

  providers.forEach((provider) => {
    const config = baseRates[provider.code] || { base: 50, perKg: 10, deliveryDays: 4 };
    
    // Check serviceability
    const isServiceable = !provider.supported_cities || 
      provider.supported_cities.length === 0 || 
      (destinationCity && provider.supported_cities.some(
        city => city.toLowerCase() === destinationCity.toLowerCase()
      ));

    const calculatedRate = Math.round((config.base + config.perKg * estimatedWeight) * multiplier);
    const deliveryDate = new Date();
    deliveryDate.setDate(deliveryDate.getDate() + config.deliveryDays + 1);

    let serviceType: 'standard' | 'express' | 'same_day' = 'standard';
    let features: string[] = [];

    if (provider.code === 'rapido') {
      serviceType = 'same_day';
      features = ['Same Day Delivery', 'Live Tracking', 'Contact Driver Directly'];
    } else if (provider.code === 'porter') {
      serviceType = 'express';
      features = ['Next Day Delivery', 'Real-time Tracking', 'Delivery Proof'];
    } else {
      features = ['Standard Delivery', 'Tracking Available', 'Insurance Included'];
    }

    rates.push({
      providerId: provider.id,
      providerName: provider.name,
      providerCode: provider.code,
      baseRate: calculatedRate,
      deliveryDays: config.deliveryDays,
      estimatedDelivery: deliveryDate,
      serviceable: isServiceable,
      serviceType,
      features,
    });
  });

  // Sort by rate (cheapest first), but put non-serviceable at the end
  return rates.sort((a, b) => {
    if (a.serviceable !== b.serviceable) return a.serviceable ? -1 : 1;
    return a.baseRate - b.baseRate;
  });
}

export function ShippingRateComparison({
  orderId,
  destinationCity,
  destinationPincode,
  orderTotal,
  onSelectRate,
  onClose,
}: ShippingRateComparisonProps) {
  const [selectedRate, setSelectedRate] = useState<ShippingRate | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const { data: providers, isLoading: providersLoading } = useQuery({
    queryKey: ['shipping-providers-active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_providers')
        .select('id, name, code, supported_cities, is_active')
        .eq('is_active', true);
      if (error) throw error;
      return data as ShippingProvider[];
    },
  });

  const rates = providers ? calculateMockRates(providers, destinationCity, orderTotal) : [];

  const handleConfirmSelection = () => {
    if (!selectedRate) return;
    setIsLoading(true);
    // Simulate API call delay
    setTimeout(() => {
      onSelectRate(selectedRate.providerId, selectedRate);
      setIsLoading(false);
    }, 500);
  };

  const getServiceBadge = (serviceType: string) => {
    switch (serviceType) {
      case 'same_day':
        return <Badge className="bg-green-500/10 text-green-600 border-green-500/30">Same Day</Badge>;
      case 'express':
        return <Badge className="bg-blue-500/10 text-blue-600 border-blue-500/30">Express</Badge>;
      default:
        return <Badge variant="secondary">Standard</Badge>;
    }
  };

  const formatDeliveryDate = (date: Date) => {
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(tomorrow.getDate() + 1);

    if (date.toDateString() === today.toDateString()) {
      return 'Today';
    } else if (date.toDateString() === tomorrow.toDateString()) {
      return 'Tomorrow';
    } else {
      return date.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });
    }
  };

  if (providersLoading) {
    return (
      <div className="flex flex-col items-center justify-center py-12">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-muted-foreground">Fetching shipping rates...</p>
      </div>
    );
  }

  if (!providers || providers.length === 0) {
    return (
      <div className="text-center py-12">
        <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <p className="text-muted-foreground">No shipping providers available.</p>
        <p className="text-sm text-muted-foreground mt-1">
          Please add and activate providers in Shipping Settings.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="bg-muted/50 rounded-lg p-3">
        <p className="text-sm text-muted-foreground">
          Delivering to <span className="font-medium text-foreground">{destinationCity || 'Unknown'}</span>
          {destinationPincode && <span> ({destinationPincode})</span>}
        </p>
      </div>

      <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
        {rates.map((rate) => (
          <Card
            key={rate.providerId}
            className={cn(
              'cursor-pointer transition-all hover:border-primary/50',
              selectedRate?.providerId === rate.providerId && 'border-primary ring-1 ring-primary',
              !rate.serviceable && 'opacity-50 cursor-not-allowed'
            )}
            onClick={() => rate.serviceable && setSelectedRate(rate)}
          >
            <CardContent className="p-4">
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-3">
                  <div className={cn(
                    "h-10 w-10 rounded-lg flex items-center justify-center shrink-0",
                    rate.serviceable ? "bg-primary/10" : "bg-muted"
                  )}>
                    <Truck className={cn(
                      "h-5 w-5",
                      rate.serviceable ? "text-primary" : "text-muted-foreground"
                    )} />
                  </div>
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <p className="font-medium">{rate.providerName}</p>
                      {getServiceBadge(rate.serviceType)}
                      {selectedRate?.providerId === rate.providerId && (
                        <Check className="h-4 w-4 text-primary" />
                      )}
                    </div>
                    <div className="flex items-center gap-3 text-sm text-muted-foreground">
                      <span className="flex items-center gap-1">
                        <Clock className="h-3.5 w-3.5" />
                        {formatDeliveryDate(rate.estimatedDelivery)}
                      </span>
                    </div>
                    <div className="flex flex-wrap gap-1 mt-2">
                      {rate.features.slice(0, 2).map((feature) => (
                        <Badge key={feature} variant="outline" className="text-xs font-normal">
                          {feature}
                        </Badge>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-lg font-bold flex items-center justify-end">
                    <IndianRupee className="h-4 w-4" />
                    {rate.baseRate}
                  </p>
                  {!rate.serviceable && (
                    <p className="text-xs text-destructive mt-1">Not serviceable</p>
                  )}
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <Button variant="outline" onClick={onClose} className="flex-1">
          Cancel
        </Button>
        <Button
          onClick={handleConfirmSelection}
          disabled={!selectedRate || isLoading}
          className="flex-1"
        >
          {isLoading ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : null}
          {selectedRate ? `Select ${selectedRate.providerName} - ₹${selectedRate.baseRate}` : 'Select a Provider'}
        </Button>
      </div>
    </div>
  );
}
