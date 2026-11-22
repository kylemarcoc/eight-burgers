import { serve } from '@hono/node-server';
import { createApp } from './app';
import { loadLocalEnvFiles, parseApiConfig } from './config/env';
import { createSupabaseGateway } from './lib/supabase';

loadLocalEnvFiles();
const config = parseApiConfig(process.env);
const gateway = createSupabaseGateway(config);
const app = createApp({ config, gateway });

serve(
  {
    fetch: app.fetch,
    hostname: '127.0.0.1',
    port: config.port,
  },
  (info) => {
    console.log(
      `[eight-burgers-api] listening on http://127.0.0.1:${info.port} (supabase: ${config.supabaseUrl})`,
    );
  },
);
