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
import { ArrowLeft, CreditCard, Truck, CheckCircle, Loader2 } from 'lucide-react';
import { z } from 'zod';

// Validation schemas
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

const paymentSchema = z.object({
  cardName: z.string().trim().min(2, 'Name on card is required').max(100, 'Name must be less than 100 characters'),
  cardNumber: z.string().trim().min(13, 'Card number must be at least 13 digits').max(19, 'Card number must be less than 19 digits').regex(/^[0-9\s]+$/, 'Card number must contain only numbers'),
  expiryDate: z.string().trim().regex(/^(0[1-9]|1[0-2])\/([0-9]{2})$/, 'Expiry date must be in MM/YY format'),
  cvv: z.string().trim().min(3, 'CVV must be 3-4 digits').max(4, 'CVV must be 3-4 digits').regex(/^[0-9]+$/, 'CVV must contain only numbers'),
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
  const [step, setStep] = useState<'shipping' | 'payment' | 'confirmation'>('shipping');
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
    cardNumber: '',
    expiryDate: '',
    cvv: '',
    cardName: ''
  });

  const shippingThreshold = 2000;
  const hasFreeShipping = totalPrice >= shippingThreshold;
  const shippingCost = hasFreeShipping ? 0 : 99;
  const orderTotal = totalPrice + shippingCost;

  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  const handleShippingSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    
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

    setStep('payment');
  };

  const handlePaymentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormErrors({});
    
    // Validate payment fields
    const paymentResult = paymentSchema.safeParse({
      cardName: formData.cardName,
      cardNumber: formData.cardNumber,
      expiryDate: formData.expiryDate,
      cvv: formData.cvv,
    });

    if (!paymentResult.success) {
      const errors: Record<string, string> = {};
      paymentResult.error.errors.forEach((err) => {
        if (err.path[0]) {
          errors[err.path[0] as string] = err.message;
        }
      });
      setFormErrors(errors);
      toast.error('Please fix the payment form errors');
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

      // Create order in database with sanitized data
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
          notes: `${sanitizedData.firstName} ${sanitizedData.lastName}`
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = items.map(({ product, quantity }) => ({
        order_id: order.id,
        product_id: product.id,
        product_name: product.name,
        quantity,
        unit_price: product.price,
        total_price: product.price * quantity
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
              Order Confirmed!
            </h1>
            <p className="font-body text-muted-foreground mb-2">
              Thank you for your order. We've sent a confirmation to your email.
            </p>
            <p className="font-body text-sm text-muted-foreground mb-8">
              Order #{orderId?.slice(0, 8).toUpperCase() || 'N/A'}
            </p>
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
            {/* Progress */}
            <div className="flex items-center gap-4 mb-8">
              <div className={`flex items-center gap-2 ${step === 'shipping' ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'shipping' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <Truck className="h-4 w-4" />
                </div>
                <span className="font-body font-medium">Shipping</span>
              </div>
              <div className="flex-1 h-px bg-border" />
              <div className={`flex items-center gap-2 ${step === 'payment' ? 'text-primary' : 'text-muted-foreground'}`}>
                <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step === 'payment' ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  <CreditCard className="h-4 w-4" />
                </div>
                <span className="font-body font-medium">Payment</span>
              </div>
            </div>

            {step === 'shipping' && (
              <form onSubmit={handleShippingSubmit} className="bg-card rounded-xl border border-border p-6 md:p-8">
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
                      <Label htmlFor="zipCode">ZIP Code</Label>
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

                <Button type="submit" variant="hero" size="lg" className="w-full mt-8">
                  Continue to Payment
                </Button>
              </form>
            )}

            {step === 'payment' && (
              <form onSubmit={handlePaymentSubmit} className="bg-card rounded-xl border border-border p-6 md:p-8">
                <h2 className="font-heading text-xl font-bold text-foreground mb-6">
                  Payment Information
                </h2>
                
                <div className="space-y-6">
                  <div className="space-y-2">
                    <Label htmlFor="cardName">Name on Card</Label>
                    <Input
                      id="cardName"
                      value={formData.cardName}
                      onChange={(e) => setFormData({ ...formData, cardName: e.target.value })}
                      maxLength={100}
                      className={formErrors.cardName ? 'border-destructive' : ''}
                      required
                    />
                    {formErrors.cardName && <p className="text-sm text-destructive">{formErrors.cardName}</p>}
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="cardNumber">Card Number</Label>
                    <Input
                      id="cardNumber"
                      placeholder="1234 5678 9012 3456"
                      value={formData.cardNumber}
                      onChange={(e) => setFormData({ ...formData, cardNumber: e.target.value })}
                      maxLength={19}
                      className={formErrors.cardNumber ? 'border-destructive' : ''}
                      required
                    />
                    {formErrors.cardNumber && <p className="text-sm text-destructive">{formErrors.cardNumber}</p>}
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="expiryDate">Expiry Date</Label>
                      <Input
                        id="expiryDate"
                        placeholder="MM/YY"
                        value={formData.expiryDate}
                        onChange={(e) => setFormData({ ...formData, expiryDate: e.target.value })}
                        maxLength={5}
                        className={formErrors.expiryDate ? 'border-destructive' : ''}
                        required
                      />
                      {formErrors.expiryDate && <p className="text-sm text-destructive">{formErrors.expiryDate}</p>}
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="cvv">CVV</Label>
                      <Input
                        id="cvv"
                        placeholder="123"
                        value={formData.cvv}
                        onChange={(e) => setFormData({ ...formData, cvv: e.target.value })}
                        maxLength={4}
                        className={formErrors.cvv ? 'border-destructive' : ''}
                        required
                      />
                      {formErrors.cvv && <p className="text-sm text-destructive">{formErrors.cvv}</p>}
                    </div>
                  </div>
                </div>

                <div className="flex gap-4 mt-8">
                  <Button 
                    type="button" 
                    variant="outline" 
                    size="lg" 
                    className="flex-1"
                    onClick={() => setStep('shipping')}
                  >
                    Back
                  </Button>
                  <Button 
                    type="submit" 
                    variant="hero" 
                    size="lg" 
                    className="flex-1"
                    disabled={loading}
                  >
                    {loading ? (
                      <>
                        <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : (
                      `Pay ₹${orderTotal.toFixed(0)}`
                    )}
                  </Button>
                </div>
              </form>
            )}
          </div>

          {/* Order Summary */}
          <div className="lg:col-span-1">
            <div className="bg-card rounded-xl border border-border p-6 sticky top-24">
              <h2 className="font-heading text-xl font-bold text-foreground mb-6">
                Order Summary
              </h2>

              <div className="space-y-4 mb-6">
                {items.map(({ product, quantity }) => (
                  <div key={product.id} className="flex gap-3">
                    <div className="w-12 h-12 rounded-lg bg-muted overflow-hidden shrink-0">
                      {product.image ? (
                        <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-xl">
                          {product.category === 'lamb' && '🥩'}
                          {product.category === 'poultry' && '🍗'}
                          {product.category === 'seafood' && '🐟'}
                        </div>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-body text-sm font-medium text-foreground line-clamp-1">
                        {product.name}
                      </p>
                      <p className="font-body text-xs text-muted-foreground">
                        Qty: {quantity}
                      </p>
                    </div>
                    <span className="font-body text-sm font-medium text-foreground">
                      ₹{(product.price * quantity).toFixed(0)}
                    </span>
                  </div>
                ))}
              </div>

              <div className="border-t border-border pt-4 space-y-3">
                <div className="flex justify-between font-body">
                  <span className="text-muted-foreground">Subtotal</span>
                  <span className="font-medium text-foreground">₹{totalPrice.toFixed(0)}</span>
                </div>
                <div className="flex justify-between font-body">
                  <span className="text-muted-foreground">Shipping</span>
                  <span className={`font-medium ${hasFreeShipping ? 'text-green-600' : 'text-foreground'}`}>
                    {hasFreeShipping ? 'FREE' : `₹${shippingCost}`}
                  </span>
                </div>
                <div className="border-t border-border pt-3 flex justify-between">
                  <span className="font-heading font-bold text-foreground">Total</span>
                  <span className="font-heading text-xl font-bold text-primary">₹{orderTotal.toFixed(0)}</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default CheckoutPage;
