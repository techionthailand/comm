/**
 * Commission engine — same rules as the original platform.
 * marginPct: gross margin percentage (e.g. 7.27 means 7.27%)
 * gp:        gross profit in THB
 */

function calcCommRate(marginPct, minMargin = 3, maxRate = 10) {
  if (parseFloat(marginPct) < parseFloat(minMargin)) return 0;
  return Math.min(parseFloat(marginPct), parseFloat(maxRate));
}

function calcCommAmount(gp, marginPct, minMargin = 3, maxRate = 10) {
  return parseFloat(gp) * (calcCommRate(marginPct, minMargin, maxRate) / 100);
}

module.exports = { calcCommRate, calcCommAmount };
