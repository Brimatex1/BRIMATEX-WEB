import { Link, type Route } from './router';
import { Container, Logo } from './ui';

/** Brimatex's Instagram (from the owner, 2 Oct 2026). */
const INSTAGRAM = 'https://www.instagram.com/brimatex.ly/';

const COLUMNS: { title: string; links: { label: string; to?: Route; href?: string }[] }[] = [
  {
    title: 'تسوّق',
    links: [
      { label: 'مراتب إليت', to: { name: 'category', tier: 'elite' } },
      { label: 'مراتب بريميوم', to: { name: 'category', tier: 'premium' } },
      { label: 'مراتب كمفورت', to: { name: 'category', tier: 'comfort' } },
      { label: 'العروض', to: { name: 'offers' } },
    ],
  },
  {
    title: 'مساعدة',
    links: [
      { label: 'تتبّع طلبك', to: { name: 'account', section: 'orders' } },
      { label: 'الضمان', to: { name: 'account', section: 'warranty' } },
      { label: 'التوصيل', to: { name: 'help' } },
      { label: 'تواصل معنا', to: { name: 'help' } },
    ],
  },
  {
    title: 'بريماتكس',
    links: [
      { label: 'صالة العرض · حي الأندلس', to: { name: 'showroom' } },
      ...(INSTAGRAM ? [{ label: 'إنستغرام', href: INSTAGRAM }] : []),
      { label: 'سياسة الخصوصية', to: { name: 'legal', page: 'privacy' } },
      { label: 'الشروط والأحكام', to: { name: 'legal', page: 'terms' } },
    ],
  },
];

function FooterLink({ label, to, href }: { label: string; to?: Route; href?: string }) {
  const cls = 'text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4';
  if (href) {
    return (
      <a href={href} target="_blank" rel="noopener noreferrer" className={cls}>
        {label}
      </a>
    );
  }
  return (
    <Link to={to!} className={cls}>
      {label}
    </Link>
  );
}

/** The logo and one line, three columns, then the copyright line (handoff WebHome; phones: WebMobile). */
export function Footer({ slim = false }: { slim?: boolean }) {
  if (slim) {
    return (
      <footer className="mt-auto border-t border-border bg-image-bg">
        <Container className="flex flex-wrap items-center justify-between gap-3 py-5 text-[13px] text-text-tertiary">
          <span>© بريماتكس لصناعة الإسفنج والمراتب</span>
          <span className="flex gap-4">
            <FooterLink label="سياسة الخصوصية" to={{ name: 'legal', page: 'privacy' }} />
            <FooterLink label="الشروط والأحكام" to={{ name: 'legal', page: 'terms' }} />
          </span>
        </Container>
      </footer>
    );
  }
  return (
    <footer className="mt-auto bg-image-bg">
      <Container className="flex flex-col gap-8 pb-8 pt-12">
        <div className="grid gap-10 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
          <div className="flex flex-col gap-3.5">
            <Logo className="h-11" />
            <p className="text-sm leading-relaxed text-muted-foreground">مراتب من مصنعنا في القره بوللي إلى منزلك مباشرة.</p>
          </div>
          {COLUMNS.map((col) => (
            <nav key={col.title} aria-label={col.title} className="hidden flex-col gap-2.5 md:flex">
              <b className="text-[15px]">{col.title}</b>
              {col.links.map((l) => (
                <FooterLink key={l.label} {...l} />
              ))}
            </nav>
          ))}
          {/* Phones: two short lines instead of three columns (WebMobile). */}
          <div className="flex flex-col gap-2 text-sm md:hidden">
            <p className="flex flex-wrap gap-x-1.5">
              <FooterLink label="تتبّع طلبك" to={{ name: 'account', section: 'orders' }} /> · <FooterLink label="الضمان" to={{ name: 'account', section: 'warranty' }} /> ·{' '}
              <FooterLink label="تواصل معنا" to={{ name: 'help' }} />
            </p>
            <p className="flex flex-wrap gap-x-1.5">
              <FooterLink label="سياسة الخصوصية" to={{ name: 'legal', page: 'privacy' }} /> · <FooterLink label="الشروط والأحكام" to={{ name: 'legal', page: 'terms' }} />
            </p>
          </div>
        </div>
        <div className="flex flex-wrap justify-between gap-3 border-t border-border pt-[18px] text-[13px] text-text-tertiary">
          <span>© بريماتكس لصناعة الإسفنج والمراتب</span>
          <span>حمّل التطبيق على App Store</span>
        </div>
      </Container>
    </footer>
  );
}
