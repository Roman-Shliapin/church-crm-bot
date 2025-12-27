// Сервіс для генерації Excel файлів
import ExcelJS from "exceljs";
import fs from "fs";

/**
 * Генерує Excel файл зі списком членів церкви
 * @param {Array} members - Масив членів церкви
 * @returns {string} Шлях до створеного файлу
 */
export async function generateMembersExcel(members) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Члени церкви");

  // Налаштування колонок
  worksheet.columns = [
    { header: "№", key: "index", width: 5 },
    { header: "Ім'я", key: "name", width: 30 },
    { header: "Дата хрещення", key: "baptism", width: 20 },
    { header: "День народження", key: "birthday", width: 20 },
    { header: "Телефон", key: "phone", width: 20 },
    { header: "Telegram ID", key: "id", width: 20 },
  ];

  // Додавання даних
  members.forEach((member, index) => {
    worksheet.addRow({
      index: index + 1,
      name: member.name,
      baptism: member.baptism,
      birthday: member.birthday || "",
      phone: member.phone,
      id: member.id,
    });
  });

  // Генерація імені файлу з поточною датою
  const date = new Date().toISOString().split("T")[0];
  const filePath = `members_${date}.xlsx`;

  // Збереження файлу
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

/**
 * Генерує Excel файл зі списком заявок на допомогу
 * @param {Array} needs - Масив заявок на допомогу
 * @returns {string} Шлях до створеного файлу
 */
export async function generateNeedsExcel(needs) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Заявки на допомогу");

  // Налаштування колонок
  worksheet.columns = [
    { header: "№", key: "index", width: 5 },
    { header: "Ім'я", key: "name", width: 30 },
    { header: "Хрещення", key: "baptism", width: 20 },
    { header: "Телефон", key: "phone", width: 20 },
    { header: "Опис", key: "description", width: 50 },
    { header: "Дата", key: "date", width: 20 },
    { header: "Статус", key: "status", width: 15 },
    { header: "Telegram ID", key: "userId", width: 20 },
  ];

  // Додавання даних
  needs.forEach((need, index) => {
    worksheet.addRow({
      index: index + 1,
      name: need.name,
      baptism: need.baptism,
      phone: need.phone,
      description: need.description,
      date: need.date,
      status: need.status,
      userId: need.userId,
    });
  });

  // Генерація імені файлу з поточною датою
  const date = new Date().toISOString().split("T")[0];
  const filePath = `needs_${date}.xlsx`;

  // Збереження файлу
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

/**
 * Генерує Excel файл зі списком молитвенних потреб
 * @param {Array} prayers - Масив молитвенних потреб
 * @returns {string} Шлях до створеного файлу
 */
export async function generatePrayersExcel(prayers) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("Молитвенні потреби");

  // Налаштування колонок
  worksheet.columns = [
    { header: "№", key: "index", width: 5 },
    { header: "Ім'я", key: "name", width: 30 },
    { header: "Опис", key: "description", width: 60 },
    { header: "Дата", key: "date", width: 20 },
    { header: "Telegram ID", key: "userId", width: 20 },
  ];

  // Додавання даних
  prayers.forEach((prayer, index) => {
    worksheet.addRow({
      index: index + 1,
      name: prayer.name || "Анонімно",
      description: prayer.description,
      date: prayer.date,
      userId: prayer.userId,
    });
  });

  // Генерація імені файлу з поточною датою
  const date = new Date().toISOString().split("T")[0];
  const filePath = `prayers_${date}.xlsx`;

  // Збереження файлу
  await workbook.xlsx.writeFile(filePath);
  return filePath;
}

/**
 * Видаляє файл після надсилання
 * @param {string} filePath - Шлях до файлу
 */
export function deleteFile(filePath) {
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    console.error("Помилка видалення файлу:", err);
  }
}

