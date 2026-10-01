import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

// True only when this page load is Google sending the user back after
// sign-in. Read before the client below clears the tokens from the URL.
export const isOAuthReturn =
  typeof window !== 'undefined' &&
  /[?#&](code|access_token|error)=/.test(window.location.href);

// The user cancelled or Google refused, e.g. "access_denied"
export const oauthReturnError =
  typeof window !== 'undefined'
    ? new URLSearchParams(
        window.location.search || window.location.hash.replace(/^#/, '')
      ).get('error')
    : null;

export const supabase = createClient(
  supabaseUrl,
  supabaseAnonKey
);