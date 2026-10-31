import { Router } from 'express';
import { demoEnabled } from '../config.js';
import { SPIKE_DEPARTMENT_GROUPS } from '../rules/dept-groups.js';
import * as dash from '../services/dashboard.js';
import { addDay } from '../services/hr.js';

const router = Router();

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function parseRange(req, res) {
  const today = new Date();
  const toDefault = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  const from = req.query.from ? String(req.query.from) : addDay(toDefault, -89);
  const to = req.query.to ? String(req.query.to) : toDefault;
  if (!DATE_RE.test(from) || !DATE_RE.test(to) || from > to) {
    res.status(400).json({ error: 'Tham số from/to phải dạng YYYY-MM-DD và from <= to' });
    return null;
  }
  return { from, to };
}

const wrap = (fn) => async (req, res) => {
  try {
    await fn(req, res);
  } catch (err) {
    console.error('[api]', req.method, req.originalUrl, err.message);
    res.status(500).json({ error: `Lỗi máy chủ: ${err.message}` });
  }
};

router.get('/health', (req, res) => {
  res.json({
    ok: true,
    mode: demoEnabled() ? 'demo' : 'real',
    time: new Date().toISOString(),
  });
});

router.get(
  '/departments',
  wrap(async (req, res) => {
    res.json({ groups: SPIKE_DEPARTMENT_GROUPS });
  })
);

router.get(
  '/kpi',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const cards = await dash.buildKpi(range.from, range.to);
    res.json({ from: range.from, to: range.to, cards });
  })
);

router.get(
  '/overtime/summary',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const totals = await dash.buildTotals(range.from, range.to);
    res.json({
      from: range.from,
      to: range.to,
      searchDays: Math.round((new Date(`${range.to}T00:00:00`) - new Date(`${range.from}T00:00:00`)) / 86400000) + 1,
      ...totals,
    });
  })
);

router.get(
  '/overtime/daily',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const deptSet = dash.expandDeptParam(req.query.dept);
    const rows = await dash.buildDailySummary(range.from, range.to, deptSet, { date: req.query.date });
    res.json({ from: range.from, to: range.to, rows });
  })
);

router.get(
  '/overtime/records',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const { rows, total, stats, totals } = await dash.buildRecords(range.from, range.to, {
      dept: req.query.dept,
      process: req.query.process,
      alert: req.query.alert,
      search: req.query.search,
      date: req.query.date,
      heavyOt: req.query.heavyOt,
      status: req.query.status,
      drillDept: req.query.drillDept,
      page: req.query.page,
      pageSize: req.query.pageSize,
      sortBy: req.query.sortBy,
      sortDir: req.query.sortDir,
    });
    res.json({ from: range.from, to: range.to, total, stats, totals, rows });
  })
);

router.get(
  '/overtime/process-rollup',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const { rows } = await dash.buildProcessRollup(range.from, range.to, {
      dept: req.query.dept,
      process: req.query.process,
      alert: req.query.alert,
      date: req.query.date,
    });
    res.json({ from: range.from, to: range.to, rows });
  })
);

router.get(
  '/overtime/monthly',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const rows = await dash.buildMonthly(range.from, range.to);
    res.json({ from: range.from, to: range.to, rows });
  })
);

router.get(
  '/overtime/department-trend',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const rows = await dash.buildDepartmentTrend(range.from, range.to);
    res.json({ from: range.from, to: range.to, rows });
  })
);

router.get(
  '/ot/spike-stats',
  wrap(async (req, res) => {
    const range = parseRange(req, res);
    if (!range) return;
    const deptSet = dash.expandDeptParam(req.query.dept);
    const stats = await dash.buildSpikeStats(range.from, range.to, deptSet);
    res.json({ from: range.from, to: range.to, ...stats });
  })
);

export default router;
