import { findActiveNeedByType } from "../../services/storage.js";
import { createMainMenu } from "../commands.js";

async function replyActiveNeedBlocked(ctx, type) {
  const menu = await createMainMenu(ctx);
  ctx.session = null;
  const typeLabel = type === "humanitarian" ? "гуманітарної допомоги" : "типу «Інше»";
  await ctx.reply(
    `⛔ У вас уже є незакрита заявка ${typeLabel}.\n\n` +
      `Нову заявку цього типу можна подати після виконання попередньої.`,
    { reply_markup: menu.reply_markup }
  );
}

/** @returns {Promise<boolean>} true — можна подавати заявку */
export async function assertCanSubmitNeed(ctx, type) {
  if (!type) return true;
  const active = await findActiveNeedByType(ctx.from.id, type);
  if (!active) return true;
  await replyActiveNeedBlocked(ctx, type);
  return false;
}
