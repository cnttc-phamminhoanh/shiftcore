// EXPORTS: IMonthlyData, MOCK_MONTHLY_DATA
export interface IMonthlyData {
  id: string
  month: string
  planOtHours: number
  actualOtHours: number
}

// Illustrative sample data — monthly OT plan vs actual (hours).
// KPI card temporary test values: Plan 3,000h, Actual 6,000h (ratio = 2.0).
// The chart series below keep their original illustrative values.
export const MOCK_MONTHLY_DATA: IMonthlyData[] = [
  {
    id: '1',
    month: 'Month 8',
    planOtHours: 2080,
    actualOtHours: 2880,
  },
  {
    id: '2',
    month: 'Month 9',
    planOtHours: 2160,
    actualOtHours: 3240,
  },
  {
    id: '3',
    month: 'Month 10',
    planOtHours: 2240,
    actualOtHours: 3600,
  },
]
