-- Create a table for page content management
CREATE TABLE public.page_content (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_key TEXT NOT NULL UNIQUE,
  content JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.page_content ENABLE ROW LEVEL SECURITY;

-- Anyone can view page content (needed for public pages)
CREATE POLICY "Anyone can view page content"
ON public.page_content
FOR SELECT
USING (true);

-- Only admins can manage page content
CREATE POLICY "Admins can manage page content"
ON public.page_content
FOR ALL
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_page_content_updated_at
BEFORE UPDATE ON public.page_content
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default content for all sections
INSERT INTO public.page_content (section_key, content) VALUES
('hero', '{
  "title": "Premium Quality Meats",
  "subtitle": "Delivered Fresh to Your Doorstep",
  "description": "Experience the finest selection of halal-certified lamb, poultry, and seafood. Farm-fresh quality you can trust.",
  "primaryButtonText": "Shop Now",
  "secondaryButtonText": "View Categories"
}'::jsonb),
('why_choose_us', '{
  "title": "Why Choose FreshMeat?",
  "subtitle": "We take pride in delivering the highest quality products with exceptional service",
  "features": [
    {"icon": "Shield", "title": "100% Halal Certified", "description": "All our products are certified halal, ensuring you get quality meat that meets the highest standards."},
    {"icon": "Truck", "title": "Fresh Delivery", "description": "Same-day delivery for orders placed before 2 PM. Your meat arrives fresh and properly stored."},
    {"icon": "Award", "title": "Premium Quality", "description": "We source only the finest cuts from trusted farms and suppliers across the country."},
    {"icon": "Clock", "title": "Easy Ordering", "description": "Simple online ordering with real-time tracking. Know exactly when your order will arrive."}
  ]
}'::jsonb),
('cta', '{
  "title": "Ready to Experience Premium Quality?",
  "description": "Join thousands of satisfied customers who trust us for their daily meat needs.",
  "buttonText": "Start Shopping",
  "stats": [
    {"value": "10,000+", "label": "Happy Customers"},
    {"value": "500+", "label": "Products"},
    {"value": "99%", "label": "Satisfaction Rate"}
  ]
}'::jsonb),
('footer', '{
  "companyName": "FreshMeat",
  "tagline": "Premium quality halal meats delivered fresh to your doorstep.",
  "phone": "+91 98765 43210",
  "email": "support@freshmeat.com",
  "address": "123 Market Street, Mumbai, Maharashtra 400001",
  "workingHours": "Mon-Sat: 8AM - 8PM"
}'::jsonb);