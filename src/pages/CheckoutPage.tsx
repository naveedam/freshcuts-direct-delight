import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useCart } from '@/context/CartContext';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { ArrowLeft, Truck, CheckCircle, Loader2, Scale, Banknote } from 'lucide-react';
import { z } from 'zod';
import { formatCurrency } from '@/lib/currency';
import { formatWeight, getTotalWeightKg, calculatePrice } from '@/lib/weight-utils';

// Validation schema for shipping
const shippingSchema = z.object({
  firstName: z.string().trim().min(1, 'First name is required').max(50, 'First name must be less than 50 characters'),
  lastName: z.string().trim().min(1, 'Last name is required').max(50, 'Last name must be less than 50 characters'),
  email: z.string().trim().email('Invalid email address').max(255, 'Email must be less than 255 characters'),
  phone: z.string().trim().min(10, 'Phone must be at least 10 digits').max(20, 'Phone must be less than 20 characters').regex(/^[0-9+\-\s()]+$/, 'Phone must contain only numbers and + - ( ) characters'),
  address: z.string().trim().min(5, 'Address must be at least 5 characters').max(200, 'Address must be less than 200 characters'),
  city: z.string().trim().min(2, 'City must be at least 2 characters').max(50, 'City must be less than 50 characters'),
  state: z.string().trim().min(2, 'State must be at least 2 characters').max(50, 'State must be less than 50 characters'),
  zipCode: z.string().trim().min(3, 'ZIP code must be at least 3 characters').max(10, 'ZIP code must be less than 10 characters').regex(/^[0-9A-Za-z\s-]+$/, 'ZIP code contains invalid characters'),
});

// Sanitize function to strip potential XSS vectors
const sanitizeInput = (input: string): string => {
  return input
    .replace(/[<>]/g, '') // Remove angle brackets
    .replace(/javascript:/gi, '') // Remove javascript: protocol
    .replace(/on\w+=/gi, '') // Remove event handlers
    .trim()
    .substring(0, 200); // Limit length
};

