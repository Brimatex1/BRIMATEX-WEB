import { Fragment, useEffect, useState } from 'react';
import { ChevronLeft, CreditCard, ShieldCheck, Store, Truck, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type { HomeSectionKey } from '@/types';

import wave from '../assets/wave-pattern-white.png';
import { TIER_TITLE, displayName, featuredVariant, tierOf, type TierKey } from '../catalog';
import { useTitle } from '../hooks';
import { photoOf, ProductCard } from '../ProductCard';
import { HomeBanners } from '../HomeBanners';
import { clearViewed, readViewed } from '../recent';
import { Link } from '../router';
import { useShop } from '../state';
import { Container, Price, Skeleton } from '../ui';
import { responsivePhoto } from '@/shop/photoSizes';

/**
 * The hero when the panel's banners cannot be read (an older server, no
 * connection): the handoff's campaign, on the mattress it names.
 */
const CAMPAIGN = {
  product: 'بالانس',
  headline: 'بالانس: نوابض ووسادة علوية',
  line: (
    <>
      نوم متوازن كل ليلة، بخمسة مقاسات تبدأ من <bdi dir="ltr">90×190</bdi>.
    </>
  ),
  cta: 'تسوّق بالانس',
};

const PROMISES = [
  { icon: Truck, title: 'توصيل مجاني', body: 'إلى كل المدن. اختر اليوم والفترة عند إتمام الطلب.' },
  { icon: CreditCard, title: 'الدفع عند الاستلام', body: 'نقداً أو بطاقة مصرفية أو حوالة مصرفية.' },
  { icon: ShieldCheck, title: 'ضمان من المصنع', body: 'سجّل ضمانك من حسابك.' },
  { icon: Store, title: 'جرّبها في الصالة', body: 'صالة العرض في حي الأندلس، طرابلس.' },
];

const TILES: { tier: TierKey; line: string; className: string; arrow: string }[] = [
  { tier: 'elite', line: 'كراون وديلوكس: نوابض منفصلة وطبقات فاخرة.', className: 'bg-dark-ocean text-white', arrow: 'bg-white text-dark-ocean' },
  { tier: 'premium', line: 'بالانس وهوتيل وسبورت. نوابض وإسفنج طبي.', className: 'bg-porcelain text-dark-ocean', arrow: 'bg-dark-ocean text-white' },
  { tier: 'comfort', line: 'كلاسيك وكمفورت وديلي. ثلاثة ارتفاعات.', className: 'bg-nebula text-dark-ocean', arrow: 'bg-dark-ocean text-white' },
];

/** The App Store page - not published yet; the phone banner shows once it is. */
const APP_STORE_URL = '';
const APP_BANNER_KEY = 'brimatex:app-banner-closed';

/** The Instagram posts the dashboard sets (GET /api/instagram) - the section hides with none. */
interface InstagramPost {
  id: string;
  imageUrl: string;
  link: string;
}

function useInstagram(): InstagramPost[] {
  const [posts, setPosts] = useState<InstagramPost[]>([]);
  useEffect(() => {
    fetch('/api/instagram')
      .then((r) => (r.ok ? r.json() : { posts: [] }))
      .then((d: { posts?: InstagramPost[] }) => setPosts((d.posts ?? []).slice(0, 5)))
      .catch(() => setPosts([]));
  }, []);
  return posts;
}

function SectionHead({ title, sub, action }: { title: string; sub?: string; action?: React.ReactNode }) {
  return (
    <div className="mb-5 flex items-end justify-between gap-4">
      <div>
        <h2 className="text-[21px] font-bold lg:text-[28px]">{title}</h2>
        {sub ? <p className="text-sm text-muted-foreground">{sub}</p> : null}
      </div>
      {action}
    </div>
  );
}

/**
 * The home's sections, in the order the panel's «ترتيب أقسام الرئيسية» gives
 * before it answers or when it cannot. «العروض» has no section on the
 * website's home yet (the header links /offers); the four promises stay
 * right under the hero.
 */
const DEFAULT_ORDER: HomeSectionKey[] = ['hero', 'offers', 'categories', 'recent', 'bestsellers', 'quiz', 'instagram'];

/**
 * الرئيسية (handoff WebHome; phones WebMobile): the panel's banners, four
 * promises, the three tiers, recently viewed, the best sellers, the quiz
 * banner, the Instagram posts - in the panel's order, and only the sections
 * it has switched on (GET /api/app/v1/config → home).
 */
export function HomePage() {
  const shop = useShop();
  const instagram = useInstagram();
  const [appBanner, setAppBanner] = useState(() => {
    try {
      return Boolean(APP_STORE_URL) && !localStorage.getItem(APP_BANNER_KEY);
    } catch {
      return Boolean(APP_STORE_URL);
    }
  });
  useTitle(null);
  const [recentIds, setRecentIds] = useState<number[]>(readViewed);
  const recent = recentIds.map((id) => shop.products.find((p) => p.id === id)).filter((p): p is NonNullable<typeof p> => Boolean(p));

  const campaign = shop.products.find((p) => displayName(p) === CAMPAIGN.product);
  const campaignTier = campaign ? tierOf(campaign) : null;
  // Most reviewed first - the closest the shop knows to «most ordered» - then the server's order.
  const best = [...shop.products].sort((a, b) => (b.rating?.count ?? 0) - (a.rating?.count ?? 0)).slice(0, 4);
  const order = shop.home ? shop.home.sections.filter((s) => s.on).map((s) => s.key) : DEFAULT_ORDER;

  /* ── The hero: the panel's banners; their space while they are on their way; the campaign without them ── */
  let hero: JSX.Element | null = null;
  if (shop.home === undefined) {
    hero = (
      <Container className="pt-0 lg:pt-7">
        <Skeleton className="-mx-4 h-[480px] lg:mx-0 lg:h-[520px]" />
      </Container>
    );
  } else if (shop.home?.banners.length) {
    hero = (
      <Container className="pt-0 lg:pt-7">
        <div className="-mx-4 lg:mx-0">
          <HomeBanners banners={shop.home.banners} />
        </div>
      </Container>
    );
  } else if (shop.home === null) {
    hero = (
      <Container className="pt-0 lg:pt-7">
        <div className="-mx-4 grid lg:mx-0 lg:grid-cols-[1fr_1.5fr] lg:grid-rows-[520px]">
          <div className="relative order-2 flex flex-col justify-center gap-4 overflow-hidden bg-dark-ocean px-5 py-8 text-white lg:order-1 lg:gap-5 lg:px-12 lg:py-14">
            <img src={wave} alt="" className="absolute inset-0 size-full object-cover opacity-[.12]" />
            {campaignTier ? <span className="relative text-sm font-bold text-porcelain">{TIER_TITLE[campaignTier]}</span> : null}
            <h1 className="relative font-display text-[28px] font-bold leading-[1.15] lg:text-[52px]">{CAMPAIGN.headline}</h1>
            <p className="relative hidden text-lg leading-[1.7] text-nebula lg:block">{CAMPAIGN.line}</p>
            <div className="relative mt-2 flex flex-wrap gap-3">
              {campaign ? (
                <Button asChild variant="inverse" size="store">
                  <Link to={{ name: 'product', id: campaign.id }}>{CAMPAIGN.cta}</Link>
                </Button>
              ) : null}
              <Button asChild variant="inverse-outline" size="store" className="hidden lg:inline-flex">
                <Link to={{ name: 'category', tier: null }}>كل المراتب</Link>
              </Button>
            </div>
          </div>
          <div className="relative order-1 aspect-[4/3] min-w-0 overflow-hidden bg-image-bg lg:order-2 lg:aspect-auto">
            {campaign ? <img {...responsivePhoto(photoOf(campaign), '(min-width: 1024px) 60vw, 100vw')} alt={`مرتبة ${displayName(campaign)}`} className="absolute inset-0 size-full object-cover" /> : <Skeleton className="absolute inset-0" />}
          </div>
        </div>
      </Container>
    );
  }

  const promises = (
    <Container className={cn('hidden gap-6 md:grid md:grid-cols-2 lg:grid-cols-4', hero && 'lg:-mt-4')}>
      {PROMISES.map(({ icon: Icon, title, body }) => (
        <div key={title} className="flex items-start gap-3.5">
          <Icon className="size-7 shrink-0 text-brand-text" strokeWidth={1.8} aria-hidden />
          <div className="flex flex-col gap-1">
            <b className="text-base">{title}</b>
            <span className="text-sm leading-relaxed text-muted-foreground">{body}</span>
          </div>
        </div>
      ))}
    </Container>
  );

  const sections: Record<HomeSectionKey, JSX.Element | null> = {
    hero,
    // No offers row on the website's home yet.
    offers: null,

    categories: (
      <Container>
        <SectionHead title="تسوّق حسب الفئة" />
        <div className="grid gap-2 lg:grid-cols-3 lg:gap-5">
          {TILES.map((t) => (
            <Link
              key={t.tier}
              to={{ name: 'category', tier: t.tier }}
              className={cn('flex h-14 items-center justify-between px-5 lg:h-[200px] lg:flex-col lg:items-stretch lg:p-7', t.className, 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2')}
            >
              <span className="font-display text-xl font-bold lg:text-[30px]">{TIER_TITLE[t.tier]}</span>
              <span className="flex items-end justify-between gap-4">
                <span className="hidden max-w-[260px] text-[15px] leading-relaxed lg:block">{t.line}</span>
                <span className={cn('grid size-8 shrink-0 place-items-center rounded-full lg:size-11', t.arrow)} aria-hidden>
                  <ChevronLeft className="size-4 lg:size-5" />
                </span>
              </span>
            </Link>
          ))}
        </div>
      </Container>
    ),

    // This browser only; hidden when empty.
    recent: recent.length ? (
      <Container>
        <SectionHead
          title="شاهدتها مؤخراً"
          action={
            <button
              type="button"
              className="text-[15px] font-bold underline-offset-4 hover:underline"
              onClick={() => {
                clearViewed();
                setRecentIds([]);
              }}
            >
              مسح السجل
            </button>
          }
        />
        <div className="-mx-4 flex gap-4 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:gap-5 lg:px-0">
          {recent.map((p, i) => (
            <Link
              key={p.id}
              to={{ name: 'product', id: p.id }}
              className={cn('flex w-[150px] shrink-0 flex-col gap-1.5 lg:w-[200px]', i === 0 ? 'animate-rv-in' : 'animate-rv-shift', 'motion-reduce:animate-none')}
            >
              <span className="relative h-[120px] overflow-hidden bg-image-bg lg:h-40">
                <img {...responsivePhoto(photoOf(p), '(min-width: 1024px) 25vw, 50vw')} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" />
              </span>
              <b className="text-[15px]">{displayName(p)}</b>
              <Price amount={featuredVariant(p).price} size="row" className="text-lg" />
            </Link>
          ))}
        </div>
      </Container>
    ) : null,

    bestsellers: (
      <Container>
        <SectionHead
          title="الأكثر طلباً"
          action={
            <Link to={{ name: 'category', tier: null }} className="text-[15px] font-bold underline-offset-4 hover:underline">
              عرض الكل
            </Link>
          }
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
          {shop.loading && best.length === 0
            ? [0, 1, 2, 3].map((i) => (
                <div key={i} className="flex flex-col gap-3">
                  <Skeleton className="aspect-[15/16]" />
                  <Skeleton className="h-4 w-1/2" />
                  <Skeleton className="h-6 w-1/3" />
                </div>
              ))
            : best.map((p) => <ProductCard key={p.id} product={p} />)}
        </div>
      </Container>
    ),

    quiz: (
      <Container>
        <div className="flex flex-col items-start gap-4 bg-nebula px-5 py-6 text-dark-ocean lg:flex-row lg:items-center lg:justify-between lg:px-10 lg:py-8">
          <div className="flex flex-col gap-1">
            <b className="text-lg lg:text-[22px]">لست متأكداً أي مرتبة تناسبك؟</b>
            <span className="text-[15px]">أجب عن أسئلة قصيرة ونقترح لك المرتبة والمقاس.</span>
          </div>
          <Button asChild size="store" className="bg-dark-ocean text-white hover:bg-dark-ocean/90">
            <Link to={{ name: 'quiz' }}>ساعدني أختار</Link>
          </Button>
        </div>
      </Container>
    ),

    // From the panel's «من إنستغرام بريماتكس»; hidden when it has none.
    instagram:
      instagram.length > 0 ? (
        <Container>
          <SectionHead
            title="من إنستغرام بريماتكس"
            sub="آخر منشوراتنا وعروضنا"
            action={
              <a href="https://www.instagram.com/brimatex.ly/" target="_blank" rel="noopener noreferrer" className="text-[15px] font-bold underline-offset-4 hover:underline">
                تابعنا على إنستغرام
              </a>
            }
          />
          <div className="-mx-4 flex snap-x gap-3 overflow-x-auto px-4 [scrollbar-width:none] lg:mx-0 lg:grid lg:grid-cols-5 lg:gap-4 lg:px-0">
            {instagram.map((post) => (
              <a key={post.id} href={post.link} target="_blank" rel="noopener noreferrer" className="aspect-square w-[44vw] shrink-0 snap-start overflow-hidden bg-image-bg lg:w-auto" aria-label="منشور على إنستغرام">
                <img src={post.imageUrl} alt="" loading="lazy" className="size-full object-cover transition-transform duration-slow hover:scale-[1.03]" />
              </a>
            ))}
          </div>
        </Container>
      ) : null,
  };

  // The promises sit under the hero - or open the page when the hero is off.
  const blocks: [string, JSX.Element | null][] = [];
  if (!order.includes('hero')) blocks.push(['promises', promises]);
  for (const key of order) {
    blocks.push([key, sections[key]]);
    if (key === 'hero') blocks.push(['promises', promises]);
  }

  return (
    <div className="flex flex-col gap-7 pb-14 lg:gap-14">
      {blocks.map(([key, block]) => (block ? <Fragment key={key}>{block}</Fragment> : null))}

      {/* ── Phones: the app (once it is on the App Store) ── */}
      {appBanner ? (
        <Container className="md:hidden">
          <div className="flex items-center gap-3 border border-border p-4">
            <span className="flex-1 text-sm font-bold">التطبيق أسرع للطلب والتتبّع</span>
            <a href={APP_STORE_URL} className="text-sm font-bold underline">
              حمّل التطبيق
            </a>
            <button
              type="button"
              aria-label="إخفاء"
              className="relative grid size-9 place-items-center after:absolute after:-inset-1"
              onClick={() => {
                setAppBanner(false);
                try {
                  localStorage.setItem(APP_BANNER_KEY, '1');
                } catch {
                  /* hidden for this visit */
                }
              }}
            >
              <X className="size-4" />
            </button>
          </div>
        </Container>
      ) : null}
    </div>
  );
}
