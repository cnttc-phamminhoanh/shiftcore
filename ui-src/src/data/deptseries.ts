// EXPORTS: DepartmentFilter, DEPARTMENT_FILTER_OPTIONS, MONTH_LABELS, TIME_RANGE_MONTHS, COMPLETE_DEPARTMENT_TREND, DEPARTMENT_PLAN_RATIO
import {
  MOCK_DEPARTMENT_TREND_DATA,
  type IDepartmentTrendData,
} from '@/data/departmenttrenddata';

export type DataDepartment = 'CUT' | 'SEW' | 'EMB' | 'PRI' | 'FIN' | 'PAC' | 'SOC' | 'OTHER';

export type DepartmentFilter = 'all' | 'other' | Exclude<DataDepartment, 'OTHER'>;

export const DEPARTMENT_FILTER_OPTIONS: { key: DepartmentFilter; label: string }[] = [
  { key: 'all', label: 'All Departments' },
  { key: 'CUT', label: 'CUT' },
  { key: 'SEW', label: 'SEW' },
  { key: 'EMB', label: 'EMB' },
  { key: 'PRI', label: 'PRI' },
  { key: 'FIN', label: 'FIN' },
  { key: 'PAC', label: 'PAC' },
  { key: 'SOC', label: 'SOC' },
  { key: 'other', label: 'Other' },
];

// Departments folded under the "Other" filter chip.
export const OTHER_DEPARTMENTS: DataDepartment[] = ['OTHER'];

export function filterDepartments(selected: DepartmentFilter): DataDepartment[] {
  if (selected === 'all') {
    return ['CUT', 'SEW', 'EMB', 'PRI', 'FIN', 'PAC', 'SOC', 'OTHER'];
  }
  if (selected === 'other') return OTHER_DEPARTMENTS;
  return [selected];
}

export const MONTH_LABELS = ['Month 8', 'Month 9', 'Month 10'];

export const TIME_RANGE_MONTHS: Record<string, number> = {
  '3m': 3,
  '6m': 6,
  '12m': 12,
};

// Illustrative sample data — completes the 7-process monthly hours series
// (the base mock only ships CUT rows). Sums tie to the monthly OT actuals.
const EXTRA_DEPARTMENT_TREND: IDepartmentTrendData[] = [
  { id: '4', month: 'Month 8', department: 'SEW', hours: 820, planHours: 880 },
  { id: '5', month: 'Month 9', department: 'SEW', hours: 930, planHours: 990 },
  { id: '6', month: 'Month 10', department: 'SEW', hours: 1040, planHours: 1100 },
  { id: '7', month: 'Month 8', department: 'EMB', hours: 380, planHours: 410 },
  { id: '8', month: 'Month 9', department: 'EMB', hours: 430, planHours: 460 },
  { id: '9', month: 'Month 10', department: 'EMB', hours: 480, planHours: 510 },
  { id: '10', month: 'Month 8', department: 'PRI', hours: 350, planHours: 380 },
  { id: '11', month: 'Month 9', department: 'PRI', hours: 390, planHours: 420 },
  { id: '12', month: 'Month 10', department: 'PRI', hours: 430, planHours: 460 },
  { id: '13', month: 'Month 8', department: 'FIN', hours: 320, planHours: 350 },
  { id: '14', month: 'Month 9', department: 'FIN', hours: 360, planHours: 390 },
  { id: '15', month: 'Month 10', department: 'FIN', hours: 400, planHours: 430 },
  { id: '16', month: 'Month 8', department: 'OTHER', hours: 270, planHours: 290 },
  { id: '17', month: 'Month 9', department: 'OTHER', hours: 300, planHours: 320 },
  { id: '18', month: 'Month 10', department: 'OTHER', hours: 330, planHours: 350 },
  { id: '19', month: 'Month 8', department: 'PAC', hours: 180, planHours: 200 },
  { id: '20', month: 'Month 9', department: 'PAC', hours: 210, planHours: 230 },
  { id: '21', month: 'Month 10', department: 'PAC', hours: 230, planHours: 250 },
];

export const COMPLETE_DEPARTMENT_TREND: IDepartmentTrendData[] = [
  ...MOCK_DEPARTMENT_TREND_DATA,
  ...EXTRA_DEPARTMENT_TREND,
];

// Plan-to-actual ratio used to derive per-department monthly plans (demo only).
export const DEPARTMENT_PLAN_RATIO: Record<DataDepartment, number> = {
  CUT: 0.93,
  SEW: 0.92,
  EMB: 0.9,
  PRI: 0.9,
  FIN: 0.92,
  PAC: 0.94,
  SOC: 0.94,
  OTHER: 0.95,
};