const CheckoutPage = () => {
  const { items, totalPrice, clearCart } = useCart();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'shipping' | 'confirmation'>('shipping');
  const [orderId, setOrderId] = useState<string | null>(null);
  
  const [formData, setFormData] = useState({
    firstName: '',
    lastName: '',
    email: '',
    phone: '',
    address: '',
    city: '',
    state: '',
    zipCode: '',
  });

  const shippingThreshold = 2000;
  const hasFreeShipping = totalPrice >= shippingThreshold;
  const shippingCost = hasFreeShipping ? 0 : 99;
  const orderTotal = totalPrice + shippingCost;

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handlePlaceOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    
    // Validate shipping fields
    const result = shippingSchema.safeParse({
      firstName: formData.firstName,
      lastName: formData.lastName,
      email: formData.email,
      phone: formData.phone,
      address: formData.address,
      city: formData.city,
      state: formData.state,
      zipCode: formData.zipCode,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setFormErrors(errors);
      toast.error('Please fix the form errors');
      return;
    }

    setLoading(true);
    
    try {
      // Sanitize all user inputs before storing
      const sanitizedData = {
        firstName: sanitizeInput(formData.firstName),
        lastName: sanitizeInput(formData.lastName),
        email: sanitizeInput(formData.email),
        phone: sanitizeInput(formData.phone),
        address: sanitizeInput(formData.address),
        city: sanitizeInput(formData.city),
        zipCode: sanitizeInput(formData.zipCode),
      };

      // Create order in database with sanitized data - payment pending after weighing
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          user_id: user?.id || null,
          total_amount: orderTotal,
          status: 'pending',
          shipping_address: sanitizedData.address,
          shipping_city: sanitizedData.city,
          shipping_postal_code: sanitizedData.zipCode,
          phone: sanitizedData.phone,
          customer_email: sanitizedData.email,
          notes: `${sanitizedData.firstName} ${sanitizedData.lastName} | Pay After Weighing`
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items - store weight in kg for database
      const orderItems = items.map(({ product, quantity }) => ({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        quantity: getTotalWeightKg(quantity), // Store actual weight in kg
        unit_price: product.price, // Price per kg
        total_price: calculatePrice(product.price, quantity) // Total based on weight
      }));

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      setOrderId(order.id);
      setStep('confirmation');
      clearCart();
      toast.success('Order placed successfully!');
    } catch (error: any) {
      toast.error('Failed to place order: ' + error.message);
    } finally {
      setLoading(false);
    }
  };

  if (items.length === 0 && step !== 'confirmation') {
    navigate('/cart');
    return null;
  }

  if (step === 'confirmation') {
    return (
      <Layout>
        <div className="container mx-auto px-4 py-20 text-center">
          <div className="max-w-md mx-auto">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <CheckCircle className="h-10 w-10 text-green-600" />
            </div>
            <h1 className="font-heading text-3xl font-bold text-foreground mb-4">
              Order Placed!
            </h1>
            <p className="font-body text-muted-foreground mb-2">
              Thank you for your order. We've sent a confirmation to your email.
            </p>
            <p className="font-body text-sm text-muted-foreground mb-4">
              Order #{orderId?.slice(0, 8).toUpperCase() || 'N/A'}
            </p>
            
            {/* Pay After Weighing Notice */}
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-8">
              <div className="flex items-center justify-center gap-2 text-amber-700 mb-2">
                <Scale className="h-5 w-5" />
                <span className="font-medium">Pay After Weighing</span>
              </div>
              <p className="text-sm text-amber-600">
                Your order will be weighed before delivery. Final payment will be collected based on actual weight.
              </p>
            </div>

            {user && (
              <Link to="/account/orders" className="block mb-4">
                <Button variant="outline" size="lg">
                  View Order History
                </Button>
              </Link>
            )}
            <Link to="/">
              <Button variant="hero" size="lg">
                Continue Shopping
              </Button>
            </Link>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="container mx-auto px-4 py-8 md:py-12">
        {/* Back Link */}
        <Link to="/cart" className="inline-flex items-center gap-2 font-body text-muted-foreground hover:text-primary transition-colors mb-8">
          <ArrowLeft className="h-4 w-4" />
          Back to Cart
        </Link>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          {/* Form Section */}
          <div className="lg:col-span-2">
            {/* Progress - Single Step */}
            <div className="flex items-center gap-4 mb-8">
              <div className="flex items-center gap-2 text-primary">
                <div className="w-8 h-8 rounded-full flex items-center justify-center bg-primary text-primary-foreground">
                  <Truck className="h-4 w-4" />
                </div>
                <span className="font-body font-medium">Shipping & Order</span>
              </div>
            </div>

            <form onSubmit={handlePlaceOrder} className="bg-card rounded-xl border border-border p-6 md:p-8">
              <h2 className="font-heading text-xl font-bold text-foreground mb-6">
                Shipping Information
              </h2>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <Label htmlFor="firstName">First Name</Label>
                  <Input
                    id="firstName"
                    value={formData.firstName}
                    onChange={(e) => setFormData({ ...formData, firstName: e.target.value })}
                    maxLength={50}
                    className={formErrors.firstName ? 'border-destructive' : ''}
                    required
                  />
                  {formErrors.firstName && <p className="text-sm text-destructive">{formErrors.firstName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="lastName">Last Name</Label>
                  <Input
                    id="lastName"
                    value={formData.lastName}
                    onChange={(e) => setFormData({ ...formData, lastName: e.target.value })}
                    maxLength={50}
                    className={formErrors.lastName ? 'border-destructive' : ''}
                    required
                  />
                  {formErrors.lastName && <p className="text-sm text-destructive">{formErrors.lastName}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    value={formData.email}
                    onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                    maxLength={255}
                    className={formErrors.email ? 'border-destructive' : ''}
                    required
                  />
                  {formErrors.email && <p className="text-sm text-destructive">{formErrors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="phone">Phone</Label>
                  <Input
                    id="phone"
                    type="tel"
                    value={formData.phone}
                    onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                    maxLength={20}
                    className={formErrors.phone ? 'border-destructive' : ''}
                    required
                  />
                  {formErrors.phone && <p className="text-sm text-destructive">{formErrors.phone}</p>}
                </div>
                <div className="md:col-span-2 space-y-2">
                  <Label htmlFor="address">Address</Label>
                  <Input
                    id="address"
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    maxLength={200}
                    className={formErrors.address ? 'border-destructive' : ''}
                    required
                  />
                  {formErrors.address && <p className="text-sm text-destructive">{formErrors.address}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="city">City</Label>
                  <Input
                    id="city"
                    value={formData.city}
                    onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                    maxLength={50}
                    className={formErrors.city ? 'border-destructive' : ''}
                    required
                  />
                  {formErrors.city && <p className="text-sm text-destructive">{formErrors.city}</p>}
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="state">State</Label>
                    <Input
                      id="state"
                      value={formData.state}
                      onChange={(e) => setFormData({ ...formData, state: e.target.value })}
                      maxLength={50}
                      className={formErrors.state ? 'border-destructive' : ''}
                      required
                    />
                    {formErrors.state && <p className="text-sm text-destructive">{formErrors.state}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="zipCode">PIN Code</Label>
                    <Input
                      id="zipCode"
                      value={formData.zipCode}
                      onChange={(e) => setFormData({ ...formData, zipCode: e.target.value })}
                      maxLength={10}
                      className={formErrors.zipCode ? 'border-destructive' : ''}
                      required
                    />
                    {formErrors.zipCode && <p className="text-sm text-destructive">{formErrors.zipCode}</p>}
                  </div>
                </div>
              </div>

              {/* Pay After Weighing Notice */}
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mt-6">
                <div className="flex items-center gap-2 text-amber-700 mb-2">
                  <Banknote className="h-5 w-5" />
                  <span className="font-medium">Pay After Weighing</span>
                </div>
                <p className="text-sm text-amber-600">
                  No payment required now. Your order will be weighed before delivery and final amount will be calculated based on actual weight. Payment will be collected at delivery.
                </p>
              </div>

              <Button type="submit" variant="hero" size="lg" className="w-full mt-8" disabled={loading}>
                {loading ? (
                  <>
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                    Placing Order...
                  </>
                ) : (
                  'Place Order'
                )}
              </Button>
            </form>
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border p-6 sticky top-24">
              <h3 className="font-heading text-lg font-bold text-foreground mb-4">
                Order Summary
              </h3>
              
              <div className="space-y-4 mb-6">
                {items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex gap-3">
                    <div className="w-16 h-16 bg-muted rounded-lg overflow-hidden flex-shrink-0">
                      <img
                        src={product.image || '/placeholder.svg'}
                        alt={product.name}
                        className="w-full h-full object-cover"
                      />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body font-medium text-foreground text-sm truncate">
                        {product.name}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        Weight: {formatWeight(quantity)}
                      </p>
                      <p className="font-body text-sm font-medium text-primary">
                        {formatCurrency(calculatePrice(product.price, quantity))}
                      </p>
                    </div>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4 space-y-2">
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Subtotal (estimated)</span>
                  <span className="text-foreground">{formatCurrency(totalPrice)}</span>
                </div>
                <div className="flex justify-between font-body text-sm">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className="text-foreground">
                    {hasFreeShipping ? 'Free' : formatCurrency(shippingCost)}
                  </span>
                </div>
                <div className="flex justify-between font-heading text-lg font-bold pt-2 border-t border-border">
                  <span>Estimated Total</span>
                  <span className="text-primary">{formatCurrency(orderTotal)}</span>
                </div>
                <p className="text-xs text-muted-foreground mt-2">
                  * Final amount may vary based on actual weight
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CheckoutPage;
