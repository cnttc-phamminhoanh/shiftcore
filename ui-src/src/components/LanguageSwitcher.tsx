import { memo } from 'react';
import { Check, ChevronDown, Globe } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { changeAppLanguage, type AppLanguage } from '@/i18n';

// Native names are intentionally NOT translated — every language is always
// listed in its own script so users can find it regardless of the active UI.
const LANGUAGE_OPTIONS: {
  code: AppLanguage;
  nativeName: string;
}[] = [
  { code: 'en', nativeName: 'English' },
  { code: 'vi', nativeName: 'Tiếng Việt' },
  { code: 'zh-CN',  nativeName: '简体中文' },
];

export default memo(function LanguageSwitcher() {
  const { i18n } = useTranslation();
  const current =
    LANGUAGE_OPTIONS.find((option) => option.code === i18n.language) ??
    LANGUAGE_OPTIONS[0];

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          aria-label="Change language"
          className="h-9 gap-1.5 rounded-lg bg-card px-2.5 text-xs font-medium text-foreground"
        >
          <Globe className="size-4 shrink-0 text-muted-foreground" />
          <span className="max-w-[92px] truncate">{current.nativeName}</span>
          <ChevronDown className="size-3.5 shrink-0 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-[168px] rounded-lg">
        {LANGUAGE_OPTIONS.map((option) => (
          <DropdownMenuItem
            key={option.code}
            onClick={() => changeAppLanguage(option.code)}
            className="gap-2 text-xs"
          >
            <span className="flex-1">{option.nativeName}</span>
            {option.code === current.code && (
              <Check className="size-3.5 shrink-0 text-primary" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
});
