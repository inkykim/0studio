import { useAuth } from "@/contexts/AuthContext";
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CheckCircle2, GraduationCap, Building2, ArrowLeft, Loader2 } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { TitleBar } from "@/components/TitleBar";
import { ModelProvider } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";
import { useState, useEffect } from "react";
import { toast } from "sonner";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

export default function Dashboard() {
  const { user, paymentPlan, hasVerifiedPlan, refreshPaymentStatus } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState<string | null>(null);

  // Handle success/cancel from Stripe redirect
  useEffect(() => {
    const success = searchParams.get('success');
    const canceled = searchParams.get('canceled');
    
    if (success) {
      toast.success('Payment successful! Your plan is now active.');
      refreshPaymentStatus?.();
      // Clean up URL
      navigate('/dashboard', { replace: true });
    } else if (canceled) {
      toast.info('Payment canceled. You can try again anytime.');
      navigate('/dashboard', { replace: true });
    }
  }, [searchParams, navigate, refreshPaymentStatus]);

  const handleCheckout = async (lookupKey: string | null, planName: string, priceId?: string) => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    const loadingKey = lookupKey || priceId || 'checkout';
    setLoading(loadingKey);
    try {
      const { supabase } = await import('@/lib/supabase');
      
      // Get current session
      let { data: { session }, error: sessionError } = await supabase.auth.getSession();
      
      if (sessionError) {
        console.error('Session error:', sessionError);
        throw new Error('Failed to get session');
      }
      
      // If no session or expired, try to refresh
      if (!session) {
        throw new Error('Not authenticated. Please sign in again.');
      }
      
      // Check if token is expired (basic check)
      if (session.expires_at && session.expires_at < Date.now() / 1000) {
        console.log('Token expired, refreshing...');
        const { data: { session: newSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (refreshError || !newSession) {
          throw new Error('Session expired. Please sign in again.');
        }
        session = newSession;
      }
      
      if (!session?.access_token) {
        throw new Error('Not authenticated. Please sign in again.');
      }
      
      console.log('Making request to:', `${BACKEND_URL}/api/stripe/create-checkout-session`);
      
      const requestBody: { lookup_key?: string; price_id?: string } = {};
      if (lookupKey) {
        requestBody.lookup_key = lookupKey;
      } else if (priceId) {
        requestBody.price_id = priceId;
      }
      
      const response = await fetch(`${BACKEND_URL}/api/stripe/create-checkout-session`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session.access_token}`,
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        const errorMessage = error.error || 'Failed to create checkout session';
        if (error.hint) {
          console.error('Stripe error:', error);
          throw new Error(`${errorMessage}. ${error.hint}`);
        }
        throw new Error(errorMessage);
      }

      const data = await response.json();
      
      // Redirect to Stripe Checkout
      if (data.url) {
        window.location.href = data.url;
      } else {
        throw new Error('No checkout URL received');
      }
    } catch (error) {
      console.error('Checkout error:', error);
      toast.error(error instanceof Error ? error.message : 'Failed to start checkout');
      setLoading(null);
    }
  };

  return (
    <VersionControlProvider>
      <ModelProvider>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <TitleBar />
      <div className="flex-1 overflow-auto">
        <div className="max-w-4xl mx-auto p-8 space-y-8">
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold mb-2">Dashboard</h1>
              <p className="text-muted-foreground">
                {user?.email}
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => navigate('/')}
              className="gap-2"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to App
            </Button>
          </div>

          {/* Payment Plan Selection */}
          <div>
            <h2 className="text-xl font-semibold mb-4">Select Your Payment Plan</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Choose a plan to unlock all features. Without a verified plan, you can make commits but cannot pull from cloud storage.
            </p>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Student Plan */}
              <Card className={paymentPlan === 'student' ? 'border-primary ring-2 ring-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-blue-500/10">
                      <GraduationCap className="w-6 h-6 text-blue-400" />
                    </div>
                    <div>
                      <CardTitle>Student</CardTitle>
                      <CardDescription>Perfect for students and individual creators</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Unlimited commits</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Cloud storage access</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Pull from cloud storage</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>All core features</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={paymentPlan === 'student' ? 'default' : 'outline'}
                    onClick={() => handleCheckout(null, 'student', 'price_1SpIuQBU9neqC79tYoTbDCck')}
                    disabled={loading !== null || paymentPlan === 'student'}
                  >
                    {loading === 'price_1SpIuQBU9neqC79tYoTbDCck' || loading === 'checkout' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : paymentPlan === 'student' ? (
                      'Active'
                    ) : (
                      'Subscribe - $10/month'
                    )}
                  </Button>
                </CardFooter>
              </Card>

              {/* Enterprise Plan */}
              <Card className={paymentPlan === 'enterprise' ? 'border-primary ring-2 ring-primary' : ''}>
                <CardHeader>
                  <div className="flex items-center gap-3 mb-2">
                    <div className="p-2 rounded-lg bg-purple-500/10">
                      <Building2 className="w-6 h-6 text-purple-400" />
                    </div>
                    <div>
                      <CardTitle>Enterprise</CardTitle>
                      <CardDescription>For teams and professional workflows</CardDescription>
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <ul className="space-y-2 text-sm">
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Everything in Student</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Priority support</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Advanced collaboration</span>
                    </li>
                    <li className="flex items-start gap-2">
                      <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                      <span>Team management</span>
                    </li>
                  </ul>
                </CardContent>
                <CardFooter>
                  <Button
                    className="w-full"
                    variant={paymentPlan === 'enterprise' ? 'default' : 'outline'}
                    onClick={() => handleCheckout('0studio_Fricionless_-_Enterprise-XXXXX', 'enterprise')}
                    disabled={loading !== null || paymentPlan === 'enterprise'}
                  >
                    {loading === '0studio_Fricionless_-_Enterprise-XXXXX' ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        Processing...
                      </>
                    ) : paymentPlan === 'enterprise' ? (
                      'Active'
                    ) : (
                      'Contact Sales'
                    )}
                  </Button>
                </CardFooter>
              </Card>
            </div>
          </div>

          {/* Current Status */}
          {hasVerifiedPlan && (
            <Card className="bg-primary/5 border-primary/20">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-green-500" />
                  Plan Active
                </CardTitle>
                <CardDescription>
                  Your {paymentPlan === 'student' ? 'Student' : 'Enterprise'} plan is active. All features are unlocked.
                </CardDescription>
              </CardHeader>
            </Card>
          )}

          {/* Feature Limitations */}
          {!hasVerifiedPlan && (
            <Card className="bg-amber-500/5 border-amber-500/20">
              <CardHeader>
                <CardTitle>Limited Features</CardTitle>
                <CardDescription>
                  Without a verified payment plan, some features are restricted:
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="space-y-2 text-sm">
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 shrink-0" />
                    <span><strong>Available:</strong> You can make commits to track your work</span>
                  </li>
                  <li className="flex items-start gap-2">
                    <CheckCircle2 className="w-4 h-4 text-amber-500 mt-0.5 shrink-0" />
                    <span><strong>Restricted:</strong> Pull from cloud storage requires a verified plan</span>
                  </li>
                </ul>
              </CardContent>
            </Card>
          )}
        </div>
      </div>
      </div>
      </ModelProvider>
    </VersionControlProvider>
  );
}
