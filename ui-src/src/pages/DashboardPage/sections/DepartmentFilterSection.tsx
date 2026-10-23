import { memo } from 'react';
import { LayoutGrid } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import DepartmentBadge, { getDepartmentBadgeMeta } from '@/components/DepartmentBadge';
import { Button } from '@/components/ui/button';
import { DEPARTMENT_FILTER_OPTIONS, type DepartmentFilter } from '@/data/deptseries';

interface DepartmentFilterSectionProps {
  selected: DepartmentFilter;
  onChange: (value: DepartmentFilter) => void;
}

// Chips reuse the unified department identity: pastel tint + colored icon
// when idle, solid department color when active. "All Departments" follows
// the primary navy token.
export default memo(function DepartmentFilterSection({
  selected,
  onChange,
}: DepartmentFilterSectionProps) {
  const { t } = useTranslation();
  return (
    <section className="flex flex-wrap items-center gap-2">
      {DEPARTMENT_FILTER_OPTIONS.map((option) => {
          const isActive = selected === option.key;

          if (option.key === 'all') {
            return (
              <Button
                key={option.key}
                type="button"
                onClick={() => onChange(option.key)}
                className={
                  isActive
                    ? 'gap-2 rounded-full px-3.5 font-semibold text-primary-foreground'
                    : 'gap-2 rounded-full px-3.5 font-semibold'
                }
                variant={isActive ? 'default' : 'outline'}
              >
                <LayoutGrid className="size-[14px] shrink-0" />
                {t('filter.allDepartments')}
              </Button>
            );
          }

          const { color, icon: Icon } = getDepartmentBadgeMeta(option.key);
          // Department codes (CUT/SEW/…) are business identifiers — never
          // translated. Only the aggregated "Other" chip is localized.
          const label = option.key === 'other' ? t('filter.other') : option.label;
          return (
            <Button
              key={option.key}
              type="button"
              variant="outline"
              onClick={() => onChange(option.key)}
              className="gap-2 rounded-full border px-3.5 font-semibold"
              style={
                isActive
                  ? { color: '#FFFFFF', backgroundColor: color, borderColor: color }
                  : { color, backgroundColor: `${color}1A`, borderColor: `${color}40` }
              }
            >
              <Icon className="size-[14px] shrink-0" aria-hidden />
              {label}
            </Button>
          );
        })}
    </section>
  );
});
