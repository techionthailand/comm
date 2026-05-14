const express = require('express');
const router  = express.Router();
const pool    = require('../lib/db');
const auth    = require('../middleware/auth');

// GET /api/employees
router.get('/', auth, async (req, res) => {
  try {
    const { rows } = await pool.query('SELECT * FROM employees ORDER BY name');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/employees
router.post('/', auth, auth.canEdit, async (req, res) => {
  const { name, color, target } = req.body;
  if (!name) return res.status(400).json({ error: 'name is required' });
  try {
    const { rows } = await pool.query(
      'INSERT INTO employees (name, color, target) VALUES ($1,$2,$3) RETURNING *',
      [name, color || '#1a56db', target || 40000000]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/employees/:id
router.put('/:id', auth, auth.canEdit, async (req, res) => {
  const { name, color, target } = req.body;
  try {
    const { rows } = await pool.query(
      'UPDATE employees SET name=$1, color=$2, target=$3 WHERE id=$4 RETURNING *',
      [name, color, target, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Employee not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/employees/:id
router.delete('/:id', auth, auth.canEdit, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM employees WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Employee not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
