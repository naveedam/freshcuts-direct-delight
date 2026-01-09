import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { Plus, Edit, Trash2, AlertCircle } from "lucide-react";
import type { GSTConfig, GSTType } from "@/types/gst";
import { GST_RATES } from "@/types/gst";

export default function GSTConfigAdmin() {
  const queryClient = useQueryClient();
  const [isAddOpen, setIsAddOpen] = useState(false);
  const [editingConfig, setEditingConfig] = useState<GSTConfig | null>(null);
  const [formData, setFormData] = useState({
    category: "",
    hsn_code: "",
    description: "",
    default_gst_type: "nil" as GSTType,
    default_gst_rate: 0,
    is_configurable: false,
    notes: "",
  });

  const { data: gstConfigs, isLoading } = useQuery({
    queryKey: ["gst-configs"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("gst_config")
        .select("*")
        .order("category", { ascending: true });
      
      if (error) throw error;
      return data as GSTConfig[];
    },
  });

  const addMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      const { error } = await supabase.from("gst_config").insert([data]);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gst-configs"] });
      toast.success("GST configuration added");
      setIsAddOpen(false);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to add GST configuration: " + error.message);
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: typeof formData }) => {
      const { error } = await supabase
        .from("gst_config")
        .update(data)
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gst-configs"] });
      toast.success("GST configuration updated");
      setEditingConfig(null);
      resetForm();
    },
    onError: (error) => {
      toast.error("Failed to update GST configuration: " + error.message);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("gst_config").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["gst-configs"] });
      toast.success("GST configuration deleted");
    },
    onError: (error) => {
      toast.error("Failed to delete GST configuration: " + error.message);
    },
  });

  const resetForm = () => {
    setFormData({
      category: "",
      hsn_code: "",
      description: "",
      default_gst_type: "nil",
      default_gst_rate: 0,
      is_configurable: false,
      notes: "",
    });
  };

  const openEditDialog = (config: GSTConfig) => {
    setEditingConfig(config);
    setFormData({
      category: config.category,
      hsn_code: config.hsn_code,
      description: config.description || "",
      default_gst_type: config.default_gst_type as GSTType,
      default_gst_rate: config.default_gst_rate,
      is_configurable: config.is_configurable,
      notes: config.notes || "",
    });
  };

  const handleSubmit = () => {
    if (!formData.category || !formData.hsn_code) {
      toast.error("Category and HSN code are required");
      return;
    }

    if (editingConfig) {
      updateMutation.mutate({ id: editingConfig.id, data: formData });
    } else {
      addMutation.mutate(formData);
    }
  };

  const getGSTTypeBadge = (gstType: string) => {
    switch (gstType) {
      case "exempt":
        return <Badge className="bg-yellow-100 text-yellow-800 hover:bg-yellow-100">Exempt</Badge>;
      case "nil":
        return <Badge className="bg-blue-100 text-blue-800 hover:bg-blue-100">NIL (0%)</Badge>;
      case "taxable":
        return <Badge className="bg-green-100 text-green-800 hover:bg-green-100">Taxable</Badge>;
      default:
        return <Badge variant="secondary">{gstType}</Badge>;
    }
  };

  // Group configs by category
  const groupedConfigs = gstConfigs?.reduce((acc, config) => {
    if (!acc[config.category]) {
      acc[config.category] = [];
    }
    acc[config.category].push(config);
    return acc;
  }, {} as Record<string, GSTConfig[]>);

  return (
    <AdminLayout>
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold">GST Configuration</h1>
          <p className="text-muted-foreground">
            Manage HSN codes and GST rates for product categories
          </p>
        </div>
        <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
          <DialogTrigger asChild>
            <Button onClick={resetForm}>
              <Plus className="h-4 w-4 mr-2" />
              Add HSN Code
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add GST Configuration</DialogTitle>
              <DialogDescription>
                Configure HSN code and default GST treatment for a product category
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Category *</Label>
                  <Select
                    value={formData.category}
                    onValueChange={(v) => setFormData({ ...formData, category: v })}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="Select category" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Meat">Meat</SelectItem>
                      <SelectItem value="Seafood">Seafood</SelectItem>
                      <SelectItem value="Fruits">Fruits</SelectItem>
                      <SelectItem value="Vegetables">Vegetables</SelectItem>
                      <SelectItem value="Dairy">Dairy</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>HSN Code *</Label>
                  <Input
                    value={formData.hsn_code}
                    onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                    placeholder="e.g., 0204"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>Description</Label>
                <Input
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="e.g., Fresh/Chilled Lamb/Mutton"
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>Default GST Type</Label>
                  <Select
                    value={formData.default_gst_type}
                    onValueChange={(v) => setFormData({ ...formData, default_gst_type: v as GSTType })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="exempt">Exempt</SelectItem>
                      <SelectItem value="nil">NIL Rated (0%)</SelectItem>
                      <SelectItem value="taxable">Taxable</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>Default GST Rate (%)</Label>
                  <Select
                    value={formData.default_gst_rate.toString()}
                    onValueChange={(v) => setFormData({ ...formData, default_gst_rate: parseInt(v) })}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {GST_RATES.map((rate) => (
                        <SelectItem key={rate} value={rate.toString()}>
                          {rate}%
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
              <div className="flex items-center space-x-2">
                <input
                  type="checkbox"
                  id="is_configurable"
                  checked={formData.is_configurable}
                  onChange={(e) => setFormData({ ...formData, is_configurable: e.target.checked })}
                  className="rounded"
                />
                <Label htmlFor="is_configurable" className="cursor-pointer">
                  Allow product-level override (e.g., Paneer can be exempt or taxable)
                </Label>
              </div>
              <div className="space-y-2">
                <Label>Notes</Label>
                <Input
                  value={formData.notes}
                  onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                  placeholder="Additional notes about this configuration"
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsAddOpen(false)}>
                Cancel
              </Button>
              <Button onClick={handleSubmit} disabled={addMutation.isPending}>
                Add Configuration
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-yellow-500" />
            GST Rules for Food Items
          </CardTitle>
        </CardHeader>
        <CardContent className="text-sm text-muted-foreground space-y-2">
          <p>• <strong>Fresh unbranded meat, fish, fruits, vegetables:</strong> NIL rated (0% GST)</p>
          <p>• <strong>Fresh milk:</strong> NIL rated (0% GST)</p>
          <p>• <strong>Paneer/Cheese (loose, cut-to-order):</strong> Exempt from GST</p>
          <p>• <strong>Paneer/Cheese (pre-packed, branded):</strong> Taxable @ 5% GST</p>
          <p>• <strong>Processed/branded food items:</strong> Taxable @ 5% or higher</p>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-4">
          {[1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-24 w-full" />
          ))}
        </div>
      ) : (
        <div className="space-y-6">
          {groupedConfigs && Object.entries(groupedConfigs).map(([category, configs]) => (
            <Card key={category}>
              <CardHeader>
                <CardTitle>{category}</CardTitle>
                <CardDescription>{configs.length} HSN code(s) configured</CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>HSN Code</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>GST Type</TableHead>
                      <TableHead>Rate</TableHead>
                      <TableHead>Configurable</TableHead>
                      <TableHead>Notes</TableHead>
                      <TableHead className="text-right">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {configs.map((config) => (
                      <TableRow key={config.id}>
                        <TableCell className="font-mono font-medium">
                          {config.hsn_code}
                        </TableCell>
                        <TableCell>{config.description || "-"}</TableCell>
                        <TableCell>{getGSTTypeBadge(config.default_gst_type)}</TableCell>
                        <TableCell>{config.default_gst_rate}%</TableCell>
                        <TableCell>
                          {config.is_configurable ? (
                            <Badge variant="outline">Yes</Badge>
                          ) : (
                            <span className="text-muted-foreground">No</span>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[200px] truncate text-muted-foreground">
                          {config.notes || "-"}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => openEditDialog(config)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              onClick={() => {
                                if (confirm("Delete this GST configuration?")) {
                                  deleteMutation.mutate(config.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-500" />
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Edit Dialog */}
      <Dialog open={!!editingConfig} onOpenChange={(open) => !open && setEditingConfig(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit GST Configuration</DialogTitle>
            <DialogDescription>
              Update HSN code and GST settings
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Category *</Label>
                <Select
                  value={formData.category}
                  onValueChange={(v) => setFormData({ ...formData, category: v })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select category" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Meat">Meat</SelectItem>
                    <SelectItem value="Seafood">Seafood</SelectItem>
                    <SelectItem value="Fruits">Fruits</SelectItem>
                    <SelectItem value="Vegetables">Vegetables</SelectItem>
                    <SelectItem value="Dairy">Dairy</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>HSN Code *</Label>
                <Input
                  value={formData.hsn_code}
                  onChange={(e) => setFormData({ ...formData, hsn_code: e.target.value })}
                  placeholder="e.g., 0204"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>Description</Label>
              <Input
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder="e.g., Fresh/Chilled Lamb/Mutton"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Default GST Type</Label>
                <Select
                  value={formData.default_gst_type}
                  onValueChange={(v) => setFormData({ ...formData, default_gst_type: v as GSTType })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="exempt">Exempt</SelectItem>
                    <SelectItem value="nil">NIL Rated (0%)</SelectItem>
                    <SelectItem value="taxable">Taxable</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Default GST Rate (%)</Label>
                <Select
                  value={formData.default_gst_rate.toString()}
                  onValueChange={(v) => setFormData({ ...formData, default_gst_rate: parseInt(v) })}
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {GST_RATES.map((rate) => (
                      <SelectItem key={rate} value={rate.toString()}>
                        {rate}%
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex items-center space-x-2">
              <input
                type="checkbox"
                id="edit_is_configurable"
                checked={formData.is_configurable}
                onChange={(e) => setFormData({ ...formData, is_configurable: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="edit_is_configurable" className="cursor-pointer">
                Allow product-level override
              </Label>
            </div>
            <div className="space-y-2">
              <Label>Notes</Label>
              <Input
                value={formData.notes}
                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                placeholder="Additional notes"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingConfig(null)}>
              Cancel
            </Button>
            <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
              Save Changes
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AdminLayout>
  );
}
