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
  const isAdminUser = !!(ctx && ctx.from && typeof ctx.from.id === "number" && isAdmin(ctx.from.id));
  
  if (ctx && ctx.from && ctx.from.id) {
    try {
      const member = await findMemberById(ctx.from.id);
      isRegistered = !!member;
    } catch (err) {
      isRegistered = true;
      console.error("Помилка перевірки реєстрації (показуємо повне меню):", err);
    }
  }
  
  if (!isRegistered) {
    return Markup.keyboard([["📝 Зареєструватися"]])
      .resize()
      .persistent();
  }

  const rows = [
    ["🙏 Попросити допомогу", "📖 Біблія та духовна підтримка"],
    ["📞 Зв'язатися з нами", "👤 Мій профіль"],
  ];

  if (isAdminUser) {
    rows.push(["🛠️ Керувати потребами"]);
  }

  return Markup.keyboard(rows)
    .resize()
    .persistent();
}

/**
 * Меню для адміна: керування потребами
 */
export function createAdminManageNeedsMenu() {
  return Markup.keyboard([
    ["🥫 Продукти", "🧴 Хімія"],
    ["💬 Інше"],
    ["🙏 Молитовні потреби"],
    ["📦 Показати виконані (архів)"],
    ["🏠 Повернутися на головне меню"],
  ])
    .resize()
    .persistent();
}

/**
 * Меню архіву для адміна
 */
export function createAdminArchiveMenu() {
  return Markup.keyboard([
    ["🥫 Виконані продукти", "🧴 Виконана хімія"],
    ["💬 Виконані інше"],
    ["🙏 Виконані молитви"],
    ["🛠️ Керувати потребами"],
    ["🏠 Повернутися на головне меню"],
  ])
    .resize()
    .persistent();
}

/**
 * Відкрити меню архіву (тільки для адмінів)
 */
export async function handleAdminArchiveMenu(ctx) {
  if (!isAdmin(ctx.from.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  return ctx.reply("📦 Архів (виконані)\n\nОберіть розділ:", createAdminArchiveMenu());
}

/**
 * Відкрити меню керування потребами (тільки для адмінів)
 */
export async function handleAdminManageNeedsMenu(ctx) {
  if (!isAdmin(ctx.from.id)) {
    const menu = await createMainMenu(ctx);
    return ctx.reply("⚠️ Ця функція доступна лише для служителів.", menu);
  }

  return ctx.reply("🛠️ Керування потребами\n\nОберіть розділ:", createAdminManageNeedsMenu());
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
 * Меню підтвердження відправки повідомлення (для адмінів)
 */
export function createConfirmSendMenu() {
  return Markup.keyboard([
    ["✅ Відправити", "✏️ Переписати"],
    ["❌ Скасувати"]
  ])
    .resize()
    .persistent();
}

/**
 * Обробник команди /start
 */
export async function handleStart(ctx) {
  const member = await findMemberById(ctx.from.id);
  const menu = await createMainMenu(ctx);

  if (!member) {
    return ctx.reply(
      `Привіт, ${ctx.from.first_name}! 👋\n\nТебе вітає Церква Христова в Вінниці ✝️\n\nДля початку роботи з ботом, будь ласка, зареєструйся, натиснувши кнопку нижче.`,
      menu
    );
  }

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

