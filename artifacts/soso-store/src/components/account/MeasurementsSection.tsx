import { FormEvent, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getGetShopperMeasurementsQueryKey,
  useCreateShopperMeasurement,
  useDeleteShopperMeasurement,
  useGetShopperMeasurements,
  useUpdateShopperMeasurement,
  type ShopperMeasurementInputUnit,
  type ShopperMeasurementProfile,
  type ShopperMeasurements,
} from "@workspace/api-client-react";
import { Empty, ErrorNote, Section, Skeleton, errorStatus, fieldClass, ghostButton, labelClass, primaryButton } from "./shared";

const VALUE_PATTERN = /^\d{1,3}(\.\d{1,2})?$/;

function MeasurementForm({ catalog, initial, onDone }: { catalog: ShopperMeasurements; initial?: ShopperMeasurementProfile; onDone: () => void }) {
  const queryClient = useQueryClient();
  const create = useCreateShopperMeasurement();
  const update = useUpdateShopperMeasurement();
  const [name, setName] = useState(initial?.name ?? "");
  const [unit, setUnit] = useState<ShopperMeasurementInputUnit>(initial?.unit ?? catalog.units[0] ?? "cm");
  const [values, setValues] = useState<Record<string, string>>(() =>
    Object.fromEntries((initial?.entries ?? []).map((e) => [e.field, e.value])),
  );
  const [localError, setLocalError] = useState("");
  const pending = create.isPending || update.isPending;
  const mutationError = create.error ?? update.error;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    setLocalError("");
    const entries = catalog.fields
      .filter((f) => (values[f.field] ?? "").trim() !== "")
      .map((f) => ({ field: f.field, label: f.label, value: values[f.field].trim() }));
    if (!entries.length) return setLocalError("Add at least one measurement.");
    if (entries.some((e) => !VALUE_PATTERN.test(e.value))) return setLocalError("Use numbers up to 999.99, with at most two decimals.");
    const body = { name: name.trim(), unit, entries };
    const onSuccess = () => {
      void queryClient.invalidateQueries({ queryKey: getGetShopperMeasurementsQueryKey() });
      onDone();
    };
    if (initial) {
      if (initial.revision === null) return setLocalError("This profile cannot be edited.");
      update.mutate({ profileId: initial.id, data: { ...body, revision: initial.revision } }, { onSuccess });
    } else {
      create.mutate({ data: body }, { onSuccess });
    }
  };

  return (
    <form onSubmit={submit} className="mt-4 grid gap-5 border border-border p-5 md:p-8" data-testid={initial ? `form-measurement-${initial.id}` : "form-measurement-new"}>
      <div className="grid gap-5 md:grid-cols-[1fr_200px]">
        <label className={labelClass}>Profile name
          <input required maxLength={100} value={name} onChange={(e) => setName(e.target.value)} className={fieldClass} placeholder="e.g. Agbada fitting" data-testid="input-measurement-name" />
        </label>
        <label className={labelClass}>Unit
          <select value={unit} onChange={(e) => setUnit(e.target.value as ShopperMeasurementInputUnit)} className={fieldClass} data-testid="select-measurement-unit">
            {catalog.units.map((u) => <option key={u} value={u}>{u === "inches" ? "Inches" : "Centimetres"}</option>)}
          </select>
        </label>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {catalog.fields.map((f) => (
          <label key={f.field} className={labelClass}>{f.label}
            <input inputMode="decimal" value={values[f.field] ?? ""} onChange={(e) => setValues({ ...values, [f.field]: e.target.value })} className={fieldClass} data-testid={`input-measurement-${f.field}`} />
          </label>
        ))}
      </div>
      {localError && <p role="alert" className="text-[13px] text-destructive">{localError}</p>}
      {mutationError && (
        <ErrorNote error={errorStatus(mutationError) === 409 ? new Error("This profile changed elsewhere. Close and reopen it to edit the latest version.") : mutationError} />
      )}
      <div className="flex flex-wrap gap-3">
        <button type="submit" disabled={pending || !name.trim()} className={primaryButton} data-testid="button-save-measurement">{pending ? "Saving..." : initial ? "Save changes" : "Save measurements"}</button>
        <button type="button" onClick={onDone} className={ghostButton} data-testid="button-cancel-measurement">Cancel</button>
      </div>
    </form>
  );
}

