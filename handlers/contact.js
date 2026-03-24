// Обробник контактів служителів
import { Markup } from "telegraf";
import { createMainMenu, createContactMenu } from "./commands.js";

/**
 * Обробник команди /contact або кнопки "Зв'язатися з нами" - показує контакти служителів
 */
export async function handleContact(ctx) {
  const message =
    "📞 Контакти служителів Церкви Христової у Вінниці:\n\n" +
    "📍 Адреса:\n" +
    "Вінниця, вул. Пирогова 59А, перший поверх\n\n" +
    "📞 Телефон:\n" +
    "+380 (93) 223 25 26 Олексій\n\n" +
    "🕊️ Якщо у вас є питання, потреби або потрібна духовна підтримка, " +
    "зв'яжіться з нашими служителями через цього бота або безпосередньо.\n\n" +
    "🔒 Ваші дані зберігаються в безпеці та використовуються тільки для служіння.\n\n" +
    "🙏 Ми завжди готові допомогти вам!";

  return ctx.reply(message, createContactMenu());
}

/**
 * Обробник кнопки "Перейти в чат церкви"
 */
export async function handleChurchChat(ctx) {
  const chatLink = process.env.CHURCH_CHAT_LINK;
  const chatUsername = process.env.CHURCH_CHAT_USERNAME;
  
  if (!chatLink && !chatUsername) {
    await ctx.reply(
      "⚠️ Посилання на чат церкви не налаштовано.\n\n" +
      "Зверніться до адміністратора.",
      createContactMenu()
    );
    return;
  }
  
  // Якщо є посилання - показуємо кнопку з посиланням
  if (chatLink) {
    // Перевіряємо, чи посилання валідне
    const validLink = chatLink.trim();
    
    await ctx.reply(
      "💬 Приєднуйтесь до нашого чату для спілкування та підтримки:",
      Markup.inlineKeyboard([
        [Markup.button.url("💬 Перейти в чат церкви", validLink)]
      ])
    );
    await ctx.reply("Або використайте кнопки нижче:", createContactMenu());
  } else if (chatUsername) {
    // Якщо є тільки username - показуємо його
    const link = chatUsername.startsWith("@") 
      ? `https://t.me/${chatUsername.slice(1)}`
      : `https://t.me/${chatUsername}`;
    
    await ctx.reply(
      "💬 Приєднуйтесь до нашого чату для спілкування та підтримки:",
      Markup.inlineKeyboard([
        [Markup.button.url("💬 Перейти в чат церкви", link)]
      ])
    );
    await ctx.reply("Або використайте кнопки нижче:", createContactMenu());
  }
}

/**
 * Обробник кнопки "Вийти на головне меню"
 */
export async function handleBackToMainMenu(ctx) {
  const menu = await createMainMenu(ctx);
  await ctx.reply("🏠 Повернулися до головного меню", menu);
}
