import { useEffect, useMemo, useState } from 'react';
import { ArrowLeft, Factory, Gift, HandCoins, ShieldCheck, Sparkles, Truck } from 'lucide-react';

import { ProductCard, ProductCardSkeleton, ProductImage } from '@/components/store/ProductCard';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Carousel, CarouselContent, CarouselItem, CarouselNext, CarouselPrevious, type CarouselApi } from '@/components/ui/carousel';
import { api } from '@/lib/api';
import { QUESTIONS } from '@/lib/mattressQuiz';
import { tiersOf } from '@/lib/tiers';
import { cn } from '@/lib/utils';
import type { Banner, Perks, Product, SectionId, User } from '@/types';

/** The tier cards' columns by how many tiers there are - whole strings, so Tailwind sees them. */
const TIER_COLUMNS: Record<number, string> = {
  1: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  2: 'grid-cols-2',
  3: 'grid-cols-3',
};

interface HomePageProps {
  user: User | null;
  products: Product[];
  loading: boolean;
  error: string | null;
  onReload: () => void;
  isSaved: (productId: number) => boolean;
  wishlistPending: number | null;
  onOpen: (product: Product) => void;
  onToggleWishlist: (product: Product) => void;
  onNavigate: (section: SectionId) => void;
  onOpenTier: (key: string) => void;
  /** Follows a banner's link - a path inside the shop. */
  onOpenLink: (path: string) => void;
  perks: Perks | null;
}

const PROMISES = [
  { Icon: HandCoins, title: 'الدفع عند الاستلام', body: 'لا تدفع شيئاً قبل أن تستلم' },
  { Icon: Truck, title: 'توصيل مجاني', body: 'لباب بيتك' },
  { Icon: ShieldCheck, title: 'ضمان المصنع', body: 'حتى 10 سنوات لبعض المنتجات' },
  { Icon: Factory, title: 'صناعة ليبية', body: 'من مصنعنا مباشرة' },
];

const SEEN_KEY = 'brimatex:rewards:seen';
function readSeen(): string[] {
  try {
    return JSON.parse(localStorage.getItem(SEEN_KEY) || '[]');
  } catch {
    return [];
  }
}
function writeSeen(codes: string[]) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify(codes));
  } catch {
    /* storage blocked - the notice simply shows again */
  }
}

/** How long a banner stays before the next slides in. */
const BANNER_MS = 5000;

/** The dashboard's banners as the page's hero - shadcn's Carousel, sliding by itself. */
function BannerHero({ banners, onOpenLink }: { banners: Banner[]; onOpenLink: (path: string) => void }) {
  const [carousel, setCarousel] = useState<CarouselApi>();
  const [index, setIndex] = useState(0);

  useEffect(() => {
    if (!carousel) return;
    const onSelect = () => setIndex(carousel.selectedScrollSnap());
    carousel.on('select', onSelect);
    const still = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    const timer = still || banners.length < 2 ? 0 : window.setInterval(() => carousel.scrollNext(), BANNER_MS);
    return () => {
      carousel.off('select', onSelect);
      if (timer) window.clearInterval(timer);
    };
  }, [carousel, banners.length]);

  return (
    <Carousel setApi={setCarousel} opts={{ direction: 'rtl', loop: true }} className="group" aria-label="إعلانات">
      <CarouselContent>
        {banners.map((b, i) => {
          const picture = (
            <img
              src={b.imageUrl}
              alt=""
              className="aspect-video w-full rounded-xl object-cover md:aspect-[21/9]"
              loading={i === 0 ? 'eager' : 'lazy'}
              draggable={false}
            />
          );
          return (
            <CarouselItem key={b.id} aria-roledescription="slide" aria-label={`${i + 1} من ${banners.length}`}>
              {b.link ? (
                <button type="button" onClick={() => onOpenLink(b.link)} className="block w-full" aria-label={`إعلان ${i + 1}`}>
                  {picture}
                </button>
              ) : (
                picture
              )}
            </CarouselItem>
          );
        })}
      </CarouselContent>
      {banners.length > 1 && (
        <>
          <CarouselPrevious className="start-3 hidden opacity-0 transition-opacity group-hover:opacity-100 md:inline-flex" />
          <CarouselNext className="end-3 hidden opacity-0 transition-opacity group-hover:opacity-100 md:inline-flex" />
          <div className="absolute inset-x-0 bottom-3 flex justify-center gap-1.5">
            {banners.map((b, i) => (
              <button
                key={b.id}
                type="button"
                onClick={() => carousel?.scrollTo(i)}
                aria-label={`الإعلان ${i + 1}`}
                aria-current={i === index}
                className={cn('h-2 rounded-full bg-white/60 shadow transition-all', i === index ? 'w-5 bg-white' : 'w-2')}
              />
            ))}
          </div>
        </>
      )}
    </Carousel>
  );
}

