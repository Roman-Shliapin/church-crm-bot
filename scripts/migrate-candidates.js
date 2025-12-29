// Скрипт міграції нехрещених користувачів з members в candidates
import dotenv from "dotenv";
dotenv.config();

import { connectToDatabase, closeDatabase, getCollection } from "../services/database.js";

const COLLECTIONS = {
  MEMBERS: "members",
  CANDIDATES: "candidates",
};

async function migrateCandidates() {
  try {
    console.log("🔄 Початок міграції нехрещених користувачів...\n");

    // Підключаємося до бази даних
    await connectToDatabase();
    
    const membersCollection = await getCollection(COLLECTIONS.MEMBERS);
    const candidatesCollection = await getCollection(COLLECTIONS.CANDIDATES);

    // Читаємо всіх користувачів з members
    const allMembers = await membersCollection.find({}).toArray();
    console.log(`📊 Знайдено ${allMembers.length} користувачів в колекції members\n`);

    // Знаходимо нехрещених
    const unbaptizedMembers = allMembers.filter(member => {
      const baptized = member.baptized;
      
      // Виключаємо якщо baptized === true або "true"
      if (baptized === true || baptized === "true") {
        return false;
      }
      
      // Включаємо всіх інших (false, null, undefined, відсутнє поле)
      return true;
    });

    console.log(`👥 Знайдено ${unbaptizedMembers.length} нехрещених користувачів для міграції\n`);

    if (unbaptizedMembers.length === 0) {
      console.log("✅ Немає нехрещених для міграції. Все готово!");
      await closeDatabase();
      return;
    }

    // Перевіряємо, чи користувачі вже є в candidates (щоб уникнути дублікатів)
    let migratedCount = 0;
    let skippedCount = 0;
    let errorsCount = 0;

    for (const member of unbaptizedMembers) {
      try {
        // Перевіряємо, чи вже існує в candidates
        const existing = await candidatesCollection.findOne({ id: member.id });
        
        if (existing) {
          console.log(`⏭️  Користувач ${member.name} (ID: ${member.id}) вже є в candidates, пропускаємо`);
          skippedCount++;
        } else {
          // Переносимо в candidates (без _id, щоб MongoDB створив новий)
          const { _id, ...memberData } = member;
          await candidatesCollection.insertOne(memberData);
          console.log(`✅ Мігровано: ${member.name} (ID: ${member.id})`);
          migratedCount++;
        }

        // Видаляємо з members
        await membersCollection.deleteOne({ id: member.id });
        console.log(`🗑️  Видалено з members: ${member.name} (ID: ${member.id})\n`);
      } catch (err) {
        console.error(`❌ Помилка міграції користувача ${member.name} (ID: ${member.id}):`, err.message);
        errorsCount++;
      }
    }

    console.log("\n📊 Статистика міграції:");
    console.log(`✅ Успішно мігровано: ${migratedCount}`);
    console.log(`⏭️  Пропущено (вже існують): ${skippedCount}`);
    console.log(`❌ Помилок: ${errorsCount}`);
    console.log("\n✅ Міграція завершена!");

    await closeDatabase();
  } catch (err) {
    console.error("❌ Критична помилка міграції:", err);
    await closeDatabase();
    process.exit(1);
  }
}

// Запускаємо міграцію
migrateCandidates();

