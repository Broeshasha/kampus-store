// ===== BRAND =====
export const BRAND = {
  name: "Kampus Store",
  logo: "/logo.png",
};

// ===== LANGUAGE: cookie first, then the phone's language, else French =====
export const LANGS = ["ar", "fr", "en"];

export function pickLang(request) {
  const cookie = request.headers.get("cookie") || "";
  const m = cookie.match(/(?:^|;\s*)lang=(ar|fr|en)\b/);
  if (m) return m[1];
  const header = (request.headers.get("accept-language") || "").toLowerCase();
  const prefs = header
    .split(",")
    .map((s) => {
      const [tag, q] = s.trim().split(";q=");
      return { tag: (tag || "").split("-")[0], q: q ? parseFloat(q) : 1 };
    })
    .sort((a, b) => b.q - a.q);
  for (const p of prefs) if (LANGS.includes(p.tag)) return p.tag;
  return "fr";
}

// ===== ALL TEXT ON THE SITE, IN 3 LANGUAGES =====
export const STRINGS = {
  en: {
    dir: "ltr",
    currency: "DA",
    tagline: "Student gear delivered to your door",
    marquee: [
      "🚚 Delivery to all 58 wilayas",
      "💵 Cash on delivery",
      "📞 We contact you to confirm your order",
      "⚡ Fast delivery 24–72h",
      "🎓 Made for students",
    ],
    search: "Search products…",
    all: "All",
    noProducts: "No products found.",
    orderNow: "Order now",
    outOfStock: "Out of stock",
    onlyLeft: "Only {n} left",
    share: "Share",
    linkCopied: "Link copied!",
    orderTitle: "Order — pay on delivery",
    fullName: "Full name",
    phone: "Phone (WhatsApp preferred)",
    wilaya: "Wilaya",
    chooseWilaya: "Choose wilaya",
    commune: "Commune",
    chooseCommune: "Choose commune",
    address: "Full address",
    quantity: "Quantity",
    promo: "Promo code (optional)",
    total: "Total",
    deliveryNote: "Delivery fee is confirmed when we contact you.",
    confirmBtn: "Confirm my order",
    sending: "Sending…",
    thanksTitle: "Thank you! Your order is received 🎉",
    thanksText: "We will contact you soon to confirm. Order ref:",
    backToStore: "Back to the store",
    notFound: "Product not found",
    errors: {
      bad_request: "Please check your details and try again.",
      invalid_phone: "Phone number is not valid.",
      invalid_name: "Please enter your full name.",
      invalid_address: "Please enter your full address.",
      invalid_location: "Please choose your wilaya and commune.",
      invalid_quantity: "Quantity is not valid.",
      not_found: "This product is no longer available.",
      out_of_stock: "Sorry, not enough stock for this quantity.",
      duplicate: "We already received this order. We will contact you soon.",
      server: "Something went wrong. Please try again.",
    },
  },

  fr: {
    dir: "ltr",
    currency: "DA",
    tagline: "Vos articles d'étudiant livrés chez vous",
    marquee: [
      "🚚 Livraison dans les 58 wilayas",
      "💵 Paiement à la livraison",
      "📞 Nous vous contactons pour confirmer",
      "⚡ Livraison rapide 24–72h",
      "🎓 Pensé pour les étudiants",
    ],
    search: "Rechercher un produit…",
    all: "Tout",
    noProducts: "Aucun produit trouvé.",
    orderNow: "Commander",
    outOfStock: "Rupture de stock",
    onlyLeft: "Plus que {n}",
    share: "Partager",
    linkCopied: "Lien copié !",
    orderTitle: "Commande — paiement à la livraison",
    fullName: "Nom complet",
    phone: "Téléphone (WhatsApp de préférence)",
    wilaya: "Wilaya",
    chooseWilaya: "Choisir la wilaya",
    commune: "Commune",
    chooseCommune: "Choisir la commune",
    address: "Adresse complète",
    quantity: "Quantité",
    promo: "Code promo (facultatif)",
    total: "Total",
    deliveryNote: "Les frais de livraison sont confirmés lors de notre contact.",
    confirmBtn: "Confirmer ma commande",
    sending: "Envoi…",
    thanksTitle: "Merci ! Votre commande est reçue 🎉",
    thanksText: "Nous vous contactons bientôt pour confirmer. Réf. commande :",
    backToStore: "Retour à la boutique",
    notFound: "Produit introuvable",
    errors: {
      bad_request: "Vérifiez vos informations et réessayez.",
      invalid_phone: "Numéro de téléphone invalide.",
      invalid_name: "Veuillez saisir votre nom complet.",
      invalid_address: "Veuillez saisir votre adresse complète.",
      invalid_location: "Veuillez choisir votre wilaya et votre commune.",
      invalid_quantity: "Quantité invalide.",
      not_found: "Ce produit n'est plus disponible.",
      out_of_stock: "Désolé, stock insuffisant pour cette quantité.",
      duplicate: "Nous avons déjà reçu cette commande. Nous vous contactons bientôt.",
      server: "Une erreur est survenue. Veuillez réessayer.",
    },
  },

  ar: {
    dir: "rtl",
    currency: "د.ج",
    tagline: "منتجات الطلبة تصلك إلى باب بيتك",
    marquee: [
      "🚚 التوصيل إلى 58 ولاية",
      "💵 الدفع عند الاستلام",
      "📞 نتواصل معك لتأكيد طلبك",
      "⚡ توصيل سريع 24–72 ساعة",
      "🎓 مصمّم للطلبة",
    ],
    search: "ابحث عن منتج…",
    all: "الكل",
    noProducts: "لا توجد منتجات.",
    orderNow: "اطلب الآن",
    outOfStock: "نفدت الكمية",
    onlyLeft: "بقي {n} فقط",
    share: "مشاركة",
    linkCopied: "تم نسخ الرابط!",
    orderTitle: "اطلب الآن — الدفع عند الاستلام",
    fullName: "الاسم الكامل",
    phone: "رقم الهاتف (يُفضّل واتساب)",
    wilaya: "الولاية",
    chooseWilaya: "اختر الولاية",
    commune: "البلدية",
    chooseCommune: "اختر البلدية",
    address: "العنوان الكامل",
    quantity: "الكمية",
    promo: "رمز الترويج (اختياري)",
    total: "المجموع",
    deliveryNote: "يتم تأكيد سعر التوصيل عند التواصل معك.",
    confirmBtn: "تأكيد الطلب",
    sending: "جارٍ الإرسال…",
    thanksTitle: "شكرًا لك! تم استلام طلبك 🎉",
    thanksText: "سنتواصل معك قريبًا لتأكيد الطلب. رقم الطلب:",
    backToStore: "العودة إلى المتجر",
    notFound: "المنتج غير موجود",
    errors: {
      bad_request: "تأكد من معلوماتك وحاول مرة أخرى.",
      invalid_phone: "رقم الهاتف غير صحيح.",
      invalid_name: "الرجاء إدخال اسمك الكامل.",
      invalid_address: "الرجاء إدخال عنوانك الكامل.",
      invalid_location: "الرجاء اختيار الولاية والبلدية.",
      invalid_quantity: "الكمية غير صحيحة.",
      not_found: "هذا المنتج لم يعد متوفرًا.",
      out_of_stock: "عذرًا، الكمية المطلوبة غير متوفرة.",
      duplicate: "لقد استلمنا هذا الطلب مسبقًا. سنتواصل معك قريبًا.",
      server: "حدث خطأ. الرجاء المحاولة مرة أخرى.",
    },
  },
};
