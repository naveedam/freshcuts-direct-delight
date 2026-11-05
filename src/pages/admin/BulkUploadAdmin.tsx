import { useState, useCallback } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { derivePricingModel } from '@/lib/weight-utils';
import { Progress } from '@/components/ui/progress';
import { Upload, ArrowRight, ArrowLeft, Check, AlertTriangle, FileSpreadsheet, Download } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

import { BulkUploadStep1 } from '@/components/admin/bulk-upload/Step1Upload';
import { BulkUploadStep2 } from '@/components/admin/bulk-upload/Step2Map';
import { BulkUploadStep3 } from '@/components/admin/bulk-upload/Step3Validate';
import { BulkUploadStep4 } from '@/components/admin/bulk-upload/Step4Preview';
import { BulkUploadStep5 } from '@/components/admin/bulk-upload/Step5Import';
import type { ColumnMapping, ParsedRow, ValidationResult, ImportState } from '@/types/bulk-upload';

const STEPS = ['Upload File', 'Map Columns', 'Validate', 'Preview', 'Import'];

export default function BulkUploadAdmin() {
  const { user } = useAuth();
  const [currentStep, setCurrentStep] = useState(0);
  const [importState, setImportState] = useState<ImportState>({
    fileName: '',
    rawHeaders: [],
    rawData: [],
    columnMapping: {},
    validationResults: [],
    isImporting: false,
    importProgress: 0,
    importLog: null,
  });

  const { data: categories = [] } = useQuery({
    queryKey: ['categories-for-bulk'],
    queryFn: async () => {
      const { data } = await supabase.from('categories').select('*').eq('is_active', true).order('name');
      return data || [];
    },
  });

  const { data: existingSkus = [] } = useQuery({
    queryKey: ['existing-skus'],
    queryFn: async () => {
      const { data } = await supabase.from('products').select('sku').not('sku', 'is', null);
      return (data || []).map(p => p.sku).filter(Boolean) as string[];
    },
  });

  const handleFileLoaded = useCallback((fileName: string, headers: string[], data: Record<string, unknown>[]) => {
    setImportState(prev => ({
      ...prev,
      fileName,
      rawHeaders: headers,
      rawData: data,
      columnMapping: {},
      validationResults: [],
    }));
    setCurrentStep(1);
  }, []);

  const handleMappingComplete = useCallback((mapping: ColumnMapping) => {
    setImportState(prev => ({ ...prev, columnMapping: mapping }));
    setCurrentStep(2);
  }, []);

  const handleValidationComplete = useCallback((results: ValidationResult[]) => {
    setImportState(prev => ({ ...prev, validationResults: results }));
    setCurrentStep(3);
  }, []);

  const handleImport = useCallback(async (validRows: ValidationResult[]) => {
    if (!user) return;

    setImportState(prev => ({ ...prev, isImporting: true, importProgress: 0 }));
    setCurrentStep(4);

    const BATCH_SIZE = 50;
    let successCount = 0;
    let failedCount = 0;
    const errors: { row: number; error: string }[] = [];

    for (let i = 0; i < validRows.length; i += BATCH_SIZE) {
      const batch = validRows.slice(i, i + BATCH_SIZE);
      const products = batch.map(r => {
        const row = r.mappedData;
        const categoryMatch = categories.find(
          c => c.name.toLowerCase() === String(row.category || '').toLowerCase() ||
               c.slug.toLowerCase() === String(row.category || '').toLowerCase()
        );
        return {
          name: String(row.product_name || ''),
          category: String(row.category || ''),
          category_id: categoryMatch?.id || null,
          description: row.description ? String(row.description) : null,
          price: Number(row.selling_price) || 0,
          mrp: row.mrp ? Number(row.mrp) : null,
          unit: String(row.unit_type || 'kg'),
          stock_quantity: row.stock_quantity ? Number(row.stock_quantity) : 0,
          in_stock: (row.stock_quantity ? Number(row.stock_quantity) > 0 : true),
          hsn_code: row.hsn_code ? String(row.hsn_code) : null,
          gst_type: String(row.gst_type || 'exempt').toLowerCase(),
          gst_rate: Number(row.gst_rate) || 0,
          sku: row.sku ? String(row.sku) : null,
          brand: row.brand ? String(row.brand) : null,
          is_published: false,
          pricing_model: derivePricingModel(String(row.unit_type || 'kg')),
        };
      });

      const { error } = await supabase.from('products').insert(products as any);
      if (error) {
        failedCount += batch.length;
        batch.forEach((_, idx) => errors.push({ row: i + idx + 1, error: error.message }));
      } else {
        successCount += batch.length;
      }

      setImportState(prev => ({
        ...prev,
        importProgress: Math.round(((i + batch.length) / validRows.length) * 100),
      }));
    }

    // Save audit log
    await supabase.from('bulk_import_logs').insert({
      admin_user_id: user.id,
      file_name: importState.fileName,
      total_rows: validRows.length,
      success_count: successCount,
      failed_count: failedCount,
      error_report: errors as any,
      column_mapping: importState.columnMapping as any,
      status: failedCount === 0 ? 'completed' : 'completed_with_errors',
    });

    setImportState(prev => ({
      ...prev,
      isImporting: false,
      importProgress: 100,
      importLog: { successCount, failedCount, errors },
    }));

    if (failedCount === 0) {
      toast.success(`Successfully imported ${successCount} products as drafts`);
    } else {
      toast.warning(`Imported ${successCount} products, ${failedCount} failed`);
    }
  }, [user, categories, importState.fileName, importState.columnMapping]);

  const resetWizard = () => {
    setCurrentStep(0);
    setImportState({
      fileName: '',
      rawHeaders: [],
      rawData: [],
      columnMapping: {},
      validationResults: [],
      isImporting: false,
      importProgress: 0,
      importLog: null,
    });
  };

  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-heading font-bold">Bulk Product Import</h1>
          <p className="text-muted-foreground">Upload Excel or CSV files to bulk-add products</p>
        </div>

        {/* Progress Steps */}
        <div className="flex items-center gap-2">
          {STEPS.map((step, idx) => (
            <div key={step} className="flex items-center gap-2">
              <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold
                ${idx < currentStep ? 'bg-primary text-primary-foreground' : 
                  idx === currentStep ? 'bg-primary text-primary-foreground ring-2 ring-primary/30' : 
                  'bg-muted text-muted-foreground'}`}>
                {idx < currentStep ? <Check className="h-4 w-4" /> : idx + 1}
              </div>
              <span className={`text-sm hidden sm:inline ${idx === currentStep ? 'font-medium' : 'text-muted-foreground'}`}>
                {step}
              </span>
              {idx < STEPS.length - 1 && <ArrowRight className="h-4 w-4 text-muted-foreground" />}
            </div>
          ))}
        </div>

        {/* Step Content */}
        {currentStep === 0 && (
          <BulkUploadStep1 onFileLoaded={handleFileLoaded} />
        )}
        {currentStep === 1 && (
          <BulkUploadStep2
            headers={importState.rawHeaders}
            sampleData={importState.rawData.slice(0, 3)}
            onMappingComplete={handleMappingComplete}
            onBack={() => setCurrentStep(0)}
          />
        )}
        {currentStep === 2 && (
          <BulkUploadStep3
            rawData={importState.rawData}
            columnMapping={importState.columnMapping}
            categories={categories}
            existingSkus={existingSkus}
            onValidationComplete={handleValidationComplete}
            onBack={() => setCurrentStep(1)}
          />
        )}
        {currentStep === 3 && (
          <BulkUploadStep4
            validationResults={importState.validationResults}
            onImport={handleImport}
            onBack={() => setCurrentStep(2)}
          />
        )}
        {currentStep === 4 && (
          <BulkUploadStep5
            importState={importState}
            onReset={resetWizard}
          />
        )}
      </div>
    </AdminLayout>
  );
}
