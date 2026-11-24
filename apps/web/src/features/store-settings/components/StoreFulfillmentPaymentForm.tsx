import { zodResolver } from '@hookform/resolvers/zod';
import {
  MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES,
  MENU_IMAGE_MAX_UPLOAD_BYTES,
  PAYMENT_METHOD_LABELS,
  PAYMENT_METHOD_VALUES,
  isValidCoordinates,
  type PaymentMethod,
  type PaymentMethodsConfig,
  type StoreProfile,
} from '@menu-kiosk/contracts';
import { useCallback, useEffect, useId, useRef, useState, type ChangeEvent } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { getApiErrorMessage, isApiError } from '@/shared/lib/api-error';
import {
  useDeleteUnusedStoreAssetMutation,
  useStoreProfile,
  useUpdateStoreProfileMutation,
  useUploadStoreAssetMutation,
} from '../hooks/useStoreSettings';
import {
  createStoreFulfillmentPaymentFormSchema,
  type StoreFulfillmentPaymentFormValues,
} from '../schemas/store-fulfillment-payment-form.schema';

const ALLOWED_MIME_SET = new Set<string>(MENU_IMAGE_ALLOWED_INPUT_MIME_TYPES);

function clonePaymentMethods(methods: PaymentMethodsConfig): PaymentMethodsConfig {
  return {
    cash: { ...methods.cash },
    gcash: { ...methods.gcash },
    maya: { ...methods.maya },
    bank_transfer: { ...methods.bank_transfer },
  };
}

function storeToFormState(store: StoreProfile): StoreFulfillmentPaymentFormValues {
  return {
    pickupEnabled: store.pickupEnabled,
    deliveryEnabled: store.deliveryEnabled,
    dineInEnabled: store.dineInEnabled,
    dineInTableRequired: store.dineInTableRequired,
    paymentMethods: clonePaymentMethods(store.paymentMethods),
  };
}

function getFulfillmentPaymentSignature(store: StoreProfile): string {
  return JSON.stringify([
    store.pickupEnabled,
    store.deliveryEnabled,
    store.dineInEnabled,
    store.dineInTableRequired,
    store.paymentMethods,
    store.originCoords,
    store.version ?? null,
  ]);
}

function formatKilobytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

export type StoreFulfillmentPaymentFormProps = {
  onStatusMessage: (message: string, tone?: 'success' | 'error') => void;
};

