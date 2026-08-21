export type PolicySection = {
  heading: string;
  paragraphs?: string[];
  bullets?: string[];
};

export type PolicyDocument = {
  title: string;
  eyebrow: string;
  summary: string;
  sections: PolicySection[];
};

export const policies: Record<string, PolicyDocument> = {
  "/privacy": {
    title: "Privacy notice",
    eyebrow: "Privacy · working draft",
    summary: "A working draft of how SOSO Africa collects, uses and protects personal information.",
    sections: [
      {
        heading: "About this notice",
        paragraphs: [
          "This working draft explains how SOSO Africa (“SOSO”, “we”, “us” or “our”) may handle personal information when you browse our storefront, ask for stylist support, place a made-to-order request, or contact the atelier.",
          "It is prepared for SOSO’s legal and business review. It is not the final privacy notice and should not be treated as approved legal advice until SOSO confirms the missing details and publishes an approved version.",
        ],
      },
      {
        heading: "Information we may receive",
        bullets: [
          "Contact information and the details you choose to send when you ask for stylist support or order assistance, such as your name, email address, phone number, preferred size and message.",
          "Order and product information, including the pieces selected, size, delivery destination, measurements or fitting notes that you choose to provide, and messages needed to make or fulfil an order.",
          "Payment and delivery information needed to complete a transaction. Full payment-card credentials should be handled by the payment service shown at checkout rather than sent to SOSO by chat.",
          "Technical and browsing information that is necessary to keep the site secure and functional.",
          "Optional first-party measurement information only after you choose the measurement option in the privacy choices panel. SOSO’s current storefront is designed to keep optional measurement off by default.",
        ],
      },
      {
        heading: "How we may use information",
        bullets: [
          "To respond to questions, stylist requests and customer-support messages.",
          "To prepare, confirm, fulfil and support made-to-order purchases.",
          "To coordinate payment, delivery and fulfilment services when those services are enabled for an order.",
          "To protect the storefront, prevent misuse, keep records and comply with applicable legal obligations.",
          "To understand storefront performance using limited first-party measurement when you have given affirmative consent. You can withdraw that choice through Cookie choices.",
        ],
      },
      {
        heading: "Service providers",
        paragraphs: [
          "We may use carefully selected providers for hosting, payment, delivery, customer support and storefront operations. When the JusticeSure commerce service is enabled, it may process catalogue, delivery, order, payment and fulfilment information required for the requested transaction under its own applicable terms.",
          "SOSO should add the final provider names, processing locations, transfer safeguards and links to provider notices here before this document is approved.",
        ],
      },
      {
        heading: "Retention, rights and contact",
        paragraphs: [
          "We keep information only for as long as it is needed for the purpose collected, an ongoing customer relationship, legitimate records, dispute handling or an applicable legal obligation. SOSO should insert its approved retention schedule before publication.",
          "Depending on applicable law, you may have rights to request access, correction, deletion, restriction or a copy of your information, and to withdraw consent where processing relies on consent. Requests should be sent through SOSO’s approved privacy contact: [insert approved privacy contact email or address].",
          "If you are unhappy with how information is handled, the final notice should identify the relevant supervisory authority or complaint route for the customer’s location.",
        ],
      },
      {
        heading: "Updates and approval",
        paragraphs: [
          "SOSO may update this notice when its services, providers or legal obligations change. The published version should show an effective date and version number. Current status: working draft, not effective.",
        ],
      },
    ],
  },
  "/cookies": {
    title: "Cookie preferences",
    eyebrow: "Cookie choices · working draft",
    summary: "How SOSO uses necessary browser storage and optional first-party measurement.",
    sections: [
      {
        heading: "Necessary storage",
        paragraphs: [
          "SOSO uses necessary browser storage to keep the shopping bag, remember your privacy choice and support basic storefront behavior. Necessary storage remains active because the site cannot provide those functions without it.",
          "The current storefront uses local browser storage for the shopping bag, the privacy choice and an anonymous visitor identifier used to associate a consent record. These identifiers are not intended to identify you by name.",
        ],
      },
      {
        heading: "Optional measurement",
        paragraphs: [
          "Optional first-party measurement is off until you choose “Allow measurement”. When enabled, SOSO records limited events such as page views, product views, size-guide use, bag activity and checkout-start activity. The measurement is designed to be consent-aware and privacy-minimized.",
          "You can change your choice at any time through Cookie choices in the footer. Changing to Necessary only stops future optional measurement from the storefront; SOSO should define its approved retention and deletion schedule for previously recorded events before this draft is finalised.",
        ],
      },
      {
        heading: "What this draft does not approve",
        paragraphs: [
          "This draft does not approve advertising cookies, cross-site tracking, third-party analytics or marketing audiences. SOSO should add any such technologies here only after a separate business and legal review.",
        ],
      },
      {
        heading: "Contact and version",
        paragraphs: [
          "For privacy questions, use SOSO’s approved contact: [insert approved privacy contact email or address]. Current status: working draft, not effective.",
        ],
      },
    ],
  },
  "/terms": {
    title: "Terms of purchase",
    eyebrow: "Terms · working draft",
    summary: "A working draft for SOSO’s bespoke, made-to-order purchase journey.",
    sections: [
      {
        heading: "The SOSO model",
        paragraphs: [
          "SOSO creates and offers bespoke and made-to-order menswear, including kaftans, agbadas, dashikis, shirts, two-piece sets and accessories. A product page is an invitation to begin a purchase request; it is not a promise that every design, size or finish is permanently available.",
          "Colours, texture, trim and fit can vary slightly between a screen, a fabric and a finished garment. The size guide and any information supplied to the atelier should be reviewed carefully before payment.",
        ],
      },
      {
        heading: "How an order is expected to work",
        bullets: [
          "You select a piece and size, with optional stylist support if you would like help.",
          "You provide accurate contact, delivery and fitting information requested at checkout.",
          "You review the displayed total and delivery information and complete payment through the hosted payment experience when live checkout is enabled.",
          "Payment comes before atelier production confirmation. After payment, the atelier reviews the request and confirms the production details or contacts you if clarification is needed.",
          "If the atelier cannot accept a request, SOSO should apply the final approved cancellation and refund process rather than make an unsupported promise in this draft.",
        ],
      },
      {
        heading: "Prices and payment",
        paragraphs: [
          "Prices are shown in Nigerian Naira unless the storefront says otherwise. The final checkout total should identify the item total, any delivery charge and any other applicable charge before payment.",
          "A payment confirmation does not remove the atelier’s need to review a bespoke request. SOSO should publish the authorised payment provider, supported methods, currency treatment, failed-payment process and refund timing before relying on these terms.",
        ],
      },
      {
        heading: "Sizing, measurements and customer information",
        paragraphs: [
          "You are responsible for reviewing the size guide and providing accurate information. Stylist support is available as an optional service and is not required to pay. If a customer supplies measurements or fitting notes, SOSO should confirm how those measurements will be used and stored in the final privacy notice.",
        ],
      },
      {
        heading: "Changes and legal rights",
        paragraphs: [
          "The final terms should explain when a customer may amend or cancel a request, what happens when production has started, and the process for defects, incorrect items, delays and refunds. Nothing in these terms is intended to remove a right that cannot lawfully be excluded.",
          "Current status: working draft, not effective. SOSO should insert its registered business name, address, governing-law position, approved contact and effective date before publication.",
        ],
      },
    ],
  },
  "/delivery": {
    title: "Delivery information",
    eyebrow: "Delivery · working draft",
    summary: "A transparent working draft for delivery of SOSO made-to-order pieces.",
    sections: [
      {
        heading: "Made-to-order timing",
        paragraphs: [
          "SOSO pieces are made-to-order or bespoke. Production and delivery timing depends on the piece, size or measurements, atelier capacity, destination and the delivery service available for the order.",
          "SOSO does not publish a fixed delivery promise in this draft. The atelier should confirm the expected production and delivery details after payment and before relying on them.",
        ],
      },
      {
        heading: "Delivery quote and destination",
        paragraphs: [
          "The delivery destination supplied at checkout must be accurate and complete. The final order should show the available delivery option and quote, or clearly explain when SOSO must confirm those details separately.",
          "SOSO should add approved information about delivery areas, collection options, duties, taxes, address changes, failed delivery and the carrier used for each destination before publication.",
        ],
      },
      {
        heading: "Delays and support",
        paragraphs: [
          "If an order is delayed or the atelier needs clarification, SOSO should contact the customer through the approved contact details. Customers should keep their order reference when asking for an update.",
          "For delivery support, use SOSO’s approved order-support channel: [insert approved support email, phone or WhatsApp details]. Current status: working draft, not effective.",
        ],
      },
    ],
  },
  "/returns": {
    title: "Returns and cancellations",
    eyebrow: "Returns · working draft",
    summary: "A working draft for bespoke returns, alterations, cancellations and refunds.",
    sections: [
      {
        heading: "Bespoke and made-to-order pieces",
        paragraphs: [
          "Because a bespoke or made-to-order piece may be cut, prepared or finished for one customer, a change-of-mind return may be limited once atelier production has started, subject to applicable law and the final terms SOSO approves.",
          "SOSO should confirm which products are treated as bespoke, when production is considered to have started, and whether any product categories have different rules before this draft is published as a binding policy.",
        ],
      },
      {
        heading: "Problems with an order",
        paragraphs: [
          "If a piece arrives damaged, materially different from the confirmed order or affected by a manufacturing issue, contact SOSO as soon as reasonably possible with the order reference, a description of the issue and clear photographs where helpful. Do not alter or wash the piece before SOSO has advised what to do.",
          "SOSO should define its inspection, repair, alteration, replacement and refund options in the final approved policy. Any remedy will remain subject to applicable consumer law.",
        ],
      },
      {
        heading: "Cancellations and refunds",
        paragraphs: [
          "A cancellation request should be sent through SOSO’s approved support channel as soon as possible. Whether a cancellation can be accepted may depend on whether the atelier has started work and on the final approved terms.",
          "Where a refund is approved, SOSO should state the refund method, currency, timing, treatment of delivery charges and any permitted deductions. Until those details are approved, this page deliberately makes no fixed refund promise.",
        ],
      },
      {
        heading: "Contact and approval",
        paragraphs: [
          "Submit a return, alteration or cancellation request through: [insert approved support email, phone or WhatsApp details]. Current status: working draft, not effective.",
        ],
      },
    ],
  },
  "/care": {
    title: "Garment care",
    eyebrow: "Care guidance · working draft",
    summary: "General care guidance for SOSO garments while product-specific instructions are confirmed.",
    sections: [
      {
        heading: "Before cleaning",
        paragraphs: [
          "Check the care label and any garment-specific instructions supplied with your piece. If the fabric, embellishment, lining or finish is unfamiliar, ask SOSO before cleaning it.",
        ],
      },
      {
        heading: "Handling and storage",
        bullets: [
          "Allow a garment to air after wear and store it clean, dry and away from direct sunlight.",
          "Use a suitable hanger for structured pieces and avoid hanging heavy embellishment from a weak point.",
          "Keep dark and light pieces separate when damp, and protect garments from moisture, heat and fragrance overspray.",
          "Do not cut, alter or repair a bespoke piece without checking whether the change may affect a support or returns request.",
        ],
      },
      {
        heading: "Cleaning and pressing",
        paragraphs: [
          "Use the care label as the controlling instruction. Do not assume that a richly coloured, embroidered, embellished or structured piece can be machine washed. Use a qualified cleaner when the label or atelier recommends it, and test any pressing method on an inconspicuous area only if the care instructions permit.",
          "SOSO should add fabric-specific instructions for each product family and confirm whether cleaning support is available before treating this page as final.",
        ],
      },
      {
        heading: "Questions",
        paragraphs: [
          "For care questions, use SOSO’s approved support channel: [insert approved support email, phone or WhatsApp details]. Current status: working draft, not effective.",
        ],
      },
    ],
  },
};