import { OPTION_SELECTION_MODE_VALUES } from '@menu-kiosk/contracts';
import { z } from 'zod';

export const choiceDraftSchema = z.object({
  id: z.string().optional(),
  name: z.string(),
  priceDeltaPhp: z.string(),
  available: z.boolean(),
  isDefault: z.boolean(),
});

export type ChoiceDraft = z.infer<typeof choiceDraftSchema>;

export const optionGroupFormSchema = z
  .object({
    name: z.string(),
    description: z.string(),
    selectionMode: z.enum(OPTION_SELECTION_MODE_VALUES),
    required: z.boolean(),
    minSelect: z.string(),
    maxSelect: z.string(),
    active: z.boolean(),
    choices: z.array(choiceDraftSchema),
  })
  .superRefine((values, ctx) => {
    if (!values.name.trim()) {
      ctx.addIssue({
        code: 'custom',
        path: ['name'],
        message: 'Enter an option group name.',
      });
    }

    const parsedMin = Math.max(0, Math.round(Number(values.minSelect || '0')));
    const effectiveMin = values.required ? Math.max(1, parsedMin) : parsedMin;
    const effectiveMax =
      values.selectionMode === 'single'
        ? 1
        : values.maxSelect.trim() === ''
          ? null
          : Math.max(1, Math.round(Number(values.maxSelect)));

    if (!Number.isFinite(effectiveMin) || effectiveMin < 0 || effectiveMin > 50) {
      ctx.addIssue({
        code: 'custom',
        path: ['minSelect'],
        message: 'Minimum selections must be between 0 and 50.',
      });
    }
    if (effectiveMax !== null && (!Number.isFinite(effectiveMax) || effectiveMax < effectiveMin)) {
      ctx.addIssue({
        code: 'custom',
        path: ['maxSelect'],
        message: 'Maximum selections cannot be less than minimum selections.',
      });
    }

    for (let idx = 0; idx < values.choices.length; idx += 1) {
      const draft = values.choices[idx];
      if (!draft) continue;
      const choiceName = draft.name.trim();
      if (!choiceName) continue;
      const delta = Number(draft.priceDeltaPhp);
      if (!Number.isFinite(delta) || delta < 0 || delta > 100000) {
        ctx.addIssue({
          code: 'custom',
          path: ['choices', idx, 'priceDeltaPhp'],
          message: `Choice "${choiceName}" must have a non-negative price delta (₱0–₱100,000).`,
        });
      }
    }
  });

export type OptionGroupFormValues = z.infer<typeof optionGroupFormSchema>;
