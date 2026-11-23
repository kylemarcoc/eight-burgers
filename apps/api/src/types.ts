import type { AdminUser } from '@eight-burgers/contracts';
import type { ApiConfig } from './config/env';
import type { OptimizedMenuImage } from './lib/image-optimizer';
import type { LocationProvider } from './lib/location-provider';
import type { SlidingWindowRateLimiter } from './lib/rate-limit';
import type { ShopBackendGateway } from './lib/supabase';

export type ApiEnv = {
  Variables: {
    requestId: string;
    adminUser?: AdminUser;
    adminAccessToken?: string;
  };
};

export type ApiDeps = {
  config: ApiConfig;
  gateway: ShopBackendGateway;
  loginRateLimiter?: SlidingWindowRateLimiter;
  orderRateLimiter?: SlidingWindowRateLimiter;
  locationRateLimiter?: SlidingWindowRateLimiter;
  locationProvider?: LocationProvider;
  optimizeMenuImage?: (inputBuffer: Uint8Array) => Promise<OptimizedMenuImage>;
};
