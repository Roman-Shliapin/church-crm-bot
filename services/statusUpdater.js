// Сервіс для автоматичного оновлення статусів заявок
import { readNeeds, updateNeedStatus } from "./storage.js";
import { NEED_STATUS, AUTO_STATUS_UPDATE_HOURS } from "../config/constants.js";
import { logInfo, logError } from "../utils/logger.js";

/**
 * Оновлює статуси заявок: якщо заявка зі статусом "нове" існує більше 24 годин,
 * автоматично змінює статус на "в очікуванні"
 */
export async function updateNeedStatuses() {
  try {
    const needs = await readNeeds();
    const now = new Date();
    let changedCount = 0;

    for (const need of needs) {
      const created = new Date(need.date);
      const hoursPassed = (now - created) / (1000 * 60 * 60);

      // Якщо пройшло достатньо годин і статус "нове" — змінюємо
      if (
        need.status === NEED_STATUS.NEW &&
        hoursPassed >= AUTO_STATUS_UPDATE_HOURS
      ) {
        await updateNeedStatus(need.id, NEED_STATUS.WAITING);
        changedCount++;
      }
    }

    if (changedCount > 0) {
      logInfo("Статуси заявок автоматично оновлено", { updatedCount: changedCount });
    }
  } catch (err) {
    logError("Помилка при оновленні статусів заявок", err);
  }
}

