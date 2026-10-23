// Hook tải toàn bộ dữ liệu dashboard từ /api/* (cùng origin với server).
// Tải lại khi [from, to] đổi; lỗi fetch được giữ lại để UI hiển thị.
import { useEffect, useState } from 'react';

import { api, type DateRange } from '@/lib/api-client';
import type { IDailySummary } from '@/data/dailysummarydata';
import type { IKpiData } from '@/data/kpidata';
import type { IMonthlyData } from '@/data/monthlydata';
import type { IDepartmentTrendData } from '@/data/departmenttrenddata';
import type { IWorkerOtRecord } from '@/data/otrecords';

export interface DashboardData {
  cards: IKpiData[];
  monthly: IMonthlyData[];
  deptTrend: IDepartmentTrendData[];
  daily: IDailySummary[];
  records: IWorkerOtRecord[];
  loading: boolean;
  error: string | null;
}

const INITIAL: DashboardData = {
  cards: [],
  monthly: [],
  deptTrend: [],
  daily: [],
  records: [],
  loading: true,
  error: null,
};

export function useDashboardData(range: DateRange): DashboardData {
  const [state, setState] = useState<DashboardData>(INITIAL);

  useEffect(() => {
    let alive = true;
    setState((s) => ({ ...s, loading: true, error: null }));

    Promise.all([
      api.kpi(range),
      api.monthly(range),
      api.departmentTrend(range),
      api.daily(range, 'all'),
      api.records(range, { dept: 'all' }),
    ])
      .then(([k, m, dt, d, r]) => {
        if (!alive) return;
        setState({
          cards: k.cards,
          monthly: m.rows,
          deptTrend: dt.rows as unknown as IDepartmentTrendData[],
          daily: d.rows,
          records: r.rows,
          loading: false,
          error: null,
        });
      })
      .catch((err: unknown) => {
        if (!alive) return;
        setState((s) => ({
          ...s,
          loading: false,
          error: err instanceof Error ? err.message : String(err),
        }));
      });

    return () => {
      alive = false;
    };
  }, [range.from, range.to]);

  return state;
}
