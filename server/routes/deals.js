const express = require('express');
const router  = express.Router();
const pool    = require('../lib/db');
const auth    = require('../middleware/auth');

// GET /api/deals  — optional ?employeeId=&month=&year=
router.get('/', auth, async (req, res) => {
  try {
    const { employeeId, month, year } = req.query;
    let query = `
      SELECT d.*, e.name AS employee_name
      FROM deals d
      LEFT JOIN employees e ON d.employee_id = e.id
      WHERE 1=1
    `;
    const params = [];
    if (employeeId) { params.push(employeeId); query += ` AND d.employee_id = $${params.length}`; }
    if (month && month !== 'ALL') { params.push(month); query += ` AND d.month = $${params.length}`; }
    if (year)  { params.push(`${year}%`); query += ` AND CAST(d.date AS TEXT) LIKE $${params.length}`; }
    query += ' ORDER BY d.date DESC, d.id DESC';

    const { rows } = await pool.query(query, params);
    res.json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deals
router.post('/', auth, auth.canEdit, async (req, res) => {
  const { employeeId, month, project, customer, receipt, date, salePrice, gp, marginPct } = req.body;
  if (!employeeId || !project || !salePrice)
    return res.status(400).json({ error: 'employeeId, project, and salePrice are required' });
  try {
    const { rows } = await pool.query(
      `INSERT INTO deals (employee_id, month, project, customer, receipt, date, sale_price, gp, margin_pct)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`,
      [employeeId, month, project, customer, receipt, date, salePrice, gp, marginPct]
    );
    res.status(201).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// PUT /api/deals/:id
router.put('/:id', auth, auth.canEdit, async (req, res) => {
  const { employeeId, month, project, customer, receipt, date, salePrice, gp, marginPct } = req.body;
  try {
    const { rows } = await pool.query(
      `UPDATE deals
       SET employee_id=$1, month=$2, project=$3, customer=$4, receipt=$5,
           date=$6, sale_price=$7, gp=$8, margin_pct=$9
       WHERE id=$10 RETURNING *`,
      [employeeId, month, project, customer, receipt, date, salePrice, gp, marginPct, req.params.id]
    );
    if (!rows[0]) return res.status(404).json({ error: 'Deal not found' });
    res.json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// DELETE /api/deals/:id
router.delete('/:id', auth, auth.canEdit, async (req, res) => {
  try {
    const { rowCount } = await pool.query('DELETE FROM deals WHERE id = $1', [req.params.id]);
    if (!rowCount) return res.status(404).json({ error: 'Deal not found' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
