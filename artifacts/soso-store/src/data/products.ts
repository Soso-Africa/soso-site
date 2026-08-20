export type CatalogProduct = {
  slug: string;
  name: string;
  img: string;
  price: number;
  tag: string;
  note: string;
  category: string;
  description: string;
  sizes: string[];
};

/**
 * Curated storefront preview data. This is deliberately isolated from the
 * JusticeSure adapter: live price, stock, variants and product facts must
 * replace it only after the headless API contract is supplied.
 */
export const products: CatalogProduct[] = [
  { slug: "vault", name: "Vault", img: "/images/soso/vault-black.jpg", price: 250000, tag: "Signature", note: "A considered black kaftan", category: "Kaftans", description: "A signature SOSO kaftan with a clean, contemporary silhouette. Select a size for a ready-to-wear fit or choose Custom to begin a made-to-measure conversation.", sizes: ["S","M","L","XL","XXL","Custom"] },
  { slug: "ivory-kaftan", name: "Ivory Ascension Kaftan", img: "/images/soso/kaftan-white.jpg", price: 240000, tag: "Collection", note: "Ivory for ceremonial occasions", category: "Kaftans", description: "An ivory kaftan designed for formal celebrations and important occasions. Speak with a SOSO stylist if you would like help choosing your fit.", sizes: ["S","M","L","XL","XXL","Custom"] },
  { slug: "sovereign-agbada", name: "The Sovereign Agbada", img: "/images/soso/agbada.jpg", price: 480000, tag: "Occasion", note: "A three-piece agbada statement", category: "Agbadas", description: "A three-piece agbada for grand occasions. Product details, availability and order timing are confirmed before an order is accepted.", sizes: ["S","M","L","XL","XXL","Custom"] },
  { slug: "heritage-dashiki", name: "Heritage Dashiki", img: "/images/soso/dashiki.jpg", price: 165000, tag: "Collection", note: "Contemporary cut, heritage lines", category: "Dashikis", description: "A contemporary dashiki that brings a refined silhouette to everyday and celebratory dressing.", sizes: ["S","M","L","XL","XXL","Custom"] },
  { slug: "boardroom-shirt", name: "The Boardroom Shirt", img: "/images/soso/shirts.jpg", price: 150000, tag: "Collection", note: "A sharp shirt for business days", category: "Shirts", description: "A refined shirt designed for business and formal settings. A SOSO stylist can help with sizing before you place an order.", sizes: ["S","M","L","XL","XXL","Custom"] },
  { slug: "twin-set", name: "Twin Set — Two Piece", img: "/images/soso/twopiece.jpg", price: 220000, tag: "Collection", note: "Coordinated, relaxed tailoring", category: "Two-Piece", description: "A coordinated two-piece set with an easy, polished presence. Select your usual size or choose Custom for made-to-measure support.", sizes: ["S","M","L","XL","XXL","Custom"] },
];