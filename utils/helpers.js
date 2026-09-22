// Допоміжні функції

/**
 * Форматує повідомлення про заявку на допомогу
 * @param {Object} need - Об'єкт заявки
 * @returns {string} Відформатоване повідомлення
 */
export function formatNeedMessage(need) {
  const typeName = need.type === "humanitarian" ? "🛒 Гуманітарна допомога" : "💬 Інше";
  return (
    `🙋‍♂️ *${need.name}*\n` +
    `📅 Хрещення: ${need.baptism}\n` +
    `🎂 День народження: ${need.birthday || "не вказано"}\n` +
    `📞 ${need.phone}\n` +
    `🏷️ Тип: ${typeName}\n` +
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
  const typeName = need.type === "humanitarian" ? "🛒 Гуманітарна допомога" : "💬 Інше";
  return (
    `📬 *Нова заявка на допомогу!*\n\n` +
    `🙋‍♂️ Ім'я: ${need.name}\n` +
    `📅 Хрещення: ${need.baptism}\n` +
    `🎂 День народження: ${need.birthday || "не вказано"}\n` +
    `📞 Телефон: ${need.phone}\n` +
    `🏷️ Тип: ${typeName}\n` +
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
 * @param {string} [params.birthday] - День народження (ДД-ММ-РРРР)
 * @param {string} params.type - Тип допомоги (humanitarian/other)
 * @returns {Object} Об'єкт заявки
 */
export function createNeed({ userId, name, baptism, phone, description, birthday, type = "other" }) {
  const createdAt = new Date().toISOString();
  return {
    id: Date.now(),
    userId,
    name,
    baptism,
    birthday: birthday || null,
    phone,
    description,
    type,
    date: new Date().toLocaleString("uk-UA"),
    createdAt,
    status: "нове",
  };
}
