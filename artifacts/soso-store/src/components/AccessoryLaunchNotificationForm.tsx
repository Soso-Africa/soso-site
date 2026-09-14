import { FormEvent, useState } from "react";
import { Link } from "wouter";
import {
  useCreateAccessoryLaunchNotification,
  type AccessoryLaunchNotificationInput,
} from "@workspace/api-client-react";
import { trackStorefrontEvent } from "@/components/ConsentManager";
import type { PlatformContent } from "@/data/platformContent";

type AccessoryLaunchCopy = NonNullable<PlatformContent["productCopy"]["accessoryLaunchNotification"]>;

type Props = {
  productSlug: string;
  accessoryCategory: string;
  copy?: AccessoryLaunchCopy;
};

const fallbackCopy: AccessoryLaunchCopy = {
  title: "Hear when this accessory launches",
  body: "Leave your email if you would like SOSO to contact you about this accessory. We cannot promise a launch date, price, or availability.",
  emailLabel: "Email address",
  consentLabel: "I agree to receive an email from SOSO about this accessory launch only.",
  privacyLink: { label: "Read our privacy policy", href: "/privacy" },
  submitLabel: "Request launch notification",
  submittingLabel: "Saving request…",
  successMessage: "Your request has been recorded. We will contact you only if there is an update about this accessory.",
  invalidEmailMessage: "Enter a valid email address and confirm consent.",
  errorMessage: "We could not save your request. Please try again.",
};

export function AccessoryLaunchNotificationForm({ productSlug, accessoryCategory, copy }: Props) {
  const text = copy ?? fallbackCopy;
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState("");
  const mutation = useCreateAccessoryLaunchNotification();

  const submit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail) || !consent) {
      setValidationError(text.invalidEmailMessage);
      return;
    }
    setValidationError("");
    const data: AccessoryLaunchNotificationInput = {
      email: normalizedEmail,
      productSlug,
      accessoryCategory,
      emailNotificationConsent: true,
    };
    try {
      await mutation.mutateAsync({ data });
      setSubmitted(true);
      trackStorefrontEvent("accessory_launch_notification_submitted", {
        productSlug,
        accessoryCategory,
      });
    } catch {
      setValidationError(text.errorMessage);
    }
  };

  if (submitted) {
    return (
      <p role="status" className="border border-border bg-muted/20 p-4 text-sm leading-relaxed" data-testid="accessory-launch-success">
        {text.successMessage}
      </p>
    );
  }

  return (
    <form onSubmit={submit} className="border border-border bg-muted/10 p-5" noValidate>
      <h2 className="soso-display text-2xl">{text.title}</h2>
      <p className="mt-2 text-sm leading-relaxed text-secondary">{text.body}</p>
      <label className="mt-5 block text-[11px] uppercase tracking-wider text-secondary" htmlFor={`accessory-launch-email-${productSlug}`}>
        {text.emailLabel}
        <input
          id={`accessory-launch-email-${productSlug}`}
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          className="mt-2 w-full border border-border bg-background px-3 py-3 text-sm normal-case tracking-normal text-foreground outline-none focus:border-foreground"
          autoComplete="email"
          required
          data-testid="accessory-launch-email"
        />
      </label>
      <label className="mt-4 flex items-start gap-3 text-xs leading-relaxed text-secondary">
        <input
          type="checkbox"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          className="mt-0.5 h-4 w-4 shrink-0 accent-foreground"
          required
          data-testid="accessory-launch-consent"
        />
        <span>
          {text.consentLabel}{" "}
          <Link href={text.privacyLink.href} className="underline underline-offset-4 hover:text-foreground">
            {text.privacyLink.label}
          </Link>
        </span>
      </label>
      {validationError && <p role="alert" className="mt-3 text-sm text-red-600" data-testid="accessory-launch-error">{validationError}</p>}
      <button
        type="submit"
        disabled={mutation.isPending}
        className="mt-5 w-full border border-foreground bg-foreground px-4 py-3 text-[11px] font-bold uppercase tracking-[0.18em] text-background transition-opacity disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="accessory-launch-submit"
      >
        {mutation.isPending ? text.submittingLabel : text.submitLabel}
      </button>
    </form>
  );
}