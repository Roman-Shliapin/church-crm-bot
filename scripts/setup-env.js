#!/usr/bin/env node
// Скрипт для створення .env файлу
import fs from "fs";
import readline from "readline";

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(prompt) {
  return new Promise((resolve) => {
    rl.question(prompt, resolve);
  });
}

async function setupEnv() {
  console.log("🔧 Налаштування .env файлу\n");

  // Перевірка чи файл вже існує
  if (fs.existsSync(".env")) {
    const overwrite = await question(
      "⚠️  Файл .env вже існує. Перезаписати? (y/n): "
    );
    if (overwrite.toLowerCase() !== "y" && overwrite.toLowerCase() !== "yes") {
      console.log("Скасовано.");
      rl.close();
      return;
    }
  }

  // Запит BOT_TOKEN
  const botToken = await question("Введіть BOT_TOKEN (з @BotFather): ");
  if (!botToken || botToken.trim() === "") {
    console.error("❌ BOT_TOKEN обов'язковий!");
    rl.close();
    process.exit(1);
  }

  // Запит ADMIN_IDS
  const adminIds = await question(
    "Введіть ADMIN_IDS (через кому, без пробілів, наприклад: 123456789,987654321): "
  );
  if (!adminIds || adminIds.trim() === "") {
    console.error("❌ ADMIN_IDS обов'язковий!");
    rl.close();
    process.exit(1);
  }

  // Валідація ADMIN_IDS
  const ids = adminIds.split(",").map((id) => id.trim());
  const invalidIds = ids.filter((id) => isNaN(parseInt(id, 10)));
  if (invalidIds.length > 0) {
    console.error(`❌ Невірні ID: ${invalidIds.join(", ")}`);
    rl.close();
    process.exit(1);
  }

  // Створення .env файлу
  const envContent = `# Telegram Bot Token
# Отримати можна у @BotFather в Telegram
BOT_TOKEN=${botToken.trim()}

# Telegram ID адміністраторів (служителів)
# Розділяти комами без пробілів: ADMIN_IDS=123456789,987654321
ADMIN_IDS=${adminIds.trim()}
`;

  try {
    fs.writeFileSync(".env", envContent, "utf8");
    console.log("\n✅ Файл .env успішно створено!");
    console.log("\n⚠️  ВАЖЛИВО:");
    console.log("   - Не діліться .env файлом з іншими");
    console.log("   - Не комітьте .env в git");
    console.log("   - Зберігайте токен в безпечному місці\n");
  } catch (err) {
    console.error("❌ Помилка створення .env файлу:", err);
    rl.close();
    process.exit(1);
  }

  rl.close();
}

setupEnv().catch((err) => {
  console.error("Помилка:", err);
  rl.close();
  process.exit(1);
});

