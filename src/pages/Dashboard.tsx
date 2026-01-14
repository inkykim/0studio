import React, { useState } from 'react';
import { useAuth } from "@/contexts/AuthContext";
import { InteractivePricingCard } from '@/components/ui/pricing';
import { TitleBar } from "@/components/TitleBar";
import { ModelProvider } from "@/contexts/ModelContext";
import { VersionControlProvider } from "@/contexts/VersionControlContext";
import { Button } from "@/components/ui/button";
import { ArrowLeft } from "lucide-react";
import { useNavigate } from "react-router-dom";

export default function Dashboard() {
  const { setPaymentPlan, paymentPlan } = useAuth();
  const navigate = useNavigate();

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
    try {
      // Convert plan name to the format expected by setPaymentPlan
      const planId = planName.toLowerCase() === 'student' ? 'student' : 'enterprise';
      await setPaymentPlan(planId);
    } catch (error) {
      console.error('Plan verification failed:', error);
    }
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
