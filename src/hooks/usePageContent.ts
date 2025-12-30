import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';

export interface HeroContent {
  title: string;
  subtitle: string;
  description: string;
  primaryButtonText: string;
  secondaryButtonText: string;
}

export interface WhyChooseUsFeature {
  icon: string;
  title: string;
  description: string;
}

export interface WhyChooseUsContent {
  title: string;
  subtitle: string;
  features: WhyChooseUsFeature[];
}

export interface CTAStat {
  value: string;
  label: string;
}

export interface CTAContent {
  title: string;
  description: string;
  buttonText: string;
  stats: CTAStat[];
}

export interface FooterContent {
  companyName: string;
  tagline: string;
  phone: string;
  email: string;
  address: string;
  workingHours: string;
}

export interface GoogleReview {
  author: string;
  rating: number;
  date: string;
  text: string;
  avatar: string;
}

export interface GoogleReviewsContent {
  overallRating: number;
  totalReviews: number;
  reviews: GoogleReview[];
}

type SectionKey = 'hero' | 'why_choose_us' | 'cta' | 'footer' | 'google_reviews';

export function usePageContent<T>(sectionKey: SectionKey) {
  return useQuery({
    queryKey: ['page-content', sectionKey],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_content')
        .select('content')
        .eq('section_key', sectionKey)
        .maybeSingle();

      if (error) throw error;
      return data?.content as T | null;
    },
  });
}

export function useUpdatePageContent<T>(sectionKey: SectionKey) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (content: T) => {
      const { error } = await supabase
        .from('page_content')
        .update({ content: JSON.parse(JSON.stringify(content)) })
        .eq('section_key', sectionKey);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['page-content', sectionKey] });
      toast.success('Content updated successfully');
    },
    onError: (error) => {
      toast.error('Failed to update content: ' + error.message);
    },
  });
}

export function useAllPageContent() {
  return useQuery({
    queryKey: ['page-content', 'all'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('page_content')
        .select('*')
        .order('section_key');

      if (error) throw error;
      return data;
    },
  });
}
