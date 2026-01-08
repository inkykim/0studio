// Supabase client configuration
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// TEMPORARY: Hardcoded for testing (will switch back to env vars after testing)
const supabaseUrl = 'https://fjgbfijgnkqzknwarptm.supabase.co';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY?.trim() || '';

// TODO: Switch back to reading from env after testing
// const supabaseUrl = (import.meta.env.VITE_SUPABASE_URL || '').trim().replace(/\/+$/, '');
// const supabaseAnonKey = (import.meta.env.VITE_SUPABASE_ANON_KEY || '').trim();

// Validate that we're using the anon key, not the service_role key
function validateAnonKey(key: string): boolean {
  if (!key) return false;
  
  // Service role keys typically start with specific patterns and are longer
  // Anon keys are shorter and have a different format
  // This is a basic check - service_role keys are usually 100+ chars, anon keys are ~100 chars
  // But the real check is if it contains "service_role" in the JWT payload (base64 decoded)
  
  // Check if key looks suspiciously long (service_role keys are usually longer)
  if (key.length > 150) {
    console.error('⚠️ WARNING: Key appears to be too long. You might be using the service_role key!');
    console.error('   Service role keys should NEVER be used in the browser.');
    console.error('   Use the "anon public" key from Settings → API in your Supabase dashboard.');
    return false;
  }
  
  // Try to decode JWT to check the role (basic check)
  try {
    const parts = key.split('.');
    if (parts.length === 3) {
      const payload = JSON.parse(atob(parts[1]));
      if (payload.role === 'service_role') {
        console.error('❌ ERROR: You are using the SERVICE_ROLE key in the browser!');
        console.error('   This is a security risk and will cause "Forbidden use of secret API key" errors.');
        console.error('   Please use the "anon public" key instead from Settings → API.');
        return false;
      }
    }
  } catch (e) {
    // If we can't decode, that's okay - just proceed with the key
  }
  
  return true;
}

// Debug: Log what we're reading
if (import.meta.env.DEV) {
  console.log('🔍 Supabase Configuration:');
  console.log('  URL:', supabaseUrl);
  console.log('  Anon Key:', supabaseAnonKey ? `✅ Set (${supabaseAnonKey.length} chars)` : '❌ NOT SET - Please set VITE_SUPABASE_ANON_KEY');
  
  if (!supabaseAnonKey) {
    console.error('⚠️ WARNING: VITE_SUPABASE_ANON_KEY is missing!');
    console.error('   Please set it in your .env file and restart the dev server.');
  } else {
    // Validate the key type
    if (!validateAnonKey(supabaseAnonKey)) {
      console.error('❌ CRITICAL: Wrong key type detected!');
      console.error('   You must use the "anon public" key, NOT the "service_role" key.');
    } else {
      console.log('✅ Key type appears correct (anon public key)');
    }
  }
}

// Validate Supabase URL format
function isValidSupabaseUrl(url: string): boolean {
  if (!url || url.trim() === '') return false;
  
  // Remove any trailing slashes
  const cleanUrl = url.trim().replace(/\/+$/, '');
  
  try {
    const urlObj = new URL(cleanUrl);
    const isValid = 
      urlObj.protocol === 'https:' &&
      urlObj.hostname.endsWith('.supabase.co') &&
      urlObj.hostname.split('.').length === 3; // project-ref.supabase.co
    
    if (!isValid) {
      console.error(`Invalid Supabase URL format: ${url}`);
      console.error('Expected format: https://[project-ref].supabase.co');
    }
    
    return isValid;
  } catch (error) {
    console.error(`Invalid URL format: ${url}`, error);
    return false;
  }
}

// Validate configuration
if (!supabaseUrl || !supabaseAnonKey) {
  console.error(
    '❌ Supabase configuration missing!\n' +
    'Please set the following environment variables in your .env file:\n' +
    '  VITE_SUPABASE_URL=https://your-project.supabase.co\n' +
    '  VITE_SUPABASE_ANON_KEY=your_anon_key\n\n' +
    '⚠️ IMPORTANT:\n' +
    '  - Edit .env (NOT .env.example)\n' +
    '  - Restart your dev server after changing .env\n' +
    '  - Vite only loads .env files on startup'
  );
} else if (!isValidSupabaseUrl(supabaseUrl)) {
  console.error(
    '❌ Invalid Supabase URL format!\n' +
    `Current URL: ${supabaseUrl}\n` +
    'Expected format: https://[project-ref].supabase.co\n\n' +
    'Please check your VITE_SUPABASE_URL in your .env file.\n' +
    '⚠️ Make sure you edited .env (not .env.example) and restarted the dev server.'
  );
}

// Create Supabase client only if configuration is valid
let supabase: SupabaseClient;

if (supabaseUrl && supabaseAnonKey && isValidSupabaseUrl(supabaseUrl)) {
  // Validate key type before creating client
  if (!validateAnonKey(supabaseAnonKey)) {
    console.error('❌ Cannot create Supabase client: Invalid key type detected.');
    console.error('   Please check your VITE_SUPABASE_ANON_KEY in .env file.');
    console.error('   Make sure you\'re using the "anon public" key, NOT the "service_role" key.');
    // Create a dummy client to prevent app crashes
    supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
  } else {
    try {
      supabase = createClient(supabaseUrl, supabaseAnonKey, {
        auth: {
          autoRefreshToken: true,
          persistSession: true,
          detectSessionInUrl: true,
        },
      });
      console.log('✅ Supabase client initialized successfully');
    } catch (error) {
      console.error('❌ Failed to create Supabase client:', error);
      // Create a dummy client to prevent app crashes
      supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
    }
  }
} else {
  // Create a dummy client to prevent app crashes, but it won't work
  console.warn('⚠️ Creating placeholder Supabase client. Please configure your environment variables.');
  supabase = createClient('https://placeholder.supabase.co', 'placeholder-key');
}

export { supabase };

// Database types matching your Supabase schema
export interface Project {
  id: string;
  name: string;
  s3_key: string;
  owner_id: string;
  created_at: string;
}

export interface Commit {
  id: string;
  project_id: string;
  parent_commit_id: string | null;
  message: string | null;
  author_id: string;
  s3_version_id: string;
  created_at: string;
}

export interface Branch {
  id: string;
  project_id: string;
  name: string;
  head_commit_id: string | null;
}

export interface Database {
  public: {
    Tables: {
      projects: {
        Row: Project;
        Insert: Omit<Project, 'id' | 'created_at'>;
        Update: Partial<Omit<Project, 'id' | 'created_at'>>;
      };
      commits: {
        Row: Commit;
        Insert: Omit<Commit, 'id' | 'created_at'>;
        Update: Partial<Omit<Commit, 'id' | 'created_at'>>;
      };
      branches: {
        Row: Branch;
        Insert: Omit<Branch, 'id'>;
        Update: Partial<Omit<Branch, 'id'>>;
      };
    };
  };
}

