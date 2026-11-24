import { zodResolver } from '@hookform/resolvers/zod';
import {
  formatPhp,
  getAdminPermissions,
  type AdminRole,
  type OptionChoiceInput,
  type OptionGroup,
  type OptionSelectionMode,
} from '@menu-kiosk/contracts';
import { useId, useMemo, useState } from 'react';
import { useFieldArray, useForm, useWatch } from 'react-hook-form';
import { getApiErrorMessage } from '@/shared/lib/api-error';
import { useCatalogQuery, useOptionGroupMutations } from '../hooks/useCatalog';
import {
  optionGroupFormSchema,
  type OptionGroupFormValues,
} from '../schemas/option-group-form.schema';

const EMPTY_GROUP_FORM: OptionGroupFormValues = {
  name: '',
  description: '',
  selectionMode: 'single',
  required: true,
  minSelect: '1',
  maxSelect: '1',
  active: true,
  choices: [{ name: '', priceDeltaPhp: '0', available: true, isDefault: true }],
};

function groupToFormState(group: OptionGroup): OptionGroupFormValues {
  const sortedChoices = [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder);
  return {
    name: group.name,
    description: group.description,
    selectionMode: group.selectionMode,
    required: group.required,
    minSelect: String(group.minSelect),
    maxSelect: group.maxSelect === null ? '' : String(group.maxSelect),
    active: group.active,
    choices: sortedChoices.map((choice) => ({
      id: choice.id,
      name: choice.name,
      priceDeltaPhp: String(choice.priceDeltaPhp),
      available: choice.available,
      isDefault: choice.isDefault,
    })),
  };
}

