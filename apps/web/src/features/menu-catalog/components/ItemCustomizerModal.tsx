import {
  ITEM_NOTE_MAX_LENGTH,
  formatPhp,
  getActiveItemOptionGroups,
  getDefaultSelectedOptionIds,
  isMenuItemOrderable,
  normalizeItemNote,
  normalizeSelectedOptionIds,
  validateItemOptionSelections,
  type MenuItem,
  type OptionGroup,
} from '@menu-kiosk/contracts';
import { useEffect, useId, useMemo, useRef, useState, type SubmitEvent } from 'react';
import { createPortal } from 'react-dom';
import { FoodImage } from '@/shared/components/FoodImage';

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type="hidden"])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    (element) =>
      !element.hasAttribute('disabled') &&
      element.tabIndex !== -1 &&
      !element.hasAttribute('hidden') &&
      !element.closest('[hidden], [inert]'),
  );
}

function getGroupRequirementText(group: OptionGroup): string {
  const effectiveMin = group.required ? Math.max(1, group.minSelect) : group.minSelect;
  const effectiveMax = group.selectionMode === 'single' ? 1 : group.maxSelect;

  if (group.selectionMode === 'single') {
    return group.required ? 'Required · Choose 1' : 'Optional · Choose up to 1';
  }
  if (effectiveMin > 0 && effectiveMax !== null) {
    return effectiveMin === effectiveMax
      ? `Required · Choose ${effectiveMin}`
      : `Required · Choose ${effectiveMin}–${effectiveMax}`;
  }
  if (effectiveMin > 0) {
    return `Required · Choose at least ${effectiveMin}`;
  }
  if (effectiveMax !== null) {
    return `Optional · Choose up to ${effectiveMax}`;
  }
  return 'Optional · Select any';
}

export type ItemCustomizerModalProps = {
  item: MenuItem;
  optionGroups: readonly OptionGroup[];
  initialSelectedOptionIds?: readonly string[];
  initialItemNote?: string;
  initialQuantity?: number;
  submitLabel?: string;
  onConfirm: (selection: {
    selectedOptionIds: string[];
    itemNote: string;
    quantity: number;
  }) => void;
  onClose: () => void;
};

