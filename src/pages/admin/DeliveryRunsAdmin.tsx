import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Textarea } from '@/components/ui/textarea';
import { formatCurrency } from '@/lib/currency';
import { toast } from 'sonner';
import { Truck, Plus, Loader2, Trash2, Edit, IndianRupee } from 'lucide-react';
import { format } from 'date-fns';

interface DeliveryRun {
  id: string;
  run_date: string;
  driver_name: string | null;
  vehicle: string | null;
  total_cost: number;
  cost_allocation_method: string;
  notes: string | null;
  created_at: string;
  orders?: { id: string; order_id: string; allocated_cost: number }[];
}

export default function DeliveryRunsAdmin() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingRun, setEditingRun] = useState<DeliveryRun | null>(null);
  const [runDate, setRunDate] = useState(new Date().toISOString().split('T')[0]);
  const [driverName, setDriverName] = useState('');
  const [vehicle, setVehicle] = useState('');
  const [totalCost, setTotalCost] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<Set<string>>(new Set());

  const { data: deliveryRuns, isLoading } = useQuery({
    queryKey: ['admin', 'delivery-runs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('delivery_runs')
        .select('*')
        .order('run_date', { ascending: false });
      if (error) throw error;

      // Fetch associated orders for each run
      const runIds = (data || []).map(r => r.id);
      if (runIds.length === 0) return [];

      const { data: runOrders } = await supabase
        .from('delivery_run_orders')
        .select('id, delivery_run_id, order_id, allocated_cost')
        .in('delivery_run_id', runIds);

      return (data || []).map(run => ({
        ...run,
        orders: (runOrders || []).filter(ro => ro.delivery_run_id === run.id),
      })) as DeliveryRun[];
    }
  });

  // Fetch unassigned orders for selection (today's or recent pending/processing)
  const { data: availableOrders } = useQuery({
    queryKey: ['admin', 'delivery-run-available-orders'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('orders')
        .select('id, building_name, flat_number, total_amount, status, created_at')
        .in('status', ['pending', 'processing', 'shipped'])
        .order('created_at', { ascending: false })
        .limit(100);
      if (error) throw error;
      return data || [];
    }
  });

  // Fetch already-assigned order IDs
  const assignedOrderIds = useMemo(() => {
    if (!deliveryRuns) return new Set<string>();
    const ids = new Set<string>();
    deliveryRuns.forEach(r => r.orders?.forEach(o => ids.add(o.order_id)));
    return ids;
  }, [deliveryRuns]);

  const unassignedOrders = useMemo(() => {
    if (!availableOrders) return [];
    return availableOrders.filter(o => !assignedOrderIds.has(o.id));
  }, [availableOrders, assignedOrderIds]);

  const resetForm = () => {
    setRunDate(new Date().toISOString().split('T')[0]);
    setDriverName('');
    setVehicle('');
    setTotalCost('');
    setNotes('');
    setSelectedOrderIds(new Set());
    setEditingRun(null);
  };

  const openCreate = () => {
    resetForm();
    setDialogOpen(true);
  };

  const openEdit = (run: DeliveryRun) => {
    setEditingRun(run);
    setRunDate(run.run_date);
    setDriverName(run.driver_name || '');
    setVehicle(run.vehicle || '');
    setTotalCost(String(run.total_cost));
    setNotes(run.notes || '');
    setSelectedOrderIds(new Set(run.orders?.map(o => o.order_id) || []));
    setDialogOpen(true);
  };

  const saveMutation = useMutation({
    mutationFn: async () => {
      const cost = parseFloat(totalCost) || 0;
      const orderIds = Array.from(selectedOrderIds);
      const costPerOrder = orderIds.length > 0 ? cost / orderIds.length : 0;

      if (editingRun) {
        // Update run
        const { error } = await supabase
          .from('delivery_runs')
          .update({ run_date: runDate, driver_name: driverName || null, vehicle: vehicle || null, total_cost: cost, notes: notes || null })
          .eq('id', editingRun.id);
        if (error) throw error;

        // Delete old orders and re-insert
        await supabase.from('delivery_run_orders').delete().eq('delivery_run_id', editingRun.id);

        if (orderIds.length > 0) {
          const { error: insertErr } = await supabase.from('delivery_run_orders').insert(
            orderIds.map(oid => ({ delivery_run_id: editingRun.id, order_id: oid, allocated_cost: costPerOrder }))
          );
          if (insertErr) throw insertErr;
        }

        // Update shipping_cost on each order
        for (const oid of orderIds) {
          await supabase.from('orders').update({ shipping_cost: costPerOrder }).eq('id', oid);
        }
        // Clear shipping cost for removed orders
        const removedOrders = (editingRun.orders || []).filter(o => !selectedOrderIds.has(o.order_id));
        for (const ro of removedOrders) {
          await supabase.from('orders').update({ shipping_cost: 0 }).eq('id', ro.order_id);
        }
      } else {
        // Create new run
        const { data: run, error } = await supabase
          .from('delivery_runs')
          .insert({ run_date: runDate, driver_name: driverName || null, vehicle: vehicle || null, total_cost: cost, notes: notes || null })
          .select()
          .single();
        if (error) throw error;

        if (orderIds.length > 0) {
          const { error: insertErr } = await supabase.from('delivery_run_orders').insert(
            orderIds.map(oid => ({ delivery_run_id: run.id, order_id: oid, allocated_cost: costPerOrder }))
          );
          if (insertErr) throw insertErr;

          // Update shipping_cost on each order
          for (const oid of orderIds) {
            await supabase.from('orders').update({ shipping_cost: costPerOrder }).eq('id', oid);
          }
        }
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'delivery-runs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'delivery-run-available-orders'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'dashboard-orders'] });
      toast.success(editingRun ? 'Delivery run updated' : 'Delivery run created');
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => toast.error('Error: ' + error.message),
  });

  const deleteMutation = useMutation({
    mutationFn: async (runId: string) => {
      // Clear shipping cost for orders in this run
      const run = deliveryRuns?.find(r => r.id === runId);
      if (run?.orders) {
        for (const o of run.orders) {
          await supabase.from('orders').update({ shipping_cost: 0 }).eq('id', o.order_id);
        }
      }
      await supabase.from('delivery_run_orders').delete().eq('delivery_run_id', runId);
      const { error } = await supabase.from('delivery_runs').delete().eq('id', runId);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin', 'delivery-runs'] });
      queryClient.invalidateQueries({ queryKey: ['admin', 'delivery-run-available-orders'] });
      toast.success('Delivery run deleted');
    },
    onError: (error) => toast.error('Error: ' + error.message),
  });

  const toggleOrder = (orderId: string) => {
    setSelectedOrderIds(prev => {
      const next = new Set(prev);
      if (next.has(orderId)) next.delete(orderId);
      else next.add(orderId);
      return next;
    });
  };

  const costPerOrder = selectedOrderIds.size > 0 ? (parseFloat(totalCost) || 0) / selectedOrderIds.size : 0;

  // Stats
  const todayRuns = deliveryRuns?.filter(r => r.run_date === new Date().toISOString().split('T')[0]) || [];
  const todayTotalCost = todayRuns.reduce((s, r) => s + Number(r.total_cost), 0);
  const todayTotalOrders = todayRuns.reduce((s, r) => s + (r.orders?.length || 0), 0);

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="font-heading text-3xl font-bold text-foreground">Delivery Runs</h1>
            <p className="font-body text-muted-foreground">Route-based shipping cost management</p>
          </div>
          <Button onClick={openCreate}>
            <Plus className="h-4 w-4 mr-2" /> Create Run
          </Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today's Runs</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{todayRuns.length}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today's Shipping Cost</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{formatCurrency(todayTotalCost)}</p></CardContent>
          </Card>
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Today's Deliveries</CardTitle></CardHeader>
            <CardContent><p className="text-2xl font-bold">{todayTotalOrders}</p></CardContent>
          </Card>
        </div>

        {/* Runs table */}
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Driver</TableHead>
                  <TableHead>Vehicle</TableHead>
                  <TableHead className="text-right">Total Cost</TableHead>
                  <TableHead className="text-center">Orders</TableHead>
                  <TableHead className="text-right">Cost/Order</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow><TableCell colSpan={7} className="text-center py-8">Loading...</TableCell></TableRow>
                ) : deliveryRuns && deliveryRuns.length > 0 ? (
                  deliveryRuns.map(run => (
                    <TableRow key={run.id}>
                      <TableCell>{format(new Date(run.run_date), 'dd MMM yyyy')}</TableCell>
                      <TableCell>{run.driver_name || '-'}</TableCell>
                      <TableCell>{run.vehicle || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{formatCurrency(run.total_cost)}</TableCell>
                      <TableCell className="text-center">
                        <Badge variant="secondary">{run.orders?.length || 0}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        {run.orders && run.orders.length > 0
                          ? formatCurrency(run.total_cost / run.orders.length)
                          : '-'}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openEdit(run)}>
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => deleteMutation.mutate(run.id)}>
                            <Trash2 className="h-4 w-4 text-destructive" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : (
                  <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No delivery runs yet</TableCell></TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {/* Create/Edit Dialog */}
        <Dialog open={dialogOpen} onOpenChange={(open) => { if (!open) resetForm(); setDialogOpen(open); }}>
          <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Truck className="h-5 w-5" />
                {editingRun ? 'Edit Delivery Run' : 'Create Delivery Run'}
              </DialogTitle>
              <DialogDescription>Assign orders to a delivery route and allocate shipping costs.</DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div>
                  <Label>Date</Label>
                  <Input type="date" value={runDate} onChange={e => setRunDate(e.target.value)} />
                </div>
                <div>
                  <Label>Driver Name</Label>
                  <Input value={driverName} onChange={e => setDriverName(e.target.value)} placeholder="Driver" />
                </div>
                <div>
                  <Label>Vehicle</Label>
                  <Input value={vehicle} onChange={e => setVehicle(e.target.value)} placeholder="Vehicle" />
                </div>
                <div>
                  <Label>Total Cost (₹)</Label>
                  <Input type="number" value={totalCost} onChange={e => setTotalCost(e.target.value)} placeholder="0" />
                </div>
              </div>

              <div>
                <Label>Notes</Label>
                <Textarea value={notes} onChange={e => setNotes(e.target.value)} placeholder="Route details..." className="h-16" />
              </div>

              {/* Order Selection */}
              <div>
                <Label className="mb-2 block">Select Orders ({selectedOrderIds.size} selected)</Label>
                {selectedOrderIds.size > 0 && (
                  <div className="flex items-center gap-2 mb-2 p-2 bg-muted/50 rounded">
                    <IndianRupee className="h-4 w-4" />
                    <span className="text-sm">Cost per order: <strong>{formatCurrency(costPerOrder)}</strong></span>
                  </div>
                )}
                <div className="border rounded-lg max-h-60 overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10"></TableHead>
                        <TableHead>Order</TableHead>
                        <TableHead>Building</TableHead>
                        <TableHead>Flat</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="text-right">Amount</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {unassignedOrders.length > 0 ? unassignedOrders.map(o => (
                        <TableRow key={o.id} className="cursor-pointer" onClick={() => toggleOrder(o.id)}>
                          <TableCell>
                            <Checkbox checked={selectedOrderIds.has(o.id)} onCheckedChange={() => toggleOrder(o.id)} />
                          </TableCell>
                          <TableCell className="text-xs font-mono">#{o.id.slice(0, 8)}</TableCell>
                          <TableCell className="text-sm">{o.building_name || '-'}</TableCell>
                          <TableCell className="text-sm">{o.flat_number || '-'}</TableCell>
                          <TableCell><Badge variant="outline" className="text-xs">{o.status}</Badge></TableCell>
                          <TableCell className="text-right text-sm">{formatCurrency(o.total_amount)}</TableCell>
                        </TableRow>
                      )) : (
                        <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">No unassigned orders</TableCell></TableRow>
                      )}
                      {/* Show currently assigned orders for editing */}
                      {editingRun?.orders?.map(ro => {
                        const order = availableOrders?.find(o => o.id === ro.order_id);
                        if (!order || unassignedOrders.find(u => u.id === order.id)) return null;
                        return (
                          <TableRow key={order.id} className="cursor-pointer" onClick={() => toggleOrder(order.id)}>
                            <TableCell>
                              <Checkbox checked={selectedOrderIds.has(order.id)} onCheckedChange={() => toggleOrder(order.id)} />
                            </TableCell>
                            <TableCell className="text-xs font-mono">#{order.id.slice(0, 8)}</TableCell>
                            <TableCell className="text-sm">{order.building_name || '-'}</TableCell>
                            <TableCell className="text-sm">{order.flat_number || '-'}</TableCell>
                            <TableCell><Badge variant="outline" className="text-xs">{order.status}</Badge></TableCell>
                            <TableCell className="text-right text-sm">{formatCurrency(order.total_amount)}</TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => { setDialogOpen(false); resetForm(); }}>Cancel</Button>
              <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {editingRun ? 'Update Run' : 'Create Run'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
