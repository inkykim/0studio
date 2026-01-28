# Google OAuth Setup Guide for Desktop App

This guide will help you configure Google sign-in for your 0studio **Electron desktop application** using Supabase.

## Important: Desktop App Configuration

Since 0studio is a desktop application (installed via Homebrew), the OAuth configuration differs from web apps. Desktop apps use localhost redirects instead of hosted URLs.

## Prerequisites

- A Supabase project (already set up)
- A Google Cloud Platform account
- 0studio desktop app installed

## Step 1: Create Google OAuth Credentials

1. Go to the [Google Cloud Console](https://console.cloud.google.com/)
2. Create a new project or select an existing one
3. Enable the Google+ API:
   - Go to **APIs & Services** > **Library**
   - Search for "Google+ API"
   - Click **Enable**

4. Create OAuth 2.0 credentials:
   - Go to **APIs & Services** > **Credentials**
   - Click **Create Credentials** > **OAuth client ID**
   - If prompted, configure the OAuth consent screen first:
     - Choose **External** for user type
     - Fill in the required fields:
       - App name: `0studio`
       - User support email: Your email
       - Developer contact information: Your email
     - Click **Save and Continue**
     - Skip the Scopes section (click **Save and Continue**)
     - Add test users if needed (or skip for production)
     - Click **Save and Continue**

5. Create the OAuth Client ID:
   - Application type: **Web application**
   - Name: `0studio Client`
   - **Authorized JavaScript origins**: Leave empty for now (we'll add later)
   - **Authorized redirect URIs**: Leave empty for now (we'll add in the next step)
   - Click **Create**

6. **Save your credentials:**
   - Copy the **Client ID**
   - Copy the **Client Secret**
   - You'll need these for Supabase configuration

**Note:** Even though this is a desktop app, we use "Web application" type because Supabase OAuth requires redirect URIs, which are only available for web applications.

## Step 2: Configure Supabase for Desktop App

1. Go to your [Supabase Dashboard](https://app.supabase.com/)
2. Select your project
3. Navigate to **Authentication** > **Providers**
4. Find **Google** in the list and click to expand it
5. Enable Google provider:
   - Toggle **Enable Sign in with Google** to ON
   - Paste your **Client ID** from Google Cloud Console (from Desktop app credentials)
   - Paste your **Client Secret** from Google Cloud Console
   - **Redirect URLs**: The default Supabase callback URL is automatically configured - you can leave this as-is
   - Click **Save**

**Note:** You don't need to manually add redirect URLs in Supabase. The default `https://your-project-ref.supabase.co/auth/v1/callback` will work fine.

## Step 3: Add Redirect URIs in Google Cloud Console ⚠️ CRITICAL STEP

Now we need to add the redirect URIs that Supabase will use.

**This is the most important step!** This is where you configure the redirect URLs.

1. Go back to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **APIs & Services** > **Credentials**
3. Click on your OAuth 2.0 Client ID (the Web application one you just created)
4. Click **Edit** at the top (or it may already be in edit mode)
5. Under **Authorized redirect URIs**, click **+ ADD URI** and add:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   ```
   - **IMPORTANT**: Replace `your-project-ref` with your actual Supabase project reference
   - You can find this in Supabase Dashboard → Settings → API → Project URL
   - Example: If your Supabase URL is `https://abcdefghijk.supabase.co`, add:
     ```
     https://abcdefghijk.supabase.co/auth/v1/callback
     ```
7. (Optional) For local development, also add:
   ```
   http://localhost:54321/auth/v1/callback
   ```
8. Under **Authorized JavaScript origins**, click **+ ADD URI** and add:
   ```
   https://your-project-ref.supabase.co
   ```
   (Replace with your actual Supabase project URL)
9. Click **Save**

**Double-check:** Make sure there are no typos, extra spaces, or trailing slashes in the URLs!

## Important Note About Desktop Apps and OAuth

For Electron desktop apps, OAuth works slightly differently:
- The app opens the OAuth flow in the user's default browser
- After authentication, Google redirects back to Supabase
- Supabase handles the callback and returns the user to your app
- The app detects the authentication session via Supabase's session detection

## Step 4: Update Electron App Configuration (if needed)

For production desktop apps, you may want to handle deep linking for OAuth callbacks:

1. Check `electron/main.ts` for URL scheme handling
2. Register the custom URL scheme `0studio://` to handle OAuth callbacks
3. This allows the browser to redirect back to your desktop app after OAuth

**For development**, the standard browser-based OAuth flow will work fine.

## Step 5: Test the Integration

1. Start your development server:
   ```bash
   npm run dev
   ```

2. The Electron app should launch
3. Click the **Sign In** button in your app
4. Click **Continue with Google**
5. Your default browser will open with Google's sign-in page
6. After signing in with Google, the browser will show a success message
7. Return to your Electron app - you should be signed in
8. Check that you're authenticated successfully

**Note**: The OAuth flow happens in your browser, not within the Electron app window. This is normal and secure behavior for desktop apps.

## Account Linking

Supabase automatically handles account linking:

- **Same email, different providers**: If a user signs up with email/password using `user@example.com` and later signs in with Google using the same `user@example.com`, Supabase will recognize this as the same user and link the accounts automatically.

- **User identity**: You can check which authentication methods a user has used by examining the user's identities in the Supabase dashboard or via the API.

- **Multiple providers**: Users can sign in with any linked provider (email/password or Google) and access the same account.

## Troubleshooting

### "Error 400: redirect_uri_mismatch"

This means the redirect URI in your Google Cloud Console doesn't match the one Supabase is using.

**Solution:**
1. Check your Supabase project URL (Settings > API > Project URL)
2. Ensure you changed the OAuth client type to **Web application** (not Desktop app)
3. Ensure the redirect URI in Google Cloud Console includes BOTH:
   ```
   https://your-project-ref.supabase.co/auth/v1/callback
   http://localhost:54321/auth/v1/callback
   ```
4. No trailing slashes, and replace `your-project-ref` with your actual project reference

### "Invalid OAuth client"

This usually means the Client ID or Client Secret is incorrect.

**Solution:**
1. Double-check you copied the correct credentials from Google Cloud Console
2. Make sure there are no extra spaces when pasting
3. Verify you're using the Client ID (not the Client Secret) in the correct field

### Users can't sign in after OAuth redirect

**Solution:**
1. Check browser console for errors (OAuth opens in browser)
2. Verify your Supabase URL and Anon Key are correctly set in `.env`
3. Make sure `VITE_SUPABASE_URL` doesn't have a trailing slash
4. Restart your dev server after changing `.env` files
5. Make sure Supabase's `detectSessionInUrl` is enabled (should be by default)

### Browser shows success but app doesn't sign in

This is common with desktop apps.

**Solution:**
1. After OAuth success in browser, return to your Electron app window
2. The app should automatically detect the session
3. If not, try refreshing the app or restarting it
4. Check that `supabase.auth.onAuthStateChange` is properly set up in your AuthContext

### "Access blocked: This app's request is invalid"

This happens when the OAuth consent screen is not properly configured.

**Solution:**
1. Go to Google Cloud Console > APIs & Services > OAuth consent screen
2. Make sure the app is published (or add yourself as a test user)
3. Fill in all required fields
4. Add your email to authorized domains if needed

## Environment Variables

No additional environment variables are needed for Google OAuth. Your existing Supabase configuration in `.env` will work:

```env
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

## Security Notes for Desktop Apps

- ✅ **DO** use the Client ID and Client Secret from Google Cloud Console
- ✅ **DO** keep your Client Secret private (don't commit to git)
- ✅ **DO** use HTTPS in production for Supabase endpoints
- ✅ **DO** use Web application type in Google Cloud (despite being a desktop app)
- ❌ **DON'T** expose your Client Secret in frontend code (Supabase handles this)
- ❌ **DON'T** use the service_role key from Supabase
- ⚠️ **Note**: Desktop apps use browser-based OAuth flow for security

## Additional Resources

- [Supabase Google OAuth Documentation](https://supabase.com/docs/guides/auth/social-login/auth-google)
- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Google Cloud Console](https://console.cloud.google.com/)

## Next Steps

After setting up Google OAuth for your desktop app:

1. Test signing in with both email/password and Google
2. Verify that the same email links to the same account
3. Check user data in Supabase Dashboard > Authentication > Users
4. Consider adding more OAuth providers (GitHub, Microsoft, etc.)
5. For production builds, implement deep linking with custom URL scheme (`0studio://`)

## Desktop App Considerations

- OAuth flow opens in the user's default browser (Chrome, Safari, Firefox, etc.)
- After successful authentication, users return to the desktop app
- Session persistence works the same as web apps via Supabase
- The app doesn't need to be running for OAuth to work (session syncs on next launch)
