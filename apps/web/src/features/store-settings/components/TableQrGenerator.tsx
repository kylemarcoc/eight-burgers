import { TABLE_NUMBER_MAX_LENGTH } from '@menu-kiosk/contracts';
import QRCode from 'qrcode';
import { useEffect, useId, useMemo, useState } from 'react';
import { useStoreProfile } from '../hooks/useStoreSettings';

const MAX_BATCH_TABLES = 30;

type GeneratedTableQr = {
  label: string;
  url: string;
  dataUrl: string;
};

function buildTableOrderUrl(tableLabel: string): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const baseUrl = import.meta.env.BASE_URL || '/';
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const params = new URLSearchParams({
    fulfillment: 'dine-in',
    table: tableLabel.trim(),
  });
  return `${origin}${normalizedBase}?${params.toString()}`;
}

function parseTableLabels(
  fromNum: number,
  toNum: number,
  prefix: string,
  customLabelsInput: string,
): { labels: string[]; error: string | null } {
  const trimmedCustom = customLabelsInput.trim();
  if (trimmedCustom) {
    const rawItems = trimmedCustom
      .split(',')
      .map((part) => part.trim().replace(/\s+/g, ' '))
      .filter(Boolean);
    if (rawItems.length === 0) {
      return { labels: [], error: 'Enter at least one table label.' };
    }
    if (rawItems.length > MAX_BATCH_TABLES) {
      return {
        labels: [],
        error: `Generate up to ${MAX_BATCH_TABLES} table QR codes at a time.`,
      };
    }
    const deduped: string[] = [];
    const seen = new Set<string>();
    for (const item of rawItems) {
      const clamped = item.slice(0, TABLE_NUMBER_MAX_LENGTH);
      const key = clamped.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        deduped.push(clamped);
      }
    }
    return { labels: deduped, error: null };
  }

  if (!Number.isInteger(fromNum) || !Number.isInteger(toNum) || fromNum < 1 || toNum < 1) {
    return { labels: [], error: 'Enter whole numbers starting at 1.' };
  }
  if (toNum < fromNum) {
    return { labels: [], error: 'End table number must be greater than or equal to start table.' };
  }
  const count = toNum - fromNum + 1;
  if (count > MAX_BATCH_TABLES) {
    return {
      labels: [],
      error: `Generate up to ${MAX_BATCH_TABLES} table QR codes at a time.`,
    };
  }
  const safePrefix = prefix.trim().slice(0, 12);
  const labels: string[] = [];
  for (let n = fromNum; n <= toNum; n += 1) {
    labels.push(`${safePrefix}${n}`.slice(0, TABLE_NUMBER_MAX_LENGTH));
  }
  return { labels, error: null };
}

