import { resolveFeatureIcons, iconSrc } from '@/lib/icons';
import { cn } from '@/lib/utils';

interface FeatureIconsProps {
  keys: string[] | undefined;
  /** Card use: small, icon-only with a tooltip. Detail page: icon + visible label. */
  compact?: boolean;
  className?: string;
}

export function FeatureIcons({ keys, compact = false, className }: FeatureIconsProps) {
  const icons = resolveFeatureIcons(keys);
  if (icons.length === 0) return null;

  if (compact) {
    return (
      <div className={cn('flex flex-wrap gap-2', className)}>
        {icons.map((icon) => (
          <span
            key={icon.key}
            title={icon.label}
            className="grid size-8 place-items-center rounded-full bg-secondary/60"
          >
            <img src={iconSrc(icon.file)} alt={icon.label} className="size-5" />
          </span>
        ))}
      </div>
    );
  }

  return (
    <div className={cn('grid grid-cols-2 gap-5 sm:grid-cols-3 md:grid-cols-4', className)}>
      {icons.map((icon) => (
        <div key={icon.key} className="flex flex-col items-center gap-2 text-center">
          <span className="grid size-14 place-items-center rounded-full bg-secondary/60">
            <img src={iconSrc(icon.file)} alt="" className="size-8" />
          </span>
          <span className="text-sm text-muted-foreground">{icon.label}</span>
        </div>
      ))}
    </div>
  );
}
