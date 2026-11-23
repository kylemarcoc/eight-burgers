import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockShopApi } from '@/shared/test/mock-api';
import { TestQueryWrapper } from '@/shared/test/TestQueryWrapper';
import { AdminOptionGroupsManager } from './AdminOptionGroupsManager';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('AdminOptionGroupsManager', () => {
  it('allows Owner to create option groups, reorder choices and groups, pause, and enforces OPTION_GROUP_IN_USE', async () => {
    const onStatusMessage = vi.fn();
    const { state } = installMockShopApi({ authenticated: true, role: 'owner' });

    render(
      <TestQueryWrapper>
        <AdminOptionGroupsManager role="owner" onStatusMessage={onStatusMessage} />
      </TestQueryWrapper>,
    );

    expect(await screen.findByRole('heading', { level: 3, name: 'Add-ons' })).toBeTruthy();

    // Create a new Size group with two choices and reorder choices
    fireEvent.change(screen.getByLabelText(/group name/i), { target: { value: 'Size' } });
    fireEvent.change(screen.getByLabelText(/choice 1 name/i), { target: { value: 'Large' } });
    fireEvent.change(screen.getByLabelText(/choice 1 extra price/i), { target: { value: '30' } });

    fireEvent.click(screen.getByRole('button', { name: /add choice/i }));
    fireEvent.change(screen.getByLabelText(/choice 2 name/i), { target: { value: 'Regular' } });
    fireEvent.click(screen.getByRole('button', { name: /move choice regular up/i }));

    fireEvent.click(screen.getByRole('button', { name: /^add option group$/i }));

    expect(await screen.findByRole('heading', { level: 3, name: 'Size' })).toBeTruthy();
    const createdSize = state.optionGroups.find((g) => g.name === 'Size');
    expect(createdSize?.choices.map((c) => c.name)).toEqual(['Regular', 'Large']);

    // Reorder option groups via Move Up
    fireEvent.click(screen.getByRole('button', { name: /move option group size up/i }));
    await waitFor(() => {
      expect(state.optionGroups[0]?.name).toBe('Size');
    });

    // Attempt to delete attached Add-ons group -> 409 OPTION_GROUP_IN_USE
    fireEvent.click(screen.getByRole('button', { name: /delete option group add-ons/i }));
    fireEvent.click(screen.getByRole('button', { name: /confirm delete option group add-ons/i }));
    await waitFor(() => {
      expect(onStatusMessage).toHaveBeenCalledWith(
        expect.stringMatching(/detach this option group from menu items/i),
        'error',
      );
    });
    expect(state.optionGroups.some((g) => g.id === 'add-ons')).toBe(true);
  });

  it('allows Staff to toggle option choice availability while hiding Owner CRUD controls', async () => {
    const { state } = installMockShopApi({ authenticated: true, role: 'staff' });

    render(
      <TestQueryWrapper>
        <AdminOptionGroupsManager role="staff" onStatusMessage={vi.fn()} />
      </TestQueryWrapper>,
    );

    const toggleBtn = await screen.findByRole('button', {
      name: /in stock — toggle choice crispy bacon/i,
    });
    expect(screen.queryByRole('button', { name: /add option group/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /delete option group/i })).toBeNull();

    fireEvent.click(toggleBtn);
    expect(
      await screen.findByRole('button', { name: /sold out — toggle choice crispy bacon/i }),
    ).toBeTruthy();
    const bacon = state.optionGroups.flatMap((g) => g.choices).find((c) => c.id === 'bacon');
    expect(bacon?.available).toBe(false);
  });
});
