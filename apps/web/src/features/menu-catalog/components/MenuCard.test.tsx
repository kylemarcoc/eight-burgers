import { DEFAULT_OPTION_GROUPS, type MenuItem, type OptionGroup } from '@menu-kiosk/contracts';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MenuCard } from './MenuCard';

const SIMPLE_FRIES: MenuItem = {
  id: 'crinkle-cut-fries',
  name: 'Crinkle Cut Fries',
  category: 'sides-snacks',
  pricePhp: 78,
  specLabel: 'Crispy Cut',
  description: 'Golden fried crinkle-cut potato ridges.',
  imageUrl: '',
  available: true,
  featured: false,
  optionGroupIds: [],
};

const CUSTOMIZABLE_BURGER: MenuItem = {
  id: 'burger-deluxe',
  name: 'Burger Deluxe',
  category: 'classic-burgers',
  pricePhp: 148,
  specLabel: '100g Pure Beef',
  description: '100g pure beef patty with signature sauce.',
  imageUrl: '',
  available: true,
  featured: true,
  optionGroupIds: ['add-ons'],
};

const REQUIRED_UPCHARGE_GROUP: OptionGroup = {
  id: 'size',
  name: 'Size',
  description: '',
  selectionMode: 'single',
  required: true,
  minSelect: 1,
  maxSelect: 1,
  sortOrder: 1,
  active: true,
  choices: [
    {
      id: 'medium',
      groupId: 'size',
      name: 'Medium',
      priceDeltaPhp: 20,
      available: true,
      isDefault: true,
      sortOrder: 1,
    },
    {
      id: 'large',
      groupId: 'size',
      name: 'Large',
      priceDeltaPhp: 40,
      available: true,
      isDefault: false,
      sortOrder: 2,
    },
  ],
};

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('MenuCard', () => {
  it('supports 1-tap add and Customize / Note link for items with zero option groups and clears timer on unmount', () => {
    vi.useFakeTimers();
    const clearTimeoutSpy = vi.spyOn(window, 'clearTimeout');
    const onAddToCart = vi.fn();
    const onOpenCustomizer = vi.fn();

    const { unmount } = render(
      <MenuCard
        item={SIMPLE_FRIES}
        optionGroups={DEFAULT_OPTION_GROUPS}
        qtyInCart={1}
        onAddToCart={onAddToCart}
        onOpenCustomizer={onOpenCustomizer}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: /add · ₱78/i }));
    expect(onAddToCart).toHaveBeenCalledWith('crinkle-cut-fries');
    expect(screen.getByRole('button', { name: /added to cart/i })).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByRole('button', { name: /add · ₱78/i })).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: /customize \/ note/i }));
    expect(onOpenCustomizer).toHaveBeenCalledWith(SIMPLE_FRIES);

    fireEvent.click(screen.getByRole('button', { name: /add · ₱78/i }));
    unmount();
    expect(clearTimeoutSpy).toHaveBeenCalled();
    clearTimeoutSpy.mockRestore();
  });

  it('opens customizer for items with option groups and displays From ₱X when required choices add a fee', () => {
    const onOpenCustomizer = vi.fn();
    const latte: MenuItem = {
      ...CUSTOMIZABLE_BURGER,
      id: 'iced-latte',
      name: 'Iced Latte',
      pricePhp: 120,
      optionGroupIds: ['size'],
    };

    render(
      <MenuCard
        item={latte}
        optionGroups={[REQUIRED_UPCHARGE_GROUP]}
        qtyInCart={0}
        onAddToCart={vi.fn()}
        onOpenCustomizer={onOpenCustomizer}
      />,
    );

    expect(screen.getByText('From ₱140')).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /customize · from ₱140/i }));
    expect(onOpenCustomizer).toHaveBeenCalledWith(latte);
  });

  it('disables ordering when sold out or when required options are all sold out', () => {
    const { rerender } = render(
      <MenuCard
        item={{ ...CUSTOMIZABLE_BURGER, available: false }}
        optionGroups={DEFAULT_OPTION_GROUPS}
        qtyInCart={0}
        onAddToCart={vi.fn()}
        onOpenCustomizer={vi.fn()}
      />,
    );

    expect(screen.getByText('Sold out')).toBeTruthy();
    expect(
      (screen.getByRole('button', { name: /unavailable/i }) as HTMLButtonElement).disabled,
    ).toBe(true);

    const soldOutSizeGroup: OptionGroup = {
      ...REQUIRED_UPCHARGE_GROUP,
      choices: REQUIRED_UPCHARGE_GROUP.choices.map((choice) => ({ ...choice, available: false })),
    };
    rerender(
      <MenuCard
        item={{ ...CUSTOMIZABLE_BURGER, optionGroupIds: ['size'] }}
        optionGroups={[soldOutSizeGroup]}
        qtyInCart={0}
        onAddToCart={vi.fn()}
        onOpenCustomizer={vi.fn()}
      />,
    );

    expect(
      (screen.getByRole('button', { name: /options unavailable/i }) as HTMLButtonElement).disabled,
    ).toBe(true);
  });
});
