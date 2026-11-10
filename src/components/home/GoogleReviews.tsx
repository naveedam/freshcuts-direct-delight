import { Star } from 'lucide-react';
import { useGoogleRating, type GoogleReviewsContent } from '@/hooks/usePageContent';

const defaultContent: GoogleReviewsContent = {
  overallRating: 5.0,
  totalReviews: 61,
  reviews: [],
};

export function GoogleReviews() {
  const reviewsContent = useGoogleRating(defaultContent);

  const renderStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-4 w-4 ${i < rating ? 'fill-yellow-400 text-yellow-400' : 'text-muted-foreground/30'}`}
      />
    ));
  };

  return (
    <section className="py-16 bg-background">
      <div className="container mx-auto px-4">
        {/* Header with Google branding */}
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <svg viewBox="0 0 24 24" className="h-8 w-8">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
            <span className="text-2xl font-semibold text-foreground">Google Reviews</span>
          </div>
          
          {/* Overall rating */}
          <div className="flex items-center justify-center gap-4">
            <span className="text-5xl font-bold text-foreground">{Number(reviewsContent.overallRating).toFixed(1)}</span>
            <div className="text-left">
              <div className="flex gap-0.5">
                {renderStars(Math.round(reviewsContent.overallRating))}
              </div>
              <p className="text-sm text-muted-foreground mt-1">
                Based on {reviewsContent.totalReviews} Google reviews
              </p>
            </div>
          </div>
        </div>

        {/* Reviews grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
          {reviewsContent.reviews.map((review, index) => (
            <div
              key={index}
              className="bg-card border border-border rounded-xl p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              {/* Reviewer info */}
              <div className="flex items-center gap-3 mb-4">
                <div className="w-10 h-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold text-sm">
                  {review.avatar}
                </div>
                <div>
                  <p className="font-medium text-foreground">{review.author}</p>
                  <p className="text-xs text-muted-foreground">{review.date}</p>
                </div>
              </div>

              {/* Rating stars */}
              <div className="flex gap-0.5 mb-3">
                {renderStars(review.rating)}
              </div>

              {/* Review text */}
              <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                {review.text}
              </p>
            </div>
          ))}
        </div>

        {/* View all on Google link */}
        <div className="text-center mt-8">
          <a
            href="https://share.google/YgAiKvO7dRTtaVLq9"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-primary hover:text-primary/80 font-medium transition-colors"
          >
            Read all {reviewsContent.totalReviews} reviews on Google
            <svg className="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    </section>
  );
}
