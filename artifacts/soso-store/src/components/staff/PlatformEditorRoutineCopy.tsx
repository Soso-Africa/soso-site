import type { PlatformContent } from "../../data/platformContent";
import { CopyPanel, PlatformCopyFields } from "./PlatformCopyFields";

export function PlatformEditorFooter({
  data,
  onChange,
}: {
  data: PlatformContent["site"]["footer"];
  onChange: (data: PlatformContent["site"]["footer"]) => void;
}) {
  return <CopyPanel title="Footer copy and links" description="Routine footer description, columns, legal links, checkout note and accessibility labels.">
    <PlatformCopyFields value={data} path={["footer"]} onChange={(updated) => onChange(updated as PlatformContent["site"]["footer"])} />
  </CopyPanel>;
}

export function PlatformEditorSiteRoutineCopy({
  data,
  onChange,
}: {
  data: PlatformContent["site"];
  onChange: (data: PlatformContent["site"]) => void;
}) {
  const routine = {
    name: data.name,
    logoUrl: data.logoUrl,
    logoAlt: data.logoAlt,
    skipLinkLabel: data.skipLinkLabel,
    instagramUrl: data.instagramUrl,
    whatsappUrl: data.whatsappUrl,
    navigation: data.navigation,
    mobileNavigation: data.mobileNavigation,
    platformState: data.platformState,
    header: {
      openMenuLabel: data.header.openMenuLabel,
      closeMenuLabel: data.header.closeMenuLabel,
      mainNavigationLabel: data.header.mainNavigationLabel,
      whatsappLabel: data.header.whatsappLabel,
      cartLabel: data.header.cartLabel,
      openCartLabel: data.header.openCartLabel,
      mobileWhatsappLabel: data.header.mobileWhatsappLabel,
      searchLabel: data.header.searchLabel,
      searchPlaceholder: data.header.searchPlaceholder,
      closeSearchLabel: data.header.closeSearchLabel,
      clearSearchLabel: data.header.clearSearchLabel,
      searchSuggestionsLabel: data.header.searchSuggestionsLabel,
    },
    cart: data.cart,
    floatingCta: data.floatingCta,
    consent: data.consent,
    structuredData: data.structuredData,
  };

  return <CopyPanel title="Brand, navigation and interface copy" description="Logo details, navigation links, header and bag labels, privacy choices, storefront states and search metadata.">
    <PlatformCopyFields
      value={routine}
      path={["site"]}
      onChange={(updated) => {
        const next = updated as typeof routine;
        onChange({
          ...data,
          ...next,
          header: { ...data.header, ...next.header },
        });
      }}
    />
  </CopyPanel>;
}

export function PlatformEditorSupportInterface({
  supportCopy,
  interfaceCopy,
  onSupportChange,
  onInterfaceChange,
}: {
  supportCopy: PlatformContent["supportCopy"];
  interfaceCopy: PlatformContent["interfaceCopy"];
  onSupportChange: (data: PlatformContent["supportCopy"]) => void;
  onInterfaceChange: (data: PlatformContent["interfaceCopy"]) => void;
}) {
  return <div className="space-y-4">
    <CopyPanel title="Stylist and support copy" description="Product help and the stylist enquiry dialog used across the storefront.">
      <PlatformCopyFields value={supportCopy} path={["supportCopy"]} onChange={(updated) => onSupportChange(updated as PlatformContent["supportCopy"])} />
    </CopyPanel>
    <CopyPanel title="Routine interface copy" description="Navigation and catalogue-search labels and empty states.">
      <PlatformCopyFields value={interfaceCopy} path={["interfaceCopy"]} onChange={(updated) => onInterfaceChange(updated as PlatformContent["interfaceCopy"])} />
    </CopyPanel>
  </div>;
}