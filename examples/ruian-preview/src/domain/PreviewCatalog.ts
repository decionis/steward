export type MerchantId = "juniper" | "form-field";
export type ProductCategory = "food" | "drink" | "gift" | "experience";

export interface PreviewMerchant {
  id: MerchantId;
  name: string;
  tagline: string;
  location: string;
  hours: string;
  voice: string;
  color: string;
  accent: string;
  membership: string;
  community: string;
}

export interface PreviewProduct {
  id: string;
  merchantId: MerchantId;
  name: string;
  description: string;
  price: number;
  category: ProductCategory;
  minutes: number;
  tags: string[];
  artwork: "bowl" | "coffee" | "tea" | "notebook" | "plant" | "workshop";
}

export const MERCHANTS: PreviewMerchant[] = [
  {
    id: "juniper",
    name: "Juniper Café",
    tagline: "A little pause in your working day.",
    location: "Demo atrium, Level 1",
    hours: "Weekdays, 08:00-18:00 (sample)",
    voice:
      "Warm, calm and practical. Short sentences. No hype or health claims.",
    color: "#245746",
    accent: "#e2edcf",
    membership:
      "An optional monthly café note with seasonal menus. No points, discount or reward is promised.",
    community:
      "A sample monthly coffee-tasting gathering; dates and booking are not connected.",
  },
  {
    id: "form-field",
    name: "Form & Field",
    tagline: "Thoughtful things for everyday life.",
    location: "Demo atrium, Level 2",
    hours: "Weekdays, 10:00-19:00 (sample)",
    voice:
      "Considered, friendly and simple. Emphasize materials and everyday usefulness. No invented sustainability claims.",
    color: "#754938",
    accent: "#f4dcc7",
    membership:
      "An optional monthly note about desk objects and workshops. No points, discount or reward is promised.",
    community:
      "A sample desk-styling workshop; dates and booking are not connected.",
  },
];

export const PRODUCTS: PreviewProduct[] = [
  {
    id: "juniper-bowl",
    merchantId: "juniper",
    name: "The garden lunch bowl",
    description:
      "Roasted vegetables, grains and a lemon dressing. A simple vegetarian lunch.",
    price: 58,
    category: "food",
    minutes: 15,
    tags: ["vegetarian", "lunch", "quick"],
    artwork: "bowl",
  },
  {
    id: "juniper-coffee",
    merchantId: "juniper",
    name: "Oat flat white",
    description:
      "A short coffee break with an oat drink and a double espresso.",
    price: 28,
    category: "drink",
    minutes: 5,
    tags: ["coffee", "oat", "quick"],
    artwork: "coffee",
  },
  {
    id: "juniper-tea",
    merchantId: "juniper",
    name: "Jasmine tea pause",
    description:
      "A pot of jasmine tea for an unhurried moment between meetings.",
    price: 32,
    category: "drink",
    minutes: 10,
    tags: ["tea", "break"],
    artwork: "tea",
  },
  {
    id: "form-notebook",
    merchantId: "form-field",
    name: "The everyday notebook",
    description:
      "A cloth-bound notebook with dotted pages, ready for your next idea.",
    price: 79,
    category: "gift",
    minutes: 5,
    tags: ["stationery", "gift", "desk"],
    artwork: "notebook",
  },
  {
    id: "form-plant",
    merchantId: "form-field",
    name: "A greener desk",
    description:
      "A small potted plant in a ceramic planter. Care instructions included.",
    price: 99,
    category: "gift",
    minutes: 5,
    tags: ["plant", "gift", "desk"],
    artwork: "plant",
  },
  {
    id: "form-workshop",
    merchantId: "form-field",
    name: "Make room for ideas",
    description:
      "A 30-minute desk-styling workshop concept. Booking and dates are not connected.",
    price: 88,
    category: "experience",
    minutes: 30,
    tags: ["workshop", "community", "desk"],
    artwork: "workshop",
  },
];

export class PreviewCatalog {
  static merchant(id: MerchantId): PreviewMerchant {
    return MERCHANTS.find((merchant) => merchant.id === id)!;
  }

  static search(filter: {
    merchantId?: MerchantId;
    category?: ProductCategory;
    maxPrice?: number;
    maxMinutes?: number;
  }): PreviewProduct[] {
    return PRODUCTS.filter(
      (product) =>
        (!filter.merchantId || product.merchantId === filter.merchantId) &&
        (!filter.category || product.category === filter.category) &&
        (filter.maxPrice === undefined || product.price <= filter.maxPrice) &&
        (filter.maxMinutes === undefined ||
          product.minutes <= filter.maxMinutes),
    );
  }
}
