const fs = require('fs');
const path = require('path');
const { pool } = require('../config/db');

const runMigrations = async () => {
  const migrationsDir = __dirname;

  // Explicit order (FK dependencies)
  const files = [
    'enum_subscription_period.sql',
    'users.sql',
    'user_profiles.sql',
    'products.sql',
    'fridge_items.sql',
    'recipes.sql',
    'favorite_recipes.sql',
    'daily_logs.sql',
    'subscription_plans.sql',
    'user_subscriptions.sql',
    'notifications.sql',
    'chat_messages.sql',
  ];

  console.log(`\n📦 Running ${files.length} migrations on database "${process.env.DB_NAME}"...\n`);

  for (const file of files) {
    const filePath = path.join(migrationsDir, file);
    const sql = fs.readFileSync(filePath, 'utf-8');

    try {
      await pool.query(sql);
      console.log(`  ✅ ${file}`);
    } catch (err) {
      console.error(`  ❌ ${file} — ${err.message}`);
    }
  }

  console.log('\n🏁 Migrations complete.\n');
  await pool.end();
};

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
runMigrations();
