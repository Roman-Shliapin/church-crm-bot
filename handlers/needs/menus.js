import { Markup } from "telegraf";

/** Якщо false — кнопка «Хімія» показує повідомлення про недоступність (змініть на true, коли знову буде допомога). */
export const HUMANITARIAN_CHEMISTRY_AVAILABLE = false;

export function buildNeedManageKeyboard(need) {
  // Вимога:
  // - після "Відповісти": прибрати "Відповісти", лишити "В процесі" + "Виконано"
  // - після "В процесі": прибрати "В процесі", але лишити "Відповісти" + "Виконано"
  const showReply = !need?.repliedAt;
  const showWaiting = !(need?.waitingAt || need?.inProgressAt);
  const rows = [];

  if (showReply) {
    rows.push([Markup.button.callback("💬 Відповісти", `reply_need_${need.id}`)]);
  }

  const row2 = [Markup.button.callback("✅ Виконано", `need_done_${need.id}`)];
  if (showWaiting) {
    row2.push(Markup.button.callback("🕓 В очікуванні", `need_progress_${need.id}`));
  }
  rows.push(row2);

  rows.push([Markup.button.callback("🗑️ Видалити", `need_delete_${need.id}`)]);

  return Markup.inlineKeyboard(rows);
}

/**
 * Створює меню вибору типу допомоги
 */
export function createNeedTypeMenu() {
  return Markup.keyboard([
    ["🛒 Гуманітарна допомога", "💬 Інше"],
    ["🏠 Повернутися до головного меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Меню категорій гуманітарної допомоги
 */
export function createHumanitarianCategoryMenu() {
  return Markup.keyboard([
    ["Продукти", "Хімія"],
    ["🏠 Повернутися до головного меню"],
  ])
    .resize()
    .persistent();
}

export function createGuestRegistrationConfirmMenu() {
  return Markup.keyboard([["Так", "Ні"]]).resize().persistent();
}