function ProfileCard({ profile, catalog }: { profile: ShopperMeasurementProfile; catalog: ShopperMeasurements }) {
  const queryClient = useQueryClient();
  const remove = useDeleteShopperMeasurement();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const canEdit = profile.editable && profile.revision !== null;

  const confirmDelete = () => {
    if (profile.revision === null) return;
    remove.mutate(
      { profileId: profile.id, data: { revision: profile.revision } },
      { onSuccess: () => { setConfirming(false); void queryClient.invalidateQueries({ queryKey: getGetShopperMeasurementsQueryKey() }); } },
    );
  };

  return (
    <li className="border border-border p-5" data-testid={`card-measurement-${profile.id}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-[13px] font-semibold uppercase tracking-[0.12em] text-foreground">{profile.name}</p>
          <p className="mt-1 text-[12px] text-secondary">{profile.unit === "inches" ? "Inches" : "Centimetres"}{!profile.editable && " / Recorded by the SOSO atelier"}</p>
        </div>
        {canEdit && !editing && (
          <div className="flex gap-2">
            <button type="button" className={ghostButton} onClick={() => { setConfirming(false); setEditing(true); }} data-testid={`button-edit-measurement-${profile.id}`}>Edit</button>
            <button type="button" className={ghostButton} onClick={() => { remove.reset(); setConfirming(true); }} data-testid={`button-delete-measurement-${profile.id}`}>Delete</button>
          </div>
        )}
      </div>
      {!editing && (
        <dl className="mt-4 grid grid-cols-2 gap-3 text-[13px] sm:grid-cols-3 lg:grid-cols-4">
          {profile.entries.map((e) => (
            <div key={e.field}><dt className="text-[11px] uppercase tracking-[0.15em] text-secondary">{e.label}</dt><dd className="mt-1 text-foreground">{e.value}</dd></div>
          ))}
        </dl>
      )}
      {editing && <MeasurementForm catalog={catalog} initial={profile} onDone={() => setEditing(false)} />}
      {confirming && (
        <div role="alertdialog" aria-label="Confirm deletion" className="mt-4 grid gap-3 border border-destructive/40 p-4">
          <p className="text-[13px] text-foreground">Delete "{profile.name}"? This cannot be undone.</p>
          {remove.isError && <ErrorNote error={remove.error} />}
          <div className="flex gap-3">
            <button type="button" disabled={remove.isPending} onClick={confirmDelete} className="inline-flex min-h-11 items-center bg-destructive px-5 text-[11px] font-semibold uppercase tracking-[0.2em] text-destructive-foreground disabled:opacity-50" data-testid={`button-confirm-delete-${profile.id}`}>{remove.isPending ? "Deleting..." : "Delete"}</button>
            <button type="button" onClick={() => setConfirming(false)} className={ghostButton} data-testid="button-cancel-delete">Keep</button>
          </div>
        </div>
      )}
    </li>
  );
}

export function MeasurementsSection() {
  const query = useGetShopperMeasurements({ query: { retry: false, queryKey: getGetShopperMeasurementsQueryKey() } });
  const [creating, setCreating] = useState(false);

  if (query.isError && errorStatus(query.error) === 403) {
    return (
      <Section title="Measurements" eyebrow="Fit" testId="section-measurements">
        <p className="text-[13px] text-secondary" data-testid="status-measurements-unavailable">Saved measurements are not available at the moment.</p>
      </Section>
    );
  }

  return (
    <Section
      title="Measurements"
      eyebrow="Fit"
      testId="section-measurements"
      action={query.data && query.data.fields.length > 0 && !creating && (
        <button type="button" className={primaryButton} onClick={() => setCreating(true)} data-testid="button-add-measurement">Add measurements</button>
      )}
    >
      {query.isLoading && <Skeleton rows={2} />}
      {query.isError && <ErrorNote error={query.error} onRetry={() => void query.refetch()} />}
      {query.data && creating && <MeasurementForm catalog={query.data} onDone={() => setCreating(false)} />}
      {query.data && query.data.profiles.length === 0 && !creating && (
        <Empty title="No measurements saved" body="Save your measurements once and the atelier can refer to them for future pieces." />
      )}
      {query.data && query.data.profiles.length > 0 && (
        <ul className="mt-4 grid gap-3">
          {query.data.profiles.map((p) => <ProfileCard key={p.id} profile={p} catalog={query.data} />)}
        </ul>
      )}
    </Section>
  );
}