/** With no banners: the shop's own hero. */
function TextHero({ onNavigate }: { onNavigate: (section: SectionId) => void }) {
  return (
    <div className="relative overflow-hidden rounded-xl bg-primary px-6 py-14 text-primary-foreground md:px-12 md:py-20">
      <div className="absolute -end-20 -top-20 size-72 rounded-full bg-white/5" aria-hidden="true" />
      <div className="absolute -bottom-24 end-40 size-56 rounded-full bg-accent/10" aria-hidden="true" />
      <div className="relative max-w-xl space-y-5">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1 text-xs font-medium">
          <Sparkles className="size-3.5" aria-hidden="true" /> صناعة ليبية
        </p>
        <h2 className="text-3xl font-bold leading-tight md:text-5xl">مراتب تريح ظهرك، من مصنعنا لبيتك</h2>
        <p className="text-base text-primary-foreground/80 md:text-lg">اختار مرتبتك، وادفع لما توصلك. التوصيل مجاني.</p>
        <div className="flex flex-wrap gap-3">
          <Button size="lg" variant="accent" onClick={() => onNavigate('shop')}>
            تسوّق المراتب
          </Button>
          <Button
            size="lg"
            variant="outline"
            className="border-white/30 bg-transparent text-primary-foreground hover:bg-white/10 hover:text-primary-foreground"
            onClick={() => onNavigate('quiz')}
          >
            ساعدني أختار
          </Button>
        </div>
      </div>
    </div>
  );
}

function SectionHeading({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <h2 className="text-xl font-bold tracking-tight md:text-2xl">{title}</h2>
      {action && onAction && (
        <Button variant="ghost" size="sm" onClick={onAction} className="gap-1 text-primary">
          {action}
          <ArrowLeft />
        </Button>
      )}
    </div>
  );
}

/**
 * Home: the hero (the dashboard's banners, or the shop's own), the shop's
 * promises, a reward just earned, the tiers, the newest mattresses and the
 * quiz.
 */
