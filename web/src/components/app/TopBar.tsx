import { ChevronRight } from 'lucide-react';

/**
 * The header of a pushed screen, as in the app's native stack: a back chevron
 * and a bold title on white, no shadow. Home draws its own header instead.
 */
export function TopBar({ title, onBack }: { title: string; onBack?: () => void }) {
  return (
    <header className="sticky top-0 z-20 flex h-14 font-app items-center gap-1 border-b border-app-divider bg-white/95 px-2 backdrop-blur-md">
      {onBack && (
        <button
          type="button"
          onClick={onBack}
          aria-label="رجوع"
          className="grid size-11 place-items-center rounded-full text-app-ocean active:bg-app-tint-soft"
        >
          {/* RTL: "back" points right */}
          <ChevronRight className="size-7" aria-hidden="true" />
        </button>
      )}
      {/* No empty heading when the screen carries its own title (the quiz) */}
      {title && <h1 className={onBack ? 'text-xl font-bold text-app-text' : 'px-3 text-xl font-bold text-app-text'}>{title}</h1>}
    </header>
  );
}
