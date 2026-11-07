import { useState, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import { format } from 'date-fns';
import { CalendarIcon, CheckCircle2, Loader2, MessageCircle, Plus, Trash2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { ScrollArea } from '@/components/ui/scroll-area';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { useStorefrontProducts } from '@/hooks/useProducts';
import { availabilityOf, canAddToCart } from '@/lib/availability';
import { Capacitor } from '@capacitor/core';
import { toast } from 'sonner';
import { useCategories } from '@/hooks/useCategories';
import { useSeafoodStorefront } from '@/lib/seafood-rate';

const WHATSAPP_NUMBER = '918971365236';

const DELIVERY_SLOTS = [
  '9:00 AM - 11:00 AM',
  '11:00 AM - 1:00 PM',
  '2:00 PM - 4:00 PM',
  '4:00 PM - 6:00 PM',
  '6:00 PM - 8:00 PM',
];

const LOCATIONS = [
  'Prestige Lakeside Habitat',
  'Sobha Dream Acres',
  'Brigade Lakefront',
  'Mantri Espana',
  'Salarpuria Sattva',
  'Purva Fountain Square',
  'Other',
];

const phoneRegex = /^[6-9]\d{9}$/;

// Phones, tablets and the Android/iOS app: hand the link straight to WhatsApp in the same tab.
// Desktop: open a new tab. Neither is reliable after an await, so a tap-to-open button is
// always shown as well.
function isMobileDevice(): boolean {
  if (Capacitor.isNativePlatform()) return true;
  return /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent)
    || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
}

const formSchema = z.object({
  customerName: z.string().min(2, 'Name must be at least 2 characters').max(100, 'Name too long'),
  mobileNumber: z.string().regex(phoneRegex, 'Please enter a valid 10-digit Indian mobile number'),
  location: z.string().min(1, 'Please select a location'),
  customLocation: z.string().optional(),
  deliveryDate: z.date({ required_error: 'Please select a delivery date' }),
  deliverySlot: z.string().min(1, 'Please select a delivery slot'),
  notes: z.string().max(500, 'Notes too long').optional(),
});

type FormValues = z.infer<typeof formSchema>;

interface OrderItem {
  productId: string;
  productName: string;
  quantity: number;
  unit: string;
  price: number;
  category: string;
}

interface WhatsAppOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function WhatsAppOrderDialog({ open, onOpenChange }: WhatsAppOrderDialogProps) {
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [orderItems, setOrderItems] = useState<OrderItem[]>([]);
  const [selectedProduct, setSelectedProduct] = useState('');
  const [quantity, setQuantity] = useState('0.5');
  // Set once the order is saved: the dialog then shows the "Open WhatsApp" step.
  const [placed, setPlaced] = useState<{ reference: string; url: string } | null>(null);
  const { data: allProducts, isLoading: productsLoading } = useStorefrontProducts();
  const { data: visibleCategories } = useCategories();
  const seafood = useSeafoodStorefront();

  // Only published products from visible (active) categories. A product's category may be
  // stored as the category id, slug or name depending on how it was added, so match any.
  const products = useMemo(() => {
    if (!allProducts || !visibleCategories) return allProducts;
    const ids = new Set(visibleCategories.map(c => c.id));
    const keys = new Set(visibleCategories.flatMap(c => [c.slug.toLowerCase(), c.name.toLowerCase()]));
    return allProducts.filter(p =>
      ((p.categoryId && ids.has(p.categoryId)) || keys.has((p.category || '').toLowerCase()))
      && canAddToCart(availabilityOf(p)));
  }, [allProducts, visibleCategories]);

  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      customerName: '',
      mobileNumber: '',
      location: '',
      customLocation: '',
      deliverySlot: '',
      notes: '',
    },
  });

  const watchLocation = form.watch('location');

  const addProduct = () => {
    if (!selectedProduct) {
      toast.error('Please select a product');
      return;
    }
    const product = products?.find(p => p.id === selectedProduct);
    if (!product) return;

    const qty = parseFloat(quantity);
    if (isNaN(qty) || qty <= 0) {
      toast.error('Please enter a valid quantity');
      return;
    }

    const existingIndex = orderItems.findIndex(item => item.productId === selectedProduct);
    if (existingIndex >= 0) {
      const updated = [...orderItems];
      updated[existingIndex].quantity += qty;
      setOrderItems(updated);
    } else {
      setOrderItems([...orderItems, {
        productId: product.id,
        productName: product.name,
        quantity: qty,
        unit: product.unit,
        price: product.price,
        category: product.category,
      }]);
    }
    setSelectedProduct('');
    setQuantity('0.5');
  };

  const removeProduct = (index: number) => {
    setOrderItems(orderItems.filter((_, i) => i !== index));
  };

  // What the customer is shown: seafood whose price is hidden is left out.
  const calculateShownTotal = () => {
    return orderItems.reduce(
      (total, item) => total + (seafood.isHidden(item.category) ? 0 : item.price * item.quantity), 0,
    );
  };
  const hasHiddenItems = orderItems.some((item) => seafood.isHidden(item.category));

  const onSubmit = async (values: FormValues) => {
    if (orderItems.length === 0) {
      toast.error('Please add at least one product to your order');
      return;
    }

    setIsSubmitting(true);

    try {
      const location = (values.location === 'Other' ? values.customLocation : values.location) || '';

      // Saved through a database function: customers can't write to orders directly, and
      // prices are taken from the product list rather than from the browser.
      const { data, error } = await (supabase as any).rpc('create_whatsapp_order', {
        p_customer_name: values.customerName,
        p_phone: values.mobileNumber,
        p_location: location,
        p_delivery_date: format(values.deliveryDate, 'yyyy-MM-dd'),
        p_delivery_slot: values.deliverySlot,
        p_notes: values.notes || '',
        p_items: orderItems.map(item => ({ product_id: item.productId, quantity: item.quantity })),
      });
      if (error) throw error;
      const reference: string = data?.reference || '';

      const orderItemsList = orderItems
        .map(item => `• ${item.productName}: ${item.quantity} ${item.unit}`)
        .join('\n');

      const message = encodeURIComponent(
        `Hi FreshCutsDaily 👋\n\n` +
        `This is ${values.customerName} from ${location}.\n\n` +
        `I have placed an order on your website.\n\n` +
        `📋 Order Reference: ${reference}\n\n` +
        `🛒 Items:\n${orderItemsList}\n\n` +
        `📅 Delivery Preference: ${format(values.deliveryDate, 'dd MMM yyyy')} – ${values.deliverySlot}\n\n` +
        `${values.notes ? `📝 Notes: ${values.notes}\n\n` : ''}` +
        `Please confirm my order. Thank you!`
      );
      const whatsappUrl = `https://wa.me/${WHATSAPP_NUMBER}?text=${message}`;

      form.reset();
      setOrderItems([]);
      setPlaced({ reference, url: whatsappUrl });

      if (isMobileDevice()) {
        window.location.href = whatsappUrl;
      } else {
        window.open(whatsappUrl, '_blank', 'noopener');
      }
    } catch (error: any) {
      console.error('Error creating order:', error);
      // Validation messages from the database function are written for customers.
      const msg = error?.code === '22023' && error?.message ? error.message : 'Failed to create order. Please try again.';
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleOpenChange = (next: boolean) => {
    if (!next) setPlaced(null);
    onOpenChange(next);
  };

  // Midnight tomorrow: calendar dates are at 00:00, so comparing against "now + 1 day"
  // (which keeps the current time) wrongly blocked tomorrow itself.
  const tomorrow = new Date();
  tomorrow.setDate(tomorrow.getDate() + 1);
  tomorrow.setHours(0, 0, 0, 0);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-hidden p-0">
        <DialogHeader className="px-6 pt-6">
          <DialogTitle className="text-xl font-semibold">Order on WhatsApp</DialogTitle>
          <DialogDescription>
            Fill in your details and we'll confirm your order on WhatsApp
          </DialogDescription>
        </DialogHeader>

        <ScrollArea className="max-h-[calc(90vh-120px)] px-6 pb-6">
          {placed ? (
            <div className="space-y-4 py-4 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-[#25D366]" />
              <div>
                <p className="text-lg font-semibold">Order saved</p>
                <p className="text-sm text-muted-foreground">Reference {placed.reference}</p>
              </div>
              <p className="text-sm text-muted-foreground">
                Send us the order on WhatsApp so we can confirm it. If WhatsApp didn't open, tap the button.
              </p>
              <Button asChild className="w-full bg-[#25D366] hover:bg-[#20BA5A]">
                <a href={placed.url} target="_blank" rel="noopener noreferrer">
                  <MessageCircle className="mr-2 h-4 w-4" />
                  Open WhatsApp
                </a>
              </Button>
              <Button variant="ghost" className="w-full" onClick={() => handleOpenChange(false)}>
                Close
              </Button>
            </div>
          ) : (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
              {/* Customer Details */}
              <div className="space-y-4">
                <h3 className="font-medium text-foreground">Your Details</h3>
                
                <FormField
                  control={form.control}
                  name="customerName"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Name *</FormLabel>
                      <FormControl>
                        <Input placeholder="Your full name" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="mobileNumber"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Mobile Number *</FormLabel>
                      <FormControl>
                        <div className="flex">
                          <span className="flex items-center rounded-l-md border border-r-0 border-input bg-muted px-3 text-sm text-muted-foreground">
                            +91
                          </span>
                          <Input 
                            placeholder="9876543210" 
                            className="rounded-l-none" 
                            maxLength={10}
                            {...field} 
                          />
                        </div>
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="location"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Apartment / Location *</FormLabel>
                      <Select onValueChange={field.onChange} value={field.value}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Select your location" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {LOCATIONS.map(loc => (
                            <SelectItem key={loc} value={loc}>{loc}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                {watchLocation === 'Other' && (
                  <FormField
                    control={form.control}
                    name="customLocation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Enter your location *</FormLabel>
                        <FormControl>
                          <Input placeholder="Your apartment / area name" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                )}

                <div className="grid grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="deliveryDate"
                    render={({ field }) => (
                      <FormItem className="flex flex-col">
                        <FormLabel>Delivery Date *</FormLabel>
                        <Popover>
                          <PopoverTrigger asChild>
                            <FormControl>
                              <Button
                                variant="outline"
                                className={cn(
                                  'w-full pl-3 text-left font-normal',
                                  !field.value && 'text-muted-foreground'
                                )}
                              >
                                {field.value ? format(field.value, 'dd MMM') : 'Select'}
                                <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                              </Button>
                            </FormControl>
                          </PopoverTrigger>
                          <PopoverContent className="w-auto p-0" align="start">
                            <Calendar
                              mode="single"
                              selected={field.value}
                              onSelect={field.onChange}
                              disabled={(date) => date < tomorrow}
                              initialFocus
                            />
                          </PopoverContent>
                        </Popover>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="deliverySlot"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Delivery Slot *</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {DELIVERY_SLOTS.map(slot => (
                              <SelectItem key={slot} value={slot}>{slot}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              </div>

              {/* Product Selection */}
              <div className="space-y-4 pt-2">
                <h3 className="font-medium text-foreground">Add Products</h3>
                
                <div className="flex gap-2">
                  <Select value={selectedProduct} onValueChange={setSelectedProduct}>
                    <SelectTrigger className="flex-1">
                      <SelectValue placeholder={productsLoading ? 'Loading...' : 'Select product'} />
                    </SelectTrigger>
                    <SelectContent>
                      {products?.filter(p => p.inStock).map(product => (
                        <SelectItem key={product.id} value={product.id}>
                          {seafood.isHidden(product.category)
                            ? `${product.name} - price from tomorrow morning`
                            : `${product.name} - ₹${product.price}/${product.unit}${availabilityOf(product) === 'preorder' ? ' (pre-order)' : ''}`}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Input
                    type="number"
                    step="0.5"
                    min="0.5"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className="w-20"
                    placeholder="Qty"
                  />
                  <Button type="button" onClick={addProduct} size="icon" variant="outline">
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>

                {orderItems.length > 0 ? (
                  <div className="rounded-md border">
                    <div className="divide-y">
                      {orderItems.map((item, index) => (
                        <div key={index} className="flex items-center justify-between p-3">
                          <div>
                            <p className="font-medium">{item.productName}</p>
                            <p className="text-sm text-muted-foreground">
                              {seafood.isHidden(item.category)
                                ? `${item.quantity} ${item.unit} · ${seafood.message}`
                                : `${item.quantity} ${item.unit} × ₹${item.price} = ₹${(item.quantity * item.price).toFixed(2)}`}
                            </p>
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            onClick={() => removeProduct(index)}
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      ))}
                      <div className="flex justify-between bg-muted/50 p-3 font-medium">
                        <span>Total</span>
                        <span>₹{calculateShownTotal().toFixed(2)}{hasHiddenItems ? ' + seafood' : ''}</span>
                      </div>
                    </div>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-4 border border-dashed rounded-md">
                    Select a product above and click + to add it to your order
                  </p>
                )}
              </div>

              {/* Notes */}
              <FormField
                control={form.control}
                name="notes"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Special Instructions (Optional)</FormLabel>
                    <FormControl>
                      <Textarea 
                        placeholder="Cut preference, packaging instructions, etc."
                        className="resize-none"
                        rows={2}
                        {...field} 
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <Button 
                type="submit" 
                className="w-full bg-[#25D366] hover:bg-[#20BA5A] disabled:bg-muted disabled:text-muted-foreground"
                disabled={isSubmitting || orderItems.length === 0}
              >
                {isSubmitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Creating Order...
                  </>
                ) : orderItems.length === 0 ? (
                  'Add products to continue'
                ) : (
                  'Continue to WhatsApp'
                )}
              </Button>
            </form>
          </Form>
          )}
        </ScrollArea>
      </DialogContent>
    </Dialog>
  );
}
