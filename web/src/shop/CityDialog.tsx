import { useEffect, useState } from 'react';
import { Check, Search } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

import { useShop } from './state';

/** The cities the shop delivers to - the iOS app's list (brimatex-ios/src/state/city.ts), busiest first. */
export const CITIES = [
  'طرابلس',
  'بنغازي',
  'مصراتة',
  'الزاوية',
  'زليتن',
  'الخمس',
  'سبها',
  'البيضاء',
  'درنة',
  'طبرق',
  'اجدابيا',
  'سرت',
  'غريان',
  'صبراتة',
  'ترهونة',
  'تاجوراء',
  'جنزور',
  'المرج',
  'بني وليد',
  'نالوت',
];

/**
 * إلى أين نوصل طلبك؟ (handoff WebCity) - on the first visit and from
 * «التوصيل إلى» in the top strip. A city not on the list can be typed in.
 */
export function CityDialog() {
  const shop = useShop();
  const [chosen, setChosen] = useState(shop.city ?? CITIES[0]);
  const [query, setQuery] = useState('');
  useEffect(() => {
    if (shop.cityDialogOpen) {
      setChosen(shop.city ?? CITIES[0]);
      setQuery('');
    }
  }, [shop.cityDialogOpen, shop.city]);

  const q = query.trim();
  const list = CITIES.filter((c) => !q || c.includes(q));
  const typed = q && !CITIES.includes(q) ? q : null;

  function save() {
    shop.setCity(chosen);
    shop.setCityDialogOpen(false);
  }

  return (
    <Dialog open={shop.cityDialogOpen} onOpenChange={shop.setCityDialogOpen}>
      <DialogContent className="flex max-h-[85svh] max-w-[480px] flex-col gap-4">
        <DialogTitle className="text-xl font-bold">إلى أين نوصل طلبك؟</DialogTitle>
        <DialogDescription className="text-[15px]">نعرض لك التوصيل ومواعيده حسب مدينتك، ويمكنك تغييرها في أي وقت من أعلى الصفحة.</DialogDescription>
        <label className="flex h-12 items-center gap-3 rounded-full bg-image-bg px-5 focus-within:ring-2 focus-within:ring-ring">
          <Search className="size-5 text-muted-foreground" aria-hidden />
          <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="ابحث عن مدينتك" aria-label="ابحث عن مدينتك" className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-text-tertiary" />
        </label>
        <div role="radiogroup" aria-label="المدينة" className="-mx-1 min-h-0 flex-1 overflow-y-auto px-1">
          {[...list, ...(typed ? [typed] : [])].map((c) => (
            <button
              key={c}
              type="button"
              role="radio"
              aria-checked={chosen === c}
              onClick={() => setChosen(c)}
              className={cn('flex w-full items-center justify-between border-b border-border py-3.5 text-start text-[15px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring', chosen === c && 'font-bold')}
            >
              <span>
                {c}
                {c === typed ? <span className="ms-2 text-[13px] font-normal text-muted-foreground">مدينة غير موجودة في القائمة</span> : null}
              </span>
              {chosen === c ? <Check className="size-5 text-brand-text" /> : null}
            </button>
          ))}
        </div>
        <Button size="store" onClick={save}>
          متابعة
        </Button>
      </DialogContent>
    </Dialog>
  );
}
