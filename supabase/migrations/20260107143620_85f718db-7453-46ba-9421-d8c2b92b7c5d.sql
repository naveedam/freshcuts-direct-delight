-- Create shipping_providers table
CREATE TABLE public.shipping_providers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  code TEXT NOT NULL UNIQUE,
  api_base_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  supported_cities TEXT[] DEFAULT '{}',
  logo_url TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shipments table
CREATE TABLE public.shipments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  provider_id UUID REFERENCES public.shipping_providers(id),
  tracking_number TEXT,
  awb_number TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  estimated_delivery TIMESTAMP WITH TIME ZONE,
  pickup_scheduled_at TIMESTAMP WITH TIME ZONE,
  picked_up_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  delivery_proof_url TEXT,
  rider_name TEXT,
  rider_phone TEXT,
  tracking_url TEXT,
  shipping_cost NUMERIC,
  raw_response JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create shipment_events table
CREATE TABLE public.shipment_events (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  shipment_id UUID NOT NULL REFERENCES public.shipments(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  description TEXT,
  location TEXT,
  event_timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  raw_data JSONB DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.shipping_providers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shipment_events ENABLE ROW LEVEL SECURITY;

-- Shipping Providers policies (public read, admin manage)
CREATE POLICY "Anyone can view active shipping providers"
ON public.shipping_providers
FOR SELECT
USING (is_active = true);

CREATE POLICY "Admins can manage shipping providers"
ON public.shipping_providers
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Shipments policies
CREATE POLICY "Users can view their own shipments"
ON public.shipments
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM orders
    WHERE orders.id = shipments.order_id
    AND orders.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all shipments"
ON public.shipments
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage shipments"
ON public.shipments
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Shipment Events policies
CREATE POLICY "Users can view their own shipment events"
ON public.shipment_events
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM shipments
    JOIN orders ON orders.id = shipments.order_id
    WHERE shipments.id = shipment_events.shipment_id
    AND orders.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can view all shipment events"
ON public.shipment_events
FOR SELECT
USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can manage shipment events"
ON public.shipment_events
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add update triggers
CREATE TRIGGER update_shipping_providers_updated_at
BEFORE UPDATE ON public.shipping_providers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_shipments_updated_at
BEFORE UPDATE ON public.shipments
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default shipping providers
INSERT INTO public.shipping_providers (name, code, api_base_url) VALUES
('Delhivery', 'delhivery', 'https://track.delhivery.com/api'),
('Porter', 'porter', 'https://api.porter.in'),
('Rapido', 'rapido', 'https://api.rapido.bike'),
('Shiprocket', 'shiprocket', 'https://apiv2.shiprocket.in'),
('Manual Entry', 'manual', NULL);