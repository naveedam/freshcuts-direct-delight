import { useState, useMemo } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { Plus, Trash2, Loader2, PackagePlus, Percent, IndianRupee } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { formatCurrency } from '@/lib/currency';

interface OrderLineItem {
  product_id: string | null;
  product_name: string;
  quantity: number;
  unit_price: number;
  hsn_code: string;
  gst_type: string;
  gst_rate: number;
  is_custom?: boolean;
  unit_type?: 'weight_based' | 'unit_based';
  category?: string;
  sku?: string;
  save_to_catalog?: boolean;
}

interface NewOrderDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const INDIAN_STATES = [
  { code: '01', name: 'Jammu & Kashmir' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '03', name: 'Punjab' },
  { code: '04', name: 'Chandigarh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '06', name: 'Haryana' },
  { code: '07', name: 'Delhi' },
  { code: '08', name: 'Rajasthan' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '10', name: 'Bihar' },
  { code: '11', name: 'Sikkim' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '13', name: 'Nagaland' },
  { code: '14', name: 'Manipur' },
  { code: '15', name: 'Mizoram' },
  { code: '16', name: 'Tripura' },
  { code: '17', name: 'Meghalaya' },
  { code: '18', name: 'Assam' },
  { code: '19', name: 'West Bengal' },
  { code: '20', name: 'Jharkhand' },
  { code: '21', name: 'Odisha' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '24', name: 'Gujarat' },
  { code: '27', name: 'Maharashtra' },
  { code: '29', name: 'Karnataka' },
  { code: '30', name: 'Goa' },
  { code: '32', name: 'Kerala' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '37', name: 'Andhra Pradesh' },
];

const parseQuantity = (value: string, isUnitBased: boolean): number => {
  if (isUnitBased) {
    const parsed = parseInt(value, 10);
    return isNaN(parsed) || parsed < 1 ? 1 : parsed;
  }
  const parsed = parseFloat(value);
  if (isNaN(parsed) || parsed < 0.0001) return 0.0001;
  return Math.round(parsed * 10000) / 10000;
};

const defaultCustomItem: Omit<OrderLineItem, 'product_id'> & { product_id: null } = {
  product_id: null,
  product_name: '',
  quantity: 1,
  unit_price: 0,
  hsn_code: '',
  gst_type: 'Exempt',
  gst_rate: 0,
  is_custom: true,
  unit_type: 'weight_based',
  category: '',
  sku: '',
  save_to_catalog: false,
};

export function NewOrderDialog({ open, onOpenChange }: NewOrderDialogProps) {
  const queryClient = useQueryClient();
  
  // Customer details
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [buildingName, setBuildingName] = useState('');
  const [flatNumber, setFlatNumber] = useState('');
  const [shippingAddress, setShippingAddress] = useState('');
  const [shippingCity, setShippingCity] = useState('');
  const [shippingPostalCode, setShippingPostalCode] = useState('');
  const [placeOfSupply, setPlaceOfSupply] = useState('29');
  const [notes, setNotes] = useState('');
  const [discountType, setDiscountType] = useState<'none' | 'percentage' | 'flat'>('none');
  const [discountValue, setDiscountValue] = useState('0');
  
  // Line items
  const [lineItems, setLineItems] = useState<OrderLineItem[]>([
    { product_id: null, product_name: '', quantity: 1, unit_price: 0, hsn_code: '', gst_type: 'Exempt', gst_rate: 0 }
  ]);

  // Custom item dialog
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [customItemData, setCustomItemData] = useState<OrderLineItem>({ ...defaultCustomItem });

  // Fetch products
  const { data: products } = useQuery({
    queryKey: ['products'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('products')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch categories for custom item
  const { data: categories } = useQuery({
    queryKey: ['categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    }
  });

  // Fetch business settings
  const { data: businessSettings } = useQuery({
    queryKey: ['business-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .single();
      if (error) throw error;
      return data;
    }
  });

  const resetForm = () => {
    setCustomerEmail('');
    setCustomerPhone('');
    setBuildingName('');
    setFlatNumber('');
    setShippingAddress('');
    setShippingCity('');
    setShippingPostalCode('');
    setPlaceOfSupply('29');
    setNotes('');
    setLineItems([{ product_id: null, product_name: '', quantity: 1, unit_price: 0, hsn_code: '', gst_type: 'Exempt', gst_rate: 0 }]);
  };

  const addLineItem = () => {
    setLineItems([...lineItems, { product_id: null, product_name: '', quantity: 1, unit_price: 0, hsn_code: '', gst_type: 'Exempt', gst_rate: 0 }]);
  };

  const removeLineItem = (index: number) => {
    if (lineItems.length > 1) {
      setLineItems(lineItems.filter((_, i) => i !== index));
    }
  };

  const updateLineItem = (index: number, field: keyof OrderLineItem, value: any) => {
    const updated = [...lineItems];
    updated[index] = { ...updated[index], [field]: value };
    setLineItems(updated);
  };

  const selectProduct = (index: number, productId: string) => {
    const product = products?.find(p => p.id === productId);
    if (product) {
      const updated = [...lineItems];
      updated[index] = {
        product_id: product.id,
        product_name: product.name,
        quantity: lineItems[index].quantity || 1,
        unit_price: product.price,
        hsn_code: product.hsn_code || '',
        gst_type: product.gst_type || 'Exempt',
        gst_rate: product.gst_rate || 0
      };
      setLineItems(updated);
    }
  };

  // Custom item handlers
  const openCustomItemDialog = () => {
    setCustomItemData({ ...defaultCustomItem });
    setCustomItemOpen(true);
  };

  const validateCustomItem = (): string | null => {
    if (!customItemData.product_name.trim()) return 'Product name is required';
    if (customItemData.unit_price < 0) return 'Unit price cannot be negative';
    if (customItemData.gst_type === 'Taxable' && (customItemData.gst_rate < 0 || customItemData.gst_rate > 28)) {
      return 'GST rate must be between 0 and 28';
    }
    if (customItemData.save_to_catalog && !customItemData.category) {
      return 'Category is required when saving to catalog';
    }
    return null;
  };

  const addCustomItem = () => {
    const error = validateCustomItem();
    if (error) {
      toast.error(error);
      return;
    }

    const newItem: OrderLineItem = {
      product_id: null,
      product_name: customItemData.product_name.trim(),
      quantity: customItemData.quantity,
      unit_price: customItemData.unit_price,
      hsn_code: customItemData.hsn_code,
      gst_type: customItemData.gst_type,
      gst_rate: customItemData.gst_type === 'Taxable' ? customItemData.gst_rate : 0,
      is_custom: true,
      unit_type: customItemData.unit_type,
      category: customItemData.category,
      sku: customItemData.sku,
      save_to_catalog: customItemData.save_to_catalog,
    };

    // Replace the first empty line item or append
    const firstEmptyIndex = lineItems.findIndex(li => !li.product_name && !li.product_id);
    if (firstEmptyIndex >= 0) {
      const updated = [...lineItems];
      updated[firstEmptyIndex] = newItem;
      setLineItems(updated);
    } else {
      setLineItems([...lineItems, newItem]);
    }

    setCustomItemOpen(false);
    toast.success('Custom item added');
  };

  // Calculate if IGST applies
  const isIGST = businessSettings?.state_code !== placeOfSupply;

  // Calculate GST for each line item
  const calculateLineGST = (item: OrderLineItem) => {
    const taxableValue = item.quantity * item.unit_price;
    
    if (item.gst_type === 'Exempt' || item.gst_type === 'Nil-rated') {
      return { taxableValue, cgst: 0, sgst: 0, igst: 0, total: taxableValue };
    }
    
    const gstAmount = (taxableValue * item.gst_rate) / 100;
    
    if (isIGST) {
      return { taxableValue, cgst: 0, sgst: 0, igst: gstAmount, total: taxableValue + gstAmount };
    } else {
      const halfGst = gstAmount / 2;
      return { taxableValue, cgst: halfGst, sgst: halfGst, igst: 0, total: taxableValue + gstAmount };
    }
  };

  // Calculate totals
  const orderTotals = lineItems.reduce((acc, item) => {
    const gst = calculateLineGST(item);
    return {
      taxableValue: acc.taxableValue + gst.taxableValue,
      cgst: acc.cgst + gst.cgst,
      sgst: acc.sgst + gst.sgst,
      igst: acc.igst + gst.igst,
      total: acc.total + gst.total
    };
  }, { taxableValue: 0, cgst: 0, sgst: 0, igst: 0, total: 0 });

  const createOrderMutation = useMutation({
    mutationFn: async () => {
      // Validate
      if (lineItems.every(item => !item.product_name)) {
        throw new Error('Please add at least one item');
      }

      // Save custom items to catalog if requested
      const itemsToSave = lineItems.filter(item => item.is_custom && item.save_to_catalog && item.product_name);
      const gstTypeToDb = (t: string) => t === 'Nil-rated' ? 'nil' : t.toLowerCase();
      for (const item of itemsToSave) {
        const { data: newProduct, error: productError } = await supabase
          .from('products')
          .insert({
            name: item.product_name,
            category: item.category || 'Uncategorized',
            price: item.unit_price,
            unit: item.unit_type === 'unit_based' ? 'piece' : 'kg',
            pricing_model: item.unit_type || 'weight_based',
            hsn_code: item.hsn_code || null,
            gst_type: gstTypeToDb(item.gst_type),
            gst_rate: item.gst_rate,
            sku: item.sku || null,
            is_published: false, // Draft status
            in_stock: true,
          })
          .select()
          .single();

        if (productError) {
          console.error('Failed to save custom item to catalog:', productError);
          toast.error(`Failed to save "${item.product_name}" to catalog`);
        } else if (newProduct) {
          // Link the product_id so order_item references it
          item.product_id = newProduct.id;
        }
      }

      // Create order
      const { data: order, error: orderError } = await supabase
        .from('orders')
        .insert({
          customer_email: customerEmail || null,
          phone: customerPhone || null,
          building_name: buildingName || null,
          flat_number: flatNumber || null,
          shipping_address: shippingAddress || null,
          shipping_city: shippingCity || null,
          shipping_postal_code: shippingPostalCode || null,
          place_of_supply: placeOfSupply,
          is_igst: isIGST,
          notes: notes || null,
          total_amount: orderTotals.total,
          status: 'pending'
        })
        .select()
        .single();

      if (orderError) throw orderError;

      // Create order items
      const orderItems = lineItems
        .filter(item => item.product_name)
        .map(item => {
          const gst = calculateLineGST(item);
          return {
            order_id: order.id,
            product_id: item.product_id || null,
            product_name: item.product_name,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: gst.total,
            hsn_code: item.hsn_code || null,
            gst_type: item.gst_type,
            gst_rate: item.gst_rate,
            taxable_value: gst.taxableValue,
            cgst_amount: gst.cgst,
            sgst_amount: gst.sgst,
            igst_amount: gst.igst
          };
        });

      const { error: itemsError } = await supabase
        .from('order_items')
        .insert(orderItems);

      if (itemsError) throw itemsError;

      return order;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'products'] });
      queryClient.invalidateQueries({ queryKey: ['products'] });
      toast.success('Order created successfully');
      resetForm();
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error('Failed to create order: ' + error.message);
    }
  });

  const handleSubmit = () => {
    createOrderMutation.mutate();
  };

  return (
    <>
    <Dialog open={open} onOpenChange={(isOpen) => {
      if (!isOpen) resetForm();
      onOpenChange(isOpen);
    }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Create New Order</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {/* Customer Details */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Customer Email</Label>
              <Input
                type="email"
                value={customerEmail}
                onChange={(e) => setCustomerEmail(e.target.value)}
                placeholder="customer@example.com"
              />
            </div>
            <div className="space-y-2">
              <Label>Phone Number</Label>
              <Input
                value={customerPhone}
                onChange={(e) => setCustomerPhone(e.target.value)}
                placeholder="+91 9876543210"
              />
            </div>
          </div>

          {/* Shipping Address */}
          <div className="space-y-4">
            <h3 className="font-medium">Shipping Address</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Building / Apartment Name</Label>
                <Input
                  value={buildingName}
                  onChange={(e) => setBuildingName(e.target.value)}
                  placeholder="e.g. Prestige Lakeside Habitat"
                  maxLength={100}
                />
              </div>
              <div className="space-y-2">
                <Label>Flat / House Number</Label>
                <Input
                  value={flatNumber}
                  onChange={(e) => setFlatNumber(e.target.value)}
                  placeholder="e.g. A-402"
                  maxLength={20}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Street / Area</Label>
              <Textarea
                value={shippingAddress}
                onChange={(e) => setShippingAddress(e.target.value)}
                placeholder="Street address, area"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>City</Label>
                <Input
                  value={shippingCity}
                  onChange={(e) => setShippingCity(e.target.value)}
                  placeholder="City"
                />
              </div>
              <div className="space-y-2">
                <Label>Postal Code</Label>
                <Input
                  value={shippingPostalCode}
                  onChange={(e) => setShippingPostalCode(e.target.value)}
                  placeholder="560001"
                />
              </div>
              <div className="space-y-2">
                <Label>Place of Supply (State)</Label>
                <Select value={placeOfSupply} onValueChange={setPlaceOfSupply}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {INDIAN_STATES.map((state) => (
                      <SelectItem key={state.code} value={state.code}>
                        {state.code} - {state.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {businessSettings && (
              <p className="text-sm text-muted-foreground">
                Business State: {businessSettings.state_code} - {businessSettings.state_name} | 
                {isIGST ? ' IGST applicable (Inter-state)' : ' CGST/SGST applicable (Intra-state)'}
              </p>
            )}
          </div>

          {/* Line Items */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="font-medium">Order Items</h3>
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={openCustomItemDialog}>
                  <PackagePlus className="h-4 w-4 mr-1" /> Add Custom Item
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={addLineItem}>
                  <Plus className="h-4 w-4 mr-1" /> Add Item
                </Button>
              </div>
            </div>

            <div className="border rounded-lg overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[250px]">Product</TableHead>
                    <TableHead className="w-[80px]">Qty</TableHead>
                    <TableHead className="w-[100px]">Unit Price</TableHead>
                    <TableHead className="w-[100px]">HSN</TableHead>
                    <TableHead className="w-[120px]">GST Type</TableHead>
                    <TableHead className="w-[80px]">GST %</TableHead>
                    <TableHead className="w-[100px] text-right">Total</TableHead>
                    <TableHead className="w-[50px]"></TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {lineItems.map((item, index) => {
                    const lineTotal = calculateLineGST(item).total;
                    const isCustom = item.is_custom;
                    return (
                      <TableRow key={index}>
                        <TableCell>
                          {isCustom ? (
                            <div className="flex items-center gap-1.5">
                              <span className="text-sm truncate max-w-[180px]">{item.product_name}</span>
                              <Badge variant="secondary" className="text-xs shrink-0">Custom</Badge>
                            </div>
                          ) : (
                            <Select
                              value={item.product_id || ''}
                              onValueChange={(value) => selectProduct(index, value)}
                            >
                              <SelectTrigger>
                                <SelectValue placeholder="Select product" />
                              </SelectTrigger>
                              <SelectContent>
                                {products?.map((product) => (
                                  <SelectItem key={product.id} value={product.id}>
                                    {product.name} - ₹{product.price}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          )}
                        </TableCell>
                        <TableCell>
                          {(() => {
                            const isUnitBased = isCustom
                              ? item.unit_type === 'unit_based'
                              : products?.find(p => p.id === item.product_id)?.pricing_model === 'unit_based';
                            return (
                              <Input
                                type="number"
                                min={isUnitBased ? "1" : "0.0001"}
                                step={isUnitBased ? "1" : "0.0001"}
                                value={item.quantity}
                                onChange={(e) => updateLineItem(index, 'quantity', parseQuantity(e.target.value, !!isUnitBased))}
                                className="w-20"
                              />
                            );
                          })()}
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            step="0.01"
                            value={item.unit_price}
                            onChange={(e) => updateLineItem(index, 'unit_price', parseFloat(e.target.value) || 0)}
                            className="w-24"
                          />
                        </TableCell>
                        <TableCell>
                          <Input
                            value={item.hsn_code}
                            onChange={(e) => updateLineItem(index, 'hsn_code', e.target.value)}
                            className="w-24"
                            placeholder="HSN"
                          />
                        </TableCell>
                        <TableCell>
                          <Select
                            value={item.gst_type}
                            onValueChange={(value) => updateLineItem(index, 'gst_type', value)}
                          >
                            <SelectTrigger className="w-28">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Exempt">Exempt</SelectItem>
                              <SelectItem value="Nil-rated">Nil-rated</SelectItem>
                              <SelectItem value="Taxable">Taxable</SelectItem>
                            </SelectContent>
                          </Select>
                        </TableCell>
                        <TableCell>
                          <Input
                            type="number"
                            min="0"
                            max="28"
                            value={item.gst_rate}
                            onChange={(e) => updateLineItem(index, 'gst_rate', parseFloat(e.target.value) || 0)}
                            className="w-20"
                            disabled={item.gst_type !== 'Taxable'}
                          />
                        </TableCell>
                        <TableCell className="text-right font-medium">
                          ₹{lineTotal.toFixed(2)}
                        </TableCell>
                        <TableCell>
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => removeLineItem(index)}
                            disabled={lineItems.length === 1}
                          >
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {/* Totals */}
            <div className="flex justify-end">
              <div className="w-64 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Taxable Value:</span>
                  <span>₹{orderTotals.taxableValue.toFixed(2)}</span>
                </div>
                {isIGST ? (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">IGST:</span>
                    <span>₹{orderTotals.igst.toFixed(2)}</span>
                  </div>
                ) : (
                  <>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">CGST:</span>
                      <span>₹{orderTotals.cgst.toFixed(2)}</span>
                    </div>
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">SGST:</span>
                      <span>₹{orderTotals.sgst.toFixed(2)}</span>
                    </div>
                  </>
                )}
                <div className="flex justify-between font-bold border-t pt-2">
                  <span>Total:</span>
                  <span>₹{orderTotals.total.toFixed(2)}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes */}
          <div className="space-y-2">
            <Label>Notes (Optional)</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Any special instructions or notes..."
              rows={2}
            />
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-2 pt-4 border-t">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button 
              onClick={handleSubmit}
              disabled={createOrderMutation.isPending}
            >
              {createOrderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Create Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>

    {/* Custom Item Dialog */}
    <Dialog open={customItemOpen} onOpenChange={setCustomItemOpen}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Add Custom Item</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Product Name *</Label>
            <Input
              value={customItemData.product_name}
              onChange={(e) => setCustomItemData({ ...customItemData, product_name: e.target.value })}
              placeholder="Enter product name"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Unit Type</Label>
              <Select
                value={customItemData.unit_type || 'weight_based'}
                onValueChange={(value: 'weight_based' | 'unit_based') => setCustomItemData({ ...customItemData, unit_type: value, quantity: value === 'unit_based' ? 1 : customItemData.quantity })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="weight_based">Weight Based (per kg)</SelectItem>
                  <SelectItem value="unit_based">Unit Based (per piece)</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Unit Price (₹) *</Label>
              <Input
                type="number"
                min="0"
                step="0.01"
                value={customItemData.unit_price}
                onChange={(e) => setCustomItemData({ ...customItemData, unit_price: parseFloat(e.target.value) || 0 })}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Quantity</Label>
              <Input
                type="number"
                min={customItemData.unit_type === 'unit_based' ? '1' : '0.0001'}
                step={customItemData.unit_type === 'unit_based' ? '1' : '0.0001'}
                value={customItemData.quantity}
                onChange={(e) => setCustomItemData({ ...customItemData, quantity: parseQuantity(e.target.value, customItemData.unit_type === 'unit_based') })}
              />
            </div>
            <div className="space-y-2">
              <Label>HSN Code</Label>
              <Input
                value={customItemData.hsn_code}
                onChange={(e) => setCustomItemData({ ...customItemData, hsn_code: e.target.value })}
                placeholder="e.g. 0201"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>GST Type</Label>
              <Select
                value={customItemData.gst_type}
                onValueChange={(value) => setCustomItemData({ ...customItemData, gst_type: value, gst_rate: value === 'Taxable' ? customItemData.gst_rate : 0 })}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Exempt">Exempt</SelectItem>
                  <SelectItem value="Nil-rated">Nil-rated</SelectItem>
                  <SelectItem value="Taxable">Taxable</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>GST Rate (%)</Label>
              <Input
                type="number"
                min="0"
                max="28"
                value={customItemData.gst_rate}
                onChange={(e) => setCustomItemData({ ...customItemData, gst_rate: parseFloat(e.target.value) || 0 })}
                disabled={customItemData.gst_type !== 'Taxable'}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Category</Label>
              <Select
                value={customItemData.category || ''}
                onValueChange={(value) => setCustomItemData({ ...customItemData, category: value })}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  {categories?.map((cat) => (
                    <SelectItem key={cat.id} value={cat.name}>
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>SKU (Optional)</Label>
              <Input
                value={customItemData.sku || ''}
                onChange={(e) => setCustomItemData({ ...customItemData, sku: e.target.value })}
                placeholder="e.g. CUST-001"
              />
            </div>
          </div>

          <div className="flex items-center space-x-2 pt-2 border-t">
            <Checkbox
              id="save-to-catalog"
              checked={customItemData.save_to_catalog || false}
              onCheckedChange={(checked) => setCustomItemData({ ...customItemData, save_to_catalog: !!checked })}
            />
            <Label htmlFor="save-to-catalog" className="text-sm font-normal cursor-pointer">
              Save to Catalog (creates a draft product for future reuse)
            </Label>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => setCustomItemOpen(false)}>Cancel</Button>
            <Button onClick={addCustomItem}>
              <PackagePlus className="h-4 w-4 mr-1" /> Add to Order
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
    </>
  );
}
