import { createClient } from '@supabase/supabase-js';

import { env } from '../../config/env.js';

export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

export const STORAGE_BUCKET = 'rentsmart-images';
