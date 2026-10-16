// Ready-made color themes for advertiser stores (presets only, so text is always readable).
//   head = top bar color, headInk = text on the top bar, strong = buttons + prices, dark = button hover
export const THEMES = {
  ocean:    { head: "#3e7bfa", headInk: "#0e0f11", strong: "#2563eb", dark: "#1d4ed8", name: { en: "Ocean",    fr: "Océan",    ar: "المحيط" } },
  midnight: { head: "#111827", headInk: "#ffffff", strong: "#4f46e5", dark: "#4338ca", name: { en: "Midnight", fr: "Minuit",   ar: "منتصف الليل" } },
  sunset:   { head: "#f97316", headInk: "#0e0f11", strong: "#c2410c", dark: "#9a3412", name: { en: "Sunset",   fr: "Coucher de soleil", ar: "الغروب" } },
  forest:   { head: "#22c55e", headInk: "#0e0f11", strong: "#15803d", dark: "#166534", name: { en: "Forest",   fr: "Forêt",    ar: "الغابة" } },
  rose:     { head: "#f43f5e", headInk: "#0e0f11", strong: "#be123c", dark: "#9f1239", name: { en: "Rose",     fr: "Rose",     ar: "وردي" } },
  violet:   { head: "#a78bfa", headInk: "#0e0f11", strong: "#6d28d9", dark: "#5b21b6", name: { en: "Violet",   fr: "Violet",   ar: "بنفسجي" } },
  gold:     { head: "#facc15", headInk: "#0e0f11", strong: "#a16207", dark: "#854d0e", name: { en: "Gold",     fr: "Or",       ar: "ذهبي" } },
  slate:    { head: "#e2e8f0", headInk: "#0e0f11", strong: "#334155", dark: "#1e293b", name: { en: "Slate",    fr: "Ardoise",  ar: "رمادي" } },
};

export function themeOf(key) { return THEMES[key] || THEMES.ocean; }

// CSS that re-colors the whole page (used on the store page and on product pages opened from a store)
export function themeCss(key) {
  const t = themeOf(key);
  return `:root{--blue:${t.head};--head-ink:${t.headInk};--blue-strong:${t.strong};--blue-dark:${t.dark}}`;
}
