import { ArrowLeft, BedDouble, Clock, Moon, ShieldCheck, Sparkles, Truck, Wallet } from 'lucide-react';

import { ProductVisual } from '@/components/ProductVisual';
import { Reveal } from '@/components/Reveal';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { formatPrice } from '@/lib/utils';
import type { Category, Product } from '@/types';

/**
 * Trust claims are limited to what BRIMATEX actually offers. Review counts and
 * customer statistics belong here too, but only once there are real ones —
 * inventing them would be false advertising.
 */
const PROMISES = [
  { Icon: Moon, title: 'تجربة 100 ليلة', body: 'جرّبها في بيتك، وأرجعها إن لم تناسبك.' },
  { Icon: ShieldCheck, title: 'ضمان حتى 12 سنة', body: 'ضمان مكتوب على البنية والخامات.' },
  { Icon: Truck, title: 'توصيل مجاني', body: 'إلى باب منزلك دون رسوم إضافية.' },
  { Icon: Wallet, title: 'ادفع عند الاستلام', body: 'لا تدفع ريالاً قبل أن تستلم.' },
];

const CATEGORY_COPY: Record<Category, { title: string; body: string }> = {
  mattress: {
    title: 'المراتب',
    body: 'من الطبية الداعمة إلى الفاخرة متعددة الطبقات — لكل جسم مرتبة تناسبه.',
  },
  pillow: {
    title: 'الوسائد',
    body: 'دعم للرقبة يتشكّل حسب وضعية نومك ويعود لشكله كل صباح.',
  },
  bedding: {
    title: 'المفروشات',
    body: 'أطقم قطن خالص تزداد نعومة مع الغسل.',
  },
};

const CATEGORY_ORDER: Category[] = ['mattress', 'pillow', 'bedding'];

interface HomeSectionProps {
  products: Product[];
  loading: boolean;
  onShopCategory: (category: Category | 'all') => void;
  onOpenProduct: (product: Product) => void;
  onStartQuiz: () => void;
}

