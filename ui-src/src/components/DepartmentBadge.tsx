import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Box,
  Cog,
  Flower,
  Footprints,
  Package,
  Printer,
  Scissors,
  Shirt,
  type LucideIcon,
} from 'lucide-react';

interface DepartmentBadgeMeta {
  color: string;
  icon: LucideIcon;
  label: string;
}

// Unified department identity: color + icon + label, shared by the filter
// chips, table badges and the by-process rollup table.
// Aliases (PRI/PRN, PAC/PAK) share the same visual identity.
export const DEPARTMENT_BADGE_META: Record<string, DepartmentBadgeMeta> = {
  CUT: { color: '#2563EB', icon: Scissors, label: 'CUT' },
  SEW: { color: '#16A34A', icon: Shirt, label: 'SEW' },
  EMB: { color: '#F97316', icon: Flower, label: 'EMB' },
  PRN: { color: '#9333EA', icon: Printer, label: 'PRN' },
  PRI: { color: '#9333EA', icon: Printer, label: 'PRI' },
  // 31/10/2026: FIN đổi từ hồng-đỏ (#F43F5E) sang teal (#14B8A6) — màu đỏ
  // dễ bị hiểu nhầm là cảnh báo/nguy hiểm (đồng bộ với chart-colors.ts).
  FIN: { color: '#14B8A6', icon: Box, label: 'FIN' },
  OTHER: { color: '#475569', icon: Cog, label: 'Other' },
  PAK: { color: '#06B6D4', icon: Package, label: 'PAK' },
  PAC: { color: '#06B6D4', icon: Package, label: 'PAC' },
  SOC: { color: '#D97706', icon: Footprints, label: 'SOC' },
};

const FALLBACK_META: DepartmentBadgeMeta = {
  color: '#475569',
  icon: Cog,
  label: 'Other',
};

// Process name → department code, so the by-process table can reuse the
// exact same identity (icon + color) as the filter chips and badges.
export const PROCESS_TO_DEPARTMENT: Record<string, string> = {
  Cutting: 'CUT',
  'Sewing Mainline': 'SEW',
  Sewing: 'SEW',
  Embroidery: 'EMB',
  Printing: 'PRI',
  Finishing: 'FIN',
  Inspection: 'OTHER',
  Packing: 'PAK',
};

// Resolves a process name to its department badge identity.
export function getProcessBadgeMeta(processName: string): DepartmentBadgeMeta {
  return getDepartmentBadgeMeta(PROCESS_TO_DEPARTMENT[processName] ?? '');
}

// Resolves any department code to its badge meta; unknown codes fall back
// to the slate "Other" identity but keep their own code as the label.
export function getDepartmentBadgeMeta(departmentCode: string): DepartmentBadgeMeta {
  const meta = DEPARTMENT_BADGE_META[departmentCode];
  if (meta) return meta;
  return { ...FALLBACK_META, label: departmentCode };
}

interface DepartmentBadgeProps {
  departmentCode: string;
}

interface ProcessBadgeProps {
  processName: string;
}

// Pill badge for a process name: pastel background tinted with the parent
// department's color, that department's icon, and the full process name as
// clear text (e.g. "Cutting", "Sewing Mainline", "Inspection").
export function ProcessBadge({ processName }: ProcessBadgeProps) {
  const { color, icon: Icon } = getProcessBadgeMeta(processName);
  return (
    <span
      className="inline-flex h-[26px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold leading-none"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      <Icon className="size-[14px] shrink-0" aria-hidden />
      {processName}
    </span>
  );
}

// Pill badge: pastel background, icon on the left, semibold label,
// 26px tall, fully rounded, consistent across all departments.
export default memo(function DepartmentBadge({ departmentCode }: DepartmentBadgeProps) {
  const { t } = useTranslation();
  const { color, icon: Icon, label } = getDepartmentBadgeMeta(departmentCode);
  // Department codes are business identifiers (never translated); only the
  // aggregated "Other" identity is localized to match the filter chip.
  const displayLabel = departmentCode === 'OTHER' ? t('filter.other') : label;
  return (
    <span
      className="inline-flex h-[26px] shrink-0 items-center justify-center gap-1.5 rounded-full px-3 text-xs font-semibold leading-none"
      style={{ color, backgroundColor: `${color}1A` }}
    >
      <Icon className="size-[14px] shrink-0" aria-hidden />
      {displayLabel}
    </span>
  );
});
