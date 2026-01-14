// Обробники основних команд бота
import { Markup } from "telegraf";
import { helpMessage, helpMessageForAdmins } from "../config/constants.js";
import { isAdmin } from "../middlewares/admin.js";
import { findMemberById } from "../services/storage.js";

/**
 * Створює reply keyboard з кнопками меню (динамічне меню)
 * @param {Object} ctx - Контекст Telegraf (опціонально, для перевірки реєстрації)
 * @returns {Promise<Markup>} Reply keyboard
 */
export async function createMainMenu(ctx = null) {
  let isRegistered = false;
  
  if (ctx && ctx.from && ctx.from.id) {
    try {
      const member = await findMemberById(ctx.from.id);
      isRegistered = !!member;
    } catch (err) {
      // Якщо помилка - використовуємо значення за замовчуванням
      console.error("Помилка перевірки реєстрації:", err);
    }
  }
  
  const dynamicButton = isRegistered ? "👤 Мій профіль" : "📝 Зареєструватися";
  
  return Markup.keyboard([
    ["🙏 Попросити допомогу", "📖 Біблія та духовна підтримка"],
    ["📞 Зв'язатися з нами", dynamicButton]
  ])
    .resize()
    .persistent();
}

/**
 * Створює меню після контактів (з двома кнопками)
 */
export function createContactMenu() {
  return Markup.keyboard([
    ["💬 Перейти в чат церкви", "🏠 Вийти на головне меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Обробник команди /start
 */
export async function handleStart(ctx) {
  const menu = await createMainMenu(ctx);
  ctx.reply(
    `Привіт, ${ctx.from.first_name}. Тебе вітає Церква Христова в Вінниці. ✝️`,
    menu
  );
  setTimeout(async () => {
    const menu2 = await createMainMenu(ctx);
    ctx.reply(
      "📖 Вітаю! Я — внутрішній бот-помічник Церкви Христової. Моє завдання — допомагати братам і сестрам у служінні:\n• вести облік членів церкви;\n• приймати заявки на матеріальну чи духовну допомогу;\n• фіксувати молитвені потреби;\n• нагадувати про зібрання, зустрічі та служіння;\n• надсилати біблійні уроки й повідомлення громади.\n\n🕊️ Усе, що я роблю, покликане служити для порядку, спілкування та турботи одне про одно Христі.\n\nВикористовуйте кнопки нижче для навігації.",
      menu2
    );
  }, 1000);
}

/**
 * Обробник команди /help
 */
export async function handleHelp(ctx) {
  const userId = ctx.from.id;
  const message = isAdmin(userId) ? helpMessageForAdmins : helpMessage;
  const menu = await createMainMenu(ctx);
  ctx.reply(message, menu);
}

/**
 * Створює меню "Біблія та духовна підтримка"
 */
export function createBibleSupportMenu() {
  return Markup.keyboard([
    ["💬 Молитвенна потреба", "📚 Біблійні уроки"],
    ["📖 Пошук літератури"],
    ["🏠 Повернутися до головного меню"]
  ])
    .resize()
    .persistent();
}

/**
 * Обробник кнопки "Біблія та духовна підтримка"
 */
export async function handleBibleSupport(ctx) {
  return ctx.reply(
    "📖 Біблія та духовна підтримка\n\nОберіть, що вас цікавить:",
    createBibleSupportMenu()
  );
}

