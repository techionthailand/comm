/**
 * Run once after setting up the database:
 *   cd server && node scripts/seed.js
 *
 * Creates the default admin user and initial employee.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
const bcrypt = require('bcrypt');
const pool   = require('../lib/db');

async function seed() {
  console.log('🌱 Seeding database...');

  // Admin user
  const adminHash = await bcrypt.hash('TechIon@2026', 10);
  await pool.query(`
    INSERT INTO users (username, password, name, role)
    VALUES ('admin', $1, 'Administrator', 'admin')
    ON CONFLICT (username) DO NOTHING
  `, [adminHash]);
  console.log('✅ Admin user created  (username: admin / password: TechIon@2026)');

  // Default viewer/manager
  const viewerHash = await bcrypt.hash('View#2026', 10);
  await pool.query(`
    INSERT INTO users (username, password, name, role)
    VALUES ('viewer', $1, 'Viewer', 'manager')
    ON CONFLICT (username) DO NOTHING
  `, [viewerHash]);
  console.log('✅ Viewer user created (username: viewer / password: View#2026)');

  // Default employee
  await pool.query(`
    INSERT INTO employees (name, color, target)
    VALUES ('Sales', '#1a56db', 40000000)
    ON CONFLICT DO NOTHING
  `);
  console.log('✅ Default employee created (Sales)');

  console.log('\n🎉 Seed complete. Change passwords after first login!');
  process.exit(0);
}

seed().catch(err => { console.error('Seed failed:', err); process.exit(1); });
