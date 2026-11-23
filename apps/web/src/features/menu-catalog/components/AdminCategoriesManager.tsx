import type { MenuCategory } from '@menu-kiosk/contracts';
import { useId, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useCatalogQuery, useCategoryMutations } from '../hooks/useCatalog';

type CategoryFormState = {
  name: string;
  description: string;
  active: boolean;
};

const EMPTY_CATEGORY_FORM: CategoryFormState = {
  name: '',
  description: '',
  active: true,
};

export type AdminCategoriesManagerProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function AdminCategoriesManager({ onStatusMessage }: AdminCategoriesManagerProps) {
  const catalogQuery = useCatalogQuery();
  const { createCategory, updateCategory, reorderCategories, deleteCategory } =
    useCategoryMutations();

  const categories = useMemo(
    () =>
      [...(catalogQuery.data?.categories ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [catalogQuery.data?.categories],
  );
  const menu = useMemo(() => catalogQuery.data?.menu ?? [], [catalogQuery.data?.menu]);

  const itemCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of menu) {
      counts.set(item.category, (counts.get(item.category) ?? 0) + 1);
    }
    return counts;
  }, [menu]);

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined);
  const [form, setForm] = useState<CategoryFormState>(EMPTY_CATEGORY_FORM);
  const [nameError, setNameError] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const headingId = useId();
  const nameInputId = useId();
  const descInputId = useId();
  const nameErrorId = useId();
  const nameInputRef = useRef<HTMLInputElement | null>(null);

  function startEdit(category: MenuCategory) {
    setEditingId(category.id);
    setEditingVersion(category.version);
    setForm({
      name: category.name,
      description: category.description,
      active: category.active,
    });
    setNameError(null);
    setConfirmDeleteId(null);
    nameInputRef.current?.focus();
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingVersion(undefined);
    setForm(EMPTY_CATEGORY_FORM);
    setNameError(null);
  }

  async function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmedName = form.name.trim();
    if (!trimmedName) {
      setNameError('Enter a category name.');
      nameInputRef.current?.focus();
      return;
    }

    setNameError(null);
    try {
      if (editingId) {
        const updated = await updateCategory.mutateAsync({
          id: editingId,
          patch: {
            name: trimmedName,
            description: form.description.trim(),
            active: form.active,
            expectedVersion: editingVersion,
          },
        });
        onStatusMessage(`Updated category "${updated.name}".`);
        cancelEdit();
      } else {
        const created = await createCategory.mutateAsync({
          name: trimmedName,
          description: form.description.trim(),
          active: form.active,
        });
        onStatusMessage(`Added category "${created.name}".`);
        setForm(EMPTY_CATEGORY_FORM);
      }
    } catch (error) {
      onStatusMessage(getApiErrorMessage(error, 'Failed to save category.'), 'error');
    }
  }

  async function handleMove(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= categories.length) return;
    const reordered = [...categories];
    const [moved] = reordered.splice(index, 1);
    if (!moved) return;
    reordered.splice(targetIndex, 0, moved);
    try {
      await reorderCategories.mutateAsync(reordered.map((category) => category.id));
      onStatusMessage(`Reordered category "${moved.name}".`);
    } catch (error) {
      onStatusMessage(getApiErrorMessage(error, 'Failed to reorder categories.'), 'error');
    }
  }

  async function handleDelete(category: MenuCategory) {
    try {
      await deleteCategory.mutateAsync(category.id);
      if (editingId === category.id) cancelEdit();
      setConfirmDeleteId(null);
      onStatusMessage(`Deleted category "${category.name}".`);
    } catch (error) {
      setConfirmDeleteId(null);
      onStatusMessage(getApiErrorMessage(error, 'Unable to delete category.'), 'error');
    }
  }

  const isBusy =
    createCategory.isPending ||
    updateCategory.isPending ||
    reorderCategories.isPending ||
    deleteCategory.isPending;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h2 id={headingId} className="text-lg font-bold text-ui-text">
          Menu Categories ({categories.length})
        </h2>
        <p className="mt-0.5 text-xs text-ui-text-muted">
          Organize menu sections and control storefront tab order. Categories with assigned items
          cannot be deleted until their items are moved.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        <form
          noValidate
          onSubmit={(event) => void handleSubmit(event)}
          className="space-y-3 rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-5"
        >
          <div className="flex items-center justify-between gap-2 border-b border-ui-border pb-2.5">
            <h3 className="text-sm font-bold text-ui-text">
              {editingId ? 'Edit category' : 'Add category'}
            </h3>
            {editingId ? (
              <button
                type="button"
                onClick={cancelEdit}
                className="text-xs font-medium text-ui-text-muted underline hover:text-ui-text"
              >
                Cancel edit
              </button>
            ) : null}
          </div>

          <div>
            <label htmlFor={nameInputId} className="block text-xs font-semibold text-ui-text">
              Category name
            </label>
            <input
              ref={nameInputRef}
              id={nameInputId}
              type="text"
              maxLength={80}
              value={form.name}
              aria-invalid={Boolean(nameError)}
              aria-describedby={nameError ? nameErrorId : undefined}
              onChange={(event) => {
                setForm((prev) => ({ ...prev, name: event.target.value }));
                if (nameError && event.target.value.trim()) setNameError(null);
              }}
              placeholder="e.g. Espresso, Matcha, Rice Meals"
              className={`mt-1 w-full rounded-xl border bg-ui-canvas px-3 py-2 text-sm text-ui-text ${
                nameError ? 'border-ui-error' : 'border-ui-border'
              }`}
            />
            {nameError ? (
              <p id={nameErrorId} role="alert" className="mt-1 text-xs font-semibold text-ui-error">
                {nameError}
              </p>
            ) : null}
          </div>

          <div>
            <label htmlFor={descInputId} className="block text-xs font-semibold text-ui-text">
              Short description (optional)
            </label>
            <input
              id={descInputId}
              type="text"
              maxLength={240}
              value={form.description}
              onChange={(event) =>
                setForm((prev) => ({ ...prev, description: event.target.value }))
              }
              placeholder="Brief note about items in this section"
              className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-ui-text">
            <input
              type="checkbox"
              checked={form.active}
              onChange={(event) => setForm((prev) => ({ ...prev, active: event.target.checked }))}
              className="accent-ui-accent h-4 w-4 rounded"
            />
            <span>Active on storefront</span>
          </label>

          <button
            type="submit"
            disabled={isBusy}
            className="w-full rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
          >
            {editingId ? 'Save category' : 'Add category'}
          </button>
        </form>

        <div className="space-y-2.5 lg:col-span-7">
          {categories.length === 0 ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-center text-sm text-ui-text-muted">
              No categories yet. Add your first category before creating menu items.
            </div>
          ) : (
            <ul className="space-y-2.5">
              {categories.map((category, index) => {
                const count = itemCountByCategory.get(category.id) ?? 0;
                const isConfirming = confirmDeleteId === category.id;
                return (
                  <li
                    key={category.id}
                    className={`flex flex-col gap-3 rounded-2xl border bg-ui-surface p-3.5 sm:flex-row sm:items-center sm:justify-between ${
                      editingId === category.id ? 'border-ui-accent' : 'border-ui-border'
                    }`}
                  >
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-sm font-semibold text-ui-text">{category.name}</span>
                        <span className="rounded-md bg-ui-surface-muted px-2 py-0.5 text-[11px] text-ui-text-muted tabular-nums">
                          {count} {count === 1 ? 'item' : 'items'}
                        </span>
                        {!category.active ? (
                          <span className="rounded-md border border-ui-error/40 bg-ui-error/10 px-2 py-0.5 text-[11px] font-semibold text-ui-error">
                            Hidden
                          </span>
                        ) : null}
                      </div>
                      {category.description ? (
                        <p className="mt-0.5 text-xs text-ui-text-muted">{category.description}</p>
                      ) : null}
                    </div>

                    <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                      <button
                        type="button"
                        disabled={isBusy || index === 0}
                        aria-label={`Move ${category.name} up`}
                        onClick={() => void handleMove(index, -1)}
                        className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-40"
                      >
                        Move up
                      </button>
                      <button
                        type="button"
                        disabled={isBusy || index === categories.length - 1}
                        aria-label={`Move ${category.name} down`}
                        onClick={() => void handleMove(index, 1)}
                        className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-40"
                      >
                        Move down
                      </button>
                      <button
                        type="button"
                        disabled={isBusy}
                        aria-label={`Edit category ${category.name}`}
                        onClick={() => startEdit(category)}
                        className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-50"
                      >
                        Edit
                      </button>
                      {isConfirming ? (
                        <>
                          <button
                            type="button"
                            disabled={isBusy}
                            aria-label={`Confirm delete category ${category.name}`}
                            onClick={() => void handleDelete(category)}
                            className="rounded-lg bg-ui-error px-2.5 py-1 text-xs font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-50"
                          >
                            Confirm
                          </button>
                          <button
                            type="button"
                            disabled={isBusy}
                            onClick={() => setConfirmDeleteId(null)}
                            className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-text"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          disabled={isBusy}
                          aria-label={`Delete category ${category.name}`}
                          onClick={() => setConfirmDeleteId(category.id)}
                          className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-error hover:bg-ui-surface-muted disabled:opacity-50"
                        >
                          Delete
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
