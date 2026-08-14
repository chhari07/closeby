// Central copy map. English is primary; Hindi rides alongside key actions
// per the design spec so a full toggle can land later without a rewrite.
export const strings = {
  addToCart: { en: "Add to Cart", hi: "कार्ट में डालें" },
  placeOrder: { en: "Place Order", hi: "ऑर्डर करें" },
  viewCart: { en: "View Cart", hi: "कार्ट देखें" },
  checkout: { en: "Checkout", hi: "चेकआउट" },
  outOfStock: { en: "Out of stock", hi: "स्टॉक में नहीं" },
  open: { en: "Open", hi: "खुला है" },
  closed: { en: "Closed", hi: "बंद है" },
  nearMe: { en: "Near", hi: "पास" },
  change: { en: "change", hi: "बदलें" },
  accept: { en: "Accept", hi: "स्वीकार करें" },
  reject: { en: "Reject", hi: "अस्वीकार करें" },
  cancel: { en: "Cancel", hi: "रद्द करें" },
  confirm: { en: "Confirm", hi: "पुष्टि करें" },
  save: { en: "Save", hi: "सहेजें" },
  next: { en: "Next", hi: "आगे" },
  back: { en: "Back", hi: "पीछे" },
  signIn: { en: "Sign in", hi: "साइन इन करें" },
  signUp: { en: "Sign up", hi: "साइन अप करें" },
  logout: { en: "Logout", hi: "लॉगआउट" },
} as const;

export type StringKey = keyof typeof strings;

export function t(key: StringKey): string {
  return strings[key].en;
}

export function th(key: StringKey): string {
  return strings[key].hi;
}
