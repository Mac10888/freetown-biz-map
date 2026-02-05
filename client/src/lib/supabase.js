import { createClient } from '@supabase/supabase-js';
export const supabase = createClient(
  'https://eukfjmahrtrslixolgah.supabase.co',
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImV1a2ZqbWFocnRyc2xpeG9sZ2FoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzMzIyMDMsImV4cCI6MjA4NTkwODIwM30.VSQu087japuf1_3LhFxgVFenWAPVabS42aiSqqEXM5Q'
);
