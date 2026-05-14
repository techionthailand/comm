-- ══════════════════════════════════════════════
-- TECH ION Commission Platform — Database Schema
-- ══════════════════════════════════════════════

-- Users & roles
CREATE TABLE IF NOT EXISTS users (
  id         SERIAL PRIMARY KEY,
  username   VARCHAR(50)  UNIQUE NOT NULL,
  password   VARCHAR(255) NOT NULL,
  name       VARCHAR(100) NOT NULL,
  role       VARCHAR(20)  NOT NULL DEFAULT 'viewer'
                          CHECK (role IN ('admin','manager','viewer')),
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- Salespeople / Employees
CREATE TABLE IF NOT EXISTS employees (
  id         SERIAL PRIMARY KEY,
  name       VARCHAR(100) NOT NULL,
  color      VARCHAR(10)  DEFAULT '#1a56db',
  target     BIGINT       DEFAULT 40000000,
  created_at TIMESTAMPTZ  DEFAULT NOW()
);

-- Deals
CREATE TABLE IF NOT EXISTS deals (
  id          SERIAL PRIMARY KEY,
  employee_id INT          NOT NULL REFERENCES employees(id) ON DELETE CASCADE,
  month       VARCHAR(20),
  project     VARCHAR(255),
  customer    VARCHAR(255),
  receipt     VARCHAR(100),
  date        DATE,
  sale_price  NUMERIC(15,2),
  gp          NUMERIC(15,2),
  margin_pct  NUMERIC(6,2),
  created_at  TIMESTAMPTZ  DEFAULT NOW()
);

-- Platform settings (key/value)
CREATE TABLE IF NOT EXISTS settings (
  key   VARCHAR(50) PRIMARY KEY,
  value VARCHAR(255) NOT NULL
);

-- ── Default data ─────────────────────────────

INSERT INTO settings (key, value) VALUES
  ('defaultTarget', '40000000'),
  ('minMargin',     '3'),
  ('maxRate',       '10')
ON CONFLICT (key) DO NOTHING;

-- Default employee
INSERT INTO employees (name, color, target) VALUES
  ('Sales', '#1a56db', 40000000)
ON CONFLICT DO NOTHING;

-- ── Seed admin user ───────────────────────────
-- After running `npm install`, generate the real hash with:
--   node -e "require('bcrypt').hash('TechIon@2026',10).then(h=>console.log(h))"
-- Then run this INSERT manually, replacing the hash:
--
-- INSERT INTO users (username, password, name, role) VALUES
--   ('admin', '<BCRYPT_HASH>', 'Administrator', 'admin');
--
-- Or use the setup script:  node server/scripts/seed.js
