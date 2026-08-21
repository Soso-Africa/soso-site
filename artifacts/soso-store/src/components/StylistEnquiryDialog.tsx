import React, { FormEvent, useEffect, useId, useState } from "react";
import { Loader2, MessageCircle, X } from "lucide-react";
import { useCreateEnquiry } from "@workspace/api-client-react";

type StylistEnquiryDialogProps = {
  isOpen: boolean;
  onClose: () => void;
  productSlug: string;
  productName: string;
};

export function StylistEnquiryDialog({
  isOpen,
  onClose,
  productSlug,
  productName,
}: StylistEnquiryDialogProps) {
  const formId = useId();
  const createEnquiry = useCreateEnquiry();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!isOpen) return;

    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !createEnquiry.isPending) onClose();
    };

    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [createEnquiry.isPending, isOpen, onClose]);

  useEffect(() => {
    if (!isOpen) {
      setSent(false);
      setError("");
    }
  }, [isOpen]);

  if (!isOpen) return null;

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
          productSlug,
          message: String(form.get("message") || "").trim(),
        },
      });
      setSent(true);
    } catch {
      setError("We could not send your question just now. Please try again or use WhatsApp.");
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
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${formId}-title`}
        className="w-full max-w-xl border border-[#b8912f]/40 bg-[#17130e] px-6 py-7 shadow-2xl sm:px-8 sm:py-9"
      >
        <div className="flex items-start justify-between gap-5">
          <div>
            <p className="text-[11px] uppercase tracking-[0.25em] text-[#b8912f]">Optional fit support</p>
            <h2 id={`${formId}-title`} className="mt-2 soso-display text-3xl text-[#f6f1e7]">
              Ask a SOSO stylist
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-[#d8ceb9]">
              Ask about <span className="text-[#f6f1e7]">{productName}</span>, sizing, or your occasion. This does not pause or replace secure checkout.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={createEnquiry.isPending}
            aria-label="Close stylist enquiry"
            className="shrink-0 text-[#d8ceb9] transition-colors hover:text-white disabled:opacity-50"
          >
            <X size={22} />
          </button>
        </div>

        {sent ? (
          <div className="mt-8 border border-[#b8912f]/45 bg-[#b8912f]/10 p-5" role="status">
            <p className="font-medium text-[#f6f1e7]">Your question has been sent.</p>
            <p className="mt-2 text-sm leading-relaxed text-[#d8ceb9]">
              A SOSO stylist can follow up using the details you shared. You can still continue to your bag whenever you are ready.
            </p>
            <button type="button" onClick={onClose} className="mt-5 text-xs font-semibold uppercase tracking-[0.16em] text-[#c9a54c] underline underline-offset-4">
              Back to the piece
            </button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-7 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="text-xs uppercase tracking-[0.14em] text-[#d8ceb9]">
                Name <span className="opacity-60">(optional)</span>
                <input name="name" autoComplete="name" className="mt-2 w-full border border-[#f6f1e7]/25 bg-transparent px-3 py-3 text-sm text-white outline-none focus:border-[#b8912f]" />
              </label>
              <label className="text-xs uppercase tracking-[0.14em] text-[#d8ceb9]">
                Phone <span className="opacity-60">(optional)</span>
                <input name="phone" autoComplete="tel" inputMode="tel" className="mt-2 w-full border border-[#f6f1e7]/25 bg-transparent px-3 py-3 text-sm text-white outline-none focus:border-[#b8912f]" />
              </label>
            </div>
            <label className="block text-xs uppercase tracking-[0.14em] text-[#d8ceb9]">
              Email <span className="opacity-60">(optional)</span>
              <input name="email" type="email" autoComplete="email" className="mt-2 w-full border border-[#f6f1e7]/25 bg-transparent px-3 py-3 text-sm text-white outline-none focus:border-[#b8912f]" />
            </label>
            <label className="block text-xs uppercase tracking-[0.14em] text-[#d8ceb9]">
              Your question
              <textarea required name="message" minLength={8} maxLength={2000} rows={5} placeholder="Tell us what you would like to know." className="mt-2 w-full resize-y border border-[#f6f1e7]/25 bg-transparent px-3 py-3 text-sm leading-relaxed text-white outline-none placeholder:text-[#d8ceb9]/45 focus:border-[#b8912f]" />
            </label>
            {error && <p role="alert" className="border border-red-300/35 bg-red-300/10 px-4 py-3 text-sm text-red-100">{error}</p>}
            <button disabled={createEnquiry.isPending} className="flex w-full items-center justify-center gap-2 bg-[#b8912f] px-4 py-4 text-xs font-bold uppercase tracking-[0.18em] text-[#17130e] disabled:opacity-65">
              {createEnquiry.isPending ? <Loader2 className="animate-spin" size={16} /> : <MessageCircle size={16} />}
              {createEnquiry.isPending ? "Sending…" : "Send question"}
            </button>
          </form>
        )}
      </section>
    </div>
  );
}