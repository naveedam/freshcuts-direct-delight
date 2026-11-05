import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export function useServedCommunities() {
  return useQuery({
    queryKey: ['served-communities'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('served_communities')
        .select('name')
        .eq('is_public', true)
        .order('name');
      if (error) throw error;
      return (data || []).map((c: any) => c.name as string);
    },
    staleTime: 5 * 60 * 1000,
  });
}
