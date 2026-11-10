import { Star } from 'lucide-react';
import { useGoogleRating, type GoogleReviewsContent } from '@/hooks/usePageContent';

const REVIEWS_URL = 'https://share.google/YgAiKvO7dRTtaVLq9';

const fallback: GoogleReviewsContent = { overallRating: 5.0, totalReviews: 61, reviews: [] };

export function TrustRow() {
  const c = useGoogleRating(fallback);
  const reviews = (c.reviews || []).slice(0, 3);
  return (
    <section className="py-8 bg-background">
      <div className="container mx-auto px-4">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-3 text-center">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }, (_, i) => (
              <Star
                key={i}
                className={`h-5 w-5 ${i < Math.round(Number(c.overallRating)) ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
              />
            ))}
          </div>
          <p className="font-body text-foreground">
            <span className="font-bold">{Number(c.overallRating).toFixed(1)}</span> from {c.totalReviews} Google reviews
          </p>
          <a
            href={REVIEWS_URL}
            target="_blank"
            rel="noopener noreferrer"
            className="text-primary font-medium hover:underline"
          >
            Read them on Google
          </a>
        </div>
        {reviews.length > 0 && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {reviews.map((r, i) => (
              <div key={i} className="bg-card border border-border rounded-xl p-4">
                <div className="flex gap-0.5 mb-2">
                  {Array.from({ length: 5 }, (_, j) => (
                    <Star
                      key={j}
                      className={`h-4 w-4 ${j < r.rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
                    />
                  ))}
                </div>
                <p className="text-sm text-muted-foreground leading-relaxed">{r.text}</p>
                <p className="text-sm font-medium text-foreground mt-3">
                  {r.author} <span className="text-xs text-muted-foreground font-normal">· {r.date}</span>
                </p>
              </div>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}
