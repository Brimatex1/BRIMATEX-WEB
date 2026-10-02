import { useEffect, type MouseEvent } from 'react';

import { cn } from '@/lib/utils';

import { useTitle } from '../hooks';
import { LEGAL, type LegalPageKey, type LegalText } from '../legal';
import { Link } from '../router';
import { Container } from '../ui';
import { Breadcrumb } from './CategoryPage';

const PAGES: LegalPageKey[] = ['privacy', 'terms'];

/** Smooth unless the visitor asked for less motion. */
function scrollToSection(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  el.scrollIntoView({ behavior: reduce ? 'auto' : 'smooth', block: 'start' });
}

function Paragraph({ parts }: { parts: LegalText[] }) {
  return (
    <p className="text-[15px] leading-[1.9] lg:text-base">
      {parts.map((part, i) =>
        typeof part === 'string' ? (
          part
        ) : part.href ? (
          <a key={i} href={part.href} className="text-brand-text underline-offset-4 hover:underline">
            <bdi dir="ltr">{part.ltr}</bdi>
          </a>
        ) : (
          <bdi key={i} dir="ltr">
            {part.ltr}
          </bdi>
        )
      )}
    </p>
  );
}

/**
 * سياسة الخصوصية / الشروط والأحكام (handoff WebPrivacy, WebTerms): a sidebar
 * that switches between the two and lists the page's sections, then the text.
 * The text is a draft (../legal.ts) - Brimatex approves the final wording.
 */
export function LegalPage({ page }: { page: LegalPageKey }) {
  const doc = LEGAL[page];
  useTitle(doc.title);

  // Opened at /privacy#cookies: go to that section once it is on the page.
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) scrollToSection(id);
  }, [page]);

  function jump(e: MouseEvent<HTMLAnchorElement>, id: string) {
    e.preventDefault();
    window.history.replaceState(null, '', `#${id}`);
    scrollToSection(id);
  }

  return (
    <Container className="pb-16 lg:pb-24">
      <Breadcrumb items={[{ label: doc.title }]} />
      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)] lg:gap-16">
        <aside className="flex flex-col gap-1 lg:sticky lg:top-40 lg:self-start">
          <nav aria-label="الصفحات القانونية" className="flex gap-2 lg:flex-col lg:gap-1">
            {PAGES.map((key) => (
              <Link
                key={key}
                to={{ name: 'legal', page: key }}
                aria-current={key === page ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center rounded-lg px-4 text-[15px] lg:h-12',
                  key === page ? 'bg-image-bg font-bold' : 'border border-border font-medium hover:bg-image-bg lg:border-0'
                )}
              >
                {LEGAL[key].title}
              </Link>
            ))}
          </nav>
          {/* The page's sections: a sidebar on desktop; phones just scroll. */}
          <nav aria-label="في هذه الصفحة" className="hidden flex-col lg:flex">
            <span className="my-3 border-t border-border" aria-hidden />
            <b className="px-4 pb-1.5 text-[13px] text-text-tertiary">في هذه الصفحة</b>
            {doc.sections.map((s) => (
              <a key={s.id} href={`#${s.id}`} onClick={(e) => jump(e, s.id)} className="px-4 py-1.5 text-sm text-muted-foreground hover:text-foreground hover:underline underline-offset-4">
                {s.title}
              </a>
            ))}
          </nav>
        </aside>

        <article className="max-w-[760px]">
          <h1 className="font-display text-[28px] font-bold leading-tight lg:text-[40px]">{doc.title}</h1>
          <span className="mt-2.5 block text-sm text-muted-foreground">آخر تحديث: {doc.updated}</span>
          {doc.sections.map((s) => (
            <section key={s.id} id={s.id} aria-labelledby={`${s.id}-title`} className="flex scroll-mt-40 flex-col gap-2.5 border-b border-border py-6">
              <h2 id={`${s.id}-title`} className="text-xl font-bold lg:text-[22px]">
                {s.title}
              </h2>
              <Paragraph parts={s.body} />
            </section>
          ))}
        </article>
      </div>
    </Container>
  );
}
