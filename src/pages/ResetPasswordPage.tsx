import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Lock, Eye, EyeOff, CheckCircle2, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';

const PASSWORD_RULES = [
  { label: 'At least 8 characters', test: (p: string) => p.length >= 8 },
  { label: 'One uppercase letter', test: (p: string) => /[A-Z]/.test(p) },
  { label: 'One lowercase letter', test: (p: string) => /[a-z]/.test(p) },
  { label: 'One number', test: (p: string) => /\d/.test(p) },
  { label: 'One special character (!@#$%^&*)', test: (p: string) => /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(p) },
];

const ResetPasswordPage = () => {
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [isValidSession, setIsValidSession] = useState(false);
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    // Listen for the PASSWORD_RECOVERY event from the URL token
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setIsValidSession(true);
        setChecking(false);
      }
    });

    // Also check if already in a recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      // Check URL hash for recovery type
      const hash = window.location.hash;
      if (hash.includes('type=recovery') || session) {
        setIsValidSession(true);
      }
      setChecking(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const allRulesPass = PASSWORD_RULES.every((r) => r.test(password));
  const passwordsMatch = password === confirmPassword && confirmPassword.length > 0;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!allRulesPass) {
      toast.error('Password does not meet requirements');
      return;
    }
    if (!passwordsMatch) {
      toast.error('Passwords do not match');
      return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });

      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Password updated successfully!');
        navigate('/auth');
      }
    } catch {
      toast.error('Something went wrong. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (checking) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex items-center justify-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      </Layout>
    );
  }

  if (!isValidSession) {
    return (
      <Layout>
        <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
          <div className="w-full max-w-md text-center">
            <div className="bg-card rounded-2xl border border-border p-8 shadow-card">
              <XCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
              <h1 className="font-heading text-2xl font-bold text-foreground mb-2">
                Invalid or Expired Link
              </h1>
              <p className="font-body text-muted-foreground mb-6">
                This password reset link is invalid or has expired. Please request a new one.
              </p>
              <Button variant="hero" onClick={() => navigate('/forgot-password')}>
                Request New Link
              </Button>
            </div>
          </div>
        </div>
      </Layout>
    );
  }

  return (
    <Layout>
      <div className="min-h-[80vh] flex items-center justify-center py-12 px-4">
        <div className="w-full max-w-md">
          <div className="text-center mb-8">
            <h1 className="font-heading text-3xl font-bold text-foreground mb-2">
              Set New Password
            </h1>
            <p className="font-body text-muted-foreground">
              Choose a strong password for your account
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border p-8 shadow-card">
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="space-y-2">
                <Label htmlFor="password" className="font-body">New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10 pr-10"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                  />
                  <button
                    type="button"
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    onClick={() => setShowPassword(!showPassword)}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Password strength rules */}
              <div className="space-y-1.5">
                {PASSWORD_RULES.map((rule) => {
                  const passes = rule.test(password);
                  return (
                    <div key={rule.label} className="flex items-center gap-2 text-xs font-body">
                      {password.length > 0 ? (
                        passes ? (
                          <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                        ) : (
                          <XCircle className="h-3.5 w-3.5 text-destructive" />
                        )
                      ) : (
                        <div className="h-3.5 w-3.5 rounded-full border border-muted-foreground/30" />
                      )}
                      <span className={password.length > 0 && passes ? 'text-green-600' : 'text-muted-foreground'}>
                        {rule.label}
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="space-y-2">
                <Label htmlFor="confirmPassword" className="font-body">Confirm New Password</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="••••••••"
                    className="pl-10"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    required
                  />
                </div>
                {confirmPassword.length > 0 && !passwordsMatch && (
                  <p className="text-xs text-destructive font-body">Passwords do not match</p>
                )}
              </div>

              <Button
                type="submit"
                variant="hero"
                size="lg"
                className="w-full"
                disabled={loading || !allRulesPass || !passwordsMatch}
              >
                {loading ? 'Updating...' : 'Update Password'}
              </Button>
            </form>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default ResetPasswordPage;
