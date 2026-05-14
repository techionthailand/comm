const express = require('express');
const router  = express.Router();
const pool    = require('../lib/db');
const auth    = require('../middleware/auth');

// GET /api/settings  — readable by all authenticated users
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT key, value FROM settings');
    const out = {};
    rows.forEach(r => { out[r.key] = isNaN(r.value) ? r.value : parseFloat(r.value); });
    res.json(out);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/settings  — admin only
router.put('/', auth, auth.adminOnly, async (req, res) => {
  const { defaultTarget, minMargin, maxRate } = req.body;
  try {
    await pool.query(`
      INSERT INTO settings (key, value) VALUES
        ('defaultTarget', $1), ('minMargin', $2), ('maxRate', $3)
      ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value
    `, [defaultTarget, minMargin, maxRate]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