export function TableQrGenerator() {
  const { store } = useStoreProfile();
  const headingId = useId();
  const fromId = useId();
  const toId = useId();
  const prefixId = useId();
  const customId = useId();

  const [fromTable, setFromTable] = useState('1');
  const [toTable, setToTable] = useState('4');
  const [tablePrefix, setTablePrefix] = useState('');
  const [customLabels, setCustomLabels] = useState('');
  const [items, setItems] = useState<GeneratedTableQr[]>([]);
  const [generationError, setGenerationError] = useState<string | null>(null);
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const parsed = useMemo(
    () => parseTableLabels(Number(fromTable), Number(toTable), tablePrefix, customLabels),
    [fromTable, toTable, tablePrefix, customLabels],
  );

  useEffect(() => {
    let cancelled = false;
    if (parsed.error || parsed.labels.length === 0) {
      return;
    }

    async function generateAll() {
      try {
        const generated = await Promise.all(
          parsed.labels.map(async (label) => {
            const url = buildTableOrderUrl(label);
            const dataUrl = await QRCode.toDataURL(url, {
              width: 220,
              margin: 2,
              errorCorrectionLevel: 'M',
            });
            return { label, url, dataUrl };
          }),
        );
        if (!cancelled) {
          setItems(generated);
          setGenerationError(null);
        }
      } catch {
        if (!cancelled) {
          setGenerationError('Could not generate table QR codes right now.');
          setItems([]);
        }
      }
    }

    void generateAll();
    return () => {
      cancelled = true;
    };
  }, [parsed.error, parsed.labels]);

  const visibleItems = parsed.error || parsed.labels.length === 0 ? [] : items;
  const visibleGenerationError =
    parsed.error || parsed.labels.length === 0 ? null : generationError;

  async function handleDownloadSvg(item: GeneratedTableQr) {
    setActionError(null);
    try {
      const svgString = await QRCode.toString(item.url, {
        type: 'svg',
        margin: 2,
        errorCorrectionLevel: 'M',
      });
      const blob = new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' });
      const objectUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      const slug = item.label.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'table';
      link.href = objectUrl;
      link.download = `table-${slug}-qr.svg`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(objectUrl);
    } catch {
      setActionError(`Unable to download SVG for Table ${item.label}.`);
    }
  }

  function handleCopyLink(item: GeneratedTableQr) {
    setActionError(null);
    if (!navigator.clipboard || typeof navigator.clipboard.writeText !== 'function') {
      setActionError('Clipboard copy is unavailable in this browser.');
      return;
    }
    void navigator.clipboard
      .writeText(item.url)
      .then(() => {
        setCopiedLabel(item.label);
      })
      .catch(() => {
        setActionError('Unable to copy table link.');
      });
  }

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-5 rounded-2xl border border-ui-border bg-ui-surface p-5"
    >
      <div className="flex flex-col gap-3 border-b border-ui-border pb-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 id={headingId} className="text-lg font-bold text-ui-text">
            Dine-in table QR codes
          </h2>
          <p className="mt-0.5 text-xs text-ui-text-muted">
            Generate scannable QR stickers that pre-select Dine-in and prefill the table number at
            checkout.
          </p>
        </div>

        <button
          type="button"
          disabled={visibleItems.length === 0}
          onClick={() => window.print()}
          className="shrink-0 rounded-xl border border-ui-border bg-ui-surface-muted px-3.5 py-2 text-xs font-semibold text-ui-text hover:bg-ui-canvas disabled:opacity-50 print:hidden"
        >
          Print table stickers
        </button>
      </div>

      {!store.dineInEnabled ? (
        <p className="rounded-xl border border-ui-border bg-ui-surface-muted px-3.5 py-2.5 text-xs text-ui-text-muted print:hidden">
          Dine-in is currently turned off above. Enable Dine-in so customers scanning these QR codes
          get table checkout automatically.
        </p>
      ) : null}

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-4 print:hidden">
        <div>
          <label htmlFor={fromId} className="block text-xs font-semibold text-ui-text">
            From table
          </label>
          <input
            id={fromId}
            type="number"
            min={1}
            max={999}
            value={fromTable}
            disabled={customLabels.trim().length > 0}
            onChange={(event) => setFromTable(event.target.value)}
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text tabular-nums disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor={toId} className="block text-xs font-semibold text-ui-text">
            To table
          </label>
          <input
            id={toId}
            type="number"
            min={1}
            max={999}
            value={toTable}
            disabled={customLabels.trim().length > 0}
            onChange={(event) => setToTable(event.target.value)}
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text tabular-nums disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor={prefixId} className="block text-xs font-semibold text-ui-text">
            Prefix (optional)
          </label>
          <input
            id={prefixId}
            type="text"
            maxLength={12}
            value={tablePrefix}
            disabled={customLabels.trim().length > 0}
            onChange={(event) => setTablePrefix(event.target.value)}
            placeholder="e.g. A-"
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text disabled:opacity-50"
          />
        </div>

        <div>
          <label htmlFor={customId} className="block text-xs font-semibold text-ui-text">
            Or custom labels
          </label>
          <input
            id={customId}
            type="text"
            value={customLabels}
            onChange={(event) => setCustomLabels(event.target.value)}
            placeholder="e.g. Patio 1, Bar 2"
            className="mt-1 w-full rounded-xl border border-ui-border bg-ui-canvas px-3 py-1.5 text-sm text-ui-text"
          />
        </div>
      </div>

      {parsed.error ? (
        <p role="alert" className="text-xs font-semibold text-ui-error">
          {parsed.error}
        </p>
      ) : null}

      {visibleGenerationError ? (
        <p role="alert" className="text-xs font-semibold text-ui-error">
          {visibleGenerationError}
        </p>
      ) : null}

      {actionError ? (
        <p role="alert" className="text-xs font-semibold text-ui-error">
          {actionError}
        </p>
      ) : null}

      {visibleItems.length > 0 ? (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 print:grid-cols-2 print:gap-4">
          {visibleItems.map((item) => (
            <article
              key={item.label}
              className="flex flex-col items-center gap-2.5 rounded-2xl border border-ui-border bg-ui-canvas p-4 text-center print:break-inside-avoid print:border-stone-300 print:bg-white print:text-stone-950"
            >
              <div className="space-y-0.5">
                <p className="text-[11px] font-semibold tracking-wide text-ui-text-muted uppercase print:text-stone-600">
                  {store.storeName}
                </p>
                <h3 className="text-base font-bold text-ui-text print:text-stone-950">
                  Table {item.label}
                </h3>
              </div>

              <div className="rounded-xl border border-ui-border bg-white p-2">
                <img
                  src={item.dataUrl}
                  alt={`QR code for Table ${item.label}`}
                  width={160}
                  height={160}
                  className="h-40 w-40 object-contain"
                />
              </div>

              <p className="text-[11px] text-ui-text-muted print:text-stone-700">
                Scan to order from your table
              </p>

              <p className="w-full truncate font-mono text-[10px] text-ui-text-muted print:hidden">
                {item.url}
              </p>

              <div className="flex w-full items-center justify-center gap-2 pt-1 print:hidden">
                <button
                  type="button"
                  onClick={() => handleCopyLink(item)}
                  className="flex-1 rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
                >
                  {copiedLabel === item.label ? 'Copied' : 'Copy link'}
                </button>
                <button
                  type="button"
                  onClick={() => void handleDownloadSvg(item)}
                  className="flex-1 rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1.5 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted"
                >
                  Download SVG
                </button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </section>
  );
}
