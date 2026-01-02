import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Loader2, Save, Building2 } from 'lucide-react';

interface BusinessSettings {
  id: string;
  business_name: string;
  address: string | null;
  city: string | null;
  postal_code: string | null;
  phone: string | null;
  email: string | null;
  gstin: string | null;
  logo_url: string | null;
}

export default function BusinessSettings() {
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<Partial<BusinessSettings>>({
    business_name: '',
    address: '',
    city: '',
    postal_code: '',
    phone: '',
    email: '',
    gstin: '',
    logo_url: ''
  });

  const { data: settings, isLoading } = useQuery({
    queryKey: ['business-settings'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('business_settings')
        .select('*')
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      return data as BusinessSettings | null;
    }
  });

  useEffect(() => {
    if (settings) {
      setFormData({
        business_name: settings.business_name || '',
        address: settings.address || '',
        city: settings.city || '',
        postal_code: settings.postal_code || '',
        phone: settings.phone || '',
        email: settings.email || '',
        gstin: settings.gstin || '',
        logo_url: settings.logo_url || ''
      });
    }
  }, [settings]);

  const saveMutation = useMutation({
    mutationFn: async (data: Partial<BusinessSettings>) => {
      if (settings?.id) {
        // Update existing
        const { error } = await supabase
          .from('business_settings')
          .update(data)
          .eq('id', settings.id);
        if (error) throw error;
      } else {
        // Insert new
        const { error } = await supabase
          .from('business_settings')
          .insert(data);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['business-settings'] });
      toast.success('Business settings saved successfully');
    },
    onError: (error) => {
      toast.error('Failed to save settings: ' + error.message);
    }
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    saveMutation.mutate(formData);
  };

  if (isLoading) {
    return (
      <AdminLayout>
        <div className="flex items-center justify-center h-64">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="space-y-6 max-w-2xl">
        <div>
          <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-3">
            <Building2 className="h-8 w-8" />
            Business Settings
          </h1>
          <p className="font-body text-muted-foreground mt-1">
            Configure your business details for invoices and shipping labels
          </p>
        </div>

        <form onSubmit={handleSubmit} className="bg-card border border-border rounded-lg p-6 space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="business_name">Business Name *</Label>
              <Input
                id="business_name"
                value={formData.business_name}
                onChange={(e) => setFormData({ ...formData, business_name: e.target.value })}
                placeholder="Your Business Name"
                required
              />
            </div>

            <div className="md:col-span-2 space-y-2">
              <Label htmlFor="address">Address</Label>
              <Input
                id="address"
                value={formData.address || ''}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Street address"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={formData.city || ''}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                placeholder="City"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="postal_code">Postal Code</Label>
              <Input
                id="postal_code"
                value={formData.postal_code || ''}
                onChange={(e) => setFormData({ ...formData, postal_code: e.target.value })}
                placeholder="Postal code"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={formData.phone || ''}
                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                placeholder="Business phone"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={formData.email || ''}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                placeholder="Business email"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="gstin">GSTIN</Label>
              <Input
                id="gstin"
                value={formData.gstin || ''}
                onChange={(e) => setFormData({ ...formData, gstin: e.target.value })}
                placeholder="GST Identification Number"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="logo_url">Logo URL</Label>
              <Input
                id="logo_url"
                value={formData.logo_url || ''}
                onChange={(e) => setFormData({ ...formData, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png"
              />
            </div>
          </div>

          <Button type="submit" disabled={saveMutation.isPending} className="w-full">
            {saveMutation.isPending ? (
              <>
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                Saving...
              </>
            ) : (
              <>
                <Save className="h-4 w-4 mr-2" />
                Save Settings
              </>
            )}
          </Button>
        </form>
      </div>
    </AdminLayout>
  );
}
