import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, ArrowRight, Wand2 } from 'lucide-react';
import { SYSTEM_FIELDS, type ColumnMapping, type SystemFieldKey } from '@/types/bulk-upload';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

interface Step2Props {
  headers: string[];
  sampleData: Record<string, unknown>[];
  onMappingComplete: (mapping: ColumnMapping) => void;
  onBack: () => void;
}

const AUTO_MAP_HINTS: Record<SystemFieldKey, string[]> = {
  product_name: ['product name', 'name', 'product', 'item name', 'item', 'title'],
  category: ['category', 'cat', 'product category', 'type'],
  selling_price: ['selling price', 'price', 'sp', 'sell price', 'rate'],
  hsn_code: ['hsn', 'hsn code', 'hsn_code'],
  gst_type: ['gst type', 'gst_type', 'tax type'],
  gst_rate: ['gst rate', 'gst_rate', 'gst %', 'gst', 'tax rate'],
  sku: ['sku', 'sku code', 'product code', 'barcode', 'item code'],
  brand: ['brand', 'brand name', 'manufacturer'],
  description: ['description', 'desc', 'details', 'product description'],
  mrp: ['mrp', 'maximum retail price', 'max price'],
  unit_type: ['unit', 'unit type', 'uom', 'unit of measure'],
  stock_quantity: ['stock', 'stock quantity', 'qty', 'quantity', 'inventory'],
  is_active: ['active', 'is active', 'status', 'is_active'],
};

function autoMap(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedFields = new Set<string>();

  headers.forEach(header => {
    const normalized = header.toLowerCase().trim();
    for (const [field, hints] of Object.entries(AUTO_MAP_HINTS)) {
      if (!usedFields.has(field) && hints.some(h => normalized === h || normalized.includes(h))) {
        mapping[header] = field as SystemFieldKey;
        usedFields.add(field);
        return;
      }
    }
    mapping[header] = 'ignore';
  });

  return mapping;
}

export function BulkUploadStep2({ headers, sampleData, onMappingComplete, onBack }: Step2Props) {
  const [mapping, setMapping] = useState<ColumnMapping>(() => autoMap(headers));

  const requiredMapped = useMemo(() => {
    const mapped = new Set(Object.values(mapping).filter(v => v !== 'ignore'));
    return SYSTEM_FIELDS.filter(f => f.required).every(f => mapped.has(f.key));
  }, [mapping]);

  const updateMapping = (header: string, value: string) => {
    setMapping(prev => ({ ...prev, [header]: value as SystemFieldKey | 'ignore' }));
  };

  const mappedFields = new Set(Object.values(mapping).filter(v => v !== 'ignore'));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Map Columns</CardTitle>
        <CardDescription>Match your Excel columns to product fields. Extra columns can be ignored.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => setMapping(autoMap(headers))}>
          <Wand2 className="h-4 w-4 mr-2" /> Auto-detect Mapping
        </Button>

        <div className="rounded-md border overflow-auto max-h-[500px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[200px]">Excel Column</TableHead>
                <TableHead className="w-[80px]">Sample</TableHead>
                <TableHead className="w-[220px]">Map to Field</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {headers.map(header => (
                <TableRow key={header}>
                  <TableCell className="font-mono text-sm">{header}</TableCell>
                  <TableCell className="text-xs text-muted-foreground max-w-[120px] truncate">
                    {sampleData[0] ? String(sampleData[0][header] ?? '') : ''}
                  </TableCell>
                  <TableCell>
                    <Select value={mapping[header] || 'ignore'} onValueChange={(v) => updateMapping(header, v)}>
                      <SelectTrigger className="h-8">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="ignore">— Ignore —</SelectItem>
                        {SYSTEM_FIELDS.map(f => (
                          <SelectItem
                            key={f.key}
                            value={f.key}
                            disabled={mappedFields.has(f.key) && mapping[header] !== f.key}
                          >
                            {f.label} {f.required && <span className="text-destructive">*</span>}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex flex-wrap gap-1">
          {SYSTEM_FIELDS.filter(f => f.required).map(f => (
            <Badge key={f.key} variant={mappedFields.has(f.key) ? 'default' : 'destructive'}>
              {f.label} {mappedFields.has(f.key) ? '✓' : '✗'}
            </Badge>
          ))}
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
          <Button onClick={() => onMappingComplete(mapping)} disabled={!requiredMapped}>
            Continue <ArrowRight className="h-4 w-4 ml-2" />
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
