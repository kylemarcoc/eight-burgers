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

  it('preserves existing choice database IDs when editing and reordering choices', async () => {
    const { spy, state } = installMockShopApi({ authenticated: true, role: 'owner' });

    render(
      <TestQueryWrapper>
        <AdminOptionGroupsManager role="owner" onStatusMessage={vi.fn()} />
      </TestQueryWrapper>,
    );

    const addOnsBefore = state.optionGroups.find((g) => g.id === 'add-ons');
    expect(addOnsBefore).toBeTruthy();
    const originalIds = [...(addOnsBefore?.choices ?? [])]
      .sort((a, b) => a.sortOrder - b.sortOrder)
      .map((c) => c.id);
    expect(originalIds.length).toBeGreaterThanOrEqual(2);

    fireEvent.click(await screen.findByRole('button', { name: /edit option group add-ons/i }));

    // Move the second choice up so order swaps, then save
    const secondChoiceName = [...(addOnsBefore?.choices ?? [])].sort(
      (a, b) => a.sortOrder - b.sortOrder,
    )[1]?.name;
    expect(secondChoiceName).toBeTruthy();
    fireEvent.click(
      screen.getByRole('button', {
        name: new RegExp(`move choice ${secondChoiceName} up`, 'i'),
      }),
    );
    fireEvent.click(screen.getByRole('button', { name: /save option group/i }));

    await waitFor(() => {
      const patchCall = spy.mock.calls.find(
        ([input, init]) =>
          String(input) === '/api/v1/admin/option-groups/add-ons' && init?.method === 'PATCH',
      );
      expect(patchCall).toBeTruthy();
      const body = JSON.parse(String(patchCall?.[1]?.body ?? '{}')) as {
        choices?: Array<{ id?: string }>;
      };
      expect(body.choices?.map((c) => c.id)).toEqual([
        originalIds[1],
        originalIds[0],
        ...originalIds.slice(2),
      ]);
    });
  });
});
