import { FormEvent, useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShopperProfileQueryKey,
  useUpdateShopperProfile,
  type ShopperProfileResponse,
} from "@workspace/api-client-react";
import { ErrorNote, Section, fieldClass, ghostButton, labelClass, primaryButton } from "./shared";

export function ProfileSection({ profile }: { profile: ShopperProfileResponse }) {
  const customer = profile.customer;
  const queryClient = useQueryClient();
  const update = useUpdateShopperProfile();
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState(customer.name);
  const [phone, setPhone] = useState(customer.phone ?? "");
  const [address, setAddress] = useState(customer.address ?? "");
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (editing) return;
    setName(customer.name);
    setPhone(customer.phone ?? "");
    setAddress(customer.address ?? "");
  }, [customer.name, customer.phone, customer.address, editing]);

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setSaved(false);
    update.mutate(
      { data: { name: name.trim(), phone: phone.trim() || null, address: address.trim() || null } },
      {
        onSuccess: (next) => {
          queryClient.setQueryData(getGetShopperProfileQueryKey(), next);
          void queryClient.invalidateQueries({ queryKey: getGetShopperProfileQueryKey() });
          setEditing(false);
          setSaved(true);
        },
      },
    );
  };

  return (
    <Section
      title="Profile"
      eyebrow="Your details"
      testId="section-profile"
      action={!editing && (
        <button type="button" className={ghostButton} onClick={() => { update.reset(); setSaved(false); setEditing(true); }} data-testid="button-edit-profile">Edit details</button>
      )}
    >
      {!editing ? (
        <dl className="grid gap-6 text-[13px] md:grid-cols-2">
          <div><dt className={labelClass}>Name</dt><dd className="mt-2 text-foreground" data-testid="text-profile-name">{customer.name}</dd></div>
          <div><dt className={labelClass}>Verified email</dt><dd className="mt-2 text-foreground" data-testid="text-profile-email">{customer.verifiedEmail}</dd></div>
          <div><dt className={labelClass}>Phone</dt><dd className="mt-2 text-foreground" data-testid="text-profile-phone">{customer.phone || <span className="text-secondary">Not added</span>}</dd></div>
          <div><dt className={labelClass}>Delivery address</dt><dd className="mt-2 whitespace-pre-wrap text-foreground" data-testid="text-profile-address">{customer.address || <span className="text-secondary">Not added</span>}</dd></div>
          {saved && <p role="status" className="text-[12px] text-secondary md:col-span-2" data-testid="status-profile-saved">Your details have been saved.</p>}
        </dl>
      ) : (
        <form onSubmit={submit} className="grid max-w-2xl gap-5">
          <label className={labelClass}>Full name
            <input required maxLength={255} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} autoComplete="name" data-testid="input-profile-name" />
          </label>
          <label className={labelClass}>Phone
            <input maxLength={50} value={phone} onChange={(e) => setPhone(e.target.value)} className={fieldClass} autoComplete="tel" type="tel" data-testid="input-profile-phone" />
          </label>
          <label className={labelClass}>Delivery address
            <textarea maxLength={2000} rows={4} value={address} onChange={(e) => setAddress(e.target.value)} className={fieldClass} autoComplete="street-address" data-testid="input-profile-address" />
          </label>
          <p className="text-[12px] text-secondary">Your email is verified through your sign-in account and cannot be changed here.</p>
          {update.isError && <ErrorNote error={update.error} />}
          <div className="flex flex-wrap gap-3">
            <button type="submit" disabled={update.isPending || !name.trim()} className={primaryButton} data-testid="button-save-profile">{update.isPending ? "Saving..." : "Save details"}</button>
            <button type="button" className={ghostButton} onClick={() => setEditing(false)} data-testid="button-cancel-profile">Cancel</button>
          </div>
        </form>
      )}
    </Section>
  );
}
