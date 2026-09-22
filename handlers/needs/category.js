const PRODUCTS_KEYWORDS = [
  "продукт",
  "харч",
  "їж",
  "круп",
  "макарон",
  "консерв",
  "олія",
  "масло",
  "борошн",
  "цукор",
];
const CHEMISTRY_KEYWORDS = [
  "хім",
  "хими",
  "побутова хім",
  "порош",
  "миюч",
  "мило",
  "шампун",
  "зубн",
  "паста",
  "папір",
  "серветк",
];

function normalizeText(s) {
  return (s || "").toString().toLowerCase().trim();
}

export function classifyNeedCategory(need) {
  // Явне правило для "Інше"
  if (need?.type === "other") return "other";

  const desc = normalizeText(need?.description);

  // Гуманітарні: визначаємо по ключових словах
  if (need?.type === "humanitarian") {
    if (PRODUCTS_KEYWORDS.some((k) => desc.includes(k))) return "products";
    if (CHEMISTRY_KEYWORDS.some((k) => desc.includes(k))) return "chemistry";
    return "other";
  }

  // fallback (на випадок старих записів без type)
  if (PRODUCTS_KEYWORDS.some((k) => desc.includes(k))) return "products";
  if (CHEMISTRY_KEYWORDS.some((k) => desc.includes(k))) return "chemistry";
  return "other";
}

export function getCategoryLabel(key) {
  if (key === "products") return "Продукти";
  if (key === "chemistry") return "Хімія";
  return "Інше";
}