export function ItemCustomizerModal({
  item,
  optionGroups,
  initialSelectedOptionIds,
  initialItemNote = '',
  initialQuantity = 1,
  submitLabel = 'Add to cart',
  onConfirm,
  onClose,
}: ItemCustomizerModalProps) {
  const activeGroups = useMemo(
    () => getActiveItemOptionGroups(item, optionGroups),
    [item, optionGroups],
  );

  const [selectedIds, setSelectedIds] = useState<string[]>(() =>
    initialSelectedOptionIds !== undefined
      ? normalizeSelectedOptionIds(initialSelectedOptionIds)
      : getDefaultSelectedOptionIds(item, optionGroups),
  );
  const [itemNote, setItemNote] = useState(() => normalizeItemNote(initialItemNote));
  const [quantity, setQuantity] = useState(() =>
    Math.min(50, Math.max(1, Math.round(initialQuantity))),
  );
  const [showValidation, setShowValidation] = useState(
    () => initialSelectedOptionIds !== undefined,
  );

  const titleId = useId();
  const noteInputId = useId();
  const portalRootRef = useRef<HTMLDivElement | null>(null);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);

  const orderable = useMemo(() => isMenuItemOrderable(item, optionGroups), [item, optionGroups]);
  const validation = useMemo(
    () => validateItemOptionSelections(item, selectedIds, optionGroups),
    [item, selectedIds, optionGroups],
  );

  const selectedSet = useMemo(() => new Set(selectedIds), [selectedIds]);
  const unitPricePhp = item.pricePhp + validation.addonsPricePhp;
  const totalPricePhp = unitPricePhp * quantity;

  const issuesByGroupId = useMemo(() => {
    const map = new Map<string, string[]>();
    for (const issue of validation.issues) {
      if (!issue.groupId) continue;
      const list = map.get(issue.groupId) ?? [];
      list.push(issue.message);
      map.set(issue.groupId, list);
    }
    return map;
  }, [validation.issues]);

  const ungroupedIssues = useMemo(
    () => validation.issues.filter((issue) => !issue.groupId),
    [validation.issues],
  );

  useEffect(() => {
    previousFocusRef.current =
      document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const portalNode = portalRootRef.current;
    const isolatedSiblings: Array<{
      element: HTMLElement;
      hadInert: boolean;
      prevAriaHidden: string | null;
    }> = [];

    for (const child of Array.from(document.body.children)) {
      if (
        child instanceof HTMLElement &&
        child !== portalNode &&
        !child.hasAttribute('data-api-loading-portal')
      ) {
        isolatedSiblings.push({
          element: child,
          hadInert: child.hasAttribute('inert'),
          prevAriaHidden: child.getAttribute('aria-hidden'),
        });
        child.setAttribute('inert', '');
        child.setAttribute('aria-hidden', 'true');
      }
    }

    closeButtonRef.current?.focus();

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        onClose();
        return;
      }

      if (event.key === 'Tab' && dialogRef.current) {
        const focusable = getFocusableElements(dialogRef.current);
        if (focusable.length === 0) {
          event.preventDefault();
          dialogRef.current.focus();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        const active = document.activeElement;
        if (event.shiftKey) {
          if (active === first || !dialogRef.current.contains(active)) {
            event.preventDefault();
            last?.focus();
          }
        } else if (active === last || !dialogRef.current.contains(active)) {
          event.preventDefault();
          first?.focus();
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown, true);
    return () => {
      window.removeEventListener('keydown', handleKeyDown, true);
      document.body.style.overflow = previousOverflow;
      for (const entry of isolatedSiblings) {
        if (!entry.hadInert) entry.element.removeAttribute('inert');
        if (entry.prevAriaHidden === null) entry.element.removeAttribute('aria-hidden');
        else entry.element.setAttribute('aria-hidden', entry.prevAriaHidden);
      }
      const prev = previousFocusRef.current;
      previousFocusRef.current = null;
      if (prev && prev.isConnected) {
        prev.focus();
      }
    };
  }, [onClose]);

  function handleSelectSingle(group: OptionGroup, choiceId: string | null) {
    const groupChoiceIds = new Set(group.choices.map((choice) => choice.id));
    setSelectedIds((prev) => {
      const remaining = prev.filter((id) => !groupChoiceIds.has(id));
      if (!choiceId) return normalizeSelectedOptionIds(remaining);
      return normalizeSelectedOptionIds([...remaining, choiceId]);
    });
  }

  function handleToggleMulti(group: OptionGroup, choiceId: string) {
    const groupChoiceIds = new Set(group.choices.map((choice) => choice.id));
    setSelectedIds((prev) => {
      if (prev.includes(choiceId)) {
        return prev.filter((id) => id !== choiceId);
      }
      if (group.maxSelect !== null) {
        const currentInGroup = prev.filter((id) => groupChoiceIds.has(id)).length;
        if (currentInGroup >= group.maxSelect) {
          return prev;
        }
      }
      return normalizeSelectedOptionIds([...prev, choiceId]);
    });
  }

  function handleRemoveStaleIds() {
    const validChoiceIds = new Set<string>();
    for (const group of activeGroups) {
      for (const choice of group.choices) {
        if (choice.available) validChoiceIds.add(choice.id);
      }
    }
    setSelectedIds((prev) => prev.filter((id) => validChoiceIds.has(id)));
  }

  function handleSubmit(event: SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setShowValidation(true);
    if (!orderable || !validation.valid) return;
    onConfirm({
      selectedOptionIds: normalizeSelectedOptionIds(selectedIds),
      itemNote: normalizeItemNote(itemNote),
      quantity,
    });
  }

  const hasStaleSelections =
    validation.invalidChoiceIds.length > 0 || validation.unavailableChoiceIds.length > 0;

  return createPortal(
    <div
      ref={portalRootRef}
      className="fixed inset-0 z-50 flex items-end justify-center p-0 sm:items-center sm:p-4"
    >
      <div
        aria-hidden="true"
        onClick={onClose}
        className="fixed inset-0 bg-stone-950/60 backdrop-blur-xs"
      />

      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative z-10 flex max-h-[90vh] w-full max-w-lg flex-col overflow-hidden rounded-t-3xl border border-ui-border bg-ui-surface text-ui-text shadow-2xl sm:rounded-3xl"
      >
        <header className="flex items-start justify-between gap-4 border-b border-ui-border px-5 py-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl border border-ui-border bg-ui-surface-muted">
              <FoodImage
                src={item.imageUrl}
                alt={item.name}
                badgeText={item.name}
                className="h-full w-full"
              />
            </div>
            <div className="min-w-0">
              <h2 id={titleId} className="truncate text-lg font-bold tracking-tight text-ui-text">
                {item.name}
              </h2>
              <p className="text-xs text-ui-text-muted">
                {item.specLabel ? `${item.specLabel} · ` : ''}
                <span className="font-semibold text-ui-accent tabular-nums">
                  {formatPhp(item.pricePhp)}
                </span>
              </p>
            </div>
          </div>

          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            aria-label={`Close ${item.name} customizer`}
            className="shrink-0 rounded-lg border border-ui-border bg-ui-surface-muted px-3 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Close
          </button>
        </header>

        <form
          noValidate
          onSubmit={handleSubmit}
          className="flex min-h-0 flex-1 flex-col overflow-hidden"
        >
          <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
            {item.description ? (
              <p className="text-sm leading-relaxed text-ui-text-muted">{item.description}</p>
            ) : null}

            {!orderable ? (
              <div
                role="alert"
                className="rounded-xl border border-ui-error/40 bg-ui-error/10 px-3.5 py-3 text-xs text-ui-error"
              >
                <p className="font-bold">Options unavailable</p>
                <p className="mt-0.5">
                  One or more required options for this item are currently sold out.
                </p>
              </div>
            ) : null}

            {hasStaleSelections ? (
              <div
                role="alert"
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3.5 py-2.5 text-xs text-ui-error"
              >
                <span>
                  Some previously selected options are no longer available. Update your choices
                  below.
                </span>
                <button
                  type="button"
                  onClick={handleRemoveStaleIds}
                  className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
                >
                  Clear unavailable
                </button>
              </div>
            ) : null}

            {ungroupedIssues.length > 0 && showValidation ? (
              <div role="alert" className="space-y-1 text-xs font-semibold text-ui-error">
                {ungroupedIssues.map((issue, idx) => (
                  <p key={`${issue.code}-${idx}`}>{issue.message}</p>
                ))}
              </div>
            ) : null}

            {activeGroups.map((group) => {
              const sortedChoices = [...group.choices].sort((a, b) => a.sortOrder - b.sortOrder);
              const groupChoiceIds = new Set(sortedChoices.map((choice) => choice.id));
              const selectedCountInGroup = selectedIds.filter((id) =>
                groupChoiceIds.has(id),
              ).length;
              const groupIssues = issuesByGroupId.get(group.id) ?? [];

              return (
                <fieldset
                  key={group.id}
                  className="space-y-2.5 rounded-2xl border border-ui-border bg-ui-surface-muted/60 p-3.5"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <legend className="text-sm font-bold text-ui-text">{group.name}</legend>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        group.required
                          ? 'bg-ui-accent/15 text-ui-accent'
                          : 'border border-ui-border bg-ui-surface text-ui-text-muted'
                      }`}
                    >
                      {getGroupRequirementText(group)}
                    </span>
                  </div>

                  {group.description ? (
                    <p className="text-xs text-ui-text-muted">{group.description}</p>
                  ) : null}

                  <div className="space-y-1.5">
                    {group.selectionMode === 'single' && !group.required ? (
                      <label className="flex cursor-pointer items-center justify-between gap-2 rounded-xl border border-ui-border bg-ui-surface px-3 py-2 text-xs text-ui-text">
                        <span className="flex items-center gap-2">
                          <input
                            type="radio"
                            name={`option-group-${group.id}`}
                            checked={selectedCountInGroup === 0}
                            onChange={() => handleSelectSingle(group, null)}
                            className="accent-ui-accent h-4 w-4"
                          />
                          <span>None</span>
                        </span>
                        <span className="text-ui-text-muted">₱0</span>
                      </label>
                    ) : null}

                    {sortedChoices.map((choice) => {
                      const isChecked = selectedSet.has(choice.id);
                      const atMultiLimit =
                        group.selectionMode === 'multi' &&
                        group.maxSelect !== null &&
                        selectedCountInGroup >= group.maxSelect &&
                        !isChecked;
                      const isDisabled = (!choice.available && !isChecked) || atMultiLimit;

                      return (
                        <label
                          key={choice.id}
                          className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 text-xs transition-colors motion-reduce:transition-none ${
                            !choice.available
                              ? 'border-ui-error/30 bg-ui-surface/60 text-ui-text-muted opacity-75'
                              : isChecked
                                ? 'cursor-pointer border-ui-accent bg-ui-surface font-semibold text-ui-text'
                                : isDisabled
                                  ? 'cursor-not-allowed border-ui-border bg-ui-surface/60 text-ui-text-muted opacity-60'
                                  : 'cursor-pointer border-ui-border bg-ui-surface text-ui-text hover:bg-ui-canvas'
                          }`}
                        >
                          <span className="flex min-w-0 items-center gap-2">
                            <input
                              type={group.selectionMode === 'single' ? 'radio' : 'checkbox'}
                              name={`option-group-${group.id}`}
                              checked={isChecked}
                              disabled={isDisabled}
                              onChange={() => {
                                if (group.selectionMode === 'single') {
                                  handleSelectSingle(group, choice.id);
                                } else {
                                  handleToggleMulti(group, choice.id);
                                }
                              }}
                              className="accent-ui-accent h-4 w-4 shrink-0"
                            />
                            <span className="truncate">{choice.name}</span>
                            {!choice.available ? (
                              <span className="rounded bg-ui-error/15 px-1.5 py-0.5 text-[10px] font-semibold text-ui-error">
                                Sold out
                              </span>
                            ) : null}
                          </span>
                          <span className="shrink-0 tabular-nums text-ui-text-muted">
                            {choice.priceDeltaPhp > 0
                              ? `+${formatPhp(choice.priceDeltaPhp)}`
                              : 'Included'}
                          </span>
                        </label>
                      );
                    })}
                  </div>

                  {showValidation && groupIssues.length > 0 ? (
                    <div role="alert" className="space-y-0.5 text-xs font-semibold text-ui-error">
                      {groupIssues.map((msg, idx) => (
                        <p key={idx}>{msg}</p>
                      ))}
                    </div>
                  ) : null}
                </fieldset>
              );
            })}

            <div className="space-y-1.5">
              <div className="flex items-center justify-between gap-2">
                <label htmlFor={noteInputId} className="text-xs font-semibold text-ui-text">
                  Special instruction (optional)
                </label>
                <span className="text-[11px] text-ui-text-muted tabular-nums">
                  {itemNote.length}/{ITEM_NOTE_MAX_LENGTH}
                </span>
              </div>
              <textarea
                id={noteInputId}
                rows={2}
                maxLength={ITEM_NOTE_MAX_LENGTH}
                value={itemNote}
                onChange={(event) => setItemNote(event.target.value)}
                placeholder="e.g. Less ice, sauce on the side, no onions"
                className="w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-2 text-sm text-ui-text placeholder:text-ui-text-muted"
              />
            </div>
          </div>

          <footer className="flex items-center justify-between gap-3 border-t border-ui-border bg-ui-surface px-5 py-4">
            <div className="inline-flex items-center rounded-xl border border-ui-border bg-ui-surface-muted">
              <button
                type="button"
                aria-label="Decrease quantity"
                disabled={quantity <= 1}
                onClick={() => setQuantity((prev) => Math.max(1, prev - 1))}
                className="px-3 py-2 text-sm font-bold text-ui-text hover:bg-ui-canvas disabled:opacity-40"
              >
                -
              </button>
              <span className="min-w-8 text-center text-sm font-semibold tabular-nums">
                {quantity}
              </span>
              <button
                type="button"
                aria-label="Increase quantity"
                disabled={quantity >= 50}
                onClick={() => setQuantity((prev) => Math.min(50, prev + 1))}
                className="px-3 py-2 text-sm font-bold text-ui-text hover:bg-ui-canvas disabled:opacity-40"
              >
                +
              </button>
            </div>

            <button
              type="submit"
              disabled={!orderable || !validation.valid}
              className="flex-1 rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-bold text-ui-on-accent tabular-nums hover:bg-ui-accent-hover disabled:cursor-not-allowed disabled:opacity-50"
            >
              {!orderable ? 'Options unavailable' : `${submitLabel} · ${formatPhp(totalPricePhp)}`}
            </button>
          </footer>
        </form>
      </div>
    </div>,
    document.body,
  );
}
