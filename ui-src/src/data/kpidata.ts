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
    // Temporary demo value: 2,000h vs Actual 4,000h → yellow warning tier
    // under the default 3-day search window (yellow 3,875 / orange 4,812.5).
    value: 2000,
    unit: 'hours',
    trend: 8.7,
    sparkline: [2000, 2200, 2400, 2600, 2800, 2000],
  },
  {
    id: '3',
    title: 'Actual OT',
    // Temporary demo value: 4,000h vs Plan 2,000h → yellow warning tier
    // under the default 3-day search window.
    value: 4000,
    unit: 'hours',
    trend: 10.2,
    sparkline: [2600, 2900, 3200, 3500, 3800, 4000],
  },
]