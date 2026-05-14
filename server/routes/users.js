const express = require('express');
const router  = express.Router();
const bcrypt  = require('bcrypt');
const pool    = require('../lib/db');
const auth    = require('../middleware/auth');

// All user-management routes require admin
router.use(auth, auth.adminOnly);

// GET /api/users
router.get('/', async (req, res) => {
  try {
    const { rows } = await pool.query(
      'SELECT id, username, name, role, created_at FROM users ORDER BY name'
    );
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/users
router.post('/', async (req, res) => {
  const { username, password, name, role } = req.body;
  if (!username || !password || !name)
    return res.status(400).json({ error: 'username, password, and name are required' });
  try {
    const hashed = await bcrypt.hash(password, 10);
    const { rows } = await pool.query(
      `INSERT INTO users (username, password, name, role)
       VALUES ($1,$2,$3,$4)
       RETURNING id, username, name, role, created_at`,
      [username.trim(), hashed, name.trim(), role || 'viewer']
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/users/:id
router.put('/:id', async (req, res) => {
  const { username, password, name, role } = req.body;
  try {
    let rows;
    if (password) {
      const hashed = await bcrypt.hash(password, 10);
      ({ rows } = await pool.query(
        `UPDATE users SET username=$1, password=$2, name=$3, role=$4
         WHERE id=$5 RETURNING id, username, name, role`,
        [username.trim(), hashed, name.trim(), role, req.params.id]
      ));
    } else {
      ({ rows } = await pool.query(
        `UPDATE users SET username=$1, name=$2, role=$3
         WHERE id=$4 RETURNING id, username, name, role`,
        [username.trim(), name.trim(), role, req.params.id]
      ));
    }
    if (!rows[0]) return res.status(404).json({ error: 'User not found' });
    res.json(rows[0]);
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'Username already exists' });
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/users/:id
router.delete('/:id', async (req, res) => {
  if (parseInt(req.params.id) === req.user.id)
    return res.status(400).json({ error: 'Cannot delete your own account' });
  try {
    const { rowCount } = await pool.query('DELETE FROM users WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'User not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
