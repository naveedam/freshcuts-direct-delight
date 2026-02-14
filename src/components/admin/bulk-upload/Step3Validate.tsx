import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { ArrowLeft, ArrowRight, CheckCircle, AlertTriangle } from 'lucide-react';
import type { ColumnMapping, ValidationResult, SystemFieldKey } from '@/types/bulk-upload';

interface Step3Props {
  rawData: Record<string, unknown>[];
  columnMapping: ColumnMapping;
  categories: { name: string; slug: string }[];
  existingSkus: string[];
  onValidationComplete: (results: ValidationResult[]) => void;
  onBack: () => void;
}

const VALID_GST_TYPES = ['exempt', 'nil', 'taxable'];
const VALID_UNITS = ['kg', 'g', 'unit', 'pack', 'piece', 'pcs', 'litre', 'ml', 'bottle', 'jar', 'can', 'box'];

function validateRow(
  row: Record<string, unknown>,
  mapping: ColumnMapping,
  rowIndex: number,
  categoryNames: string[],
  existingSkus: string[],
  seenSkus: Set<string>,
): ValidationResult {
  // Build mapped data
  const mappedData: Record<string, unknown> = {};
  for (const [excelCol, fieldKey] of Object.entries(mapping)) {
    if (fieldKey !== 'ignore') {
      mappedData[fieldKey] = row[excelCol];
    }
  }

  const errors: string[] = [];
  const warnings: string[] = [];

  // Required fields
  if (!mappedData.product_name || String(mappedData.product_name).trim() === '') errors.push('Product Name is required');
  if (!mappedData.category || String(mappedData.category).trim() === '') errors.push('Category is required');
  if (!mappedData.selling_price || isNaN(Number(mappedData.selling_price)) || Number(mappedData.selling_price) <= 0) errors.push('Selling Price must be a positive number');
  if (!mappedData.hsn_code || String(mappedData.hsn_code).trim() === '') errors.push('HSN Code is required');

  // GST validation
  const gstType = String(mappedData.gst_type || '').toLowerCase();
  if (!VALID_GST_TYPES.includes(gstType)) {
    errors.push(`GST Type must be one of: ${VALID_GST_TYPES.join(', ')}`);
  }
  const gstRate = Number(mappedData.gst_rate);
  if (isNaN(gstRate) || gstRate < 0) {
    errors.push('GST Rate must be a non-negative number');
  }
  if (gstType === 'exempt' && gstRate !== 0) warnings.push('GST Rate should be 0 for Exempt type');
  if (gstType === 'nil' && gstRate !== 0) warnings.push('GST Rate should be 0 for Nil type');

  // Category exists check
  const catName = String(mappedData.category || '').toLowerCase();
  if (catName && !categoryNames.some(c => c.toLowerCase() === catName)) {
    warnings.push(`Category "${mappedData.category}" not found — will use text value`);
  }

  // SKU duplicate check
  if (mappedData.sku) {
    const sku = String(mappedData.sku).trim();
    if (existingSkus.includes(sku)) errors.push(`SKU "${sku}" already exists`);
    if (seenSkus.has(sku)) errors.push(`Duplicate SKU "${sku}" in file`);
    seenSkus.add(sku);
  }

  // Numeric fields
  if (mappedData.mrp && (isNaN(Number(mappedData.mrp)) || Number(mappedData.mrp) < 0)) warnings.push('MRP should be a number');
  if (mappedData.stock_quantity && isNaN(Number(mappedData.stock_quantity))) warnings.push('Stock Quantity should be a number');

  // Unit type
  if (mappedData.unit_type) {
    const unit = String(mappedData.unit_type).toLowerCase();
    if (!VALID_UNITS.includes(unit)) warnings.push(`Unit "${mappedData.unit_type}" is non-standard`);
  }

  return { rowIndex, mappedData, errors, warnings, isValid: errors.length === 0 };
}

export function BulkUploadStep3({ rawData, columnMapping, categories, existingSkus, onValidationComplete, onBack }: Step3Props) {
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ValidationResult[] | null>(null);

  useEffect(() => {
    const categoryNames = categories.map(c => c.name);
    const seenSkus = new Set<string>();
    const allResults: ValidationResult[] = [];

    // Process in chunks to not block UI
    const CHUNK = 100;
    let i = 0;
    const processChunk = () => {
      const end = Math.min(i + CHUNK, rawData.length);
      for (; i < end; i++) {
        allResults.push(validateRow(rawData[i], columnMapping, i, categoryNames, existingSkus, seenSkus));
      }
      setProgress(Math.round((i / rawData.length) * 100));
      if (i < rawData.length) {
        requestAnimationFrame(processChunk);
      } else {
        setResults(allResults);
      }
    };
    processChunk();
  }, [rawData, columnMapping, categories, existingSkus]);

  const validCount = results?.filter(r => r.isValid).length ?? 0;
  const errorCount = results?.filter(r => !r.isValid).length ?? 0;
  const warningCount = results?.filter(r => r.warnings.length > 0).length ?? 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Validation</CardTitle>
        <CardDescription>Checking {rawData.length} rows for errors</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!results ? (
          <div className="space-y-2">
            <Progress value={progress} />
            <p className="text-sm text-muted-foreground text-center">Validating... {progress}%</p>
          </div>
        ) : (
          <>
            <div className="grid grid-cols-3 gap-4">
              <div className="p-4 rounded-lg bg-emerald-50 dark:bg-emerald-950/30 text-center">
                <CheckCircle className="h-6 w-6 mx-auto text-emerald-600 mb-1" />
                <p className="text-2xl font-bold text-emerald-700">{validCount}</p>
                <p className="text-xs text-muted-foreground">Valid rows</p>
              </div>
              <div className="p-4 rounded-lg bg-destructive/10 text-center">
                <AlertTriangle className="h-6 w-6 mx-auto text-destructive mb-1" />
                <p className="text-2xl font-bold text-destructive">{errorCount}</p>
                <p className="text-xs text-muted-foreground">Errors</p>
              </div>
              <div className="p-4 rounded-lg bg-amber-50 dark:bg-amber-950/30 text-center">
                <AlertTriangle className="h-6 w-6 mx-auto text-amber-600 mb-1" />
                <p className="text-2xl font-bold text-amber-700">{warningCount}</p>
                <p className="text-xs text-muted-foreground">Warnings</p>
              </div>
            </div>

            {errorCount > 0 && (
              <div className="rounded-md border border-destructive/30 max-h-[300px] overflow-auto">
                <div className="p-3 space-y-2">
                  {results.filter(r => !r.isValid).slice(0, 20).map(r => (
                    <div key={r.rowIndex} className="text-sm">
                      <span className="font-mono font-medium">Row {r.rowIndex + 2}:</span>{' '}
                      <span className="text-destructive">{r.errors.join('; ')}</span>
                    </div>
                  ))}
                  {errorCount > 20 && <p className="text-xs text-muted-foreground">...and {errorCount - 20} more errors</p>}
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <Button variant="outline" onClick={onBack}><ArrowLeft className="h-4 w-4 mr-2" /> Back</Button>
              <Button
                onClick={() => onValidationComplete(results)}
                disabled={validCount === 0}
              >
                Preview {validCount} valid rows <ArrowRight className="h-4 w-4 ml-2" />
              </Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
