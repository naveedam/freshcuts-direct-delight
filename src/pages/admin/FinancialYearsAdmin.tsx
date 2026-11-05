import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Skeleton } from '@/components/ui/skeleton';
import { toast } from 'sonner';
import { CalendarDays, Plus, Pencil, CheckCircle2, Lock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useFinancialYears, FinancialYear } from '@/hooks/useFinancialYears';

interface FYForm {
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
}

function getDefaultFYName(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `FY ${year}–${String(year + 1).slice(2)}`;
}

function getDefaultStartDate(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() : now.getFullYear() - 1;
  return `${year}-04-01`;
}

function getDefaultEndDate(): string {
  const now = new Date();
  const year = now.getMonth() >= 3 ? now.getFullYear() + 1 : now.getFullYear();
  return `${year}-03-31`;
}

const emptyForm: FYForm = {
  name: getDefaultFYName(),
  start_date: getDefaultStartDate(),
  end_date: getDefaultEndDate(),
  is_active: false,
};

export default function FinancialYearsAdmin() {
  const queryClient = useQueryClient();
  const { data: financialYears, isLoading } = useFinancialYears();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingFY, setEditingFY] = useState<FinancialYear | null>(null);
  const [form, setForm] = useState<FYForm>(emptyForm);

  const openCreate = () => {
    setEditingFY(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (fy: FinancialYear) => {
    setEditingFY(fy);
    setForm({
      name: fy.name,
      start_date: fy.start_date,
      end_date: fy.end_date,
      is_active: fy.is_active,
    });
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (editingFY) {
        const { error } = await supabase
          .from('financial_years')
          .update({
            name: form.name,
            start_date: form.start_date,
            end_date: form.end_date,
            is_active: form.is_active,
          })
          .eq('id', editingFY.id);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('financial_years')
          .insert({
            name: form.name,
            start_date: form.start_date,
            end_date: form.end_date,
            is_active: form.is_active,
          });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-years'] });
      setDialogOpen(false);
      toast.success(editingFY ? 'Financial year updated' : 'Financial year created');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const activateMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financial_years')
        .update({ is_active: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-years'] });
      toast.success('Financial year activated');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const closeFYMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('financial_years')
        .update({ is_active: false })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['financial-years'] });
      toast.success('Financial year closed');
    },
    onError: (err: Error) => toast.error(err.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.start_date || !form.end_date) {
      toast.error('All fields are required');
      return;
    }
    if (form.start_date >= form.end_date) {
      toast.error('End date must be after start date');
      return;
    }
    saveMutation.mutate();
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground flex items-center gap-3">
              <CalendarDays className="h-8 w-8" />
              Financial Years
            </h1>
            <p className="font-body text-muted-foreground mt-1">
              Manage financial years for orders, invoices, and reports
            </p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> New Financial Year
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">All Financial Years</CardTitle>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map(i => <Skeleton key={i} className="h-12 w-full" />)}
              </div>
            ) : financialYears && financialYears.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Start Date</TableHead>
                    <TableHead>End Date</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {financialYears.map((fy) => (
                    <TableRow key={fy.id}>
                      <TableCell className="font-medium">{fy.name}</TableCell>
                      <TableCell>{format(new Date(fy.start_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>{format(new Date(fy.end_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>
                        {fy.is_active ? (
                          <Badge className="bg-emerald-100 text-emerald-800 border-emerald-200">Active</Badge>
                        ) : (
                          <Badge variant="secondary">Closed</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-right space-x-2">
                        <Button variant="ghost" size="sm" onClick={() => openEdit(fy)}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        {!fy.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => activateMutation.mutate(fy.id)}
                            disabled={activateMutation.isPending}
                          >
                            <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> Activate
                          </Button>
                        )}
                        {fy.is_active && (
                          <Button
                            variant="outline"
                            size="sm"
                            onClick={() => closeFYMutation.mutate(fy.id)}
                            disabled={closeFYMutation.isPending}
                          >
                            <Lock className="h-3.5 w-3.5 mr-1" /> Close
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-center text-muted-foreground py-8">
                No financial years created yet. Create your first one to get started.
              </p>
            )}
          </CardContent>
        </Card>

        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle>{editingFY ? 'Edit Financial Year' : 'Create Financial Year'}</DialogTitle>
            </DialogHeader>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="fy-name">Financial Year Name *</Label>
                <Input
                  id="fy-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. FY 2026–27"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="fy-start">Start Date *</Label>
                  <Input
                    id="fy-start"
                    type="date"
                    value={form.start_date}
                    onChange={(e) => setForm({ ...form, start_date: e.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="fy-end">End Date *</Label>
                  <Input
                    id="fy-end"
                    type="date"
                    value={form.end_date}
                    onChange={(e) => setForm({ ...form, end_date: e.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="fy-active"
                  checked={form.is_active}
                  onChange={(e) => setForm({ ...form, is_active: e.target.checked })}
                  className="rounded border-border"
                />
                <Label htmlFor="fy-active" className="text-sm">Set as active financial year</Label>
              </div>
              <p className="text-xs text-muted-foreground">
                Only one financial year can be active at a time. Activating this will deactivate others.
              </p>
              <Button type="submit" className="w-full" disabled={saveMutation.isPending}>
                {saveMutation.isPending ? (
                  <><Loader2 className="h-4 w-4 mr-2 animate-spin" /> Saving...</>
                ) : (
                  editingFY ? 'Update Financial Year' : 'Create Financial Year'
                )}
              </Button>
            </form>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
