import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface FinancialYear {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export function useFinancialYears() {
  return useQuery({
    queryKey: ['financial-years'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_years')
        .select('*')
        .order('start_date', { ascending: false });
      if (error) throw error;
      return (data || []) as FinancialYear[];
    }
  });
}

export function useActiveFinancialYear() {
  return useQuery({
    queryKey: ['financial-years', 'active'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('financial_years')
        .select('*')
        .eq('is_active', true)
        .maybeSingle();
      if (error) throw error;
      return data as FinancialYear | null;
    }
  });
}
