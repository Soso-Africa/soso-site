export type FaqItem = {
  id: string;
  question: string;
  answer: string;
  category: string;
};

/**
 * Public FAQ content. Only safe, verified facts about the SOSO ordering
 * experience are included. Delivery timelines, refund rules, and legal
 * commitments are not stated until officially approved.
 */
export const faqItems: FaqItem[] = [
  {
    id: "how-made-to-order-works",
    category: "Ordering",
    question: "How does the SOSO made-to-order process work?",
    answer:
      "Select a piece from the collection, choose your size or opt for Custom sizing, then proceed to secure payment. After payment is confirmed, the SOSO atelier contacts you directly to discuss making details — finish direction, measurements where needed, and next steps. Your garment is then made specifically for you.",
  },
  {
    id: "what-happens-after-payment",
    category: "Ordering",
    question: "What happens after I pay?",
    answer:
      "Once your payment is confirmed, you will receive a payment confirmation. The SOSO atelier will then reach out to you to confirm the production details for your piece — including any measurements, finish preferences, or styling choices. Made-to-order garments are not produced until after payment is received.",
  },
  {
    id: "standard-sizes",
    category: "Sizing",
    question: "What standard sizes are available?",
    answer:
      "SOSO garments are available in S, M, L, XL, and XXL. Each product page includes a fit guide with measurements to help you choose the right size. If your measurements fall between sizes or outside the standard range, Custom sizing is available.",
  },
  {
    id: "custom-sizing",
    category: "Sizing",
    question: "What is Custom sizing?",
    answer:
      "Selecting Custom means your garment will be made to your personal measurements. After payment, the atelier will contact you to collect the measurements required for your specific piece. Custom does not necessarily change the price — check the individual product page for details.",
  },
  {
    id: "stylist-help",
    category: "Sizing",
    question: "How do I get sizing help before I order?",
    answer:
      "You can ask a SOSO stylist a question at any point before checkout — use the 'Ask a stylist' option on the product page, during checkout, or from the homepage. Your question goes directly to the SOSO team. There is no account required and no obligation to purchase.",
  },
  {
    id: "change-after-payment",
    category: "Ordering",
    question: "Can I change my order after payment?",
    answer:
      "If you need to change any details after payment, contact the SOSO atelier as soon as possible through the support enquiry form. Because garments are made to order and production begins quickly after payment, changes may not always be possible once making has started. The atelier will advise you on your specific situation.",
  },
  {
    id: "care-guide",
    category: "Care",
    question: "How should I care for my SOSO garment?",
    answer:
      "Most SOSO garments should be hand-washed or gently machine-washed in cool water, then line-dried away from direct sunlight. Iron on a cool or medium setting, and store folded rather than hung to preserve the shape. Embroidered or embellished pieces may require dry cleaning — the atelier will advise on your specific garment after your order is confirmed.",
  },
  {
    id: "what-is-bespoke",
    category: "About SOSO",
    question: "What makes SOSO a bespoke house?",
    answer:
      "Every SOSO piece is made specifically for the person who orders it. Nothing is taken from a production rack. The atelier confirms details, finish preferences, and where necessary measurements after each payment — so each garment reflects the person wearing it.",
  },
  {
    id: "delivery-questions",
    category: "Delivery",
    question: "Where does SOSO deliver?",
    answer:
      "Delivery details, regions, and timelines will be confirmed by the atelier after your payment is received. If you have a specific delivery question before ordering, use the 'Ask a stylist' option and the SOSO team will respond directly.",
  },
  {
    id: "payment-security",
    category: "Payment",
    question: "Is my payment secure?",
    answer:
      "SOSO uses a secure, hosted payment process. Your card details are never stored by SOSO — they are handled entirely by the payment provider. After a successful payment you will receive a confirmation, and the atelier will follow up with your order details.",
  },
];

export const faqCategories = [...new Set(faqItems.map((f) => f.category))];
