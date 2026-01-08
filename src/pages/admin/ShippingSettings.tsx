import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Loader2, Truck, Plus, Settings, Eye, EyeOff } from 'lucide-react';
import { toast } from 'sonner';

interface ShippingProvider {
  id: string;
  name: string;
  code: string;
  api_base_url: string | null;
  is_active: boolean;
  supported_cities: string[] | null;
  logo_url: string | null;
  created_at: string;
  updated_at: string;
}

export default function ShippingSettings() {
  const queryClient = useQueryClient();
  const [editingProvider, setEditingProvider] = useState<ShippingProvider | null>(null);
  const [showApiKey, setShowApiKey] = useState<Record<string, boolean>>({});
  const [apiKeys, setApiKeys] = useState<Record<string, string>>({});
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newProvider, setNewProvider] = useState({
    name: '',
    code: '',
    api_base_url: '',
    supported_cities: '',
  });

  const { data: providers, isLoading } = useQuery({
    queryKey: ['shipping-providers'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('shipping_providers')
        .select('*')
        .order('name');
      if (error) throw error;
      return data as ShippingProvider[];
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase
        .from('shipping_providers')
        .update({ is_active })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipping-providers'] });
      toast.success('Provider status updated');
    },
    onError: () => {
      toast.error('Failed to update provider status');
    },
  });

  const updateProviderMutation = useMutation({
    mutationFn: async (provider: Partial<ShippingProvider> & { id: string }) => {
      const { error } = await supabase
        .from('shipping_providers')
        .update({
          name: provider.name,
          api_base_url: provider.api_base_url,
          supported_cities: provider.supported_cities,
        })
        .eq('id', provider.id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipping-providers'] });
      toast.success('Provider updated successfully');
      setEditingProvider(null);
    },
    onError: () => {
      toast.error('Failed to update provider');
    },
  });

  const addProviderMutation = useMutation({
    mutationFn: async (provider: typeof newProvider) => {
      const { error } = await supabase
        .from('shipping_providers')
        .insert({
          name: provider.name,
          code: provider.code.toLowerCase().replace(/\s+/g, '_'),
          api_base_url: provider.api_base_url || null,
          supported_cities: provider.supported_cities 
            ? provider.supported_cities.split(',').map(c => c.trim()) 
            : [],
          is_active: true,
        });
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shipping-providers'] });
      toast.success('Provider added successfully');
      setIsAddingNew(false);
      setNewProvider({ name: '', code: '', api_base_url: '', supported_cities: '' });
    },
    onError: () => {
      toast.error('Failed to add provider');
    },
  });

  const handleSaveApiKey = (providerCode: string) => {
    const key = apiKeys[providerCode];
    if (!key) {
      toast.error('Please enter an API key');
      return;
    }
    // In a real implementation, this would save to Supabase secrets
    toast.info('API key management requires backend secrets configuration. Please add the API key as a secret in your backend settings.');
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
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Shipping Providers</h1>
            <p className="font-body text-muted-foreground mt-1">
              Manage your shipping providers and configure API integrations
            </p>
          </div>
          <Dialog open={isAddingNew} onOpenChange={setIsAddingNew}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="h-4 w-4 mr-2" />
                Add Provider
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Shipping Provider</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="space-y-2">
                  <Label htmlFor="name">Provider Name</Label>
                  <Input
                    id="name"
                    value={newProvider.name}
                    onChange={(e) => setNewProvider({ ...newProvider, name: e.target.value })}
                    placeholder="e.g., BlueDart"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="code">Provider Code</Label>
                  <Input
                    id="code"
                    value={newProvider.code}
                    onChange={(e) => setNewProvider({ ...newProvider, code: e.target.value })}
                    placeholder="e.g., bluedart"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="api_url">API Base URL (optional)</Label>
                  <Input
                    id="api_url"
                    value={newProvider.api_base_url}
                    onChange={(e) => setNewProvider({ ...newProvider, api_base_url: e.target.value })}
                    placeholder="https://api.provider.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="cities">Supported Cities (comma-separated)</Label>
                  <Input
                    id="cities"
                    value={newProvider.supported_cities}
                    onChange={(e) => setNewProvider({ ...newProvider, supported_cities: e.target.value })}
                    placeholder="Mumbai, Delhi, Bangalore"
                  />
                </div>
                <Button 
                  className="w-full" 
                  onClick={() => addProviderMutation.mutate(newProvider)}
                  disabled={!newProvider.name || !newProvider.code || addProviderMutation.isPending}
                >
                  {addProviderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Add Provider
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>

        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {providers?.map((provider) => (
            <Card key={provider.id} className={!provider.is_active ? 'opacity-60' : ''}>
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center">
                      <Truck className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <CardTitle className="text-lg">{provider.name}</CardTitle>
                      <CardDescription className="text-xs font-mono">{provider.code}</CardDescription>
                    </div>
                  </div>
                  <Switch
                    checked={provider.is_active}
                    onCheckedChange={(checked) => 
                      toggleActiveMutation.mutate({ id: provider.id, is_active: checked })
                    }
                  />
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Status</Label>
                  <div className="mt-1">
                    <Badge variant={provider.is_active ? 'default' : 'secondary'}>
                      {provider.is_active ? 'Active' : 'Inactive'}
                    </Badge>
                  </div>
                </div>

                {provider.supported_cities && provider.supported_cities.length > 0 && (
                  <div>
                    <Label className="text-xs text-muted-foreground">Supported Cities</Label>
                    <div className="mt-1 flex flex-wrap gap-1">
                      {provider.supported_cities.slice(0, 3).map((city) => (
                        <Badge key={city} variant="outline" className="text-xs">
                          {city}
                        </Badge>
                      ))}
                      {provider.supported_cities.length > 3 && (
                        <Badge variant="outline" className="text-xs">
                          +{provider.supported_cities.length - 3} more
                        </Badge>
                      )}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">API Key</Label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={showApiKey[provider.code] ? 'text' : 'password'}
                        placeholder="Enter API key..."
                        value={apiKeys[provider.code] || ''}
                        onChange={(e) => setApiKeys({ ...apiKeys, [provider.code]: e.target.value })}
                        className="pr-10"
                      />
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="absolute right-0 top-0 h-full"
                        onClick={() => setShowApiKey({ ...showApiKey, [provider.code]: !showApiKey[provider.code] })}
                      >
                        {showApiKey[provider.code] ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </Button>
                    </div>
                    <Button 
                      size="sm" 
                      variant="outline"
                      onClick={() => handleSaveApiKey(provider.code)}
                    >
                      Save
                    </Button>
                  </div>
                </div>

                <Dialog open={editingProvider?.id === provider.id} onOpenChange={(open) => !open && setEditingProvider(null)}>
                  <DialogTrigger asChild>
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="w-full"
                      onClick={() => setEditingProvider(provider)}
                    >
                      <Settings className="h-4 w-4 mr-2" />
                      Configure
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Configure {editingProvider?.name}</DialogTitle>
                    </DialogHeader>
                    {editingProvider && (
                      <div className="space-y-4 py-4">
                        <div className="space-y-2">
                          <Label htmlFor="edit-name">Provider Name</Label>
                          <Input
                            id="edit-name"
                            value={editingProvider.name}
                            onChange={(e) => setEditingProvider({ ...editingProvider, name: e.target.value })}
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-api-url">API Base URL</Label>
                          <Input
                            id="edit-api-url"
                            value={editingProvider.api_base_url || ''}
                            onChange={(e) => setEditingProvider({ ...editingProvider, api_base_url: e.target.value })}
                            placeholder="https://api.provider.com"
                          />
                        </div>
                        <div className="space-y-2">
                          <Label htmlFor="edit-cities">Supported Cities (comma-separated)</Label>
                          <Input
                            id="edit-cities"
                            value={editingProvider.supported_cities?.join(', ') || ''}
                            onChange={(e) => setEditingProvider({ 
                              ...editingProvider, 
                              supported_cities: e.target.value.split(',').map(c => c.trim()).filter(Boolean) 
                            })}
                            placeholder="Mumbai, Delhi, Bangalore"
                          />
                        </div>
                        <Button 
                          className="w-full" 
                          onClick={() => updateProviderMutation.mutate(editingProvider)}
                          disabled={updateProviderMutation.isPending}
                        >
                          {updateProviderMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                          Save Changes
                        </Button>
                      </div>
                    )}
                  </DialogContent>
                </Dialog>
              </CardContent>
            </Card>
          ))}
        </div>

        {(!providers || providers.length === 0) && (
          <Card className="p-12 text-center">
            <Truck className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="font-heading text-lg font-semibold mb-2">No Shipping Providers</h3>
            <p className="text-muted-foreground mb-4">Add your first shipping provider to start managing deliveries.</p>
            <Button onClick={() => setIsAddingNew(true)}>
              <Plus className="h-4 w-4 mr-2" />
              Add Provider
            </Button>
          </Card>
        )}
      </div>
    </AdminLayout>
  );
}
