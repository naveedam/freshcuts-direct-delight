import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { PageFrame } from '@/components/admin/TabbedAdminPage';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Plus, Loader2, Edit, Trash2, GripVertical, Layers } from 'lucide-react';
import { toast } from 'sonner';
import { Skeleton } from '@/components/ui/skeleton';
import { Category, CategoryForm, CategoryType, defaultCategoryForm, categoryTypeLabels } from '@/types/category';

export default function CategoriesAdmin({ embedded = false }: { embedded?: boolean } = {}) {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Category | null>(null);
  const [form, setForm] = useState<CategoryForm>(defaultCategoryForm);

  const { data: categories, isLoading } = useQuery({
    queryKey: ['admin', 'categories'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('categories')
        .select('*')
        .order('sort_order', { ascending: true });
      if (error) throw error;
      return data as Category[];
    }
  });

  const createMutation = useMutation({
    mutationFn: async (data: CategoryForm) => {
      const { error } = await supabase.from('categories').insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast.success('Category created successfully');
      closeDialog();
    },
    onError: (error) => {
      toast.error('Failed to create category: ' + error.message);
    }
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CategoryForm> }) => {
      const { error } = await supabase.from('categories').update(data).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast.success('Category updated successfully');
      closeDialog();
    },
    onError: (error) => {
      toast.error('Failed to update category: ' + error.message);
    }
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      // Check if any products use this category
      const { data: products } = await supabase
        .from('products')
        .select('id')
        .eq('category_id', id)
        .limit(1);

      if (products && products.length > 0) {
        throw new Error('Cannot delete category with associated products');
      }

      const { error } = await supabase.from('categories').delete().eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
      toast.success('Category deleted');
    },
    onError: (error) => {
      toast.error('Failed to delete: ' + error.message);
    }
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, is_active }: { id: string; is_active: boolean }) => {
      const { error } = await supabase.from('categories').update({ is_active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'categories'] });
    },
    onError: (error) => {
      toast.error('Failed to update: ' + error.message);
    }
  });

  const openCreateDialog = () => {
    setEditingCategory(null);
    setForm({
      ...defaultCategoryForm,
      sort_order: (categories?.length || 0) + 1,
    });
    setDialogOpen(true);
  };

  const openEditDialog = (category: Category) => {
    setEditingCategory(category);
    setForm({
      name: category.name,
      slug: category.slug,
      category_type: category.category_type,
      description: category.description || '',
      image_url: category.image_url || '',
      is_active: category.is_active,
      sort_order: category.sort_order,
    });
    setDialogOpen(true);
  };

  const closeDialog = () => {
    setDialogOpen(false);
    setEditingCategory(null);
    setForm(defaultCategoryForm);
  };

  const generateSlug = (name: string) => {
    return name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '');
  };

  const handleNameChange = (name: string) => {
    setForm(prev => ({
      ...prev,
      name,
      slug: editingCategory ? prev.slug : generateSlug(name),
    }));
  };

  const handleSubmit = () => {
    if (!form.name.trim()) {
      toast.error('Category name is required');
      return;
    }
    if (!form.slug.trim()) {
      toast.error('Category slug is required');
      return;
    }

    if (editingCategory) {
      updateMutation.mutate({ id: editingCategory.id, data: form });
    } else {
      createMutation.mutate(form);
    }
  };

  const getCategoryTypeBadge = (type: CategoryType) => {
    const styles: Record<CategoryType, string> = {
      fresh: 'bg-green-100 text-green-800 hover:bg-green-100',
      packaged: 'bg-blue-100 text-blue-800 hover:bg-blue-100',
      gourmet: 'bg-purple-100 text-purple-800 hover:bg-purple-100',
    };
    return <Badge className={styles[type]}>{categoryTypeLabels[type]}</Badge>;
  };

  const stats = {
    total: categories?.length || 0,
    active: categories?.filter(c => c.is_active).length || 0,
    fresh: categories?.filter(c => c.category_type === 'fresh').length || 0,
    packaged: categories?.filter(c => c.category_type === 'packaged').length || 0,
    gourmet: categories?.filter(c => c.category_type === 'gourmet').length || 0,
  };

  return (
    <PageFrame embedded={embedded}>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Categories</h1>
            <p className="font-body text-muted-foreground">Manage product categories</p>
          </div>
          <Button onClick={openCreateDialog}>
            <Plus className="h-4 w-4 mr-2" />
            Add Category
          </Button>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Total</CardDescription>
              <CardTitle className="text-2xl">{stats.total}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Active</CardDescription>
              <CardTitle className="text-2xl text-green-600">{stats.active}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Fresh</CardDescription>
              <CardTitle className="text-2xl">{stats.fresh}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Packaged</CardDescription>
              <CardTitle className="text-2xl">{stats.packaged}</CardTitle>
            </CardHeader>
          </Card>
          <Card>
            <CardHeader className="pb-2">
              <CardDescription>Gourmet</CardDescription>
              <CardTitle className="text-2xl">{stats.gourmet}</CardTitle>
            </CardHeader>
          </Card>
        </div>

        {/* Table */}
        <Card>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-6 space-y-4">
                {[...Array(5)].map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : !categories?.length ? (
              <div className="p-12 text-center text-muted-foreground">
                <Layers className="h-12 w-12 mx-auto mb-4 opacity-50" />
                <p>No categories found</p>
                <Button variant="link" onClick={openCreateDialog}>
                  Add your first category
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12">Order</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Slug</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Description</TableHead>
                    <TableHead className="text-center">Show on Website & WhatsApp</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <TableRow key={category.id}>
                      <TableCell className="text-center text-muted-foreground">
                        {category.sort_order}
                      </TableCell>
                      <TableCell className="font-medium">{category.name}</TableCell>
                      <TableCell className="font-mono text-sm text-muted-foreground">
                        {category.slug}
                      </TableCell>
                      <TableCell>{getCategoryTypeBadge(category.category_type)}</TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {category.description || '-'}
                      </TableCell>
                      <TableCell className="text-center">
                        <Switch
                          checked={category.is_active}
                          onCheckedChange={(checked) =>
                            toggleActiveMutation.mutate({ id: category.id, is_active: checked })
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => openEditDialog(category)}
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            onClick={() => {
                              if (confirm('Delete this category?')) {
                                deleteMutation.mutate(category.id);
                              }
                            }}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCategory ? 'Edit Category' : 'Add Category'}
            </DialogTitle>
            <DialogDescription>
              {editingCategory
                ? 'Update category details'
                : 'Create a new product category'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Category Name *</Label>
              <Input
                id="name"
                value={form.name}
                onChange={(e) => handleNameChange(e.target.value)}
                placeholder="e.g., Gourmet Foods"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="slug">Slug *</Label>
              <Input
                id="slug"
                value={form.slug}
                onChange={(e) => setForm(prev => ({ ...prev, slug: e.target.value }))}
                placeholder="e.g., gourmet-foods"
                className="font-mono"
              />
              <p className="text-xs text-muted-foreground">
                Used in URLs. Auto-generated from name.
              </p>
            </div>

            <div className="space-y-2">
              <Label htmlFor="category_type">Category Type *</Label>
              <Select
                value={form.category_type}
                onValueChange={(value: CategoryType) =>
                  setForm(prev => ({ ...prev, category_type: value }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="fresh">Fresh</SelectItem>
                  <SelectItem value="packaged">Packaged</SelectItem>
                  <SelectItem value="gourmet">Gourmet</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Description</Label>
              <Textarea
                id="description"
                value={form.description}
                onChange={(e) => setForm(prev => ({ ...prev, description: e.target.value }))}
                placeholder="Brief description of this category"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="sort_order">Sort Order</Label>
              <Input
                id="sort_order"
                type="number"
                value={form.sort_order}
                onChange={(e) => setForm(prev => ({ ...prev, sort_order: parseInt(e.target.value) || 0 }))}
                min="0"
              />
            </div>

            <div className="flex items-center gap-2">
              <Switch
                id="is_active"
                checked={form.is_active}
                onCheckedChange={(checked) => setForm(prev => ({ ...prev, is_active: checked }))}
              />
              <Label htmlFor="is_active">Active</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={createMutation.isPending || updateMutation.isPending}
            >
              {(createMutation.isPending || updateMutation.isPending) && (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              )}
              {editingCategory ? 'Update' : 'Create'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </PageFrame>
  );
}
