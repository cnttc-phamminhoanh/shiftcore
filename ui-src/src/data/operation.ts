// EXPORTS: IOperation, MOCK_OPERATIONS
export interface IOperation {
  id: string
  date: string
  department: 'CUT' | 'SEW' | 'EMB' | 'PRI' | 'FIN' | 'OTHER' | 'PAC'
  process: string
  workers: number
  planPcs: number
  planCompletionDate: string
  actualTime: string
  scanTime: string
  status: 'On Track' | 'Delay'
}

export const MOCK_OPERATIONS: IOperation[] = [
  {
    id: '1',
    date: '2025-08-01',
    department: 'CUT',
    process: 'Cutting',
    workers: 12,
    planPcs: 8000,
    planCompletionDate: '2025-08-01',
    actualTime: '7h 45m',
    scanTime: '7h 40m',
    status: 'On Track'
  },
  {
    id: '2',
    date: '2025-08-01',
    department: 'SEW',
    process: 'Assembly',
    workers: 24,
    planPcs: 6500,
    planCompletionDate: '2025-08-01',
    actualTime: '8h 00m',
    scanTime: '8h 35m',
    status: 'Delay'
  },
  {
    id: '3',
    date: '2025-08-02',
    department: 'OTHER',
    process: 'Inspection',
    workers: 8,
    planPcs: 7200,
    planCompletionDate: '2025-08-02',
    actualTime: '6h 30m',
    scanTime: '6h 25m',
    status: 'On Track'
  }
]