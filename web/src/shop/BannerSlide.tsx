import { Fragment, type CSSProperties, type ReactNode } from 'react';

import { cn } from '@/lib/utils';
import type { WebBanner } from '@/types';
import { responsivePhoto } from '@/shop/photoSizes';

/**
 * One banner of the home page as real HTML - the tag line, the title, a line
 * of text and one or two buttons over the banner's colour, beside (desktop)
 * or under (phones) its photo - the owner's Brimatex-Banners web/*.html, so
 * search engines and screen readers read the words. The panel's preview
 * draws the same component.
 *
 *   desktop  1fr | 1.5fr side by side, 520px high (web-desktop.html)
 *   mobile   the photo on top, the text under it (web-mobile.html)
 */
export type BannerMode = 'desktop' | 'mobile';

export interface BannerLinkProps {
  className?: string;
  style?: CSSProperties;
  children: ReactNode;
  'aria-label'?: string;
  tabIndex?: number;
}

/** How a link is drawn: the shop's router link, or a plain span in the panel's preview. */
export type RenderLink = (href: string, props: BannerLinkProps) => ReactNode;

const plainLink: RenderLink = (href, props) => <a href={href} {...props} />;

const NAVY = '#282868';
const LIME = '#DEE337';

/** Is the panel dark enough for light text? (relative luminance under ~0.35) */
export function isDarkPanel(hex: string): boolean {
  const m = /^#?([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return true;
  const [r, g, b] = m.slice(1).map((h) => {
    const c = parseInt(h, 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 0.35;
}

/**
 * Text with its Latin runs (Pocket Spring, 180×200) kept left to right and
 * whole, and «60 د.ل» never broken between the number and the currency.
 */
export function richText(text: string): ReactNode {
  const glued = text.replace(/(\d)\s+د\.ل/g, '$1 د.ل');
  const parts = glued.split(/([A-Za-z][A-Za-z0-9 .-]*[A-Za-z0-9]|\d+×\d+)/);
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <bdi key={i} dir="ltr" className="whitespace-nowrap">
        {part}
      </bdi>
    ) : (
      <Fragment key={i}>{part}</Fragment>
    )
  );
}

function PointsIcon({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" strokeWidth={1.4} />
    </svg>
  );
}

/** The white card over the photo (the loyalty banner's «60 د.ل خصم»). */
function OfferCard({ card, mode }: { card: NonNullable<WebBanner['card']>; mode: BannerMode }) {
  const desktop = mode === 'desktop';
  return (
    <div
      className={cn('flex flex-col bg-white text-dark-ocean', desktop ? 'w-[320px] gap-3 px-[22px] py-5' : 'w-[196px] gap-[7px] px-3.5 py-3')}
      style={{ boxShadow: desktop ? '0 22px 44px rgba(20,20,60,.35)' : '0 14px 27px rgba(20,20,60,.35)' }}
    >
      <div className="flex items-center justify-between gap-2">
        {card.caption ? <span className={cn('font-bold text-[#5F6373]', desktop ? 'text-[15px]' : 'text-[9px]')}>{card.caption}</span> : <span />}
        {card.chip ? (
          <span className={cn('whitespace-nowrap rounded-full font-bold', desktop ? 'px-[11px] py-[3px] text-[13px]' : 'px-[7px] py-0.5 text-[8px]')} style={{ background: LIME, color: NAVY }}>
            {card.chip}
          </span>
        ) : null}
      </div>
      <div className={cn('flex items-baseline', desktop ? 'gap-[9px]' : 'gap-1.5')}>
        <b className={cn('font-display leading-none', desktop ? 'text-[54px]' : 'text-[33px]')}>{richText(card.value ?? '')}</b>
        {card.suffix ? <span className={cn('font-bold', desktop ? 'text-[21px]' : 'text-[13px]')}>{card.suffix}</span> : null}
      </div>
      {card.note ? (
        <>
          <div className="h-px bg-[#E5E5E5]" />
          <div className={cn('text-[#484848]', desktop ? 'text-[15px]' : 'text-[9px]')}>{richText(card.note)}</div>
        </>
      ) : null}
    </div>
  );
}

export function BannerSlide({
  banner,
  mode,
  heading = 'h2',
  renderLink = plainLink,
  eager = false,
  tabbable = true,
}: {
  banner: WebBanner;
  mode: BannerMode;
  /** The first slide of the home page is its h1. */
  heading?: 'h1' | 'h2';
  renderLink?: RenderLink;
  eager?: boolean;
  /** Off for slides out of view, so the keyboard does not walk through hidden links. */
  tabbable?: boolean;
}) {
  const dark = isDarkPanel(banner.panel);
  const desktop = mode === 'desktop';
  const ink = dark ? '#FFFFFF' : NAVY;
  const body = dark ? '#D9E3E2' : '#22264F';
  const wave = dark ? '/images/banners/wave-white.png' : '/images/banners/wave-navy.png';
  const waveOpacity = dark ? 0.14 : banner.panel.toUpperCase() === LIME ? 0.12 : 0.16;
  const Heading = heading;
  const long = [...banner.title].length > 34;
  const tab = tabbable ? undefined : -1;

  const photo = renderLink(banner.link, {
    className: cn('relative block overflow-hidden bg-image-bg', desktop ? 'h-full' : banner.card ? 'h-[220px]' : 'h-[200px]'),
    'aria-label': banner.title,
    tabIndex: tab,
    children: (
      <>
        <img
          {...responsivePhoto(banner.photo, desktop ? '60vw' : '100vw')}
          alt={banner.photoAlt ?? ''}
          loading={eager ? 'eager' : 'lazy'}
          draggable={false}
          className="absolute inset-0 size-full object-cover"
          style={{ objectPosition: banner.photoPosition ?? '50% 50%' }}
        />
        {banner.card && desktop ? (
          <span className="absolute bottom-10 left-10 block">
            <OfferCard card={banner.card} mode="desktop" />
          </span>
        ) : null}
      </>
    ),
  });

  const panel = (
    <div
      className={cn(
        'relative flex flex-col justify-center overflow-hidden',
        desktop ? 'gap-[18px] px-11 py-12' : cn('flex-1 gap-2.5 px-[18px] pb-6', banner.card ? 'pt-[78px]' : 'pt-5')
      )}
      style={{ background: banner.panel, color: ink }}
    >
      <img src={wave} alt="" aria-hidden className="pointer-events-none absolute inset-0 size-full object-cover" style={{ opacity: waveOpacity }} />
      {banner.tag ? (
        <span className={cn('relative inline-flex items-center font-bold', desktop ? 'gap-2 text-sm' : 'gap-1.5 text-xs')}>
          {banner.tagIcon === 'points' ? <PointsIcon size={desktop ? 20 : 15} /> : null}
          {banner.tag}
        </span>
      ) : null}
      <Heading className={cn('relative m-0 font-display font-bold', desktop ? (long ? 'text-[42px] leading-[1.2]' : 'text-[44px] leading-[1.18]') : long ? 'text-[23px] leading-[1.25]' : 'text-2xl leading-[1.25]')}>
        {richText(banner.title)}
      </Heading>
      {banner.text ? (
        <p className={cn('relative m-0', desktop ? 'text-[17px] leading-[1.7]' : 'text-[13px] leading-[1.6]')} style={{ color: body }}>
          {richText(banner.text)}
        </p>
      ) : null}
      <span className={cn('relative flex flex-wrap', desktop ? 'gap-3' : 'mt-1 gap-2')}>
        {banner.buttons.map((b, i) =>
          <Fragment key={i}>
            {renderLink(b.link, {
              tabIndex: tab,
              className: cn(
                'inline-flex items-center whitespace-nowrap rounded-full font-bold transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2',
                desktop ? 'h-[52px] px-7 text-base' : 'h-[42px] px-[22px] text-[13px]'
              ),
              style:
                i === 0
                  ? { background: dark ? LIME : NAVY, color: dark ? NAVY : '#FFFFFF' }
                  : { boxShadow: `inset 0 0 0 1.5px ${ink}`, color: ink },
              children: b.label,
            })}
          </Fragment>
        )}
      </span>
    </div>
  );

  if (desktop) {
    return (
      <div className="grid h-[520px] grid-cols-[1fr_1.5fr] overflow-hidden font-sans" dir="rtl">
        {panel}
        {photo}
      </div>
    );
  }
  return (
    <div className="relative flex h-full flex-col overflow-hidden font-sans" dir="rtl">
      {photo}
      {banner.card ? (
        <span className="pointer-events-none absolute left-3.5 top-[150px] z-10 block">
          <OfferCard card={banner.card} mode="mobile" />
        </span>
      ) : null}
      {panel}
    </div>
  );
}
