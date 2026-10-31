// EXPORTS: IKpiData, MOCK_KPI_DATA
export interface IKpiData {
  id: string
  title: string
  value: number
  unit: string
  trend: number
  sparkline: number[]
}

export const MOCK_KPI_DATA: IKpiData[] = [
  {
    id: '1',
    title: 'Worker Count',
    value: 1250,
    unit: 'people',
    trend: 4.2,
    sparkline: [1180, 1200, 1195, 1220, 1240, 1250],
  },
  {
    id: '2',
    title: 'Total OT (Plan)',
    // Temporary demo value: 60,000h vs Actual 185,000h → red warning tier
    // under the default 3-month search window (~93 days; red threshold
    // 60,000 + 1,250 × 93 ≈ 176,250).
    value: 60000,
    unit: 'hours',
    trend: 8.7,
    sparkline: [52000, 54000, 56000, 58000, 59000, 60000],
  },
  {
    id: '3',
    title: 'Actual OT',
    // Temporary demo value: 185,000h vs Plan 60,000h → red warning tier
    // under the default 3-month search window (red threshold ≈ 176,250,
    // i.e. ~1.5h OT per worker per day over the envelope).
    value: 185000,
    unit: 'hours',
    trend: 22.5,
    sparkline: [150000, 158000, 166000, 174000, 180000, 185000],
  },
]