export function StoreFulfillmentPaymentForm({ onStatusMessage }: StoreFulfillmentPaymentFormProps) {
  const { store, catalogQuery } = useStoreProfile();
  const updateProfileMutation = useUpdateStoreProfileMutation();
  const uploadAssetMutation = useUploadStoreAssetMutation();
  const deleteUnusedAssetMutation = useDeleteUnusedStoreAssetMutation();
  const hasOriginPin = isValidCoordinates(store.originCoords);

  const {
    register,
    control,
    handleSubmit,
    reset,
    setValue,
    clearErrors,
    formState: { errors, isDirty },
  } = useForm<StoreFulfillmentPaymentFormValues>({
    defaultValues: storeToFormState(store),
    resolver: (values, ctx, options) =>
      zodResolver(createStoreFulfillmentPaymentFormSchema({ hasOriginPin }))(values, ctx, options),
  });

  const watchedValues = useWatch({ control });
  const deliveryEnabled = watchedValues.deliveryEnabled ?? store.deliveryEnabled;
  const dineInEnabled = watchedValues.dineInEnabled ?? store.dineInEnabled;

  const loadedVersionRef = useRef<number | undefined>(store.version);
  const [conflict, setConflict] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadingMethod, setUploadingMethod] = useState<PaymentMethod | null>(null);
  const [pendingQrUploads, setPendingQrUploads] = useState<Partial<Record<PaymentMethod, string>>>(
    {},
  );
  const lastSyncedSignatureRef = useRef(getFulfillmentPaymentSignature(store));

  const currentSignature = getFulfillmentPaymentSignature(store);

  useEffect(() => {
    if (!isDirty && currentSignature !== lastSyncedSignatureRef.current) {
      lastSyncedSignatureRef.current = currentSignature;
      reset(storeToFormState(store));
      loadedVersionRef.current = store.version;
      setConflict(false);
    }
  }, [currentSignature, isDirty, reset, store]);

  const headingId = useId();
  const fileInputRefs = useRef<Partial<Record<PaymentMethod, HTMLInputElement | null>>>({});

  const cleanupUnusedAsset = useCallback(
    (url: string | undefined) => {
      if (!url) return;
      deleteUnusedAssetMutation.mutate(url);
    },
    [deleteUnusedAssetMutation],
  );

  async function reloadLatestSettings() {
    for (const url of Object.values(pendingQrUploads)) {
      cleanupUnusedAsset(url);
    }
    setPendingQrUploads({});
    const refreshed = await catalogQuery.refetch();
    const latest = refreshed.data?.store ?? store;
    lastSyncedSignatureRef.current = getFulfillmentPaymentSignature(latest);
    reset(storeToFormState(latest));
    loadedVersionRef.current = latest.version;
    setConflict(false);
    setUploadError(null);
    onStatusMessage('Reloaded latest fulfillment and payment settings.');
  }

  async function handleQrUpload(event: ChangeEvent<HTMLInputElement>, method: PaymentMethod) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;

    if (file.type && !ALLOWED_MIME_SET.has(file.type)) {
      setUploadError('Select a JPG, PNG, WebP, or AVIF image file.');
      return;
    }
    if (file.size === 0) {
      setUploadError('Selected QR image file is empty.');
      return;
    }
    if (file.size > MENU_IMAGE_MAX_UPLOAD_BYTES) {
      setUploadError('QR image must be 4 MB or smaller.');
      return;
    }

    setUploadError(null);
    setUploadingMethod(method);
    try {
      const uploaded = await uploadAssetMutation.mutateAsync({ file, purpose: 'payment-qr' });
      const previousPending = pendingQrUploads[method];
      if (previousPending && previousPending !== uploaded.imageUrl) {
        cleanupUnusedAsset(previousPending);
      }
      setPendingQrUploads((prev) => ({ ...prev, [method]: uploaded.imageUrl }));
      setValue(`paymentMethods.${method}.qrImageUrl`, uploaded.imageUrl, { shouldDirty: true });
      clearErrors(`paymentMethods.${method}.qrImageUrl`);
      clearErrors('root');
      onStatusMessage(
        `Uploaded ${PAYMENT_METHOD_LABELS[method]} QR (${formatKilobytes(uploaded.sizeBytes)}, ${uploaded.width}×${uploaded.height}). Save fulfillment & payments to publish.`,
      );
    } catch (error) {
      setUploadError(
        getApiErrorMessage(error, `Unable to upload ${PAYMENT_METHOD_LABELS[method]} QR image.`),
      );
    } finally {
      setUploadingMethod(null);
    }
  }

  async function onSubmit(values: StoreFulfillmentPaymentFormValues) {
    const sanitizedMethods = clonePaymentMethods(values.paymentMethods);
    for (const method of PAYMENT_METHOD_VALUES) {
      const cfg = sanitizedMethods[method];
      cfg.label = cfg.label.trim().slice(0, 40) || PAYMENT_METHOD_LABELS[method];
      cfg.accountName = cfg.accountName.trim().slice(0, 120);
      cfg.accountNumber = cfg.accountNumber.trim().slice(0, 80);
      cfg.instructions = cfg.instructions.trim().slice(0, 280);
      cfg.qrImageUrl = method === 'cash' ? '' : cfg.qrImageUrl.trim();
    }

    clearErrors('root');
    try {
      const updated = await updateProfileMutation.mutateAsync({
        pickupEnabled: values.pickupEnabled,
        deliveryEnabled: values.deliveryEnabled,
        dineInEnabled: values.dineInEnabled,
        dineInTableRequired: values.dineInTableRequired,
        paymentMethods: sanitizedMethods,
        expectedVersion: loadedVersionRef.current ?? store.version,
      });

      for (const method of PAYMENT_METHOD_VALUES) {
        const pendingUrl = pendingQrUploads[method];
        if (pendingUrl && pendingUrl !== sanitizedMethods[method].qrImageUrl) {
          cleanupUnusedAsset(pendingUrl);
        }
      }
      setPendingQrUploads({});
      lastSyncedSignatureRef.current = getFulfillmentPaymentSignature(updated);
      reset(storeToFormState(updated));
      loadedVersionRef.current = updated.version;
      setConflict(false);
      onStatusMessage('Saved fulfillment and payment settings.');
    } catch (error) {
      if (isApiError(error) && error.status === 409) {
        setConflict(true);
      }
      onStatusMessage(
        getApiErrorMessage(error, 'Failed to save fulfillment and payment settings.'),
        'error',
      );
    }
  }

  const isBusy = updateProfileMutation.isPending || uploadAssetMutation.isPending;
  const fieldError =
    errors.root?.message ??
    PAYMENT_METHOD_VALUES.map(
      (method) => errors.paymentMethods?.[method]?.qrImageUrl?.message,
    ).find(Boolean);

  return (
    <section
      aria-labelledby={headingId}
      className="space-y-5 rounded-2xl border border-ui-border bg-ui-surface p-5"
    >
      <div className="border-b border-ui-border pb-3">
        <h2 id={headingId} className="text-lg font-bold text-ui-text">
          Fulfillment modes & payment methods
        </h2>
        <p className="mt-0.5 text-xs text-ui-text-muted">
          Choose which ordering modes and payment methods appear at checkout, and upload lossless QR
          codes for e-wallet or bank transfers.
        </p>
      </div>

      {conflict ? (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-ui-error/40 bg-ui-surface-muted px-3 py-2 text-xs text-ui-error"
        >
          <span>
            Fulfillment or payment settings changed on another device. Reload latest values first.
          </span>
          <button
            type="button"
            onClick={() => void reloadLatestSettings()}
            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 font-semibold text-ui-text hover:bg-ui-canvas"
          >
            Reload latest settings
          </button>
        </div>
      ) : null}

      <form
        noValidate
        onSubmit={(event) => {
          if (isBusy) {
            event.preventDefault();
            return;
          }
          void handleSubmit(onSubmit)(event);
        }}
        className="space-y-6"
      >
        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-ui-text">Enabled fulfillment modes</legend>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ui-border bg-ui-canvas p-3 text-xs">
              <input
                type="checkbox"
                className="accent-ui-accent mt-0.5 h-4 w-4 rounded"
                {...register('pickupEnabled', {
                  onChange: () => clearErrors('root'),
                })}
              />
              <span>
                <span className="block font-semibold text-ui-text">Pickup</span>
                <span className="mt-0.5 block text-ui-text-muted">
                  Customers collect orders at the counter.
                </span>
              </span>
            </label>

            <label
              className={`flex items-start gap-2.5 rounded-xl border border-ui-border bg-ui-canvas p-3 text-xs ${
                !hasOriginPin && !deliveryEnabled
                  ? 'cursor-not-allowed opacity-60'
                  : 'cursor-pointer'
              }`}
            >
              <input
                type="checkbox"
                disabled={!hasOriginPin && !deliveryEnabled}
                className="accent-ui-accent mt-0.5 h-4 w-4 rounded"
                {...register('deliveryEnabled', {
                  onChange: () => clearErrors('root'),
                })}
              />
              <span>
                <span className="block font-semibold text-ui-text">Delivery</span>
                <span className="mt-0.5 block text-ui-text-muted">
                  {hasOriginPin
                    ? 'Distance-priced delivery from your shop pin.'
                    : 'Set your shop location pin above before enabling delivery.'}
                </span>
              </span>
            </label>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-ui-border bg-ui-canvas p-3 text-xs">
              <input
                type="checkbox"
                className="accent-ui-accent mt-0.5 h-4 w-4 rounded"
                {...register('dineInEnabled', {
                  onChange: () => clearErrors('root'),
                })}
              />
              <span>
                <span className="block font-semibold text-ui-text">Dine-in</span>
                <span className="mt-0.5 block text-ui-text-muted">
                  Table ordering with optional Table QR deep-links.
                </span>
              </span>
            </label>
          </div>

          {dineInEnabled ? (
            <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-ui-border bg-ui-surface-muted px-3 py-2 text-xs font-medium text-ui-text">
              <input
                type="checkbox"
                className="accent-ui-accent h-4 w-4 rounded"
                {...register('dineInTableRequired')}
              />
              <span>Require table number for dine-in orders</span>
            </label>
          ) : null}
        </fieldset>

        <fieldset className="space-y-3">
          <legend className="text-xs font-semibold text-ui-text">Payment methods</legend>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
            {PAYMENT_METHOD_VALUES.map((method) => {
              const cfg = {
                ...store.paymentMethods[method],
                ...watchedValues.paymentMethods?.[method],
              };
              const isCash = method === 'cash';
              const methodTitle = PAYMENT_METHOD_LABELS[method];
              const isUploadingThis = uploadingMethod === method;

              return (
                <div
                  key={method}
                  className="space-y-3 rounded-xl border border-ui-border bg-ui-canvas p-4"
                >
                  <div className="flex items-center justify-between gap-2 border-b border-ui-border pb-2.5">
                    <label className="flex cursor-pointer items-center gap-2 text-sm font-semibold text-ui-text">
                      <input
                        type="checkbox"
                        className="accent-ui-accent h-4 w-4 rounded"
                        {...register(`paymentMethods.${method}.enabled`, {
                          onChange: () => clearErrors('root'),
                        })}
                      />
                      <span>{methodTitle}</span>
                    </label>
                    <span
                      className={`rounded-md px-2 py-0.5 text-[11px] font-semibold ${
                        cfg.enabled
                          ? 'bg-ui-surface-muted text-ui-accent'
                          : 'bg-ui-surface text-ui-text-muted'
                      }`}
                    >
                      {cfg.enabled ? 'Enabled' : 'Hidden'}
                    </span>
                  </div>

                  <div>
                    <label
                      htmlFor={`payment-label-${method}`}
                      className="block text-xs font-semibold text-ui-text"
                    >
                      Display label
                    </label>
                    <input
                      id={`payment-label-${method}`}
                      type="text"
                      maxLength={40}
                      placeholder={methodTitle}
                      className="mt-1 w-full rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
                      {...register(`paymentMethods.${method}.label`, {
                        onChange: () => clearErrors('root'),
                      })}
                    />
                  </div>

                  {!isCash ? (
                    <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                      <div>
                        <label
                          htmlFor={`payment-account-name-${method}`}
                          className="block text-xs font-semibold text-ui-text"
                        >
                          Account name
                        </label>
                        <input
                          id={`payment-account-name-${method}`}
                          type="text"
                          maxLength={80}
                          placeholder="e.g. Kape Kanto OPC"
                          className="mt-1 w-full rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
                          {...register(`paymentMethods.${method}.accountName`, {
                            onChange: () => clearErrors('root'),
                          })}
                        />
                      </div>
                      <div>
                        <label
                          htmlFor={`payment-account-number-${method}`}
                          className="block text-xs font-semibold text-ui-text"
                        >
                          Account number
                        </label>
                        <input
                          id={`payment-account-number-${method}`}
                          type="text"
                          maxLength={40}
                          placeholder="e.g. 0917 123 4567"
                          className="mt-1 w-full rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
                          {...register(`paymentMethods.${method}.accountNumber`, {
                            onChange: () => clearErrors('root'),
                          })}
                        />
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <label
                      htmlFor={`payment-instructions-${method}`}
                      className="block text-xs font-semibold text-ui-text"
                    >
                      Instructions (optional)
                    </label>
                    <input
                      id={`payment-instructions-${method}`}
                      type="text"
                      maxLength={240}
                      placeholder={
                        isCash
                          ? 'e.g. Pay at counter or to rider on delivery.'
                          : `e.g. Scan QR or send exact amount via ${methodTitle}.`
                      }
                      className="mt-1 w-full rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
                      {...register(`paymentMethods.${method}.instructions`, {
                        onChange: () => clearErrors('root'),
                      })}
                    />
                  </div>

                  {!isCash ? (
                    <div className="space-y-2 border-t border-ui-border pt-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <label
                          htmlFor={`payment-qr-url-${method}`}
                          className="text-xs font-semibold text-ui-text"
                        >
                          {methodTitle} QR image
                        </label>
                        <div className="flex items-center gap-1.5">
                          <input
                            ref={(node) => {
                              fileInputRefs.current[method] = node;
                            }}
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/avif"
                            aria-label={`Upload ${methodTitle} QR code`}
                            disabled={uploadAssetMutation.isPending}
                            onChange={(event) => void handleQrUpload(event, method)}
                            className="sr-only"
                          />
                          <button
                            type="button"
                            disabled={uploadAssetMutation.isPending}
                            onClick={() => fileInputRefs.current[method]?.click()}
                            className="rounded-lg border border-ui-border bg-ui-surface px-2.5 py-1 text-xs font-semibold text-ui-text hover:bg-ui-surface-muted disabled:opacity-60"
                          >
                            {isUploadingThis ? 'Uploading…' : 'Upload QR'}
                          </button>
                          {cfg.qrImageUrl ? (
                            <button
                              type="button"
                              aria-label={`Clear ${methodTitle} QR`}
                              onClick={() => {
                                const pendingUrl = pendingQrUploads[method];
                                if (pendingUrl) {
                                  cleanupUnusedAsset(pendingUrl);
                                  setPendingQrUploads((prev) => {
                                    const next = { ...prev };
                                    delete next[method];
                                    return next;
                                  });
                                }
                                setValue(`paymentMethods.${method}.qrImageUrl`, '', {
                                  shouldDirty: true,
                                });
                                clearErrors(`paymentMethods.${method}.qrImageUrl`);
                                clearErrors('root');
                              }}
                              className="rounded-lg border border-ui-border bg-ui-surface px-2 py-1 text-xs font-medium text-ui-error hover:bg-ui-surface-muted"
                            >
                              Clear
                            </button>
                          ) : null}
                        </div>
                      </div>

                      <input
                        id={`payment-qr-url-${method}`}
                        type="url"
                        maxLength={500}
                        placeholder="Upload QR or paste https:// image URL"
                        className="w-full rounded-xl border border-ui-border bg-ui-surface px-3 py-1.5 text-xs text-ui-text"
                        {...register(`paymentMethods.${method}.qrImageUrl`)}
                      />

                      {cfg.qrImageUrl ? (
                        <div className="flex items-center gap-3">
                          <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-ui-border bg-white p-1">
                            <img
                              src={cfg.qrImageUrl}
                              alt={`${methodTitle} QR preview`}
                              className="h-full w-full object-contain"
                            />
                          </div>
                          <p className="text-[11px] text-ui-text-muted">
                            Encoded losslessly so mobile banking apps scan cleanly.
                          </p>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>

        {uploadError ? (
          <p role="alert" className="text-xs font-semibold text-ui-error">
            {uploadError}
          </p>
        ) : null}

        {fieldError ? (
          <p role="alert" className="text-xs font-semibold text-ui-error">
            {fieldError}
          </p>
        ) : null}

        <button
          type="submit"
          disabled={isBusy}
          className="rounded-xl bg-ui-accent px-4 py-2.5 text-sm font-semibold text-ui-on-accent hover:bg-ui-accent-hover disabled:opacity-60"
        >
          {updateProfileMutation.isPending ? 'Saving settings…' : 'Save fulfillment & payments'}
        </button>
      </form>
    </section>
  );
}
