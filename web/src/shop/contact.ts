import { useEffect, useState } from 'react';

import { api } from '@/lib/api';

import { useShop } from './state';

/**
 * How to reach Brimatex, in one place for «تواصل معنا» and «صالة العرض».
 * A null value is still pending from the owner: the pages show the handoff's
 * bracketed placeholder in its place. The admin panel's «التواصل» replaces
 * these once /api/app/v1/config answers - see useContact.
 */
export const CONTACT = {
  /** The shop's line (the server's default WhatsApp number, src/lib/settings.js), shown as Libyans write it. */
  phone: { display: '093 577 00 70', tel: '+218935770070' },
  /** wa.me digits; the dashboard's number replaces it once loaded (useWhatsAppDigits). */
  whatsapp: '218935770070',
  email: 'info@brimatex.ly',
  /** «نرد عادةً خلال …» */
  replyTime: null as string | null,
};

export const SHOWROOM = {
  area: 'النوفليين',
  city: 'طرابلس',
  /** e.g. «السبت – الخميس» and «9 ص – 9 م». */
  days: null as string | null,
  hours: null as string | null,
  /** The showroom's own number, if it has one. Until then «اتصل بالصالة» rings the shop's line. */
  phone: null as { display: string; tel: string } | null,
  /** A Google Maps link to the exact place; until the owner sends one, a search for the area. */
  mapsUrl: null as string | null,
};

export const PLACEHOLDER = {
  replyTime: '[المدة]',
  days: '[الأيام]',
  hours: '[الساعات]',
  phone: '[رقم الهاتف]',
};

/** «[الأيام] · [الساعات]» until the owner sends them. */
export function showroomHours(): string {
  return `${SHOWROOM.days ?? PLACEHOLDER.days} · ${SHOWROOM.hours ?? PLACEHOLDER.hours}`;
}

export function showroomMapsUrl(): string {
  return SHOWROOM.mapsUrl ?? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`بريماتكس ${SHOWROOM.area} ${SHOWROOM.city}`)}`;
}

/** wa.me wants the international number as digits only: 0935770070 -> 218935770070. */
function waDigits(phone: string | null | undefined): string {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('00')) return digits.slice(2);
  if (digits.startsWith('0')) return `218${digits.slice(1)}`;
  return digits;
}

/** The WhatsApp number the dashboard sets (GET /api/whatsapp-config), the shop's line until it answers. */
export function useWhatsAppDigits(): string {
  const [digits, setDigits] = useState(CONTACT.whatsapp);
  useEffect(() => {
    let live = true;
    api
      .getWhatsappConfig()
      .then((c) => {
        const d = waDigits(c.phone);
        if (live && d) setDigits(d);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return digits;
}

/** 0935770070 → «093 577 00 70», as the shop writes its line. */
function localDisplay(phone: string): string {
  const d = phone.replace(/\D/g, '');
  return /^0\d{9}$/.test(d) ? `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6, 8)} ${d.slice(8)}` : phone;
}

export interface LiveContact {
  phone: { display: string; tel: string };
  /** wa.me digits. */
  whatsapp: string;
  email: string;
  /** The showroom's address in one line: «النوفليين، طرابلس». */
  showroom: string;
}

/**
 * The contact details the admin panel sets (الإعدادات → التواصل), with this
 * file's values until they arrive - or if they never do.
 */
export function useContact(): LiveContact {
  const live = useShop().config?.contact;
  const whatsapp = useWhatsAppDigits();
  return {
    phone: live?.phone ? { display: localDisplay(live.phone), tel: `+${waDigits(live.phone)}` } : CONTACT.phone,
    whatsapp: live?.whatsapp ? waDigits(live.whatsapp) : whatsapp,
    email: live?.email || CONTACT.email,
    showroom: live?.showroom || `${SHOWROOM.area} · ${SHOWROOM.city}`,
  };
}
