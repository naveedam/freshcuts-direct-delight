import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuth } from '@/context/AuthContext';
import { toast } from 'sonner';
import { Phone, Loader2, ArrowLeft } from 'lucide-react';
import { useNavigate } from 'react-router-dom';

export function PhoneAuth() {
  const navigate = useNavigate();
  const { signInWithPhone, verifyOtp } = useAuth();
  const [step, setStep] = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!phone.trim()) {
      toast.error('Please enter a phone number');
      return;
    }

    // Ensure phone number starts with country code
    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone; // Default to India
    }

    setLoading(true);
    try {
      const { error } = await signInWithPhone(formattedPhone);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('OTP sent to your phone!');
        setStep('otp');
      }
    } catch (err) {
      toast.error('Failed to send OTP');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!otp.trim() || otp.length !== 6) {
      toast.error('Please enter a valid 6-digit OTP');
      return;
    }

    let formattedPhone = phone.trim();
    if (!formattedPhone.startsWith('+')) {
      formattedPhone = '+91' + formattedPhone;
    }

    setLoading(true);
    try {
      const { error } = await verifyOtp(formattedPhone, otp);
      if (error) {
        toast.error(error.message);
      } else {
        toast.success('Phone verified successfully!');
        navigate('/');
      }
    } catch (err) {
      toast.error('Failed to verify OTP');
    } finally {
      setLoading(false);
    }
  };

  if (step === 'otp') {
    return (
      <form onSubmit={handleVerifyOtp} className="space-y-4">
        <button
          type="button"
          onClick={() => setStep('phone')}
          className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Change number
        </button>
        
        <div className="space-y-2">
          <Label htmlFor="otp">Enter OTP</Label>
          <p className="text-sm text-muted-foreground">
            We sent a 6-digit code to {phone}
          </p>
          <Input
            id="otp"
            type="text"
            placeholder="000000"
            maxLength={6}
            value={otp}
            onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
            className="text-center text-lg tracking-widest"
            required
          />
        </div>

        <Button type="submit" className="w-full" disabled={loading}>
          {loading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Verifying...
            </>
          ) : (
            'Verify OTP'
          )}
        </Button>
      </form>
    );
  }

  return (
    <form onSubmit={handleSendOtp} className="space-y-4">
      <div className="space-y-2">
        <Label htmlFor="phone">Phone Number</Label>
        <div className="relative">
          <Phone className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            id="phone"
            type="tel"
            placeholder="+91 9876543210"
            className="pl-10"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            required
          />
        </div>
        <p className="text-xs text-muted-foreground">
          Enter with country code (e.g., +91 for India)
        </p>
      </div>

      <Button type="submit" className="w-full" disabled={loading}>
        {loading ? (
          <>
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            Sending OTP...
          </>
        ) : (
          'Send OTP'
        )}
      </Button>
    </form>
  );
}
