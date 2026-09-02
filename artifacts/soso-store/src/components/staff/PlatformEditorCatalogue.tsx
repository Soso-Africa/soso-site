import { useState } from "react";
import type { PlatformContent, CatalogProduct } from "../../data/platformContent";
import { ProductEditor } from "./product/ProductEditor";
import { PlatformEditorSupportInterface } from "./PlatformEditorRoutineCopy";
import { CopyPanel, PlatformCopyFields } from "./PlatformCopyFields";

type CatalogueData = Pick<PlatformContent, "products" | "collections" | "sizeGuide" | "productCopy" | "supportCopy" | "interfaceCopy">;

export function PlatformEditorCatalogue({
  data,
  onChange,
  onUploadMedia,
}: {
  data: CatalogueData;
  onChange: (data: CatalogueData) => void;
  onUploadMedia: (file: File) => Promise<string>;
}) {
  const [expandedProductIndex, setExpandedProductIndex] = useState<number | null>(null);

  const updateProduct = (index: number, product: CatalogProduct) => {
    const products = [...data.products];
    products[index] = product;
    onChange({ ...data, products });
  };

  return (
    <div className="mt-5 space-y-5">
      <section className="border border-border bg-card p-5">
        <h3 className="mb-4 text-xs font-semibold uppercase tracking-wider text-primary">Catalogue Products</h3>
        <div className="space-y-4">
        {data.products?.map((product, index) => (
          <ProductEditor
            key={product.slug || index}
            product={product}
            allProducts={data.products}
            collections={data.collections}
            isExpanded={expandedProductIndex === index}
            onToggle={() => setExpandedProductIndex(expandedProductIndex === index ? null : index)}
            onChange={(updatedProduct) => updateProduct(index, updatedProduct)}
            onUploadMedia={onUploadMedia}
          />
        ))}
        </div>
      </section>
      <CopyPanel title="Collections" description="Collection names, departments, storefront introductions and search metadata.">
        <PlatformCopyFields
          value={data.collections}
          path={["collections"]}
          onChange={(collections) => onChange({ ...data, collections: collections as PlatformContent["collections"] })}
        />
      </CopyPanel>
      <CopyPanel title="Size guide" description="Shared size-guide headings, measurements and custom-sizing guidance.">
        <PlatformCopyFields
          value={data.sizeGuide}
          path={["sizeGuide"]}
          onChange={(sizeGuide) => onChange({ ...data, sizeGuide: sizeGuide as PlatformContent["sizeGuide"] })}
        />
      </CopyPanel>
      <CopyPanel title="Product page copy" description="Shared product labels, fit guidance, assurances and product-page interface text.">
        <PlatformCopyFields
          value={data.productCopy}
          path={["productCopy"]}
          onChange={(productCopy) => onChange({ ...data, productCopy: productCopy as PlatformContent["productCopy"] })}
        />
      </CopyPanel>
      <PlatformEditorSupportInterface
        supportCopy={data.supportCopy}
        interfaceCopy={data.interfaceCopy}
        onSupportChange={(supportCopy) => onChange({ ...data, supportCopy })}
        onInterfaceChange={(interfaceCopy) => onChange({ ...data, interfaceCopy })}
      />
    </div>
  );
}
