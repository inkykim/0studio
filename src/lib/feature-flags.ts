/**
 * Feature Flags Configuration
 * 
 * Toggle features on/off for development and testing.
 * To re-enable a feature, simply set its flag to `false`.
 */

/**
 * STRIPE_DISABLED: When true, disables all Stripe payment functionality
 * - Skips subscription checks in AuthContext
 * - Disables checkout redirects
 * - Shows "coming soon" message on checkout page
 * - All features that require payment will be unlocked
 * 
 * To re-enable Stripe: Set this to `false`
 */
export const STRIPE_DISABLED = true;

/**
 * MOCK_PAYMENT_PLAN: The mock payment plan to use when Stripe is disabled
 * Options: 'student' | 'enterprise' | null (free)
 * 
 * Set to 'student' or 'enterprise' to simulate having a paid plan
 * Set to null to simulate a free user
 */
export const MOCK_PAYMENT_PLAN: 'student' | 'enterprise' | null = 'student';
