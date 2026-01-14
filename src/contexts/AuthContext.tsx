// Authentication context using Supabase
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { supabase } from '@/lib/supabase';
import { User, Session, AuthError } from '@supabase/supabase-js';
import { toast } from 'sonner';

export type PaymentPlan = 'student' | 'enterprise' | null;

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  paymentPlan: PaymentPlan;
  hasVerifiedPlan: boolean;
  signUp: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signIn: (email: string, password: string) => Promise<{ error: AuthError | null }>;
  signOut: () => Promise<void>;
  resetPassword: (email: string) => Promise<{ error: AuthError | null }>;
  setPaymentPlan: (plan: PaymentPlan) => Promise<void>;
  refreshPaymentStatus: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

interface AuthProviderProps {
  children: ReactNode;
}

export const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [paymentPlan, setPaymentPlanState] = useState<PaymentPlan>(null);

  const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || 'http://localhost:3000';

  // Load payment plan from backend API (Supabase)
  const loadPaymentPlan = useCallback(async () => {
    if (!user || !session?.access_token) {
      setPaymentPlanState(null);
      return;
    }

    try {
      const response = await fetch(`${BACKEND_URL}/api/stripe/payment-status`, {
        headers: {
          'Authorization': `Bearer ${session.access_token}`,
        },
      });

      if (response.ok) {
        const data = await response.json();
        if (data.hasActivePlan && data.plan) {
          setPaymentPlanState(data.plan as PaymentPlan);
        } else {
          setPaymentPlanState(null);
        }
      } else {
        // If API fails, fall back to localStorage for backward compatibility
        const stored = localStorage.getItem(`paymentPlan_${user.id}`);
        setPaymentPlanState((stored as PaymentPlan) || null);
      }
    } catch (error) {
      console.error('Error loading payment plan:', error);
      // Fall back to localStorage
      const stored = localStorage.getItem(`paymentPlan_${user.id}`);
      setPaymentPlanState((stored as PaymentPlan) || null);
    }
  }, [user, session, BACKEND_URL]);

  // Load payment plan when user changes
  useEffect(() => {
    loadPaymentPlan();
  }, [loadPaymentPlan]);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth changes
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signUp = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          emailRedirectTo: `${window.location.origin}`,
        },
      });

      if (error) {
        // Don't show toast here - let the form component handle it
        return { error };
      }

      if (data.user && !data.session) {
        // User needs to verify email
        toast.success('Account created! Please check your email to verify your account.');
      } else if (data.session) {
        // User is automatically signed in (if email confirmation is disabled)
        toast.success('Account created successfully!');
      }

      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      return { error: authError };
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        // Don't show toast here - let the form component handle it
        return { error };
      }

      toast.success('Signed in successfully');
      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      return { error: authError };
    }
  };

  const signOut = async () => {
    try {
      const { error } = await supabase.auth.signOut();
      if (error) {
        toast.error(error.message);
        throw error;
      }
      toast.success('Signed out successfully');
    } catch (error) {
      console.error('Error signing out:', error);
      throw error;
    }
  };

  const resetPassword = async (email: string) => {
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      });

      if (error) {
        // Don't show toast here - let the form component handle it
        return { error };
      }

      // Success toast is handled in the component
      return { error: null };
    } catch (error) {
      const authError = error as AuthError;
      return { error: authError };
    }
  };

  const setPaymentPlan = async (plan: PaymentPlan) => {
    if (user) {
      // This is now handled by Stripe webhooks, but keep for backward compatibility
      localStorage.setItem(`paymentPlan_${user.id}`, plan || '');
      setPaymentPlanState(plan);
    }
  };

  const refreshPaymentStatus = useCallback(async () => {
    await loadPaymentPlan();
  }, [loadPaymentPlan]);

  const hasVerifiedPlan = paymentPlan !== null;

  const value: AuthContextType = {
    user,
    session,
    loading,
    paymentPlan,
    hasVerifiedPlan,
    signUp,
    signIn,
    signOut,
    resetPassword,
    setPaymentPlan,
    refreshPaymentStatus,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = (): AuthContextType => {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};

