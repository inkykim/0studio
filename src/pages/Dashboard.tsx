import React, { useState, useEffect } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { InteractivePricingCard } from '@/components/ui/pricing';
import { TitleBar } from "@/components/TitleBar";
import { ModelProvider } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate, useSearchParams } from "react-router-dom";
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

  const studentPlanFeatures = [
    'Unlimited commits',
    'File tree visualization',
    'Pull from cloud storage',
    'Share with 5 other team members',
    'Community support'
  ];

  const enterprisePlanFeatures = [
    'Everything in Student',
    'Share across entire organization',
    'Fine-tuned merge conflict resolution',
    'Priority support',
  ];

  const handlePlanSelect = async (planName: string, units: number, totalPrice: number) => {
    if (!user) {
      toast.error('Please sign in to continue');
      return;
    }

    // Determine the price ID and lookup key based on plan
    const priceId = planName.toLowerCase() === 'student' ? 'price_1SpIuQBU9neqC79tYoTbDCck' : undefined;
    const lookupKey = planName.toLowerCase() === 'enterprise' ? '0studio_Fricionless_-_Enterprise-XXXXX' : null;
    
    // Call the handleCheckout function with Stripe integration
    await handleCheckout(lookupKey, planName.toLowerCase(), priceId);
  };

  return (
    <VersionControlProvider>
      <ModelProvider>
        <div className="h-screen flex flex-col bg-background overflow-hidden">
          <TitleBar />
          <div className="flex-1 overflow-auto relative">
            {/* Header with back button and current plan - positioned absolutely */}
            <div className="absolute top-6 left-1/2 transform -translate-x-1/2 z-10 space-y-4 text-center">
              <Button
                variant="outline"
                onClick={() => navigate('/')}
                className="gap-2"
              >
                <ArrowLeft className="w-4 h-4" />
                Go back to app
              </Button>
              {paymentPlan ? (
                <p className="text-muted-foreground">
                  Your current plan is: {paymentPlan === 'student' ? 'Student' : 'Enterprise'}
                </p>
              ) : (
                <p className="text-muted-foreground">
                  Choose a plan to unlock all features. Without a verified plan, you can make commits but cannot pull from cloud
                </p>
              )}
            </div>

            {/* Pricing cards centered */}
            <div className="flex min-h-full w-full flex-col items-center justify-center gap-8 p-8 md:flex-row">
              {/* Student Plan */}
              <InteractivePricingCard
                planName="Student"
                planDescription="For individuals and small teams."
                pricePerUnit={10}
                unitName="user"
                minUnits={1}
                maxUnits={10}
                initialUnits={3}
                features={studentPlanFeatures}
                ctaText="Get Started with Student"
                hideSlider={true}
                onPlanSelect={handlePlanSelect}
              />

              {/* Enterprise Plan - Highlighted */}
              <InteractivePricingCard
                planName="Enterprise"
                planDescription="For advanced collaboration and unlimited power."
                pricePerUnit={50}
                unitName="user"
                minUnits={5}
                maxUnits={50}
                initialUnits={10}
                features={enterprisePlanFeatures}
                ctaText="Subscribe to Enterprise"
                highlighted={true}
                onPlanSelect={handlePlanSelect}
              />
            </div>
          </div>
        </div>
      </ModelProvider>
    </VersionControlProvider>
  );
}
