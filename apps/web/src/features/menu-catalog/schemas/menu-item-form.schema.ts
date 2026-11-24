import { isSafeImageUrl } from '@menu-kiosk/contracts';
import { z } from 'zod';

export type MenuItemFormSchemaOptions = {
  categoryIds: readonly string[];
};

export function resolveEffectiveMenuCategory(
  category: string,
  categoryIds: readonly string[],
): string {
  if (category && categoryIds.includes(category)) return category;
  return categoryIds[0] ?? '';
}

export function createMenuItemFormSchema({ categoryIds }: MenuItemFormSchemaOptions) {
  return z
    .object({
      name: z
        .string()
        .trim()
        .min(1, 'Enter an item name before saving.')
        .max(120, 'Item name must be 120 characters or fewer.'),
      category: z.string(),
      pricePhp: z.string().refine((value) => {
        const n = Number(value);
        return value.trim() !== '' && Number.isFinite(n) && n > 0 && n <= 100000;
      }, 'Enter a valid price between ₱1 and ₱100,000.'),
      specLabel: z.string(),
      description: z
        .string()
        .trim()
        .min(1, 'Enter ingredients or a short description for customers.')
        .max(500, 'Description must be 500 characters or fewer.'),
      imageUrl: z.string().refine((value) => {
        const trimmed = value.trim();
        return isSafeImageUrl(trimmed) && trimmed.length <= 500;
      }, 'Enter a valid https:// image URL (max 500 chars), or leave blank.'),
      available: z.boolean(),
      featured: z.boolean(),
      optionGroupIds: z.array(z.string()),
    })
    .superRefine((values, ctx) => {
      if (!resolveEffectiveMenuCategory(values.category, categoryIds)) {
        ctx.addIssue({
          code: 'custom',
          path: ['category'],
          message: 'Create at least one category before saving menu items.',
        });
      }
    });
}

export type MenuItemFormValues = z.infer<ReturnType<typeof createMenuItemFormSchema>>;
