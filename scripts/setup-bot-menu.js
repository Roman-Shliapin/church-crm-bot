#!/usr/bin/env node
// Скрипт для налаштування меню команд бота через Telegram Bot API
// Використання: node scripts/setup-bot-menu.js

import { Telegraf } from "telegraf";
import dotenv from "dotenv";
import { regularUserCommands, allAdminCommands } from "../utils/botMenu.js";

dotenv.config();

const BOT_TOKEN = process.env.BOT_TOKEN;

if (!BOT_TOKEN) {
  console.error("❌ ПОМИЛКА: BOT_TOKEN не встановлено в .env файлі!");
  process.exit(1);
}

const bot = new Telegraf(BOT_TOKEN);

async function setupBotMenu() {
  try {
    console.log("🔧 Налаштування меню команд бота...\n");

    // Встановлюємо команди для всіх користувачів (звичайні команди)
    // Telegram автоматично приховає команди, які користувач не може виконати
    // Але краще встановити тільки ті, які доступні всім
    console.log("Встановлюю команди для всіх користувачів...");
    await bot.telegram.setMyCommands(regularUserCommands);

    console.log("✅ Меню команд успішно налаштовано!\n");
    console.log("📋 Команди, які бачать звичайні користувачі:");
    regularUserCommands.forEach((cmd) => {
      console.log(`   /${cmd.command} — ${cmd.description}`);
    });

    console.log("\n⚠️  Примітка:");
    console.log("Адміністраторські команди (/members, /needs, /announce)");
    console.log("не включені в меню, оскільки вони доступні тільки адміністраторам.");
    console.log("Адміністратори можуть використовувати ці команди напряму, навіть якщо");
    console.log("вони не відображаються в меню.\n");
  } catch (err) {
    console.error("❌ Помилка налаштування меню:", err);
    process.exit(1);
  }
}

setupBotMenu();