export type AdminOptionGroupsManagerProps = {
  role?: AdminRole;
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function AdminOptionGroupsManager({
  role = 'owner',
  onStatusMessage,
}: AdminOptionGroupsManagerProps) {
  const { canManageCatalog } = getAdminPermissions(role);
  const catalogQuery = useCatalogQuery();
  const {
    createOptionGroup,
    updateOptionGroup,
    reorderOptionGroups,
    deleteOptionGroup,
    setOptionChoiceAvailability,
  } = useOptionGroupMutations();

  const optionGroups = useMemo(
    () =>
      [...(catalogQuery.data?.optionGroups ?? [])].sort(
        (a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name),
      ),
    [catalogQuery.data?.optionGroups],
  );

  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingVersion, setEditingVersion] = useState<number | undefined>(undefined);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [pendingChoiceIds, setPendingChoiceIds] = useState<ReadonlySet<string>>(() => new Set());

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    setFocus,
    getValues,
    formState: { errors },
  } = useForm<OptionGroupFormValues>({
    defaultValues: EMPTY_GROUP_FORM,
    resolver: zodResolver(optionGroupFormSchema),
  });

  const choicePriceError = Array.isArray(errors.choices)
    ? errors.choices.find((entry) => Boolean(entry?.priceDeltaPhp?.message))?.priceDeltaPhp?.message
    : undefined;
  const formError =
    errors.name?.message ??
    errors.minSelect?.message ??
    errors.maxSelect?.message ??
    choicePriceError ??
    errors.root?.message ??
    null;

  const {
    fields: choiceFields,
    append: appendChoice,
    move: moveChoice,
    remove: removeChoice,
  } = useFieldArray({
    control,
    name: 'choices',
    keyName: 'fieldId',
  });

  const selectionMode = useWatch({ control, name: 'selectionMode' }) ?? 'single';
  const watchedChoices = useWatch({ control, name: 'choices' }) ?? EMPTY_GROUP_FORM.choices;

  const headingId = useId();
  const nameInputId = useId();
  const descInputId = useId();
  const modeSelectId = useId();
  const minInputId = useId();
  const maxInputId = useId();

  function setChoicePending(id: string, pending: boolean) {
    setPendingChoiceIds((prev) => {
      const next = new Set(prev);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }

  function startEdit(group: OptionGroup) {
    setEditingId(group.id);
    setEditingVersion(group.version);
    reset(groupToFormState(group));
    setConfirmDeleteId(null);
    setFocus('name');
  }

  function cancelEdit() {
    setEditingId(null);
    setEditingVersion(undefined);
    reset(EMPTY_GROUP_FORM);
  }

  function handleSelectionModeChange(mode: OptionSelectionMode) {
    if (mode === 'single') {
      const currentChoices = getValues('choices');
      const firstDefaultIdx = currentChoices.findIndex((entry) => entry.isDefault);
      currentChoices.forEach((choice, idx) => {
        setValue(`choices.${idx}.isDefault`, idx === firstDefaultIdx ? choice.isDefault : false);
      });
      setValue('maxSelect', '1');
      setValue('minSelect', getValues('required') ? '1' : '0');
    } else if (getValues('maxSelect') === '1') {
      setValue('maxSelect', '');
    }
  }

  function handleAddChoice() {
    appendChoice({ name: '', priceDeltaPhp: '0', available: true, isDefault: false });
  }

  function handleMoveChoice(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= choiceFields.length) return;
    moveChoice(index, targetIndex);
  }

  function handleRemoveChoice(index: number) {
    removeChoice(index);
  }

  async function onSubmit(values: OptionGroupFormValues) {
    const trimmedName = values.name.trim();
    const parsedMin = Math.max(0, Math.round(Number(values.minSelect || '0')));
    const effectiveMin = values.required ? Math.max(1, parsedMin) : parsedMin;
    const effectiveMax =
      values.selectionMode === 'single'
        ? 1
        : values.maxSelect.trim() === ''
          ? null
          : Math.max(1, Math.round(Number(values.maxSelect)));

    const parsedChoices: OptionChoiceInput[] = [];
    for (let idx = 0; idx < values.choices.length; idx += 1) {
      const draft = values.choices[idx];
      if (!draft) continue;
      const choiceName = draft.name.trim();
      if (!choiceName) continue;
      const delta = Number(draft.priceDeltaPhp);
      parsedChoices.push({
        ...(draft.id ? { id: draft.id } : {}),
        name: choiceName,
        priceDeltaPhp: Math.round(delta),
        available: draft.available,
        isDefault: draft.isDefault,
        sortOrder: parsedChoices.length + 1,
      });
    }

    try {
      if (editingId) {
        const updated = await updateOptionGroup.mutateAsync({
          id: editingId,
          patch: {
            name: trimmedName,
            description: values.description.trim(),
            selectionMode: values.selectionMode,
            required: values.required,
            minSelect: effectiveMin,
            maxSelect: effectiveMax,
            active: values.active,
            choices: parsedChoices,
            expectedVersion: editingVersion,
          },
        });
        onStatusMessage(`Updated option group "${updated.name}".`);
        cancelEdit();
      } else {
        const created = await createOptionGroup.mutateAsync({
          name: trimmedName,
          description: values.description.trim(),
          selectionMode: values.selectionMode,
          required: values.required,
          minSelect: effectiveMin,
          maxSelect: effectiveMax,
          active: values.active,
          choices: parsedChoices,
        });
        onStatusMessage(`Added option group "${created.name}".`);
        reset(EMPTY_GROUP_FORM);
      }
    } catch (error) {
      onStatusMessage(getApiErrorMessage(error, 'Failed to save option group.'), 'error');
    }
  }

  async function handleMoveGroup(index: number, direction: -1 | 1) {
    const targetIndex = index + direction;
    if (targetIndex < 0 || targetIndex >= optionGroups.length) return;
    const next = [...optionGroups];
    const [moved] = next.splice(index, 1);
    if (!moved) return;
    next.splice(targetIndex, 0, moved);
    try {
      await reorderOptionGroups.mutateAsync(next.map((group) => group.id));
      onStatusMessage(`Reordered option group "${moved.name}".`);
    } catch (error) {
      onStatusMessage(getApiErrorMessage(error, 'Failed to reorder option groups.'), 'error');
    }
  }

  async function handleToggleGroupActive(group: OptionGroup) {
    try {
      const updated = await updateOptionGroup.mutateAsync({
        id: group.id,
        patch: { active: !group.active, expectedVersion: group.version },
      });
      onStatusMessage(
        updated.active
          ? `Activated option group "${updated.name}".`
          : `Paused option group "${updated.name}".`,
      );
    } catch (error) {
      onStatusMessage(getApiErrorMessage(error, 'Failed to update option group status.'), 'error');
    }
  }

  async function handleDeleteGroup(group: OptionGroup) {
    try {
      await deleteOptionGroup.mutateAsync(group.id);
      if (editingId === group.id) cancelEdit();
      setConfirmDeleteId(null);
      onStatusMessage(`Deleted option group "${group.name}".`);
    } catch (error) {
      setConfirmDeleteId(null);
      onStatusMessage(getApiErrorMessage(error, 'Unable to delete option group.'), 'error');
    }
  }

  const isMutatingGroup =
    createOptionGroup.isPending ||
    updateOptionGroup.isPending ||
    reorderOptionGroups.isPending ||
    deleteOptionGroup.isPending;

  return (
    <section aria-labelledby={headingId} className="space-y-4">
      <div>
        <h2 id={headingId} className="text-lg font-bold text-ui-text">
          {canManageCatalog
            ? `Option Groups & Modifiers (${optionGroups.length})`
            : `Option Choice Stock (${optionGroups.length})`}
        </h2>
        <p className="mt-0.5 text-xs text-ui-text-muted">
          {canManageCatalog
            ? 'Create reusable modifier groups (such as Size, Milk, Sugar Level, or Add-ons), reorder choices, pause groups, or toggle individual choice stock.'
            : 'Toggle individual modifier choices In Stock or Sold Out in real time.'}
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {canManageCatalog ? (
          <form
            noValidate
            onSubmit={(event) => {
              if (isMutatingGroup) {
                event.preventDefault();
                return;
              }
              void handleSubmit(onSubmit)(event);
            }}
            className="space-y-4 rounded-2xl border border-ui-border bg-ui-surface p-5 lg:col-span-5"
          >
            <div className="flex items-center justify-between gap-2 border-b border-ui-border pb-2.5">
              <h3 className="text-sm font-bold text-ui-text">
                {editingId ? 'Edit option group' : 'Add option group'}
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
                Group name
              </label>
              <input
                id={nameInputId}
                type="text"
                maxLength={80}
                placeholder="e.g. Size, Sugar Level, Add-ons"
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                {...register('name')}
              />
            </div>

            <div>
              <label htmlFor={descInputId} className="block text-xs font-semibold text-ui-text">
                Description (optional)
              </label>
              <input
                id={descInputId}
                type="text"
                maxLength={240}
                placeholder="Helper text shown in the customizer"
                className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text"
                {...register('description')}
              />
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div>
                <label htmlFor={modeSelectId} className="block text-xs font-semibold text-ui-text">
                  Selection
                </label>
                <select
                  id={modeSelectId}
                  className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-xs text-ui-text"
                  {...register('selectionMode', {
                    onChange: (event) =>
                      handleSelectionModeChange(
                        (event.target as HTMLSelectElement).value as OptionSelectionMode,
                      ),
                  })}
                >
                  <option value="single">Single select</option>
                  <option value="multi">Multi select</option>
                </select>
              </div>

              <div>
                <label htmlFor={minInputId} className="block text-xs font-semibold text-ui-text">
                  Min select
                </label>
                <input
                  id={minInputId}
                  type="number"
                  min={0}
                  max={50}
                  disabled={selectionMode === 'single'}
                  className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-xs text-ui-text tabular-nums disabled:opacity-50"
                  {...register('minSelect')}
                />
              </div>

              <div>
                <label htmlFor={maxInputId} className="block text-xs font-semibold text-ui-text">
                  Max select
                </label>
                <input
                  id={maxInputId}
                  type="number"
                  min={1}
                  max={50}
                  disabled={selectionMode === 'single'}
                  placeholder="Unlimited"
                  className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-xs text-ui-text tabular-nums disabled:opacity-50"
                  {...register('maxSelect')}
                />
              </div>
            </div>

            <div className="flex flex-wrap gap-4 text-xs font-medium text-ui-text">
              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-ui-accent h-4 w-4 rounded"
                  {...register('required', {
                    onChange: (event) => {
                      const required = (event.target as HTMLInputElement).checked;
                      const currentMin = getValues('minSelect');
                      const currentMode = getValues('selectionMode');
                      setValue(
                        'minSelect',
                        required
                          ? String(Math.max(1, Number(currentMin || '0')))
                          : currentMode === 'single'
                            ? '0'
                            : currentMin,
                      );
                    },
                  })}
                />
                <span>Required selection</span>
              </label>

              <label className="flex cursor-pointer items-center gap-2">
                <input
                  type="checkbox"
                  className="accent-ui-accent h-4 w-4 rounded"
                  {...register('active')}
                />
                <span>Active</span>
              </label>
            </div>

            <div className="space-y-2 border-t border-ui-border pt-3">
              <div className="flex items-center justify-between gap-2">
                <h4 className="text-xs font-semibold text-ui-text">
                  Choices ({choiceFields.length})
                </h4>
                <button
                  type="button"
                  onClick={handleAddChoice}
                  className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
                >
                  Add choice
                </button>
              </div>

              <div className="space-y-2">
                {choiceFields.map((choiceField, index) => {
                  const choiceName = watchedChoices[index]?.name ?? choiceField.name;
                  return (
                    <div
                      key={choiceField.fieldId}
                      className="space-y-2 rounded-xl border border-ui-border bg-ui-canvas p-2.5"
                    >
                      <div className="grid grid-cols-12 gap-2">
                        <input
                          type="text"
                          maxLength={80}
                          aria-label={`Choice ${index + 1} name`}
                          placeholder="Choice name (e.g. Oat Milk)"
                          className="col-span-7 rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs text-ui-text"
                          {...register(`choices.${index}.name`)}
                        />
                        <input
                          type="number"
                          min={0}
                          max={100000}
                          step={1}
                          aria-label={`Choice ${index + 1} extra price`}
                          placeholder="+₱0"
                          className="col-span-5 rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs text-ui-text tabular-nums"
                          {...register(`choices.${index}.priceDeltaPhp`)}
                        />
                      </div>
                      <div className="flex flex-wrap items-center justify-between gap-2 text-[11px]">
                        <div className="flex items-center gap-3">
                          <label className="flex cursor-pointer items-center gap-1.5 text-ui-text">
                            <input
                              type="checkbox"
                              className="accent-ui-accent h-3.5 w-3.5 rounded"
                              {...register(`choices.${index}.available`)}
                            />
                            <span>In stock</span>
                          </label>
                          <label className="flex cursor-pointer items-center gap-1.5 text-ui-text">
                            <input
                              type="checkbox"
                              className="accent-ui-accent h-3.5 w-3.5 rounded"
                              {...register(`choices.${index}.isDefault`, {
                                onChange: (event) => {
                                  if (
                                    (event.target as HTMLInputElement).checked &&
                                    getValues('selectionMode') === 'single'
                                  ) {
                                    getValues('choices').forEach((_, idx) => {
                                      if (idx !== index) {
                                        setValue(`choices.${idx}.isDefault`, false);
                                      }
                                    });
                                  }
                                },
                              })}
                            />
                            <span>Default</span>
                          </label>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            disabled={index === 0}
                            aria-label={`Move choice ${choiceName || index + 1} up`}
                            onClick={() => handleMoveChoice(index, -1)}
                            className="rounded border border-ui-border bg-ui-surface px-2 py-0.5 text-ui-text hover:bg-ui-surface-muted disabled:opacity-40"
                          >
                            Up
                          </button>
                          <button
                            type="button"
                            disabled={index === choiceFields.length - 1}
                            aria-label={`Move choice ${choiceName || index + 1} down`}
                            onClick={() => handleMoveChoice(index, 1)}
                            className="rounded border border-ui-border bg-ui-surface px-2 py-0.5 text-ui-text hover:bg-ui-surface-muted disabled:opacity-40"
                          >
                            Down
                          </button>
                          <button
                            type="button"
                            aria-label={`Remove choice ${choiceName || index + 1}`}
                            onClick={() => handleRemoveChoice(index)}
                            className="rounded border border-ui-border bg-ui-surface px-2 py-0.5 font-semibold text-ui-error hover:bg-ui-surface-muted"
                          >
                            Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {formError ? (
              <p role="alert" className="text-xs font-semibold text-ui-error">
                {formError}
              </p>
            ) : null}

            <button
              type="submit"
              disabled={isMutatingGroup}
              className="w-full rounded-xl bg-ui-accent px-4 py-2 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
            >
              {editingId ? 'Save option group' : 'Add option group'}
            </button>
          </form>
        ) : null}

        <div className={`space-y-3 ${canManageCatalog ? 'lg:col-span-7' : 'lg:col-span-12'}`}>
          {optionGroups.length === 0 ? (
            <div className="rounded-2xl border border-ui-border bg-ui-surface p-6 text-center text-sm text-ui-text-muted">
              No option groups configured yet.
            </div>
          ) : (
            optionGroups.map((group, index) => {
              const sortedChoices = [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder);
              const isConfirming = confirmDeleteId === group.id;
              return (
                <article
                  key={group.id}
                  className={`space-y-3 rounded-2xl border bg-ui-surface p-4 ${
                    editingId === group.id ? 'border-ui-accent' : 'border-ui-border'
                  }`}
                >
                  <div className="flex flex-col gap-2 border-b border-ui-border pb-3 sm:flex-row sm:items-start sm:justify-between">
                    <div className="space-y-0.5">
                      <div className="flex flex-wrap items-center gap-2">
                        <h3 className="text-sm font-bold text-ui-text">{group.name}</h3>
                        <span className="rounded-md bg-ui-surface-muted px-2 py-0.5 text-[11px] text-ui-text-muted">
                          {group.selectionMode === 'single' ? 'Single' : 'Multi'} ·{' '}
                          {group.required ? 'Required' : 'Optional'}
                        </span>
                        {!group.active ? (
                          <span className="rounded-md border border-ui-error/40 bg-ui-error/10 px-2 py-0.5 text-[11px] font-semibold text-ui-error">
                            Paused
                          </span>
                        ) : null}
                      </div>
                      {group.description ? (
                        <p className="text-xs text-ui-text-muted">{group.description}</p>
                      ) : null}
                    </div>

                    {canManageCatalog ? (
                      <div className="flex flex-wrap items-center gap-1.5 sm:shrink-0">
                        <button
                          type="button"
                          disabled={isMutatingGroup || index === 0}
                          aria-label={`Move option group ${group.name} up`}
                          onClick={() => void handleMoveGroup(index, -1)}
                          className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-40"
                        >
                          Move up
                        </button>
                        <button
                          type="button"
                          disabled={isMutatingGroup || index === optionGroups.length - 1}
                          aria-label={`Move option group ${group.name} down`}
                          onClick={() => void handleMoveGroup(index, 1)}
                          className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-text hover:bg-ui-surface-muted disabled:opacity-40"
                        >
                          Move down
                        </button>
                        <button
                          type="button"
                          disabled={isMutatingGroup}
                          onClick={() => void handleToggleGroupActive(group)}
                          className="rounded-lg border border-ui-border bg-ui-surface-muted px-2.5 py-1 text-xs font-medium text-ui-text hover:bg-ui-canvas disabled:opacity-50"
                        >
                          {group.active ? 'Pause' : 'Resume'}
                        </button>
                        <button
                          type="button"
                          disabled={isMutatingGroup}
                          aria-label={`Edit option group ${group.name}`}
                          onClick={() => startEdit(group)}
                          className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-50"
                        >
                          Edit
                        </button>
                        {isConfirming ? (
                          <>
                            <button
                              type="button"
                              disabled={isMutatingGroup}
                              aria-label={`Confirm delete option group ${group.name}`}
                              onClick={() => void handleDeleteGroup(group)}
                              className="rounded-lg bg-ui-error px-2.5 py-1 text-xs font-semibold text-ui-on-error hover:opacity-90 disabled:opacity-50"
                            >
                              Confirm
                            </button>
                            <button
                              type="button"
                              disabled={isMutatingGroup}
                              onClick={() => setConfirmDeleteId(null)}
                              className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-text"
                            >
                              Cancel
                            </button>
                          </>
                        ) : (
                          <button
                            type="button"
                            disabled={isMutatingGroup}
                            aria-label={`Delete option group ${group.name}`}
                            onClick={() => setConfirmDeleteId(group.id)}
                            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-error hover:bg-ui-surface-muted disabled:opacity-50"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    ) : null}
                  </div>

                  {sortedChoices.length === 0 ? (
                    <p className="text-xs text-ui-text-muted">No choices in this group.</p>
                  ) : (
                    <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {sortedChoices.map((choice) => {
                        const isPending = pendingChoiceIds.has(choice.id);
                        return (
                          <li
                            key={choice.id}
                            className="flex items-center justify-between gap-2 rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-xs"
                          >
                            <div className="min-w-0">
                              <span className="font-semibold text-ui-text">{choice.name}</span>
                              <span className="ml-1.5 text-ui-text-muted tabular-nums">
                                {choice.priceDeltaPhp > 0
                                  ? `+${formatPhp(choice.priceDeltaPhp)}`
                                  : '₱0'}
                              </span>
                              {choice.isDefault ? (
                                <span className="ml-1.5 rounded bg-ui-surface-muted px-1.5 py-0.5 text-[10px] font-medium text-ui-text-muted">
                                  Default
                                </span>
                              ) : null}
                            </div>

                            <button
                              type="button"
                              disabled={isPending}
                              aria-pressed={choice.available}
                              aria-label={`${choice.available ? 'In Stock' : 'Sold Out'} — toggle choice ${choice.name}`}
                              onClick={() => {
                                setChoicePending(choice.id, true);
                                void setOptionChoiceAvailability
                                  .mutateAsync({
                                    id: choice.id,
                                    available: !choice.available,
                                    expectedVersion: choice.version,
                                  })
                                  .catch((error: unknown) => {
                                    onStatusMessage(
                                      getApiErrorMessage(
                                        error,
                                        'Failed to toggle option availability.',
                                      ),
                                      'error',
                                    );
                                  })
                                  .finally(() => {
                                    setChoicePending(choice.id, false);
                                  });
                              }}
                              className={`shrink-0 rounded-lg border px-2 py-1 text-[11px] font-semibold transition-colors motion-reduce:transition-none disabled:opacity-50 ${
                                choice.available
                                  ? 'border-ui-border bg-ui-surface-muted text-ui-text hover:bg-ui-surface'
                                  : 'border-ui-error/40 bg-ui-error/10 text-ui-error'
                              }`}
                            >
                              {choice.available ? 'In Stock' : 'Sold Out'}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </article>
              );
            })
          )}
        </div>
      </div>
    </section>
  );
}
