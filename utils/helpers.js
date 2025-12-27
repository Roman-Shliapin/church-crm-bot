// Допоміжні функції

/**
 * Форматує повідомлення про заявку на допомогу
 * @param {Object} need - Об'єкт заявки
 * @returns {string} Відформатоване повідомлення
 */
export function formatNeedMessage(need) {
  return (
    `🙋‍♂️ *${need.name}*\n` +
    `📅 Хрещення: ${need.baptism}\n` +
    `📞 ${need.phone}\n` +
    `📖 ${need.description}\n` +
    `🕓 ${need.date}\n` +
    `⚙️ *Статус:* ${need.status}`
  );
}

/**
 * Створює повідомлення для адмінів про нову заявку
 * @param {Object} need - Об'єкт заявки
 * @returns {string} Повідомлення для адмінів
 */
export function createAdminNotification(need) {
  return (
    `📬 *Нова заявка на допомогу!*\n\n` +
    `🙋‍♂️ Ім'я: ${need.name}\n` +
    `📅 Хрещення: ${need.baptism}\n` +
    `📞 Телефон: ${need.phone}\n` +
    `📖 Потреба: ${need.description}\n` +
    `🕓 Дата подання: ${need.date}`
  );
}

/**
 * Створює об'єкт заявки на допомогу
 * @param {Object} params - Параметри заявки
 * @param {number} params.userId - Telegram ID користувача
 * @param {string} params.name - Ім'я
 * @param {string} params.baptism - Дата хрещення
 * @param {string} params.phone - Номер телефону
 * @param {string} params.description - Опис потреби
 * @returns {Object} Об'єкт заявки
 */
export function createNeed({ userId, name, baptism, phone, description }) {
  return {
    id: Date.now(),
    userId,
    name,
    baptism,
    phone,
    description,
    date: new Date().toLocaleString("uk-UA"),
    status: "нове",
  };
}

/**
 * Форматує повідомлення про молитвенну потребу
 * @param {Object} prayer - Об'єкт молитвенної потреби
 * @returns {string} Відформатоване повідомлення
 */
export function formatPrayerMessage(prayer) {
  return (
    `🙏 *${prayer.name || "Анонімно"}*\n` +
    `📖 ${prayer.description}\n` +
    `🕓 ${prayer.date}`
  );
}

/**
 * Створює об'єкт молитвенної потреби
 * @param {Object} params - Параметри
 * @param {number} params.userId - Telegram ID користувача
 * @param {string} params.name - Ім'я (опціонально)
 * @param {string} params.description - Опис потреби
 * @returns {Object} Об'єкт молитвенної потреби
 */
export function createPrayer({ userId, name, description }) {
  return {
    id: Date.now(),
    userId,
    name: name || null,
    description,
    date: new Date().toLocaleString("uk-UA"),
  };
}

/**
 * Створює повідомлення для адмінів про нову молитвенну потребу
 * @param {Object} prayer - Об'єкт молитвенної потреби
 * @returns {string} Повідомлення для адмінів
 */
export function createAdminPrayerNotification(prayer) {
  return (
    `🙏 *Нова молитвенна потреба!*\n\n` +
    `👤 ${prayer.name ? `Ім'я: ${prayer.name}` : "Анонімно"}\n` +
    `📖 Потреба: ${prayer.description}\n` +
    `🕓 Дата подання: ${prayer.date}`
  );
}

/**
 * Створює об'єкт запиту на літературу
 * @param {Object} params - Параметри
 * @param {number} params.userId - Telegram ID користувача
 * @param {string} params.name - Ім'я користувача
 * @param {string} params.request - Текст запиту
 * @returns {Object} Об'єкт запиту
 */
export function createLiteratureRequest({ userId, name, request }) {
  return {
    id: Date.now(),
    userId,
    name: name || null,
    request,
    date: new Date().toLocaleString("uk-UA"),
  };
}

/**
 * Створює повідомлення для адмінів про новий запит на літературу
 * @param {Object} literatureRequest - Об'єкт запиту
 * @returns {string} Повідомлення для адмінів
 */
export function createAdminLiteratureNotification(literatureRequest) {
  return (
    `📚 *Новий запит на літературу!*\n\n` +
    `👤 Ім'я: ${literatureRequest.name || "Не вказано"}\n` +
    `📖 Запит: ${literatureRequest.request}\n` +
    `🕓 Дата подання: ${literatureRequest.date}`
  );
}

