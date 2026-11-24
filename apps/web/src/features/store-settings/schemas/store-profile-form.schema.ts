import {
  isSafeExternalUrl,
  storeMonogramSchema,
  storeQueuePrefixSchema,
} from '@menu-kiosk/contracts';
import { z } from 'zod';

export const storeProfileFormSchema = z
  .object({
    storeName: z.string().trim().min(1, 'Store name is required.').max(80),
    branchLabel: z.string(),
    monogram: storeMonogramSchema,
    heroHeadline: z.string(),
    heroSubtext: z.string(),
    heroBadgeLabel: z.string(),
    address: z.string(),
    landmark: z.string(),
    contactPhone: z.string(),
    hoursText: z.string(),
    pickupSpotLabel: z.string(),
    queuePrefix: storeQueuePrefixSchema,
    preparingStageLabel: z.string().trim().min(1, 'Preparing stage label is required.').max(40),
    externalLinks: z
      .array(
        z.object({
          label: z.string(),
          url: z.string(),
        }),
      )
      .max(6),
  })
  .superRefine((values, ctx) => {
    for (const link of values.externalLinks) {
      const label = link.label.trim();
      const url = link.url.trim();
      if (!label && !url) continue;
      if (!label) {
        ctx.addIssue({
          code: 'custom',
          path: ['externalLinks'],
          message: 'Enter a label for every external link.',
        });
        return;
      }
      if (!isSafeExternalUrl(url)) {
        ctx.addIssue({
          code: 'custom',
          path: ['externalLinks'],
          message: 'External links must start with https:// and contain no credentials.',
        });
        return;
      }
    }
  });

export type StoreProfileFormValues = z.infer<typeof storeProfileFormSchema>;
