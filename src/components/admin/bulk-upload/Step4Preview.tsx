import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Upload, AlertTriangle } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import type { ValidationResult } from '@/types/bulk-upload';

interface Step4Props {
  validationResults: ValidationResult[];
  onImport: (validRows: ValidationResult[]) => void;
  onBack: () => void;
}

export function BulkUploadStep4({ validationResults, onImport, onBack }: Step4Props) {
  const validRows = useMemo(() => validationResults.filter(r => r.isValid), [validationResults]);
  const preview = validRows.slice(0, 10);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Preview Import</CardTitle>
        <CardDescription>
          Showing first {Math.min(10, validRows.length)} of {validRows.length} valid products.
          All will be created as <Badge variant="secondary">Draft</Badge> — not published until you activate them.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="rounded-md border overflow-auto max-h-[400px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>#</TableHead>
                <TableHead>Product Name</TableHead>
                <TableHead>Category</TableHead>
                <TableHead>Price</TableHead>
                <TableHead>HSN</TableHead>
                <TableHead>GST</TableHead>
                <TableHead>SKU</TableHead>
                <TableHead>Warnings</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {preview.map(r => (
                <TableRow key={r.rowIndex}>
                  <TableCell className="font-mono text-xs">{r.rowIndex + 2}</TableCell>
                  <TableCell className="font-medium">{String(r.mappedData.product_name || '')}</TableCell>
                  <TableCell>{String(r.mappedData.category || '')}</TableCell>
                  <TableCell>₹{Number(r.mappedData.selling_price || 0).toFixed(2)}</TableCell>
                  <TableCell className="font-mono text-xs">{String(r.mappedData.hsn_code || '')}</TableCell>
                  <TableCell>
                    <span className="text-xs">{String(r.mappedData.gst_type || '')} {Number(r.mappedData.gst_rate || 0)}%</span>
                  </TableCell>
                  <TableCell className="font-mono text-xs">{String(r.mappedData.sku || '—')}</TableCell>
                  <TableCell>
                    {r.warnings.length > 0 && (
                      <Badge variant="outline" className="text-amber-600">
                        <AlertTriangle className="h-3 w-3 mr-1" />{r.warnings.length}
                      </Badge>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>

        <div className="flex justify-between">
          <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
          <Button onClick={() => onImport(validRows)}>
            <Upload className="h-4 w-4 mr-2" /> Import {validRows.length} Products as Draft
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