export function HomeSection({
  products,
  loading,
  onShopCategory,
  onOpenProduct,
  onStartQuiz,
}: HomeSectionProps) {
  const groups = CATEGORY_ORDER.map((category) => {
    const items = products.filter((p) => p.category === category);
    const from = items.length ? Math.min(...items.map((p) => p.price)) : 0;
    return { category, items, from, ...CATEGORY_COPY[category] };
  }).filter((g) => g.items.length > 0);

  const featured = products.find((p) => p.category === 'mattress') ?? products[0];

  return (
    <div className="animate-fade-up">
      {/* ---------- Hero ---------- */}
      <section className="border-b bg-secondary/40">
        <div className="container grid items-center gap-10 py-14 md:grid-cols-2 md:py-20">
          <div>
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-accent">
              مجموعة 2026
            </p>
            <h1 className="font-heading text-4xl font-semibold leading-[1.15] tracking-tight text-primary sm:text-5xl lg:text-6xl">
              نوم أعمق يبدأ من مرتبة مصنوعة بعناية
            </h1>
            <p className="mt-5 max-w-[52ch] text-lg text-muted-foreground">
              مراتب مصمّمة ومختبَرة لتناسب طريقة نومك. اطلب مباشرة دون تسجيل،
              وجرّبها 100 ليلة في بيتك، وادفع عند الاستلام.
            </p>

            <div className="mt-8 flex flex-wrap gap-3">
              <Button size="lg" onClick={() => onShopCategory('mattress')}>
                تسوّق المراتب
              </Button>
              <Button size="lg" variant="outline" onClick={onStartQuiz}>
                <Sparkles aria-hidden="true" />
                ساعدني أختار
              </Button>
            </div>

            <p className="mt-5 text-sm text-muted-foreground">
              لا تعرف أي مرتبة تناسبك؟ أجب عن أربعة أسئلة ونرشّح لك واحدة.
            </p>
          </div>

          {featured && (
            <div className="relative">
              <ProductVisual product={featured} variant="hero" className="shadow-2xl" />
              <div className="absolute bottom-4 rounded-xl border bg-card/95 p-4 shadow-lg backdrop-blur start-4">
                <p className="text-xs text-muted-foreground">يبدأ من</p>
                <p className="font-heading text-2xl font-semibold tabular text-primary">
                  {formatPrice(Math.min(...products.map((p) => p.price)))}
                  <span className="ms-1 text-sm font-normal text-muted-foreground">ر.س</span>
                </p>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* ---------- Promises ---------- */}
      <section className="border-b">
        <div className="container grid gap-8 py-12 sm:grid-cols-2 lg:grid-cols-4">
          {PROMISES.map(({ Icon, title, body }, i) => (
            <Reveal key={title} delay={i * 80}>
              <div className="group/promise mb-3 grid size-11 place-items-center rounded-full bg-accent/15 text-accent motion-safe:transition-transform motion-safe:duration-300 hover:scale-110">
                <Icon className="size-5" aria-hidden="true" />
              </div>
              <h2 className="font-heading text-lg font-semibold text-primary">{title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{body}</p>
            </Reveal>
          ))}
        </div>
      </section>

      {/* ---------- Quiz ---------- */}
      <section className="border-b bg-primary text-primary-foreground">
        <div className="container flex flex-wrap items-center justify-between gap-6 py-12">
          <div className="max-w-[54ch]">
            <h2 className="font-heading text-3xl font-semibold">ما الذي يقلق نومك؟</h2>
            <p className="mt-2 text-primary-foreground/80">
              ألم في الظهر، حرارة أثناء النوم، أو شريك كثير الحركة — أجب عن أربعة
              أسئلة سريعة ونرشّح لك المرتبة الأنسب من المجموعة.
            </p>
          </div>
          <Button size="lg" variant="secondary" onClick={onStartQuiz}>
            ابدأ الاختبار
            <ArrowLeft aria-hidden="true" />
          </Button>
        </div>
      </section>

      {/* ---------- Categories ---------- */}
      <section className="container py-14">
        <h2 className="font-heading text-3xl font-semibold text-primary">تصفّح المجموعة</h2>
        <p className="mt-2 text-muted-foreground">كل ما تحتاجه غرفة نومك.</p>

        {loading ? (
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {[0, 1, 2].map((i) => (
              <div key={i} className="h-72 animate-pulse rounded-xl bg-muted" />
            ))}
          </div>
        ) : (
          <div className="mt-8 grid gap-8 md:grid-cols-3">
            {groups.map((group, i) => (
              <Reveal key={group.category} delay={i * 90} className="flex">
              <Card className="group/cat flex flex-1 flex-col overflow-hidden motion-safe:transition-shadow motion-safe:duration-300 hover:shadow-xl">
                <ProductVisual
                  product={group.items[0]}
                  className="rounded-none motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover/cat:scale-[1.04]"
                />
                <CardContent className="flex flex-1 flex-col pt-6">
                  <h3 className="font-heading text-2xl font-semibold text-primary">
                    {group.title}
                  </h3>
                  <p className="mt-2 flex-1 text-sm text-muted-foreground">{group.body}</p>
                  <p className="mt-4 text-sm text-muted-foreground">
                    يبدأ من{' '}
                    <span className="font-heading text-xl font-semibold tabular text-primary">
                      {formatPrice(group.from)}
                    </span>{' '}
                    ر.س
                  </p>
                  <Button
                    variant="outline"
                    className="mt-5 w-full"
                    onClick={() => onShopCategory(group.category)}
                  >
                    تصفّح {group.title}
                  </Button>
                </CardContent>
              </Card>
              </Reveal>
            ))}
          </div>
        )}
      </section>

      {/* ---------- Best sellers ---------- */}
      {!loading && products.length > 0 && (
        <section className="border-t bg-secondary/30">
          <div className="container py-14">
            <div className="flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-heading text-3xl font-semibold text-primary">
                  المراتب الأكثر طلباً
                </h2>
                <p className="mt-2 text-muted-foreground">اختيارات عملائنا الأكثر شيوعاً.</p>
              </div>
              <Button variant="ghost" onClick={() => onShopCategory('all')}>
                عرض الكل
                <ArrowLeft aria-hidden="true" />
              </Button>
            </div>

            <div className="mt-8 grid gap-8 sm:grid-cols-2 lg:grid-cols-4">
              {products
                .filter((p) => p.category === 'mattress')
                .slice(0, 4)
                .map((product, i) => (
                  <Reveal key={product.id} delay={i * 70}>
                  <button
                    type="button"
                    onClick={() => onOpenProduct(product)}
                    className="group w-full rounded-xl text-start focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <div className="overflow-hidden rounded-xl">
                      <ProductVisual
                        product={product}
                        className="motion-safe:transition-transform motion-safe:duration-500 motion-safe:group-hover:scale-[1.05]"
                      />
                    </div>
                    <h3 className="mt-4 font-semibold text-primary group-hover:text-accent">
                      {product.name}
                    </h3>
                    {product.size?.label && (
                      <p className="mt-1 text-xs text-muted-foreground">{product.size.label}</p>
                    )}
                    <p className="mt-2">
                      <span className="font-heading text-xl font-semibold tabular text-primary">
                        {formatPrice(product.price)}
                      </span>
                      <span className="ms-1 text-sm text-muted-foreground">ر.س</span>
                    </p>
                  </button>
                  </Reveal>
                ))}
            </div>
          </div>
        </section>
      )}

      {/* ---------- Closing ---------- */}
      <section className="container py-16 text-center">
        <BedDouble className="mx-auto mb-4 size-10 text-accent" aria-hidden="true" />
        <h2 className="font-heading text-3xl font-semibold text-primary">
          جرّبها 100 ليلة في بيتك
        </h2>
        <p className="mx-auto mt-3 max-w-[56ch] text-muted-foreground">
          المرتبة لا تُجرَّب في دقيقتين داخل معرض. خذها إلى بيتك، ونم عليها مئة
          ليلة — وإن لم تناسبك أرجعها.
        </p>
        <div className="mt-7 flex flex-wrap justify-center gap-3">
          <Button size="lg" onClick={() => onShopCategory('mattress')}>
            تسوّق المراتب
          </Button>
          <Button size="lg" variant="outline" onClick={onStartQuiz}>
            <Clock aria-hidden="true" />
            اختبار دقيقتين
          </Button>
        </div>
      </section>
    </div>
  );
}