export function HomePage({
  user,
  products,
  loading,
  error,
  onReload,
  isSaved,
  wishlistPending,
  onOpen,
  onToggleWishlist,
  onNavigate,
  onOpenTier,
  onOpenLink,
  perks,
}: HomePageProps) {
  const [banners, setBanners] = useState<Banner[]>([]);
  useEffect(() => {
    api
      .getBanners()
      .then((r) => setBanners(r.banners))
      .catch(() => {});
  }, []);

  const [seen, setSeen] = useState<string[]>(readSeen);
  const newReward =
    perks?.vouchers.find(
      (v) => v.unit === '%' && v.state === 'active' && !seen.includes(v.code) && Date.now() - new Date(v.unlockedAt).getTime() < 14 * 86_400_000
    ) ?? null;

  const tiers = useMemo(() => tiersOf(products), [products]);
  const newest = useMemo(() => [...products].sort((a, b) => b.id - a.id).slice(0, 6), [products]);
  const firstName = user?.name?.trim().split(/\s+/)[0];

  return (
    <div className="mx-auto max-w-7xl space-y-14 px-4 py-6 md:px-6 md:py-10">
      <section className="space-y-4">
        <h1 className="sr-only">بريماتكس — مراتب صناعة ليبية</h1>
        {firstName && <p className="text-lg font-semibold">مرحباً، {firstName} 👋</p>}
        {banners.length > 0 ? <BannerHero banners={banners} onOpenLink={onOpenLink} /> : <TextHero onNavigate={onNavigate} />}
      </section>

      {/* ── The shop's promises ── */}
      <section aria-label="لماذا بريماتكس" className="-mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {PROMISES.map(({ Icon, title, body }) => (
          <div key={title} className="flex flex-col items-center gap-2 rounded-lg border bg-card p-4 text-center md:flex-row md:gap-3 md:text-start">
            <span className="grid size-10 shrink-0 place-items-center rounded-full bg-secondary text-secondary-foreground">
              <Icon className="size-5" aria-hidden="true" />
            </span>
            <span>
              <span className="block text-sm font-semibold">{title}</span>
              <span className="block text-xs text-muted-foreground">{body}</span>
            </span>
          </div>
        ))}
      </section>

      {/* ── A reward just earned: shown once, then it lives under vouchers ── */}
      {newReward && (
        <Card className="border-primary/20 bg-secondary/40">
          <CardContent className="flex flex-col items-start gap-4 p-5 sm:flex-row sm:items-center">
            <span className="grid size-12 shrink-0 place-items-center rounded-full bg-primary text-primary-foreground">
              <Gift className="size-6" aria-hidden="true" />
            </span>
            <div className="flex-1">
              <p className="font-semibold">حصلت على مكافأة: {newReward.title}</p>
              <p className="text-sm text-muted-foreground">{newReward.body}</p>
            </div>
            <Button
              onClick={() => {
                const next = [...seen, newReward.code];
                setSeen(next);
                writeSeen(next);
                onNavigate('vouchers');
              }}
            >
              اعرض قسيمتي
            </Button>
          </CardContent>
        </Card>
      )}

      {/* ── The tiers ── */}
      {tiers.length > 0 && (
        <section>
          <SectionHeading title="تسوّق حسب الفئة" />
          {/* One row, as many columns as tiers: a leftover empty cell (or a tier
              alone on the last row, on a phone) looked broken */}
          <div className={cn('grid gap-3 md:gap-4', TIER_COLUMNS[tiers.length] ?? 'grid-cols-2 lg:grid-cols-4')}>
            {tiers.map(({ tier, items }) => (
              <a
                key={tier.key}
                href={`/shop?category=${encodeURIComponent(tier.key)}`}
                onClick={(e) => {
                  if (e.button !== 0 || e.metaKey || e.ctrlKey) return;
                  e.preventDefault();
                  onOpenTier(tier.key);
                }}
                className="group rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Card className="overflow-hidden transition-shadow group-hover:shadow-md">
                  <ProductImage product={items[0]} className="aspect-[4/3] transition-transform duration-300 group-hover:scale-[1.03]" />
                  <CardContent className="flex items-center justify-between gap-1 p-3 md:p-4">
                    <span className="min-w-0">
                      <span className="block text-sm font-semibold md:text-base">مراتب {tier.name}</span>
                      <span className="text-xs text-muted-foreground">{items.length} {items.length === 1 ? 'مرتبة' : 'مراتب'}</span>
                    </span>
                    <ArrowLeft className="hidden size-4 shrink-0 text-muted-foreground transition-transform group-hover:-translate-x-1 sm:block" aria-hidden="true" />
                  </CardContent>
                </Card>
              </a>
            ))}
          </div>
        </section>
      )}

      {/* ── The newest mattresses ── */}
      <section>
        <SectionHeading title="وصل حديثاً" action="عرض الكل" onAction={() => onNavigate('shop')} />
        {error ? (
          <Card className="p-8 text-center">
            <p className="font-semibold">تعذّر تحميل المراتب</p>
            <p className="mt-1 text-sm text-muted-foreground">{error}</p>
            <Button variant="outline" className="mt-4" onClick={onReload}>
              إعادة المحاولة
            </Button>
          </Card>
        ) : (
          // Two columns on a phone, three from a tablet up: six mattresses fill
          // whole rows at every width, where four columns left two on the last.
          <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
            {loading
              ? [0, 1, 2].map((i) => <ProductCardSkeleton key={i} />)
              : newest.map((p) => (
                  <ProductCard
                    key={p.id}
                    product={p}
                    saved={isSaved(p.id)}
                    wishlistPending={wishlistPending === p.id}
                    onOpen={onOpen}
                    onToggleWishlist={onToggleWishlist}
                  />
                ))}
          </div>
        )}
      </section>

      {/* ── The quiz ── */}
      <section>
        <Card className="overflow-hidden border-0 bg-secondary">
          <CardContent className="flex flex-col items-start gap-5 p-8 md:flex-row md:items-center md:justify-between md:p-10">
            <div className="space-y-2">
              <h2 className="text-2xl font-bold text-secondary-foreground">مش متأكد شن تختار؟</h2>
              <p className="text-secondary-foreground/80">
                {QUESTIONS.length} أسئلة بسيطة على نومك، ونقترح عليك المرتبة الأقرب ليك.
              </p>
            </div>
            <Button size="lg" onClick={() => onNavigate('quiz')}>
              ابدأ الاختبار
            </Button>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
