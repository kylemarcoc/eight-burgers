import type { MenuItem, OptionGroup } from '@menu-kiosk/contracts';
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ItemCustomizerModal } from './ItemCustomizerModal';

const SAMPLE_LATTE: MenuItem = {
  id: 'iced-latte',
  name: 'Iced Latte',
  category: 'espresso',
  pricePhp: 130,
  specLabel: 'Espresso + Milk',
  description: 'Double-shot espresso over milk and ice.',
  imageUrl: '',
  available: true,
  featured: true,
  optionGroupIds: ['size', 'milk', 'add-ons'],
};

const SAMPLE_OPTION_GROUPS: OptionGroup[] = [
  {
    id: 'size',
    name: 'Size',
    description: 'Choose cup size',
    selectionMode: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 1,
    active: true,
    choices: [
      {
        id: 'size-regular',
        groupId: 'size',
        name: 'Regular (12oz)',
        priceDeltaPhp: 0,
        available: true,
        isDefault: true,
        sortOrder: 1,
      },
      {
        id: 'size-large',
        groupId: 'size',
        name: 'Large (16oz)',
        priceDeltaPhp: 30,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'milk',
    name: 'Milk',
    description: '',
    selectionMode: 'single',
    required: true,
    minSelect: 1,
    maxSelect: 1,
    sortOrder: 2,
    active: true,
    choices: [
      {
        id: 'milk-whole',
        groupId: 'milk',
        name: 'Whole Milk',
        priceDeltaPhp: 0,
        available: true,
        isDefault: true,
        sortOrder: 1,
      },
      {
        id: 'milk-oat',
        groupId: 'milk',
        name: 'Oat Milk',
        priceDeltaPhp: 35,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
    ],
  },
  {
    id: 'add-ons',
    name: 'Add-ons',
    description: 'Choose up to 1 extra',
    selectionMode: 'multi',
    required: false,
    minSelect: 0,
    maxSelect: 1,
    sortOrder: 3,
    active: true,
    choices: [
      {
        id: 'extra-shot',
        groupId: 'add-ons',
        name: 'Extra Espresso Shot',
        priceDeltaPhp: 40,
        available: true,
        isDefault: false,
        sortOrder: 1,
      },
      {
        id: 'vanilla-syrup',
        groupId: 'add-ons',
        name: 'Vanilla Syrup',
        priceDeltaPhp: 20,
        available: true,
        isDefault: false,
        sortOrder: 2,
      },
    ],
  },
];

afterEach(() => {
  cleanup();
  document.body.style.overflow = '';
});

describe('ItemCustomizerModal', () => {
  it('pre-selects defaults, enforces multi-select max, calculates live +₱X, and submits itemNote', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();

    render(
      <ItemCustomizerModal
        item={SAMPLE_LATTE}
        optionGroups={SAMPLE_OPTION_GROUPS}
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Iced Latte' });
    expect((within(dialog).getByLabelText(/regular \(12oz\)/i) as HTMLInputElement).checked).toBe(
      true,
    );
    expect((within(dialog).getByLabelText(/whole milk/i) as HTMLInputElement).checked).toBe(true);

    // Pick Large (+30), Oat Milk (+35), and Extra Shot (+40) -> 130 + 105 = 235
    fireEvent.click(within(dialog).getByLabelText(/large \(16oz\)/i));
    fireEvent.click(within(dialog).getByLabelText(/oat milk/i));
    fireEvent.click(within(dialog).getByLabelText(/extra espresso shot/i));

    // Max select = 1 disables unchecked multi choice
    expect((within(dialog).getByLabelText(/vanilla syrup/i) as HTMLInputElement).disabled).toBe(
      true,
    );

    fireEvent.change(within(dialog).getByLabelText(/special instruction/i), {
      target: { value: 'Less ice please' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: /increase quantity/i }));

    const submitBtn = within(dialog).getByRole('button', { name: /add to cart · ₱470/i });
    fireEvent.click(submitBtn);

    expect(onConfirm).toHaveBeenCalledWith({
      selectedOptionIds: ['extra-shot', 'milk-oat', 'size-large'],
      itemNote: 'Less ice please',
      quantity: 2,
    });
  });

  it('disables confirmation with Options unavailable guard when all choices in a required group are sold out', () => {
    const soldOutGroups: OptionGroup[] = SAMPLE_OPTION_GROUPS.map((group) =>
      group.id === 'size'
        ? {
            ...group,
            choices: group.choices.map((choice) => ({ ...choice, available: false })),
          }
        : group,
    );

    render(
      <ItemCustomizerModal
        item={SAMPLE_LATTE}
        optionGroups={soldOutGroups}
        onConfirm={vi.fn()}
        onClose={vi.fn()}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Iced Latte' });
    const submitBtn = within(dialog).getByRole('button', {
      name: /options unavailable/i,
    }) as HTMLButtonElement;
    expect(submitBtn.disabled).toBe(true);
    expect(
      within(dialog).getByText(
        /one or more required options for this item are currently sold out/i,
      ),
    ).toBeTruthy();
  });

  it('closes on Escape and lets users clear unavailable choices when repairing a stale cart line', () => {
    const onConfirm = vi.fn();
    const onClose = vi.fn();
    const oatSoldOutGroups: OptionGroup[] = SAMPLE_OPTION_GROUPS.map((group) =>
      group.id === 'milk'
        ? {
            ...group,
            choices: group.choices.map((choice) =>
              choice.id === 'milk-oat' ? { ...choice, available: false } : choice,
            ),
          }
        : group,
    );

    render(
      <ItemCustomizerModal
        item={SAMPLE_LATTE}
        optionGroups={oatSoldOutGroups}
        initialSelectedOptionIds={['size-regular', 'milk-oat']}
        initialItemNote="No sugar"
        submitLabel="Update item"
        onConfirm={onConfirm}
        onClose={onClose}
      />,
    );

    const dialog = screen.getByRole('dialog', { name: 'Iced Latte' });
    expect(within(dialog).getByText(/"oat milk" is currently sold out\./i)).toBeTruthy();

    fireEvent.click(within(dialog).getByLabelText(/whole milk/i));
    fireEvent.click(within(dialog).getByRole('button', { name: /update item · ₱130/i }));

    expect(onConfirm).toHaveBeenCalledWith({
      selectedOptionIds: ['milk-whole', 'size-regular'],
      itemNote: 'No sugar',
      quantity: 1,
    });

    fireEvent.keyDown(window, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
