// Утиліти для налаштування меню бота в Telegram
// Це команди, які будуть показані в меню бота

// Команди для звичайних користувачів (не адмінів)
export const regularUserCommands = [
  { command: "start", description: "Почати спілкування з ботом" },
  { command: "help", description: "Показати довідку" },
  { command: "register", description: "Зареєструватися в системі" },
  { command: "me", description: "Подивитися свої дані" },
  { command: "need", description: "Подати заявку на допомогу" },
  { command: "pray", description: "Додати молитвенну потребу" },
  { command: "lessons", description: "Отримати біблійний урок" },
  { command: "contact", description: "Контакти служителів" },
];

// Команди для адміністраторів (додаткові)
export const adminCommands = [
  { command: "members", description: "Список членів церкви" },
  { command: "needs", description: "Усі заявки на допомогу" },
  { command: "prayers", description: "Список молитвенних потреб" },
  { command: "announce", description: "Зробити оголошення" },
  { command: "upload_lesson", description: "Завантажити PDF урок" },
];

// Всі команди для адмінів
export const allAdminCommands = [...regularUserCommands, ...adminCommands];

