import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Bed } from 'lucide-react';

import { Button } from '@/components/ui/button';

import wave from '../assets/wave-pattern-white.png';
import { useTitle } from '../hooks';
import { Link } from '../router';
import { Container } from '../ui';

/** The words on one side, a navy panel with the wave and a bed on the other (handoff Web404, WebError). */
function Frame({ eyebrow, title, body, actions }: { eyebrow: string; title: string; body: string; actions: ReactNode }) {
  return (
    <Container className="grid items-center gap-8 pb-16 pt-8 lg:grid-cols-2 lg:gap-16 lg:pb-24 lg:pt-24">
      <div className="flex flex-col items-start gap-4 lg:gap-[18px]">
        <span className="font-display text-base font-bold text-blue-violet lg:text-lg">{eyebrow}</span>
        <h1 className="font-display text-[32px] font-bold leading-tight lg:text-[44px]">{title}</h1>
        <p className="text-base leading-[1.7] text-muted-foreground lg:text-[17px]">{body}</p>
        <div className="mt-2 flex flex-wrap gap-3">{actions}</div>
      </div>
      <div className="relative order-first grid h-48 place-items-center overflow-hidden bg-dark-ocean sm:h-64 lg:order-none lg:h-[360px]" aria-hidden>
        <img src={wave} alt="" className="absolute inset-0 size-full object-cover opacity-[.12]" />
        <Bed className="relative size-20 text-porcelain lg:size-[120px]" strokeWidth={1.2} />
      </div>
    </Container>
  );
}

/** الصفحة غير موجودة (handoff Web404). */
export function NotFoundPage() {
  useTitle('الصفحة غير موجودة');
  return (
    <Frame
      eyebrow="خطأ 404"
      title="الصفحة غير موجودة"
      body="ربما تغيّر الرابط أو حُذفت الصفحة. ابحث عن المرتبة التي تريدها أو ارجع إلى الرئيسية."
      actions={
        <>
          <Button asChild size="store">
            <Link to={{ name: 'home' }}>الرئيسية</Link>
          </Button>
          <Button asChild variant="outline" size="store">
            <Link to={{ name: 'category', tier: null }}>تسوّق المراتب</Link>
          </Button>
        </>
      }
    />
  );
}

/**
 * حدث خطأ غير متوقّع (handoff WebError). «حاول مرة أخرى» runs `onRetry`, or
 * reloads the page without one. Plain links only: it may render where the
 * shop's router has failed.
 */
export function ErrorPage({ onRetry }: { onRetry?: () => void }) {
  useTitle('حدث خطأ');
  return (
    <Frame
      eyebrow="خطأ"
      title="حدث خطأ غير متوقّع"
      body="لم نتمكّن من تحميل الصفحة. حاول مرة أخرى بعد قليل. إن تكرّر الخطأ تواصل معنا."
      actions={
        <>
          <Button size="store" onClick={() => (onRetry ? onRetry() : window.location.reload())}>
            حاول مرة أخرى
          </Button>
          <Button asChild variant="outline" size="store">
            <a href="/help">تواصل معنا</a>
          </Button>
        </>
      }
    />
  );
}

/**
 * Catches a page that throws while rendering and shows ErrorPage in its place;
 * «حاول مرة أخرى» clears the error and renders the children again. Give it a
 * `resetKey` (the address) so moving to another page clears it too.
 */
export class PageErrorBoundary extends Component<{ children: ReactNode; resetKey?: string }, { error: Error | null }> {
  state: { error: Error | null } = { error: null };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error('Page crashed', error, info.componentStack);
  }

  componentDidUpdate(prev: { resetKey?: string }) {
    if (this.state.error && prev.resetKey !== this.props.resetKey) this.setState({ error: null });
  }

  reset = () => this.setState({ error: null });

  render() {
    if (this.state.error) return <ErrorPage onRetry={this.reset} />;
    return this.props.children;
  }
}
