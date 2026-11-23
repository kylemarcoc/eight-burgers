import type { AdminUser, AssetUploadPurpose } from '@menu-kiosk/contracts';
import type { ApiConfig } from './config/env';
import type { OptimizedMenuImage } from './lib/image-optimizer';
import type { LocationProvider } from './lib/location-provider';
import type { SlidingWindowRateLimiter } from './lib/rate-limit';
import type { StoreProfileCache } from './lib/store-profile-cache';
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
  storeProfileCache?: StoreProfileCache;
  optimizeMenuImage?: (
    inputBuffer: Uint8Array,
    purpose?: AssetUploadPurpose,
  ) => Promise<OptimizedMenuImage>;
};
