// Константи та конфігурація бота
// ⚠️ Примітка: dotenv.config() викликається в bot.js

// Отримуємо ADMIN_IDS з змінних оточення
// Формат в .env: ADMIN_IDS=580788346,1015055588
export const ADMIN_IDS = process.env.ADMIN_IDS
  ? process.env.ADMIN_IDS.split(",")
      .map((id) => parseInt(id.trim(), 10))
      .filter((id) => !isNaN(id) && id > 0)
  : [580788346, 1015055588]; // Fallback (тільки для розробки, якщо .env не налаштовано)

// Повідомлення допомоги для звичайних користувачів (БЕЗ адмінівських команд)
export const helpMessage =
  "/start — почати спілкування з ботом\n" +
  "/help — показати довідку\n" +
  "/register — зареєструватися в системі\n" +
  "/me — подивитися свої дані\n" +
  "/need — подати заявку на допомогу\n" +
  "/pray — додати молитвенну потребу\n" +
  "/lessons — отримати біблійний урок\n" +
  "/contact — контакти служителів";

// Повідомлення допомоги для адміністраторів (з додатковими командами)
export const helpMessageForAdmins =
  helpMessage +
  "\n\n*Команди для служителів:*\n" +
  "/members — список членів церкви (хрещені)\n" +
  "/candidates — список нехрещених\n" +
  "/needs — усі заявки на допомогу\n" +
  "/prayers — список молитвенних потреб\n" +
  "/announce — зробити оголошення\n" +
  "/upload_lesson — завантажити PDF урок";

// Шляхи до файлів даних
export const MEMBERS_FILE = "members.json";
export const NEEDS_FILE = "needs.json";
export const PRAYERS_FILE = "prayers.json";
export const LESSONS_FILE = "lessons.json";

// Статуси заявок
export const NEED_STATUS = {
  NEW: "нове",
  WAITING: "в очікуванні",
  DONE: "виконано",
};

// Маппінг статусів для callback кнопок
export const STATUS_MAP = {
  waiting: NEED_STATUS.WAITING,
  done: NEED_STATUS.DONE,
};

// Тривалість автоматичного оновлення статусів (хвилини)
export const STATUS_UPDATE_INTERVAL = 10;

// Кількість годин до автоматичної зміни статусу з "нове" на "в очікуванні"
export const AUTO_STATUS_UPDATE_HOURS = 24;

