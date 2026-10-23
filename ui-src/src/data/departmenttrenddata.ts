// EXPORTS: IDepartmentTrendData, MOCK_DEPARTMENT_TREND_DATA
export interface IDepartmentTrendData {
  id: string
  month: string
  department: 'CUT' | 'SEW' | 'EMB' | 'PRI' | 'FIN' | 'OTHER' | 'PAC'
  hours: number
}

// Illustrative sample data — monthly overtime hours per process.
// Monthly sums tie to the Monthly Plan vs Actual chart actuals
// (Month 8: 2,880h, Month 9: 3,240h, Month 10: 3,600h).
export const MOCK_DEPARTMENT_TREND_DATA: IDepartmentTrendData[] = [
  { id: '1', month: 'Month 8', department: 'CUT', hours: 560 },
  { id: '2', month: 'Month 9', department: 'CUT', hours: 620 },
  { id: '3', month: 'Month 10', department: 'CUT', hours: 690 },
]
