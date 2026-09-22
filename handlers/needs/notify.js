import { ADMIN_IDS } from "../../config/constants.js";
import { createAdminNotification } from "../../utils/helpers.js";
import { createMainMenu } from "../commands.js";

/**
 * Надсилає повідомлення адмінам про нову заявку
 */
export async function notifyAdmins(ctx, need) {
  const adminMessage = createAdminNotification(need);
  console.log("🟢 Надсилаю повідомлення адмінам:", ADMIN_IDS);

  for (const adminId of ADMIN_IDS) {
    try {
      // ВАЖЛИВО: не показуємо кнопку "Написати відповідь" при надходженні нової заявки.
      // Адмін керує заявками через "🛠️ Керувати потребами".
      const menu = await createMainMenu({ from: { id: adminId } });
      await ctx.telegram.sendMessage(adminId, adminMessage, {
        parse_mode: "Markdown",
        reply_markup: menu.reply_markup,
      });
    } catch (err) {
      console.error("❌ Помилка надсилання адміну:", err);
    }
  }
}
