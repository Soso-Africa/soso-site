import { useMemo } from "react";
import { ArrowUp, ArrowDown, Plus, Trash2, AlertCircle } from "lucide-react";
import type { CatalogProduct, PlatformContent } from "../../data/platformContent";

type SiteData = PlatformContent["site"];
type MegaMenuGroup = SiteData["megaMenu"][number];
type ProductOption = Pick<CatalogProduct, "slug" | "name" | "department">;

export function PlatformEditorSite({
  data,
  onChange,
  allowedTargets,
  products,
}: {
  data: SiteData;
  onChange: (data: SiteData) => void;
  allowedTargets: string[];
  products: ProductOption[];
}) {
  const suggestions = data.header?.searchSuggestions || [];
  const megaMenu = data.megaMenu || [];
  const announcementItems = data.announcementItems;

  const updateAnnouncementItem = (index: number, value: string) => {
    const items = [...announcementItems];
    items[index] = value;
    onChange({ ...data, announcementItems: items });
  };

  const addAnnouncementItem = () => {
    if (announcementItems.length >= 8) return;
    onChange({ ...data, announcementItems: [...announcementItems, ""] });
  };

  const removeAnnouncementItem = (index: number) => {
    if (announcementItems.length <= 1) return;
    const items = [...announcementItems];
    items.splice(index, 1);
    onChange({ ...data, announcementItems: items });
  };

  const updateSocialLink = (field: keyof SiteData["socialLinks"], value: string) => {
    onChange({
      ...data,
      socialLinks: {
        ...data.socialLinks,
        [field]: value
      }
    });
  };

  const updateSuggestions = (newSuggestions: { label: string; href: string }[]) => {
    onChange({
      ...data,
      header: {
        ...data.header,
        searchSuggestions: newSuggestions,
      },
    });
  };

  const moveItem = (index: number, direction: "up" | "down") => {
    if (direction === "up" && index === 0) return;
    if (direction === "down" && index === suggestions.length - 1) return;
    const newIndex = direction === "up" ? index - 1 : index + 1;
    const items = [...suggestions];
    const temp = items[index];
    items[index] = items[newIndex];
    items[newIndex] = temp;
    updateSuggestions(items);
  };

  const updateItem = (index: number, field: "label" | "href", value: string) => {
    const items = [...suggestions];
    items[index] = { ...items[index], [field]: value };
    updateSuggestions(items);
  };

  const removeItem = (index: number) => {
    const items = [...suggestions];
    items.splice(index, 1);
    updateSuggestions(items);
  };

  const addItem = () => {
    updateSuggestions([...suggestions, { label: "", href: "" }]);
  };

  const updateMegaMenu = (groups: MegaMenuGroup[]) => {
    onChange({ ...data, megaMenu: groups });
  };

  const updateGroup = (groupIndex: number, updates: Partial<MegaMenuGroup>) => {
    const groups = [...megaMenu];
    groups[groupIndex] = { ...groups[groupIndex], ...updates };
    updateMegaMenu(groups);
  };

  const addGroup = () => {
    let suffix = megaMenu.length + 1;
    while (megaMenu.some((group) => group.id === `menu-${suffix}`)) suffix += 1;
    updateMegaMenu([
      ...megaMenu,
      {
        id: `menu-${suffix}`,
        label: "",
        href: "",
        visible: true,
        columns: [],
        featuredProductSlugs: [],
      },
    ]);
  };

  const moveGroup = (groupIndex: number, direction: "up" | "down") => {
    const nextIndex = direction === "up" ? groupIndex - 1 : groupIndex + 1;
    if (nextIndex < 0 || nextIndex >= megaMenu.length) return;
    const groups = [...megaMenu];
    [groups[groupIndex], groups[nextIndex]] = [groups[nextIndex], groups[groupIndex]];
    updateMegaMenu(groups);
  };

  const removeGroup = (groupIndex: number) => {
    updateMegaMenu(megaMenu.filter((_, index) => index !== groupIndex));
  };

  const addColumn = (groupIndex: number) => {
    updateGroup(groupIndex, {
      columns: [...megaMenu[groupIndex].columns, { heading: "", links: [] }],
    });
  };

  const updateColumnHeading = (groupIndex: number, columnIndex: number, heading: string) => {
    const columns = [...megaMenu[groupIndex].columns];
    columns[columnIndex] = { ...columns[columnIndex], heading };
    updateGroup(groupIndex, { columns });
  };

  const removeColumn = (groupIndex: number, columnIndex: number) => {
    updateGroup(groupIndex, {
      columns: megaMenu[groupIndex].columns.filter((_, index) => index !== columnIndex),
    });
  };

  const addLink = (groupIndex: number, columnIndex: number) => {
    const columns = [...megaMenu[groupIndex].columns];
    columns[columnIndex] = {
      ...columns[columnIndex],
      links: [...columns[columnIndex].links, { label: "", href: "" }],
    };
    updateGroup(groupIndex, { columns });
  };

  const updateLink = (
    groupIndex: number,
    columnIndex: number,
    linkIndex: number,
    updates: Partial<MegaMenuGroup["columns"][number]["links"][number]>,
  ) => {
    const columns = [...megaMenu[groupIndex].columns];
    const links = [...columns[columnIndex].links];
    links[linkIndex] = { ...links[linkIndex], ...updates };
    columns[columnIndex] = { ...columns[columnIndex], links };
    updateGroup(groupIndex, { columns });
  };

  const removeLink = (groupIndex: number, columnIndex: number, linkIndex: number) => {
    const columns = [...megaMenu[groupIndex].columns];
    columns[columnIndex] = {
      ...columns[columnIndex],
      links: columns[columnIndex].links.filter((_, index) => index !== linkIndex),
    };
    updateGroup(groupIndex, { columns });
  };

  const toggleFeaturedProduct = (groupIndex: number, slug: string) => {
    const selected = megaMenu[groupIndex].featuredProductSlugs;
    updateGroup(groupIndex, {
      featuredProductSlugs: selected.includes(slug)
        ? selected.filter((productSlug) => productSlug !== slug)
        : selected.length < 2
          ? [...selected, slug]
          : selected,
    });
  };

  const validateHrefs = useMemo(() => {
    const issues = new Set<string>();
    const seen = new Set<string>();
    suggestions.forEach((s) => {
      if (!s.label.trim()) issues.add("Every suggestion needs a shopper-facing label");
      if (!s.href) issues.add("Some suggestions are missing a URL path");
      else if (!allowedTargets.includes(s.href) && !s.href.startsWith("/shop?")) {
        issues.add(`Unknown or unsafe storefront target: ${s.href}`);
      }
      if (seen.has(s.href)) issues.add(`Duplicate URL path detected: ${s.href}`);
      seen.add(s.href);
    });
    return Array.from(issues);
  }, [allowedTargets, suggestions]);

  const validateMegaMenu = useMemo(() => {
    const issues = new Set<string>();
    const ids = new Set<string>();
    const targets = new Set<string>();
    const productBySlug = new Map(products.map((product) => [product.slug, product]));
    const validateTarget = (href: string, location: string) => {
      if (!href) {
        issues.add(`${location} is missing a URL path`);
      } else if (!allowedTargets.includes(href) && !href.startsWith("/shop?")) {
        issues.add(`Unknown or unsafe storefront target: ${href}`);
      }
      if (href && targets.has(href)) issues.add(`Duplicate mega-menu target detected: ${href}`);
      if (href) targets.add(href);
    };

    megaMenu.forEach((group) => {
      const groupName = group.label.trim() || group.id || "Unnamed group";
      if (!group.id.trim()) issues.add("Every mega-menu group needs an ID");
      else if (ids.has(group.id)) issues.add(`Duplicate mega-menu ID detected: ${group.id}`);
      ids.add(group.id);
      if (!group.label.trim()) issues.add(`Mega-menu group ${group.id || "without an ID"} needs a label`);
      validateTarget(group.href, `Mega-menu group ${groupName}`);

      group.columns.forEach((column, columnIndex) => {
        if (!column.heading.trim()) issues.add(`${groupName}, column ${columnIndex + 1} needs a heading`);
        column.links.forEach((link, linkIndex) => {
          if (!link.label.trim()) {
            issues.add(`${groupName}, column ${columnIndex + 1}, link ${linkIndex + 1} needs a label`);
          }
          validateTarget(link.href, `${groupName}, link ${link.label.trim() || linkIndex + 1}`);
        });
      });

      if (group.featuredProductSlugs.length > 2) {
        issues.add(`${groupName} can feature no more than two products`);
      }
      if (new Set(group.featuredProductSlugs).size !== group.featuredProductSlugs.length) {
        issues.add(`${groupName} has duplicate featured products`);
      }
      group.featuredProductSlugs.forEach((slug) => {
        const product = productBySlug.get(slug);
        if (!product) issues.add(`${groupName} features an unknown product: ${slug}`);
        else if (!group.department || product.department !== group.department) {
          issues.add(`${groupName} features a product outside its department: ${slug}`);
        }
      });
      if (group.visible && group.department && (group.featuredProductSlugs.length < 1 || group.featuredProductSlugs.length > 2)) {
        issues.add(`${groupName} must feature one or two products while visible`);
      }
    });
    return Array.from(issues);
  }, [allowedTargets, megaMenu, products]);

  return (
    <div className="mt-5 space-y-5">
      <section className="border border-border bg-card p-5" aria-labelledby="site-info-editor-heading">
        <h3 id="site-info-editor-heading" className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">Global Site Info</h3>
        <div className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">HQ Address</span>
            <textarea
              value={data.hqAddress}
              onChange={(e) => onChange({ ...data, hqAddress: e.target.value })}
              className="staff-input text-xs"
              placeholder="Enter the site address"
              rows={3}
              required
              maxLength={300}
              data-testid="input-site-hq-address"
            />
          </label>
        </div>
      </section>

      <section className="border border-border bg-card p-5" aria-labelledby="announcements-editor-heading">
        <div className="mb-4 flex items-center justify-between">
          <h3 id="announcements-editor-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">Announcement Strip (Max 8)</h3>
        </div>
        <div className="space-y-3">
          {announcementItems.map((item, index) => (
            <div key={index} className="flex gap-2 items-center">
              <input
                type="text"
                value={item}
                onChange={(e) => updateAnnouncementItem(index, e.target.value)}
                className="staff-input text-xs flex-1"
                 placeholder="Enter announcement text"
                 required
                 maxLength={180}
                data-testid={`input-announcement-item-${index}`}
              />
              <button
                type="button"
                onClick={() => removeAnnouncementItem(index)}
                disabled={announcementItems.length <= 1}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10 disabled:opacity-30 disabled:hover:bg-transparent"
                aria-label={`Remove announcement ${index + 1}`}
                data-testid={`button-remove-announcement-${index}`}
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
          {announcementItems.length < 8 && (
            <button
              type="button"
              onClick={addAnnouncementItem}
              className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
              data-testid="button-add-announcement"
            >
              <Plus size={15} /> Add Announcement
            </button>
          )}
        </div>
      </section>

      <section className="border border-border bg-card p-5" aria-labelledby="social-links-editor-heading">
        <h3 id="social-links-editor-heading" className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">Social Links</h3>
        <p className="mb-4 text-xs text-muted-foreground">Use complete HTTPS links. Leave a field blank to hide that network from the storefront.</p>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Facebook URL</span>
            <input
              type="url"
              value={data.socialLinks.facebookUrl}
              onChange={(e) => updateSocialLink("facebookUrl", e.target.value)}
              className="staff-input text-xs"
              placeholder="https://facebook.com/..."
              pattern="https://.*"
              data-testid="input-social-facebook"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Twitter (X) URL</span>
            <input
              type="url"
              value={data.socialLinks.twitterUrl}
              onChange={(e) => updateSocialLink("twitterUrl", e.target.value)}
              className="staff-input text-xs"
              placeholder="https://twitter.com/..."
              pattern="https://.*"
              data-testid="input-social-twitter"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">YouTube URL</span>
            <input
              type="url"
              value={data.socialLinks.youtubeUrl}
              onChange={(e) => updateSocialLink("youtubeUrl", e.target.value)}
              className="staff-input text-xs"
              placeholder="https://youtube.com/..."
              pattern="https://.*"
              data-testid="input-social-youtube"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">TikTok URL</span>
            <input
              type="url"
              value={data.socialLinks.tiktokUrl}
              onChange={(e) => updateSocialLink("tiktokUrl", e.target.value)}
              className="staff-input text-xs"
              placeholder="https://tiktok.com/..."
              pattern="https://.*"
              data-testid="input-social-tiktok"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">LinkedIn URL</span>
            <input
              type="url"
              value={data.socialLinks.linkedinUrl}
              onChange={(e) => updateSocialLink("linkedinUrl", e.target.value)}
              className="staff-input text-xs"
              placeholder="https://linkedin.com/in/..."
              pattern="https://.*"
              data-testid="input-social-linkedin"
            />
          </label>
        </div>
      </section>

      <section className="border border-border bg-card p-5" aria-labelledby="mega-menu-editor-heading">
        <div className="mb-4 flex items-center justify-between gap-4">
          <h3 id="mega-menu-editor-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">Mega Menu</h3>
          {validateMegaMenu.length > 0 && (
            <div className="flex items-center gap-2 text-destructive">
              <AlertCircle size={14} aria-hidden="true" />
              <span className="text-[10px] font-semibold uppercase tracking-wider" data-testid="text-mega-menu-issue-count">
                {validateMegaMenu.length} Issue{validateMegaMenu.length > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>

        {validateMegaMenu.length > 0 && (
          <div className="mb-4 space-y-1 border border-destructive/30 bg-destructive/10 p-3 text-xs text-destructive" data-testid="mega-menu-validation-errors">
            {validateMegaMenu.map((issue) => <div key={issue}>{issue}</div>)}
          </div>
        )}

        <div className="space-y-5">
          {megaMenu.map((group, groupIndex) => {
            const departmentProducts = group.department
              ? products.filter((product) => product.department === group.department)
              : [];
            return (
              <div key={`${group.id}-${groupIndex}`} className="border border-border bg-background p-4" data-testid={`site-mega-menu-group-${groupIndex}`}>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-[10rem_1fr_1fr_11rem_auto]">
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Group ID</span>
                    <input
                      type="text"
                      value={group.id}
                      onChange={(event) => updateGroup(groupIndex, { id: event.target.value })}
                      className="staff-input text-xs font-mono"
                      data-testid={`input-mega-menu-id-${groupIndex}`}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Group Label</span>
                    <input
                      type="text"
                      value={group.label}
                      onChange={(event) => updateGroup(groupIndex, { label: event.target.value })}
                      className="staff-input text-xs"
                      data-testid={`input-mega-menu-label-${groupIndex}`}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL Path</span>
                    <input
                      type="text"
                      value={group.href}
                      onChange={(event) => updateGroup(groupIndex, { href: event.target.value })}
                      className="staff-input text-xs font-mono"
                      placeholder="/shop?department=men"
                      data-testid={`input-mega-menu-href-${groupIndex}`}
                    />
                  </label>
                  <label>
                    <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Department</span>
                    <select
                      value={group.department || ""}
                      onChange={(event) => updateGroup(groupIndex, {
                        department: (event.target.value || undefined) as MegaMenuGroup["department"],
                      })}
                      className="staff-input text-xs"
                      data-testid={`select-mega-menu-department-${groupIndex}`}
                    >
                      <option value="">None</option>
                      <option value="men">Men</option>
                      <option value="women">Women</option>
                      <option value="accessories">Accessories</option>
                    </select>
                  </label>
                  <div className="flex items-end gap-2">
                    <button type="button" onClick={() => moveGroup(groupIndex, "up")} disabled={groupIndex === 0} className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30" aria-label={`Move ${group.label || "group"} up`} data-testid={`button-mega-menu-up-${groupIndex}`}><ArrowUp size={16} /></button>
                    <button type="button" onClick={() => moveGroup(groupIndex, "down")} disabled={groupIndex === megaMenu.length - 1} className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30" aria-label={`Move ${group.label || "group"} down`} data-testid={`button-mega-menu-down-${groupIndex}`}><ArrowDown size={16} /></button>
                    <button type="button" onClick={() => removeGroup(groupIndex)} className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10" aria-label={`Remove ${group.label || "group"}`} data-testid={`button-mega-menu-remove-${groupIndex}`}><Trash2 size={16} /></button>
                  </div>
                </div>

                <label className="mt-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-wider">
                  <input type="checkbox" checked={group.visible} onChange={(event) => updateGroup(groupIndex, { visible: event.target.checked })} data-testid={`checkbox-mega-menu-visible-${groupIndex}`} />
                  Visible on storefront
                </label>

                <div className="mt-5 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Menu Columns</h4>
                    <button type="button" onClick={() => addColumn(groupIndex)} className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider hover:border-primary hover:text-primary" data-testid={`button-mega-menu-column-add-${groupIndex}`}><Plus size={14} /> Add Column</button>
                  </div>
                  {group.columns.map((column, columnIndex) => (
                    <div key={columnIndex} className="border border-border p-3" data-testid={`site-mega-menu-column-${groupIndex}-${columnIndex}`}>
                      <div className="flex items-end gap-2">
                        <label className="flex-1">
                          <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Column Heading</span>
                          <input type="text" value={column.heading} onChange={(event) => updateColumnHeading(groupIndex, columnIndex, event.target.value)} className="staff-input text-xs" data-testid={`input-mega-menu-column-heading-${groupIndex}-${columnIndex}`} />
                        </label>
                        <button type="button" onClick={() => removeColumn(groupIndex, columnIndex)} className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10" aria-label={`Remove column ${columnIndex + 1}`} data-testid={`button-mega-menu-column-remove-${groupIndex}-${columnIndex}`}><Trash2 size={15} /></button>
                      </div>
                      <div className="mt-3 space-y-2">
                        {column.links.map((link, linkIndex) => (
                          <div key={linkIndex} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto_auto]" data-testid={`site-mega-menu-link-${groupIndex}-${columnIndex}-${linkIndex}`}>
                            <label>
                              <span className="sr-only">Link label</span>
                              <input type="text" value={link.label} onChange={(event) => updateLink(groupIndex, columnIndex, linkIndex, { label: event.target.value })} className="staff-input text-xs" placeholder="Link label" data-testid={`input-mega-menu-link-label-${groupIndex}-${columnIndex}-${linkIndex}`} />
                            </label>
                            <label>
                              <span className="sr-only">Link URL path</span>
                              <input type="text" value={link.href} onChange={(event) => updateLink(groupIndex, columnIndex, linkIndex, { href: event.target.value })} className="staff-input text-xs font-mono" placeholder="/shop?..." data-testid={`input-mega-menu-link-href-${groupIndex}-${columnIndex}-${linkIndex}`} />
                            </label>
                            <label className="flex min-h-10 items-center gap-2 text-[10px] font-semibold uppercase tracking-wider">
                              <input type="checkbox" checked={Boolean(link.external)} onChange={(event) => updateLink(groupIndex, columnIndex, linkIndex, { external: event.target.checked || undefined })} data-testid={`checkbox-mega-menu-link-external-${groupIndex}-${columnIndex}-${linkIndex}`} />
                              External
                            </label>
                            <button type="button" onClick={() => removeLink(groupIndex, columnIndex, linkIndex)} className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10" aria-label={`Remove link ${link.label || linkIndex + 1}`} data-testid={`button-mega-menu-link-remove-${groupIndex}-${columnIndex}-${linkIndex}`}><Trash2 size={15} /></button>
                          </div>
                        ))}
                        <button type="button" onClick={() => addLink(groupIndex, columnIndex)} className="inline-flex min-h-9 items-center gap-2 border border-border px-3 text-[10px] font-semibold uppercase tracking-wider hover:border-primary hover:text-primary" data-testid={`button-mega-menu-link-add-${groupIndex}-${columnIndex}`}><Plus size={14} /> Add Link</button>
                      </div>
                    </div>
                  ))}
                </div>

                <fieldset className="mt-5">
                  <legend className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Featured Products (up to two)</legend>
                  {group.featuredProductSlugs
                    .filter((slug) => !departmentProducts.some((product) => product.slug === slug))
                    .map((slug) => (
                      <div key={slug} className="mt-2 flex items-center justify-between border border-destructive/30 bg-destructive/10 p-2 text-xs text-destructive" data-testid={`row-mega-menu-invalid-featured-${groupIndex}-${slug}`}>
                        <span className="font-mono">{slug}</span>
                        <button type="button" onClick={() => toggleFeaturedProduct(groupIndex, slug)} className="border border-destructive/30 px-3 py-1 font-semibold uppercase tracking-wider hover:bg-destructive/10" data-testid={`button-mega-menu-invalid-featured-remove-${groupIndex}-${slug}`}>Remove</button>
                      </div>
                    ))}
                  {!group.department ? (
                    <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-mega-menu-products-help-${groupIndex}`}>Choose a department to select featured products.</p>
                  ) : departmentProducts.length === 0 ? (
                    <p className="mt-2 text-xs text-muted-foreground" data-testid={`text-mega-menu-products-empty-${groupIndex}`}>No products are available for this department.</p>
                  ) : (
                    <div className="mt-2 grid gap-2 sm:grid-cols-2">
                      {departmentProducts.map((product) => {
                        const selected = group.featuredProductSlugs.includes(product.slug);
                        return (
                          <label key={product.slug} className="flex items-center gap-2 border border-border p-3 text-xs">
                            <input
                              type="checkbox"
                              checked={selected}
                              disabled={!selected && group.featuredProductSlugs.length >= 2}
                              onChange={() => toggleFeaturedProduct(groupIndex, product.slug)}
                              data-testid={`checkbox-mega-menu-featured-${groupIndex}-${product.slug}`}
                            />
                            <span>{product.name}</span>
                            <span className="ml-auto font-mono text-[10px] text-muted-foreground">{product.slug}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </fieldset>
              </div>
            );
          })}
          <button type="button" onClick={addGroup} className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary" data-testid="button-mega-menu-add"><Plus size={15} /> Add Menu Group</button>
        </div>
      </section>

      <section className="border border-border bg-card p-5" aria-labelledby="search-suggestions-editor-heading">
      <div className="mb-4 flex items-center justify-between">
        <h3 id="search-suggestions-editor-heading" className="text-xs font-semibold uppercase tracking-wider text-primary">Header Search Suggestions</h3>
        {validateHrefs.length > 0 && (
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle size={14} />
            <span className="text-[10px] font-semibold uppercase tracking-wider">{validateHrefs.length} Issue{validateHrefs.length > 1 ? "s" : ""}</span>
          </div>
        )}
      </div>
      
      {validateHrefs.length > 0 && (
        <div className="bg-destructive/10 border border-destructive/30 p-3 text-destructive text-xs space-y-1 mb-4" data-testid="site-validation-errors">
          {validateHrefs.map((val, i) => <div key={i}>{val}</div>)}
        </div>
      )}

      <div className="space-y-4">
        {suggestions.map((suggestion, index) => (
          <div key={index} className="flex flex-col gap-3 border border-border p-4 bg-background sm:flex-row sm:items-start" data-testid={`site-search-suggestion-${index}`}>
            <div className="flex flex-1 gap-4">
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">Label</span>
                <input
                  type="text"
                  value={suggestion.label}
                  onChange={(e) => updateItem(index, "label", e.target.value)}
                  className="staff-input text-xs"
                  placeholder="e.g. New Arrivals"
                  data-testid={`input-suggestion-label-${index}`}
                />
              </label>
              <label className="flex-1">
                <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">URL Path</span>
                <input
                  type="text"
                  value={suggestion.href}
                  onChange={(e) => updateItem(index, "href", e.target.value)}
                  className="staff-input text-xs font-mono"
                  placeholder="e.g. /collections/new"
                  data-testid={`input-suggestion-href-${index}`}
                />
              </label>
            </div>
            <div className="flex gap-2 pt-5">
              <button
                type="button"
                onClick={() => moveItem(index, "up")}
                disabled={index === 0}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                data-testid={`button-suggestion-up-${index}`}
                title="Move Up"
              >
                <ArrowUp size={16} />
              </button>
              <button
                type="button"
                onClick={() => moveItem(index, "down")}
                disabled={index === suggestions.length - 1}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-border text-muted-foreground hover:border-primary hover:text-primary disabled:opacity-30 disabled:hover:border-border disabled:hover:text-muted-foreground"
                data-testid={`button-suggestion-down-${index}`}
                title="Move Down"
              >
                <ArrowDown size={16} />
              </button>
              <button
                type="button"
                onClick={() => removeItem(index)}
                className="flex h-[2.75rem] w-[2.75rem] items-center justify-center border border-destructive/30 text-destructive hover:bg-destructive/10"
                data-testid={`button-suggestion-remove-${index}`}
                title="Remove"
              >
                <Trash2 size={16} />
              </button>
            </div>
          </div>
        ))}
        <button
          type="button"
          onClick={addItem}
          className="inline-flex min-h-10 items-center gap-2 border border-border px-4 text-xs font-semibold uppercase tracking-wider hover:border-primary hover:text-primary"
          data-testid="button-suggestion-add"
        >
          <Plus size={15} /> Add Suggestion
        </button>
      </div>
      </section>
    </div>
  );
}
