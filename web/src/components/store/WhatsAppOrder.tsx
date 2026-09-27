import { useEffect, useState } from 'react';

import { Button } from '@/components/ui/button';
import { api } from '@/lib/api';
import { trackWhatsAppOrder } from '@/lib/pixel';
import { leadText } from '@/lib/preorder';
import { cn, formatPrice } from '@/lib/utils';

/** WhatsApp's mark (Simple Icons, CC0) - customers look for it, not for a word. */
export function WhatsAppIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={cn('fill-current', className)}>
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z" />
    </svg>
  );
}

// The shop's WhatsApp line, as the server's default (src/lib/settings.js):
// used only if the dashboard's number has not arrived by the time of the tap.
const FALLBACK_PHONE = '218935770070';

/** One request per visit, shared by every button on the page. */
let phonePromise: Promise<string> | null = null;
function loadPhone(): Promise<string> {
  phonePromise ??= api
    .getWhatsappConfig()
    .then((c) => waDigits(c.phone) || FALLBACK_PHONE)
    .catch(() => FALLBACK_PHONE);
  return phonePromise;
}

/** wa.me takes the international number as digits only: +218 93-577-0070 / 0935770070 -> 218935770070. */
export function waDigits(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  return digits;
}

export interface WhatsAppOrderItem {
  /** The size's own id (the variant) - the one the catalogue and the cart use. */
  id: number;
  productId: number;
  name: string;
  /** "H18 / 190*100" */
  label?: string;
  sku?: string | null;
  price: number;
  preorder: boolean;
  leadDays?: number | null;
}

/**
 * The message the customer sends: everything the team needs to take the order
 * without asking again - the model, the size, its code in Odoo, the price
 * shown, whether it is made to order, and the page.
 */
export function orderMessage(item: WhatsAppOrderItem, origin = window.location.origin): string {
  return [
    'مرحباً بريماتكس، أرغب في طلب:',
    item.name,
    item.label ? `المقاس: ${item.label}` : null,
    item.sku ? `رمز المنتج: ${item.sku}` : null,
    `السعر: ${formatPrice(item.price)} د.ل`,
    item.preorder ? `طلب مسبق · ${leadText(item.leadDays)}` : null,
    `${origin}/product/${item.productId}`,
  ]
    .filter(Boolean)
    .join('\n');
}

export function whatsAppUrl(phone: string, text: string): string {
  return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
}

/**
 * "Order on WhatsApp" for the size on screen. The tap is reported to Meta as
 * a Contact (Pixel + Conversions API, same event ID) with the size, price and
 * contact_channel "whatsapp_order" - so ads learn from WhatsApp orders too,
 * and Events Manager can tell them from a question to customer care.
 *
 * `compact`: the icon alone, for the phone's buy bar.
 */
export function WhatsAppOrderButton({
  item,
  compact = false,
  className,
}: {
  item: WhatsAppOrderItem;
  compact?: boolean;
  className?: string;
}) {
  const [phone, setPhone] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void loadPhone().then((p) => alive && setPhone(p));
    return () => {
      alive = false;
    };
  }, []);

  function open() {
    trackWhatsAppOrder(item);
    const url = whatsAppUrl(phone ?? FALLBACK_PHONE, orderMessage(item));
    // A new tab on a computer (WhatsApp Web); the app itself on a phone. If the
    // browser refuses the new tab, the page goes there instead. (No "noopener"
    // feature: with it window.open always returns null, and the fallback would
    // open WhatsApp twice - the opener is cut by hand instead.)
    const win = window.open(url, '_blank');
    if (win) win.opener = null;
    else window.location.href = url;
  }

  if (compact) {
    return (
      <Button
        type="button"
        size="lg"
        variant="outline"
        onClick={open}
        aria-label="اطلبها على واتساب"
        className={cn('shrink-0 border-[#25D366]/60 bg-[#25D366]/10 px-3 text-[#128C7E] hover:bg-[#25D366]/20 hover:text-[#0e6b5f]', className)}
      >
        <WhatsAppIcon className="size-6" />
      </Button>
    );
  }

  return (
    <Button
      type="button"
      size="lg"
      variant="outline"
      onClick={open}
      className={cn('w-full gap-2 border-[#25D366]/60 bg-[#25D366]/10 text-[#0e6b5f] hover:bg-[#25D366]/20 hover:text-[#0b5a50]', className)}
    >
      <WhatsAppIcon className="size-5 text-[#25D366]" />
      اطلبها على واتساب
    </Button>
  );
}
