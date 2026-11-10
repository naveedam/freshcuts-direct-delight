// Keeps the storefront's Google star rating and review count up to date.
//
// The storefront calls this function. It returns the rating saved in page_content
// ('google_reviews'). If that is more than REFRESH_HOURS old, it first asks Google
// Places for the latest rating and review count and saves them, so Google is asked
// only a few times a day however many people visit.
//
// Needs two secrets (Supabase → Edge Functions → Secrets):
//   GOOGLE_PLACES_API_KEY  an API key with "Places API (New)" enabled
//   GOOGLE_PLACE_ID        the shop's Place ID (e.g. ChIJ...)
// Without them it simply returns the saved numbers, as typed in Admin → Content.

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const REFRESH_HOURS = 6;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  const json = (body: unknown) =>
    new Response(JSON.stringify(body), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

  const { data: row } = await supabase
    .from('page_content')
    .select('content')
    .eq('section_key', 'google_reviews')
    .maybeSingle();
  const content: Record<string, unknown> = (row?.content as Record<string, unknown>) || {};
  const saved = {
    overallRating: Number(content.overallRating ?? 5),
    totalReviews: Number(content.totalReviews ?? 0),
    fetchedAt: (content.fetchedAt as string) || null,
    live: false,
  };

  const key = Deno.env.get('GOOGLE_PLACES_API_KEY');
  const placeId = Deno.env.get('GOOGLE_PLACE_ID');
  const fresh =
    saved.fetchedAt && Date.now() - new Date(saved.fetchedAt).getTime() < REFRESH_HOURS * 3600_000;
  if (!key || !placeId) return json(saved);
  if (fresh) return json({ ...saved, live: true });

  try {
    const res = await fetch(`https://places.googleapis.com/v1/places/${encodeURIComponent(placeId)}`, {
      headers: { 'X-Goog-Api-Key': key, 'X-Goog-FieldMask': 'rating,userRatingCount' },
    });
    if (!res.ok) throw new Error(`Google answered ${res.status}: ${await res.text()}`);
    const place = await res.json();
    if (typeof place.rating !== 'number') throw new Error('No rating in the reply');

    const next = {
      ...content,
      overallRating: place.rating,
      totalReviews: place.userRatingCount ?? saved.totalReviews,
      fetchedAt: new Date().toISOString(),
    };
    if (row) {
      await supabase.from('page_content').update({ content: next }).eq('section_key', 'google_reviews');
    } else {
      await supabase.from('page_content').insert({ section_key: 'google_reviews', content: next });
    }
    return json({ overallRating: next.overallRating, totalReviews: next.totalReviews, fetchedAt: next.fetchedAt, live: true });
  } catch (e) {
    console.error('google-rating:', e);
    return json(saved); // keep showing the last good numbers
  }
});
