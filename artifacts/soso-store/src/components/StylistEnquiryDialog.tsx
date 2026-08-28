import { FormEvent, useEffect, useId, useRef, useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import { useCreateEnquiry } from "@workspace/api-client-react";
import { editorialOrigin, trackStorefrontEvent } from "./ConsentManager";
import { usePlatformContent } from "@/data/platformContent";

type StylistEnquiryDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  productSlug?: string;
  productName?: string;
};

export function StylistEnquiryDialog({
  isOpen,
  onClose,
  productSlug,
  productName,
}: StylistEnquiryDialogProps) {
  const formId = useId();
  const createEnquiry = useCreateEnquiry();
  const platform = usePlatformContent();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLElement>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);
  const enquiryPendingRef = useRef(createEnquiry.isPending);

  useEffect(() => {
    enquiryPendingRef.current = createEnquiry.isPending;
  }, [createEnquiry.isPending]);

  useEffect(() => {
    if (!isOpen) return;
    previouslyFocusedRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
    const focusTimer = window.setTimeout(() => {
      dialogRef.current?.querySelector<HTMLElement>("[data-stylist-initial-focus]")?.focus();
    }, 0);

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !enquiryPendingRef.current) {
        event.preventDefault();
        onClose();
      }
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", closeOnEscape);
      previouslyFocusedRef.current?.focus();
    };
  }, [isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setSent(false);
      setError("");
    }
  }, [isOpen]);

  useEffect(() => {
    if (isOpen) trackStorefrontEvent("stylist_inquiry_started", { productSlug: productSlug || undefined, articleSlug: editorialOrigin() });
  }, [isOpen, productSlug]);

  if (!isOpen || !platform.data) return null;
  const copy = platform.data.content.supportCopy.stylistDialog;

  const trapFocus = (event: React.KeyboardEvent<HTMLElement>) => {
    if (event.key !== "Tab") return;
    const focusable = dialogRef.current?.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), [tabindex]:not([tabindex="-1"])',
    );
    if (!focusable?.length) {
      event.preventDefault();
      return;
    }

    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError("");
    const form = new FormData(event.currentTarget);

    try {
      await createEnquiry.mutateAsync({
        data: {
          name: String(form.get("name") || "").trim() || undefined,
          email: String(form.get("email") || "").trim() || undefined,
          phone: String(form.get("phone") || "").trim() || undefined,
          productSlug: productSlug || undefined,
          message: String(form.get("message") || "").trim(),
        },
      });
      setSent(true);
      trackStorefrontEvent("stylist_inquiry_completed", { productSlug: productSlug || undefined, articleSlug: editorialOrigin() });
    } catch {
      setError(copy.failureMessage);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center bg-black/70 p-0 sm:p-5"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !createEnquiry.isPending) onClose();
      }}
    >
      <section
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        onKeyDown={trapFocus}
        className="w-full max-w-xl border border-border bg-background px-6 py-7 shadow-2xl sm:px-8 sm:py-9"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-secondary">{copy.eyebrow}</p>
            <h2 id={`${formId}-title`} className="mt-2 soso-display text-3xl text-foreground">
              {copy.title}
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-secondary">
              {productName ? copy.productPrompt.replace("{productName}", productName) : copy.generalPrompt} {copy.checkoutReassurance}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            data-stylist-initial-focus
            disabled={createEnquiry.isPending}
            aria-label={copy.closeLabel}
            className="shrink-0 text-secondary transition-colors hover:text-foreground disabled:opacity-50"
          >
            <X size={22} />
          </button>
        </div>

        {sent ? (
          <div className="mt-8 border border-border bg-muted/20 p-5" role="status">
            <p className="font-medium text-foreground">{copy.successTitle}</p>
            <p className="mt-2 text-sm leading-relaxed text-secondary">
              {copy.successBody}
            </p>
            <button type="button" onClick={onClose} className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-foreground underline underline-offset-4">
              {copy.backLabel}
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs uppercase tracking-[0.14em] text-secondary">
                {copy.nameLabel} <span className="opacity-60">({copy.optionalLabel})</span>
                <input name="name" autoComplete="name" className="mt-2 w-full border border-border bg-transparent px-3 py-3 text-sm text-foreground outline-none focus:border-foreground" />
              </label>
              <label className="text-xs uppercase tracking-[0.14em] text-secondary">
                {copy.phoneLabel} <span className="opacity-60">({copy.optionalLabel})</span>
                <input name="phone" autoComplete="tel" inputMode="tel" className="mt-2 w-full border border-border bg-transparent px-3 py-3 text-sm text-foreground outline-none focus:border-foreground" />
              </label>
            </div>
            <label className="block text-xs uppercase tracking-[0.14em] text-secondary">
              {copy.emailLabel} <span className="opacity-60">({copy.optionalLabel})</span>
              <input name="email" type="email" autoComplete="email" className="mt-2 w-full border border-border bg-transparent px-3 py-3 text-sm text-foreground outline-none focus:border-foreground" />
            </label>
            <label className="block text-xs uppercase tracking-[0.14em] text-secondary">
              {copy.questionLabel}
              <textarea required name="message" minLength={8} maxLength={2000} rows={5} placeholder={copy.questionPlaceholder} className="mt-2 w-full resize-y border border-border bg-transparent px-3 py-3 text-sm leading-relaxed text-foreground outline-none placeholder:text-muted-foreground focus:border-foreground" />
            </label>
            {error && <p role="alert" className="border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">{error}</p>}
            <button disabled={createEnquiry.isPending} className="flex w-full items-center justify-center gap-2 bg-foreground px-4 py-4 text-xs font-bold uppercase tracking-[0.18em] text-background disabled:opacity-65">
              {createEnquiry.isPending ? <Loader2 className="animate-spin" size={16} /> : <MessageCircle size={16} />}
              {createEnquiry.isPending ? copy.pendingLabel : copy.submitLabel}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}