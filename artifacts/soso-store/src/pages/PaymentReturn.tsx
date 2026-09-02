import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import { CheckCircle2, Clock3, ShieldAlert, AlertTriangle, Ruler, Info } from "lucide-react";
import { Seo } from "@/components/Seo";
import { clearCheckoutOperation, pendingPaymentAttempt } from "@/lib/commerce";
import { naira } from "@/lib/utils";
import { useCart } from "@/context/CartContext";
import { PlatformContentState, usePlatformContent } from "@/data/platformContent";
import {
  useGetCommercePaymentStatus,
  getGetCommercePaymentStatusQueryKey,
  useGetCustomerMeasurements,
  getGetCustomerMeasurementsQueryKey,
  useUpdateCustomerMeasurement,
  type CustomerMeasurement,
  type CustomerMeasurementInputUnit,
  type CustomerMeasurementStatus
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import type { PlatformContent } from "@/data/platformContent";

const CM_BOUNDS = { height: [120, 230], chest: [50, 180], waist: [50, 180], hips: [50, 180], shoulder: [25, 70], sleeve: [35, 100], garmentLength: [40, 180] };
const measurementFields = ["height", "chest", "waist", "hips", "shoulder", "sleeve", "garmentLength"] as const;

function interpolate(template: string, values: Record<string, string | number>) {
  return template.replace(/\{(\w+)\}/g, (_, key: string) => String(values[key] ?? ""));
}

function getBounds(unit: CustomerMeasurementInputUnit) {
  if (unit === "cm") return CM_BOUNDS;
  return {
    height: [120 / 2.54, 230 / 2.54],
    chest: [50 / 2.54, 180 / 2.54],
    waist: [50 / 2.54, 180 / 2.54],
    hips: [50 / 2.54, 180 / 2.54],
    shoulder: [25 / 2.54, 70 / 2.54],
    sleeve: [35 / 2.54, 100 / 2.54],
    garmentLength: [40 / 2.54, 180 / 2.54],
  };
}

export default function PaymentReturn() {
  const { items } = useCart();
  const attemptId = useMemo(
    () => new URLSearchParams(window.location.search).get("attempt") ?? pendingPaymentAttempt(),
    [],
  );

  const platform = usePlatformContent();
  const platformStateCopy = platform.data?.content.site.platformState;

  const { data: status, error: paymentError } = useGetCommercePaymentStatus(attemptId ?? "", {
    query: {
      queryKey: getGetCommercePaymentStatusQueryKey(attemptId ?? ""),
      enabled: !!attemptId,
      retry: false,
      refetchInterval: (query) => {
        const state = query.state.data?.status;
        if (state === "paid" || state === "fulfilled" || state === "cancelled" || state === "refunded") return false;
        if (query.state.dataUpdateCount >= 10) return false;
        return 2500;
      }
    }
  });

  useEffect(() => {
    if (status?.status && (status.status === "paid" || status.status === "fulfilled" || status.status === "cancelled" || status.status === "refunded")) {
      clearCheckoutOperation();
    }
  }, [status?.status]);

  const paid = status?.status === "paid" || status?.status === "fulfilled";
  const cancelled = status?.status === "cancelled" || status?.status === "refunded";
  const { data: measurementsData, error: measurementsError } = useGetCustomerMeasurements({
    query: {
      queryKey: [...getGetCustomerMeasurementsQueryKey(), attemptId],
      enabled: paid,
      refetchInterval: 30000,
    },
    request: {
      headers: { "X-SOSO-Checkout-Attempt": attemptId ?? "" },
    },
  });

  if (!platform.data) return <PlatformContentState loading={platform.isLoading} error={platform.isError} copy={platformStateCopy} />;
  const copy = platform.data.content.pages.paymentReturn;
  const errorMessage = paymentError ? copy.statusUnavailableMessage : (!attemptId ? copy.missingAttemptMessage : "");

  const mDataError = measurementsError ? copy.measurementSyncError : null;

  return (
    <main className="mx-auto max-w-3xl px-6 py-16 md:py-24">
      <Seo title={copy.seo.title} description={copy.seo.description} path="/checkout/return" noIndex />
      <p className="text-xs uppercase tracking-[0.25em] text-[hsl(var(--primary))]">{copy.eyebrow}</p>

      <section className="mt-5 border border-border bg-card p-7 md:p-10">
        {paid ? <CheckCircle2 className="text-[hsl(var(--primary))]" size={32} /> : cancelled ? <ShieldAlert className="text-[hsl(var(--primary))]" size={32} /> : <Clock3 className="text-[hsl(var(--primary))]" size={32} />}
        <h1 className="mt-5 soso-display text-3xl text-foreground md:text-4xl">
           {paid ? copy.paidTitle : cancelled ? copy.cancelledTitle : copy.pendingTitle}
        </h1>
        <p className="mt-4 text-sm leading-relaxed text-[hsl(var(--secondary))]">
          {paid ? copy.paidBody : cancelled ? copy.cancelledBody : copy.pendingBody}
        </p>

        {status?.orderNumber && <p className="mt-5 text-sm text-foreground">{copy.orderReferenceLabel} <span className="font-semibold">{status.orderNumber}</span></p>}
        {typeof status?.totalKobo === "number" && <p className="mt-2 text-sm text-[hsl(var(--secondary))]">{copy.authoritativeTotalLabel} {naira(status.totalKobo / 100)}</p>}

        {errorMessage && <p role="alert" className="mt-5 border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed text-destructive">{errorMessage} {copy.errorSuffix}</p>}
        {!paid && !cancelled && !errorMessage && <p className="mt-5 text-xs uppercase tracking-[0.18em] text-[hsl(var(--primary))]">{copy.pendingNotice}</p>}

        {!paid && (cancelled || errorMessage) && (
          <div className="mt-6 border-t border-border pt-5">
            <p className="text-sm leading-relaxed text-[hsl(var(--secondary))]">
               {copy.retryHelp}
            </p>
            {items.length > 0 && (
              <ul className="mt-4 space-y-2 text-sm">
                {items.map((item) => (
                  <li key={`${item.slug}-${item.size}-${item.selectedColourId}-${item.customColour ?? ""}`}>
                    <Link href={`/product/${item.slug}`} className="text-[hsl(var(--primary))] underline underline-offset-4">
                       {copy.reviewLabel} {item.name} — {copy.sizeLabel} {item.size} · {item.customColour ?? item.selectedColourLabel ?? "Custom colour"}
                    </Link>
                     <span className="text-[hsl(var(--secondary))]"> · {copy.quantityLabel} {item.quantity}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}

        <div className="mt-8 flex flex-wrap gap-3">
          {!paid && (cancelled || errorMessage) ? (
            <Link href={copy.returnBagCta.href} className="soso-btn-gold px-5 py-3 text-xs font-bold uppercase tracking-[.18em]" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>{copy.returnBagCta.label.replace(/bag/i, 'Cart')}</Link>
          ) : (
            <Link href={copy.continueCta.href} className="soso-btn-gold px-5 py-3 text-xs font-bold uppercase tracking-[.18em]" style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}>{copy.continueCta.label}</Link>
          )}
          {!paid && <Link href={(cancelled || errorMessage ? copy.retryCta : copy.returnCheckoutCta).href} className="border border-foreground/30 px-5 py-3 text-xs font-bold uppercase tracking-[.18em] text-foreground transition hover:bg-muted">{(cancelled || errorMessage ? copy.retryCta : copy.returnCheckoutCta).label}</Link>}
        </div>
      </section>

      {mDataError && (
        <div role="alert" className="mt-5 border border-destructive/30 bg-destructive/5 p-4 text-sm leading-relaxed text-destructive">
          <p className="flex items-center gap-2 font-semibold text-primary"><AlertTriangle size={16} /> {copy.noticeLabel}</p>
          <p className="mt-1">{mDataError}</p>
        </div>
      )}

      {measurementsData && measurementsData.items.length > 0 && (
        <section className="mt-10 animate-in fade-in slide-in-from-bottom-4 duration-700">
          <div className="mb-6">
            <h2 className="soso-display flex items-center gap-3 text-2xl text-foreground">
              <Ruler size={24} className="text-primary" />
              {copy.measurementsTitle}
            </h2>
            <p className="mt-2 text-sm text-secondary">
              {measurementsData.measurementsRequired
                ? copy.requiredMeasurementsGuidance
                : copy.optionalMeasurementsGuidance}
            </p>
            {measurementsData.dispatchGuidance && (
              <div role="status" data-testid="status-measurements-guidance" className="mt-4 flex items-start gap-2 bg-primary/10 border border-primary/20 p-4 text-xs text-primary">
                <Info size={16} className="shrink-0 mt-0.5" />
                <p>{measurementsData.dispatchGuidance}</p>
              </div>
            )}
          </div>

          <div className="space-y-8">
            {measurementsData.items.map((item) => (
              <MeasurementItemForm key={item.id} item={item} attemptId={attemptId!} copy={copy} />
            ))}
          </div>
        </section>
      )}
    </main>
  );
}

function MeasurementItemForm({ item, attemptId, copy }: {
  item: CustomerMeasurement;
  attemptId: string;
  copy: PlatformContent["pages"]["paymentReturn"];
}) {
  const queryClient = useQueryClient();
  const updateMutation = useUpdateCustomerMeasurement({
    request: {
      headers: { "X-SOSO-Checkout-Attempt": attemptId },
    },
  });
  const [unit, setUnit] = useState<CustomerMeasurementInputUnit>(item.unit ?? "cm");

  const [values, setValues] = useState({
    height: item.values?.height?.toString() ?? "",
    chest: item.values?.chest?.toString() ?? "",
    waist: item.values?.waist?.toString() ?? "",
    hips: item.values?.hips?.toString() ?? "",
    shoulder: item.values?.shoulder?.toString() ?? "",
    sleeve: item.values?.sleeve?.toString() ?? "",
    garmentLength: item.values?.garmentLength?.toString() ?? "",
  });

  const [note, setNote] = useState(item.customerNote ?? "");
  const [error, setError] = useState("");

  const bounds = getBounds(unit);
  const locked = item.status === "confirmed" || item.status === "cancelled";

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsedValues = {
      height: parseFloat(values.height),
      chest: parseFloat(values.chest),
      waist: parseFloat(values.waist),
      hips: parseFloat(values.hips),
      shoulder: parseFloat(values.shoulder),
      sleeve: parseFloat(values.sleeve),
      garmentLength: parseFloat(values.garmentLength),
    };

    // Validate
    for (const [key, val] of Object.entries(parsedValues) as [typeof measurementFields[number], number][]) {
      const label = copy.measurementFieldLabels[key];
      if (isNaN(val)) {
        setError(interpolate(copy.measurementInvalidErrorTemplate, { label }));
        return;
      }
      const [min, max] = bounds[key as keyof typeof bounds];
      if (val < min || val > max) {
        setError(interpolate(copy.measurementRangeErrorTemplate, { label, min, max, unit }));
        return;
      }
    }

    try {
      await updateMutation.mutateAsync({
        id: item.id,
        data: {
          unit,
          values: parsedValues,
          customerNote: note || undefined,
          version: item.version
        }
      });
      queryClient.invalidateQueries({ queryKey: getGetCustomerMeasurementsQueryKey() });
    } catch (err: any) {
      if (err?.response?.status === 409 || err?.status === 409) {
        setError(copy.measurementConflictError);
      } else {
        setError(copy.measurementSubmitError);
      }
    }
  };

  const getStatusText = (status: CustomerMeasurementStatus) => copy.measurementStatusLabels[status];

  const getStatusColor = (status: CustomerMeasurementStatus) => {
    switch (status) {
      case "needed": return "text-primary border-primary";
      case "submitted": return "text-blue-400 border-blue-400";
      case "clarification_requested": return "text-amber-500 border-amber-500";
      case "confirmed": return "text-green-500 border-green-500";
      case "cancelled": return "text-red-500 border-red-500";
    }
  };

  return (
    <div className="border border-border bg-muted/10 p-6 md:p-8 relative">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-6">
        <div>
          <h3 className="soso-display text-xl">{item.productName}</h3>
          <p className="text-xs text-muted-foreground mt-1 tracking-wider uppercase">
             {copy.lineLabel} {item.lineNumber} {item.selectedSize ? `— ${copy.baseSizeLabel} ${item.selectedSize}` : ""}
          </p>
        </div>
        <div role="status" data-testid={`status-measurement-${item.id}`} className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider border ${getStatusColor(item.status)}`}>
          {getStatusText(item.status)}
        </div>
      </div>

      {item.clarificationNote && (
        <div className="mb-6 bg-amber-500/10 border border-amber-500/30 p-4 text-amber-100 text-sm">
           <p className="font-semibold text-xs uppercase tracking-wider text-amber-500 mb-1">{copy.atelierNoteLabel}</p>
          {item.clarificationNote}
        </div>
      )}

      {item.productionException && (
        <div className="mb-6 bg-red-500/10 border border-red-500/30 p-4 text-red-100 text-sm">
           <p className="font-semibold text-xs uppercase tracking-wider text-red-500 mb-1">{copy.productionExceptionLabel}</p>
          {item.productionException}
        </div>
      )}

      <form onSubmit={handleSave}>
        {!locked && (
          <div className="mb-6 flex gap-4 items-center">
            <span className="text-sm text-secondary">{copy.unitLabel}</span>
            <div className="flex bg-[#1c1914] border border-border p-1" role="group" aria-label={copy.unitsGroupAriaLabel}>
              <button
                type="button"
                className={`px-4 py-1 text-xs uppercase tracking-widest font-semibold transition-colors ${unit === "cm" ? "bg-primary text-primary-foreground" : "text-secondary hover:text-primary"}`}
                onClick={() => setUnit("cm")}
                disabled={locked}
                aria-pressed={unit === "cm"}
                data-testid={`btn-unit-cm-${item.id}`}
              >
                {copy.centimetersUnitLabel}
              </button>
              <button
                type="button"
                className={`px-4 py-1 text-xs uppercase tracking-widest font-semibold transition-colors ${unit === "in" ? "bg-primary text-primary-foreground" : "text-secondary hover:text-primary"}`}
                onClick={() => setUnit("in")}
                disabled={locked}
                aria-pressed={unit === "in"}
                data-testid={`btn-unit-in-${item.id}`}
              >
                {copy.inchesUnitLabel}
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-2 md:grid-cols-3 gap-6">
          {measurementFields.map((key) => {
            const field = { key, label: copy.measurementFieldLabels[key] };
            return (
              <div key={field.key}>
                <label htmlFor={`input-${field.key}-${item.id}`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  {field.label} ({unit})
                </label>
                <input
                  id={`input-${field.key}-${item.id}`}
                  type="number"
                  step="any"
                  inputMode="decimal"
                  disabled={locked || updateMutation.isPending}
                  value={values[field.key as keyof typeof values]}
                  onChange={(e) => setValues(v => ({ ...v, [field.key]: e.target.value }))}
                  className="w-full h-10 border border-border bg-[#1c1914] px-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-50"
                  min={bounds[field.key as keyof typeof bounds][0]}
                  max={bounds[field.key as keyof typeof bounds][1]}
                  required
                  data-testid={`input-${field.key}-${item.id}`}
                />
                {!locked && (
                  <p className="text-[10px] text-muted-foreground mt-1">
                    {bounds[field.key as keyof typeof bounds][0].toFixed(1)}–{bounds[field.key as keyof typeof bounds][1].toFixed(1)}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="mt-6">
          <label htmlFor={`input-note-${item.id}`} className="block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
             {copy.additionalNotesLabel} ({copy.optionalLabel})
          </label>
          <textarea
            id={`input-note-${item.id}`}
            disabled={locked || updateMutation.isPending}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            rows={3}
            className="w-full border border-border bg-[#1c1914] p-3 text-sm text-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary resize-y disabled:opacity-50"
            placeholder={copy.optionalContextPlaceholder}
            data-testid={`input-note-${item.id}`}
          />
        </div>

        {error && (
          <div role="alert" className="mt-4 flex items-start gap-2 text-red-400 bg-red-400/10 p-3 border border-red-400/20 text-sm">
            <AlertTriangle size={16} className="mt-0.5 shrink-0" />
            <p>{error}</p>
          </div>
        )}

        {!locked && (
          <div className="mt-6 flex justify-end">
            <button
              type="submit"
              disabled={updateMutation.isPending}
              className="soso-btn-gold px-8 py-3 text-xs font-bold uppercase tracking-[.18em] disabled:opacity-50 disabled:cursor-not-allowed"
              style={{ backgroundColor: "hsl(var(--primary))", color: "hsl(var(--primary-foreground))" }}
              data-testid={`btn-submit-${item.id}`}
            >
              {updateMutation.isPending ? copy.submittingMeasurementsLabel : item.status === "needed" ? copy.submitMeasurementsLabel : copy.updateMeasurementsLabel}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
