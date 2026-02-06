// Subscription service for checking user subscription status
import { supabase } from './supabase';
import { STRIPE_DISABLED, MOCK_PAYMENT_PLAN } from './feature-flags';

/**
 * Check if the current user has an active subscription
 * @returns Promise<boolean> - true if user has active subscription, false otherwise
 */
export async function checkSubscriptionStatus(): Promise<boolean> {
  // When Stripe is disabled, return true if mock plan is set
  if (STRIPE_DISABLED) {
    console.log('[Feature Flag] Stripe disabled, returning mock subscription status');
    return MOCK_PAYMENT_PLAN !== null;
  }

  try {
    // 1. Check if user is authenticated
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      console.log('No authenticated user found');
      return false;
    }

    // 2. Get the user's session to access the JWT token
    const { data: { session } } = await supabase.auth.getSession();
    
    if (!session) {
      console.log('No active session found');
      return false;
    }

    // 3. Query the backend API to check subscription status
    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    
    const response = await fetch(`${BACKEND_URL}/api/stripe/payment-status`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch subscription status:', response.statusText);
      return false;
    }

    const data = await response.json();
    
    // 4. Return true only if user has an active subscription
    return data.hasActivePlan === true && data.status === 'active';
  } catch (error) {
    console.error('Error checking subscription status:', error);
    return false;
  }
}

/**
 * Get detailed subscription information for the current user
 * @returns Promise with subscription details or null
 */
export async function getSubscriptionDetails(): Promise<{
  hasActivePlan: boolean;
  plan: 'student' | 'enterprise' | null;
  status: 'active' | 'canceled' | 'past_due' | 'trialing' | null;
} | null> {
  // When Stripe is disabled, return mock subscription details
  if (STRIPE_DISABLED) {
    console.log('[Feature Flag] Stripe disabled, returning mock subscription details');
    return {
      hasActivePlan: MOCK_PAYMENT_PLAN !== null,
      plan: MOCK_PAYMENT_PLAN,
      status: MOCK_PAYMENT_PLAN ? 'active' : null,
    };
  }

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;

    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;

    const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';
    
    const response = await fetch(`${BACKEND_URL}/api/stripe/payment-status`, {
      headers: {
        'Authorization': `Bearer ${session.access_token}`,
      },
    });

    if (!response.ok) {
      console.error('Failed to fetch subscription details:', response.statusText);
      return null;
    }

    return await response.json();
  } catch (error) {
    console.error('Error fetching subscription details:', error);
    return null;
  }
}
