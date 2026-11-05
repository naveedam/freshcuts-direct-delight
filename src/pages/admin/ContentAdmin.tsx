import { useState, useEffect } from 'react';
import { AdminLayout } from '@/components/admin/AdminLayout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Plus, Trash2 } from 'lucide-react';
import {
  usePageContent,
  useUpdatePageContent,
  HeroContent,
  WhyChooseUsContent,
  CTAContent,
  FooterContent,
  GoogleReviewsContent,
  GoogleReview,
} from '@/hooks/usePageContent';

function HeroEditor() {
  const { data: content, isLoading } = usePageContent<HeroContent>('hero');
  const updateMutation = useUpdatePageContent<HeroContent>('hero');
  const [form, setForm] = useState<HeroContent>({
    title: '',
    subtitle: '',
    description: '',
    primaryButtonText: '',
    secondaryButtonText: '',
  });

  useEffect(() => {
    if (content) setForm(content);
  }, [content]);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="hero-title">Title</Label>
        <Input
          id="hero-title"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hero-subtitle">Subtitle</Label>
        <Input
          id="hero-subtitle"
          value={form.subtitle}
          onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="hero-description">Description</Label>
        <Textarea
          id="hero-description"
          value={form.description}
          onChange={(e) => setForm({ ...form, description: e.target.value })}
          rows={3}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="hero-primary">Primary Button Text</Label>
          <Input
            id="hero-primary"
            value={form.primaryButtonText}
            onChange={(e) => setForm({ ...form, primaryButtonText: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="hero-secondary">Secondary Button Text</Label>
          <Input
            id="hero-secondary"
            value={form.secondaryButtonText}
            onChange={(e) => setForm({ ...form, secondaryButtonText: e.target.value })}
          />
        </div>
      </div>
      <Button
        onClick={() => updateMutation.mutate(form)}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
}

function WhyChooseUsEditor() {
  const { data: content, isLoading } = usePageContent<WhyChooseUsContent>('why_choose_us');
  const updateMutation = useUpdatePageContent<WhyChooseUsContent>('why_choose_us');
  const [form, setForm] = useState<WhyChooseUsContent>({
    title: '',
    subtitle: '',
    features: [],
  });

  useEffect(() => {
    if (content) setForm(content);
  }, [content]);

  const updateFeature = (index: number, field: string, value: string) => {
    const updated = [...form.features];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, features: updated });
  };

  const addFeature = () => {
    setForm({
      ...form,
      features: [...form.features, { icon: 'Star', title: '', description: '' }],
    });
  };

  const removeFeature = (index: number) => {
    const updated = form.features.filter((_, i) => i !== index);
    setForm({ ...form, features: updated });
  };

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="why-title">Section Title</Label>
          <Input
            id="why-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="why-subtitle">Section Subtitle</Label>
          <Textarea
            id="why-subtitle"
            value={form.subtitle}
            onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
            rows={2}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Features</Label>
          <Button variant="outline" size="sm" onClick={addFeature}>
            <Plus className="h-4 w-4 mr-1" /> Add Feature
          </Button>
        </div>
        {form.features.map((feature, index) => (
          <Card key={index} className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Feature {index + 1}</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeFeature(index)}
                  className="h-8 w-8 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Icon (Shield, Truck, Award, Clock, Leaf, Snowflake)</Label>
                  <Input
                    value={feature.icon}
                    onChange={(e) => updateFeature(index, 'icon', e.target.value)}
                    placeholder="e.g., Shield"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Title</Label>
                  <Input
                    value={feature.title}
                    onChange={(e) => updateFeature(index, 'title', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Description</Label>
                <Textarea
                  value={feature.description}
                  onChange={(e) => updateFeature(index, 'description', e.target.value)}
                  rows={2}
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Button
        onClick={() => updateMutation.mutate(form)}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
}

function CTAEditor() {
  const { data: content, isLoading } = usePageContent<CTAContent>('cta');
  const updateMutation = useUpdatePageContent<CTAContent>('cta');
  const [form, setForm] = useState<CTAContent>({
    title: '',
    description: '',
    buttonText: '',
    stats: [],
  });

  useEffect(() => {
    if (content) setForm(content);
  }, [content]);

  const updateStat = (index: number, field: string, value: string) => {
    const updated = [...form.stats];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, stats: updated });
  };

  const addStat = () => {
    setForm({
      ...form,
      stats: [...form.stats, { value: '', label: '' }],
    });
  };

  const removeStat = (index: number) => {
    const updated = form.stats.filter((_, i) => i !== index);
    setForm({ ...form, stats: updated });
  };

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="cta-title">Title</Label>
          <Input
            id="cta-title"
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cta-description">Description</Label>
          <Textarea
            id="cta-description"
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            rows={2}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="cta-button">Button Text</Label>
          <Input
            id="cta-button"
            value={form.buttonText}
            onChange={(e) => setForm({ ...form, buttonText: e.target.value })}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Stats</Label>
          <Button variant="outline" size="sm" onClick={addStat}>
            <Plus className="h-4 w-4 mr-1" /> Add Stat
          </Button>
        </div>
        {form.stats.map((stat, index) => (
          <div key={index} className="flex items-end gap-3">
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Value</Label>
              <Input
                value={stat.value}
                onChange={(e) => updateStat(index, 'value', e.target.value)}
                placeholder="e.g., 10,000+"
              />
            </div>
            <div className="flex-1 space-y-1">
              <Label className="text-xs">Label</Label>
              <Input
                value={stat.label}
                onChange={(e) => updateStat(index, 'label', e.target.value)}
                placeholder="e.g., Happy Customers"
              />
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => removeStat(index)}
              className="text-destructive"
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        ))}
      </div>

      <Button
        onClick={() => updateMutation.mutate(form)}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
}

function FooterEditor() {
  const { data: content, isLoading } = usePageContent<FooterContent>('footer');
  const updateMutation = useUpdatePageContent<FooterContent>('footer');
  const [form, setForm] = useState<FooterContent>({
    companyName: '',
    tagline: '',
    phone: '',
    email: '',
    address: '',
    workingHours: '',
  });

  useEffect(() => {
    if (content) setForm(content);
  }, [content]);

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="footer-company">Company Name</Label>
          <Input
            id="footer-company"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="footer-phone">Phone</Label>
          <Input
            id="footer-phone"
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="footer-tagline">Tagline</Label>
        <Textarea
          id="footer-tagline"
          value={form.tagline}
          onChange={(e) => setForm({ ...form, tagline: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footer-email">Email</Label>
        <Input
          id="footer-email"
          value={form.email}
          onChange={(e) => setForm({ ...form, email: e.target.value })}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footer-address">Address</Label>
        <Textarea
          id="footer-address"
          value={form.address}
          onChange={(e) => setForm({ ...form, address: e.target.value })}
          rows={2}
        />
      </div>
      <div className="space-y-2">
        <Label htmlFor="footer-hours">Working Hours</Label>
        <Input
          id="footer-hours"
          value={form.workingHours}
          onChange={(e) => setForm({ ...form, workingHours: e.target.value })}
          placeholder="e.g., Mon-Sat: 8AM - 8PM"
        />
      </div>
      <Button
        onClick={() => updateMutation.mutate(form)}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
}

function GoogleReviewsEditor() {
  const { data: content, isLoading } = usePageContent<GoogleReviewsContent>('google_reviews');
  const updateMutation = useUpdatePageContent<GoogleReviewsContent>('google_reviews');
  const [form, setForm] = useState<GoogleReviewsContent>({
    overallRating: 4.8,
    totalReviews: 156,
    reviews: [],
  });

  useEffect(() => {
    if (content) setForm(content);
  }, [content]);

  const updateReview = (index: number, field: keyof GoogleReview, value: string | number) => {
    const updated = [...form.reviews];
    updated[index] = { ...updated[index], [field]: value };
    setForm({ ...form, reviews: updated });
  };

  const addReview = () => {
    setForm({
      ...form,
      reviews: [...form.reviews, { author: '', rating: 5, date: '', text: '', avatar: '' }],
    });
  };

  const removeReview = (index: number) => {
    const updated = form.reviews.filter((_, i) => i !== index);
    setForm({ ...form, reviews: updated });
  };

  if (isLoading) return <Loader2 className="h-6 w-6 animate-spin mx-auto" />;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="overall-rating">Overall Rating</Label>
          <Input
            id="overall-rating"
            type="number"
            step="0.1"
            min="0"
            max="5"
            value={form.overallRating}
            onChange={(e) => setForm({ ...form, overallRating: parseFloat(e.target.value) || 0 })}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="total-reviews">Total Reviews Count</Label>
          <Input
            id="total-reviews"
            type="number"
            value={form.totalReviews}
            onChange={(e) => setForm({ ...form, totalReviews: parseInt(e.target.value) || 0 })}
          />
        </div>
      </div>

      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <Label className="text-base font-semibold">Reviews</Label>
          <Button variant="outline" size="sm" onClick={addReview}>
            <Plus className="h-4 w-4 mr-1" /> Add Review
          </Button>
        </div>
        {form.reviews.map((review, index) => (
          <Card key={index} className="p-4">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <Label className="font-medium">Review {index + 1}</Label>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => removeReview(index)}
                  className="h-8 w-8 text-destructive"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">Author Name</Label>
                  <Input
                    value={review.author}
                    onChange={(e) => updateReview(index, 'author', e.target.value)}
                    placeholder="e.g., Priya Sharma"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Avatar Initials</Label>
                  <Input
                    value={review.avatar}
                    onChange={(e) => updateReview(index, 'avatar', e.target.value)}
                    placeholder="e.g., PS"
                    maxLength={2}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Rating (1-5)</Label>
                  <Input
                    type="number"
                    min="1"
                    max="5"
                    value={review.rating}
                    onChange={(e) => updateReview(index, 'rating', parseInt(e.target.value) || 5)}
                  />
                </div>
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Date (e.g., "2 weeks ago")</Label>
                <Input
                  value={review.date}
                  onChange={(e) => updateReview(index, 'date', e.target.value)}
                  placeholder="e.g., 2 weeks ago"
                />
              </div>
              <div className="space-y-1">
                <Label className="text-xs">Review Text</Label>
                <Textarea
                  value={review.text}
                  onChange={(e) => updateReview(index, 'text', e.target.value)}
                  rows={2}
                  placeholder="Customer review text..."
                />
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Button
        onClick={() => updateMutation.mutate(form)}
        disabled={updateMutation.isPending}
      >
        {updateMutation.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
        Save Changes
      </Button>
    </div>
  );
}

export default function ContentAdmin() {
  return (
    <AdminLayout>
      <div className="space-y-4">
        <div>
          <h1 className="font-heading text-2xl font-bold">Page Content</h1>
          <p className="text-muted-foreground">Manage your website content</p>
        </div>

        <Tabs defaultValue="hero" className="w-full">
          <TabsList className="grid w-full grid-cols-5">
            <TabsTrigger value="hero">Hero</TabsTrigger>
            <TabsTrigger value="why">Why Choose Us</TabsTrigger>
            <TabsTrigger value="reviews">Reviews</TabsTrigger>
            <TabsTrigger value="cta">CTA Section</TabsTrigger>
            <TabsTrigger value="footer">Footer</TabsTrigger>
          </TabsList>
          <TabsContent value="hero">
            <Card>
              <CardHeader>
                <CardTitle>Hero Section</CardTitle>
                <CardDescription>Edit the main banner content on your homepage</CardDescription>
              </CardHeader>
              <CardContent>
                <HeroEditor />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="why">
            <Card>
              <CardHeader>
                <CardTitle>Why Choose Us</CardTitle>
                <CardDescription>Edit the features section highlighting your benefits</CardDescription>
              </CardHeader>
              <CardContent>
                <WhyChooseUsEditor />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="reviews">
            <Card>
              <CardHeader>
                <CardTitle>Google Reviews</CardTitle>
                <CardDescription>Manage customer reviews displayed on the homepage</CardDescription>
              </CardHeader>
              <CardContent>
                <GoogleReviewsEditor />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="cta">
            <Card>
              <CardHeader>
                <CardTitle>Call to Action</CardTitle>
                <CardDescription>Edit the promotional section with stats</CardDescription>
              </CardHeader>
              <CardContent>
                <CTAEditor />
              </CardContent>
            </Card>
          </TabsContent>
          <TabsContent value="footer">
            <Card>
              <CardHeader>
                <CardTitle>Footer Information</CardTitle>
                <CardDescription>Edit contact details and company info</CardDescription>
              </CardHeader>
              <CardContent>
                <FooterEditor />
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
