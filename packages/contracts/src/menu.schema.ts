import { z } from 'zod';

export const SLUG_ID_REGEX = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export const slugIdSchema = z
  .string()
  .trim()
  .min(1, 'Identifier is required.')
  .max(80, 'Identifier must be 80 characters or fewer.')
  .regex(SLUG_ID_REGEX, 'Use lowercase letters, numbers, and single hyphens only.');
export type SlugId = z.infer<typeof slugIdSchema>;

export const OPTION_SELECTION_MODE_VALUES = ['single', 'multi'] as const;
export const optionSelectionModeSchema = z.enum(OPTION_SELECTION_MODE_VALUES);
export type OptionSelectionMode = z.infer<typeof optionSelectionModeSchema>;

export function isSafeImageUrl(raw: string): boolean {
  const trimmed = raw.trim();
  if (!trimmed) return true;
  if (trimmed.startsWith('/') && !trimmed.startsWith('//')) return true;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password;
  } catch {
    return false;
  }
}

export const safeImageUrlSchema = z
  .string()
  .trim()
  .max(500)
  .refine(isSafeImageUrl, 'Image URL must be a relative path or an HTTPS URL without credentials.');

export const menuCategorySchema = z.object({
  id: slugIdSchema,
  name: z.string().trim().min(1, 'Category name is required.').max(80),
  description: z.string().trim().max(240),
  sortOrder: z.number().int().min(0).max(10000),
  active: z.boolean(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type MenuCategory = z.infer<typeof menuCategorySchema>;

export const menuCategoryInputSchema = z.strictObject({
  id: slugIdSchema.optional(),
  name: z.string().trim().min(1, 'Category name is required.').max(80),
  description: z.string().trim().max(240).default(''),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  active: z.boolean().default(true),
  expectedVersion: z.number().int().positive().optional(),
});
export type MenuCategoryInput = z.infer<typeof menuCategoryInputSchema>;

export const menuCategoryPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Category name is required.').max(80).optional(),
    description: z.string().trim().max(240).optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    active: z.boolean().optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (patch) =>
      patch.name !== undefined ||
      patch.description !== undefined ||
      patch.sortOrder !== undefined ||
      patch.active !== undefined,
    {
      message: 'Provide at least one category field to update.',
    },
  );
export type MenuCategoryPatch = z.infer<typeof menuCategoryPatchSchema>;

export const menuCategoryResponseSchema = z.object({
  data: menuCategorySchema,
});

export const menuCategoriesListResponseSchema = z.object({
  data: z.array(menuCategorySchema),
});

export const reorderIdsRequestSchema = z.strictObject({
  orderedIds: z.array(slugIdSchema).min(1).max(200),
});
export type ReorderIdsRequest = z.infer<typeof reorderIdsRequestSchema>;

export const optionChoiceSchema = z.object({
  id: slugIdSchema,
  groupId: slugIdSchema,
  name: z.string().trim().min(1, 'Choice name is required.').max(80),
  priceDeltaPhp: z.number().int().min(0, 'Option price delta cannot be negative.').max(100000),
  available: z.boolean(),
  isDefault: z.boolean(),
  sortOrder: z.number().int().min(0).max(10000),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type OptionChoice = z.infer<typeof optionChoiceSchema>;

export const optionChoiceInputSchema = z.strictObject({
  id: slugIdSchema.optional(),
  name: z.string().trim().min(1, 'Choice name is required.').max(80),
  priceDeltaPhp: z
    .number()
    .int()
    .min(0, 'Option price delta cannot be negative.')
    .max(100000)
    .default(0),
  available: z.boolean().default(true),
  isDefault: z.boolean().default(false),
  sortOrder: z.number().int().min(0).max(10000).optional(),
});
export type OptionChoiceInput = z.infer<typeof optionChoiceInputSchema>;

export const optionChoiceAvailabilityPatchSchema = z.strictObject({
  available: z.boolean(),
  expectedVersion: z.number().int().positive().optional(),
});
export type OptionChoiceAvailabilityPatch = z.infer<typeof optionChoiceAvailabilityPatchSchema>;

export const optionChoiceResponseSchema = z.object({
  data: optionChoiceSchema,
});

function validateOptionGroupInvariants(
  value: {
    selectionMode: OptionSelectionMode;
    required: boolean;
    minSelect: number;
    maxSelect: number | null;
  },
  ctx: z.RefinementCtx,
) {
  if (value.selectionMode === 'single' && value.maxSelect !== 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxSelect'],
      message: 'Single-select option groups must have maxSelect equal to 1.',
    });
  }
  if (value.required && value.minSelect < 1) {
    ctx.addIssue({
      code: 'custom',
      path: ['minSelect'],
      message: 'Required option groups must require at least 1 selection.',
    });
  }
  if (value.maxSelect !== null && value.maxSelect < value.minSelect) {
    ctx.addIssue({
      code: 'custom',
      path: ['maxSelect'],
      message: 'Maximum selections cannot be less than minimum selections.',
    });
  }
}

export const optionGroupSchema = z
  .object({
    id: slugIdSchema,
    name: z.string().trim().min(1, 'Option group name is required.').max(80),
    description: z.string().trim().max(240),
    selectionMode: optionSelectionModeSchema,
    required: z.boolean(),
    minSelect: z.number().int().min(0).max(50),
    maxSelect: z.number().int().min(1).max(50).nullable(),
    sortOrder: z.number().int().min(0).max(10000),
    active: z.boolean(),
    choices: z.array(optionChoiceSchema),
    updatedAt: z.string().optional(),
    version: z.number().int().positive().optional(),
  })
  .superRefine(validateOptionGroupInvariants);
export type OptionGroup = z.infer<typeof optionGroupSchema>;

export const optionGroupInputSchema = z
  .strictObject({
    id: slugIdSchema.optional(),
    name: z.string().trim().min(1, 'Option group name is required.').max(80),
    description: z.string().trim().max(240).default(''),
    selectionMode: optionSelectionModeSchema.default('multi'),
    required: z.boolean().default(false),
    minSelect: z.number().int().min(0).max(50).default(0),
    maxSelect: z.number().int().min(1).max(50).nullable().default(null),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    active: z.boolean().default(true),
    choices: z.array(optionChoiceInputSchema).max(50).default([]),
    expectedVersion: z.number().int().positive().optional(),
  })
  .superRefine((value, ctx) => {
    validateOptionGroupInvariants(value, ctx);
    if (value.selectionMode === 'single') {
      const defaultCount = value.choices.filter((choice) => choice.isDefault).length;
      if (defaultCount > 1) {
        ctx.addIssue({
          code: 'custom',
          path: ['choices'],
          message: 'Single-select option groups can have at most one default choice.',
        });
      }
    }
  });
export type OptionGroupInput = z.infer<typeof optionGroupInputSchema>;

export const optionGroupPatchSchema = z
  .strictObject({
    name: z.string().trim().min(1, 'Option group name is required.').max(80).optional(),
    description: z.string().trim().max(240).optional(),
    selectionMode: optionSelectionModeSchema.optional(),
    required: z.boolean().optional(),
    minSelect: z.number().int().min(0).max(50).optional(),
    maxSelect: z.number().int().min(1).max(50).nullable().optional(),
    sortOrder: z.number().int().min(0).max(10000).optional(),
    active: z.boolean().optional(),
    choices: z.array(optionChoiceInputSchema).max(50).optional(),
    expectedVersion: z.number().int().positive().optional(),
  })
  .refine(
    (patch) =>
      patch.name !== undefined ||
      patch.description !== undefined ||
      patch.selectionMode !== undefined ||
      patch.required !== undefined ||
      patch.minSelect !== undefined ||
      patch.maxSelect !== undefined ||
      patch.sortOrder !== undefined ||
      patch.active !== undefined ||
      patch.choices !== undefined,
    {
      message: 'Provide at least one option group field to update.',
    },
  );
export type OptionGroupPatch = z.infer<typeof optionGroupPatchSchema>;

export const optionGroupResponseSchema = z.object({
  data: optionGroupSchema,
});

export const optionGroupsListResponseSchema = z.object({
  data: z.array(optionGroupSchema),
});

export const menuItemSchema = z.object({
  id: z.string().min(1).max(120),
  name: z.string().min(1).max(120),
  category: slugIdSchema,
  pricePhp: z.number().int().positive().max(100000),
  specLabel: z.string().max(80),
  description: z.string().max(500),
  imageUrl: safeImageUrlSchema,
  available: z.boolean(),
  featured: z.boolean(),
  optionGroupIds: z.array(slugIdSchema).max(20),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  updatedAt: z.string().optional(),
  version: z.number().int().positive().optional(),
});
export type MenuItem = z.infer<typeof menuItemSchema>;

export const menuItemInputSchema = z.strictObject({
  name: z.string().trim().min(1, 'Item name is required.').max(120),
  category: slugIdSchema,
  pricePhp: z.number().int().positive('Price must be greater than zero.').max(100000),
  specLabel: z.string().trim().max(80),
  description: z.string().trim().max(500),
  imageUrl: safeImageUrlSchema,
  available: z.boolean(),
  featured: z.boolean(),
  optionGroupIds: z.array(slugIdSchema).max(20).default([]),
  sortOrder: z.number().int().min(0).max(10000).optional(),
  expectedVersion: z.number().int().positive().optional(),
});
export type MenuItemInput = Omit<MenuItem, 'id' | 'updatedAt' | 'version' | 'sortOrder'>;
export type MenuItemMutationInput = z.infer<typeof menuItemInputSchema>;

export const menuAvailabilityPatchSchema = z.strictObject({
  available: z.boolean(),
  expectedVersion: z.number().int().positive().optional(),
});
export type MenuAvailabilityPatch = z.infer<typeof menuAvailabilityPatchSchema>;

export const menuItemResponseSchema = z.object({
  data: menuItemSchema,
});

export const menuItemsListResponseSchema = z.object({
  data: z.array(menuItemSchema),
});

// Keep image uploads safely below Vercel's 4.5 MB serverless request-body ceiling (including multipart overhead).
export const MENU_IMAGE_MAX_UPLOAD_BYTES = 4 * 1024 * 1024;
export const MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/avif',
] as const;

export const uploadedMenuImageSchema = z.object({
  imageUrl: safeImageUrlSchema,
  path: z.string().min(1).max(200),
  sizeBytes: z.number().int().positive(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  contentType: z.literal('image/webp'),
});
export type UploadedMenuImage = z.infer<typeof uploadedMenuImageSchema>;

export const uploadedMenuImageResponseSchema = z.object({
  data: uploadedMenuImageSchema,
});
export type UploadedMenuImageResponse = z.infer<typeof uploadedMenuImageResponseSchema>;

export const deleteMenuImageRequestSchema = z.strictObject({
  imageUrl: safeImageUrlSchema,
});
export type DeleteMenuImageRequest = z.infer<typeof deleteMenuImageRequestSchema>;

export const DEFAULT_MENU_CATEGORIES: readonly MenuCategory[] = [
  {
    id: 'classic-burgers',
    name: 'Classic Burgers',
    description: 'Pure beef griddle staples with crisp garden toppings.',
    sortOrder: 1,
    active: true,
  },
  {
    id: 'specialty-burgers',
    name: 'Specialty Burgers',
    description: 'Signature sauces, salsa, wasabi mayo, taco beef, and grilled pineapple.',
    sortOrder: 2,
    active: true,
  },
  {
    id: 'heavyweights',
    name: 'Heavyweights & Sandwiches',
    description: 'Double patties, cheesesteaks, and sausage rolls built for big appetites.',
    sortOrder: 3,
    active: true,
  },
  {
    id: 'sides-snacks',
    name: 'Sides & Snacks',
    description: 'Crinkle fries, seasoned potato wedges, and loaded nacho trays.',
    sortOrder: 4,
    active: true,
  },
];

export const DEFAULT_OPTION_GROUPS: readonly OptionGroup[] = [
  {
    id: 'add-ons',
    name: 'Add-ons',
    description: 'Optional extras for your burger or sandwich.',
    selectionMode: 'multi',
    required: false,
    minSelect: 0,
    maxSelect: null,
    sortOrder: 1,
    active: true,
    choices: [
      {
        id: 'sliced-cheese',
        groupId: 'add-ons',
        name: 'Sliced Cheese',
        priceDeltaPhp: 20,
        available: true,
        isDefault: false,
        sortOrder: 1,
      },
      {
        id: 'bacon',
        groupId: 'add-ons',
        name: 'Crispy Bacon',
        priceDeltaPhp: 20,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
      {
        id: 'veggies',
        groupId: 'add-ons',
        name: 'Extra Veggies',
        priceDeltaPhp: 26,
        available: true,
        isDefault: false,
        sortOrder: 3,
      },
      {
        id: 'pineapple',
        groupId: 'add-ons',
        name: 'Grilled Pineapple',
        priceDeltaPhp: 26,
        available: true,
        isDefault: false,
        sortOrder: 4,
      },
    ],
  },
];

export const DEFAULT_MENU_ITEMS: readonly MenuItem[] = [
  {
    id: 'mini-cheese-burger-deluxe',
    name: 'Mini Cheese Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 90,
    specLabel: '65g Junior Beef',
    description:
      'Compact seared beef patty, melted cheese slice, crisp lettuce, tomato, cucumber, and house mayo dressing on a soft bun.',
    imageUrl: '/images/menu/mini-cheese-burger-deluxe.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'burger-deluxe',
    name: 'Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 148,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty topped with fresh onion, crisp lettuce, juicy tomato slices, cool cucumber, and creamy mayo on a soft bun.',
    imageUrl: '/images/menu/burger-deluxe.webp',
    available: true,
    featured: true,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'cheese-burger-deluxe',
    name: 'Cheese Burger Deluxe',
    category: 'classic-burgers',
    pricePhp: 168,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty layered with melted cheddar, warm mayo cheese sauce, lettuce, tomato, onion, and cucumber on a toasted bun.',
    imageUrl: '/images/menu/cheese-burger-deluxe.webp',
    available: true,
    featured: true,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'chicano-burger',
    name: 'Chicano Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty finished with creamy mayo, melted cheese sauce, crisp lettuce, and zesty tomato-chili house salsa.',
    imageUrl: '/images/menu/chicano-burger.webp',
    available: true,
    featured: true,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'mexican-burger',
    name: 'Mexican Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    specLabel: '100g Beef + Taco Meat',
    description:
      '100g pure beef patty stacked with seasoned taco beef, crisp lettuce, creamy mayo, and rich cheese sauce on a toasted bun.',
    imageUrl: '/images/menu/mexican-burger.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'japanese-burger',
    name: 'Japanese Burger',
    category: 'specialty-burgers',
    pricePhp: 158,
    specLabel: '100g Pure Beef',
    description:
      '100g pure beef patty paired with crisp shredded lettuce, punchy wasabi mayo, and rich warm cheese sauce.',
    imageUrl: '/images/menu/japanese-burger.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'american-burger',
    name: 'American Burger',
    category: 'specialty-burgers',
    pricePhp: 178,
    specLabel: '100g Beef + Bacon',
    description:
      '100g pure beef patty topped with creamy mayo, melted cheese sauce, savory sautéed mushrooms, and crispy bacon strips.',
    imageUrl: '/images/menu/american-burger.webp',
    available: true,
    featured: true,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'hawaiian-burger',
    name: 'Hawaiian Burger',
    category: 'specialty-burgers',
    pricePhp: 188,
    specLabel: '100g Beef + Pineapple',
    description:
      '100g pure beef patty with sweet caramelized pineapple, lettuce, tomato, onion, cucumber, creamy mayo, and cheese sauce.',
    imageUrl: '/images/menu/hawaiian-burger.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'hungarian-sandwich',
    name: 'Hungarian Sandwich',
    category: 'heavyweights',
    pricePhp: 175,
    specLabel: 'Grilled Sausage',
    description:
      'Smoky grilled Hungarian sausage tucked into a warm toasted roll with tangy dressing and rich melted cheese sauce.',
    imageUrl: '/images/menu/hungarian-sandwich.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'philly-cheese-steak',
    name: 'Philly Ground Beef Cheese Steak',
    category: 'heavyweights',
    pricePhp: 178,
    specLabel: 'Seared Ground Beef',
    description:
      'Savory seared ground beef tossed with sweet sautéed onions and peppers, smothered in warm cheese sauce on a soft long roll.',
    imageUrl: '/images/menu/philly-cheese-steak.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'ultimate-burger',
    name: 'Ultimate Burger',
    category: 'heavyweights',
    pricePhp: 218,
    specLabel: '100g Beef Loaded',
    description:
      '100g pure beef patty piled high with crispy bacon, sautéed mushrooms, fried egg, crisp garden veggies, and signature sauces.',
    imageUrl: '/images/menu/ultimate-burger.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'ultimate-cheese-burger',
    name: 'Ultimate Cheese Burger',
    category: 'heavyweights',
    pricePhp: 238,
    specLabel: 'Double Cheese Stack',
    description:
      '100g pure beef patty with extra sliced cheddar, molten cheese sauce, crispy bacon, fried egg, and fresh garden crunch.',
    imageUrl: '/images/menu/ultimate-cheese-burger.webp',
    available: true,
    featured: false,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'overload-burger',
    name: 'Overload Burger',
    category: 'heavyweights',
    pricePhp: 298,
    specLabel: 'Double 100g Beef',
    description:
      'Double 100g pure beef patties layered with crispy bacon, spiced taco beef, sautéed mushrooms, double cheese, and full toppings.',
    imageUrl: '/images/menu/overload-burger.webp',
    available: true,
    featured: true,
    optionGroupIds: ['add-ons'],
  },
  {
    id: 'crinkle-cut-fries',
    name: 'Crinkle Cut Fries',
    category: 'sides-snacks',
    pricePhp: 78,
    specLabel: 'Crispy Cut',
    description: 'Golden fried crinkle-cut potato ridges seasoned warm out of the fryer.',
    imageUrl: '/images/menu/crinkle-cut-fries.webp',
    available: true,
    featured: false,
    optionGroupIds: [],
  },
  {
    id: 'potato-wedges',
    name: 'Potato Wedges',
    category: 'sides-snacks',
    pricePhp: 78,
    specLabel: 'Seasoned Wedges',
    description: 'Thick-cut skin-on potato wedges with crisp seasoned edges and fluffy centers.',
    imageUrl: '/images/menu/potato-wedges.webp',
    available: true,
    featured: false,
    optionGroupIds: [],
  },
  {
    id: 'nachos-overload',
    name: 'Nachos Overload',
    category: 'sides-snacks',
    pricePhp: 218,
    specLabel: 'Shareable Tray',
    description:
      'Crispy tortilla chips loaded with seasoned ground beef, diced tomatoes, fresh onions, and generous warm melted cheese sauce.',
    imageUrl: '/images/menu/nachos-overload.webp',
    available: true,
    featured: true,
    optionGroupIds: [],
  },
];
