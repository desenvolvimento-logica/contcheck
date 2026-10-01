import { createClient } from '@supabase/supabase-js';
import type { Database } from './types';

const APP_SUPABASE_URL = 'https://olyvjnqmrzkziirzbmhi.supabase.co';

function createAppAdminClient() {
  const serviceRoleKey = process.env.CONTCHECK_SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error('Missing CONTCHECK_SUPABASE_SERVICE_ROLE_KEY');
  }
  return createClient<Database>(APP_SUPABASE_URL, serviceRoleKey, {
    auth: { storage: undefined, persistSession: false, autoRefreshToken: false },
  });
}

let _client: ReturnType<typeof createAppAdminClient> | undefined;

export const appAdminClient = new Proxy({} as ReturnType<typeof createAppAdminClient>, {
  get(_, prop, receiver) {
    if (!_client) _client = createAppAdminClient();
    return Reflect.get(_client, prop, receiver);
  },
});
