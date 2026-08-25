import { useState } from "react";
import type { PlatformContent, CatalogProduct } from "../../data/platformContent";
import { ProductEditor } from "./product/ProductEditor";

type CatalogueData = Pick<PlatformContent, "products" | "collections" | "sizeGuide" | "productCopy" | "supportCopy">;

export function PlatformEditorCatalogue({
  data,
  onChange,
}: {
  data: CatalogueData;
  onChange: (data: CatalogueData) => void;
}) {
  const [expandedProductIndex, setExpandedProductIndex] = useState<number | null>(null);

  const updateProduct = (index: number, product: CatalogProduct) => {
    const products = [...data.products];
    products[index] = product;
    onChange({ ...data, products });
  };

  return (
    <div className="mt-5 border border-border bg-card p-5">
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
          />
        ))}
      </div>
    </div>
  );
}
