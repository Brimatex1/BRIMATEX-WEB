/**
 * The privacy policy and the terms (handoff WebPrivacy, WebTerms) - a DRAFT.
 * Brimatex must approve the final legal text; the bracketed parts are the
 * handoff's placeholders, left for the owner to fill.
 */

/**
 * A piece of a paragraph: Arabic text, or a left-to-right value (an email, a
 * phone) that may be a link. `contact` marks the shop's own email or phone,
 * which the admin panel's «التواصل» replaces when set (LegalPage).
 */
export type LegalText = string | { ltr: string; href?: string; contact?: 'email' | 'phone' };

export interface LegalSection {
  /** The anchor the sidebar scrolls to. */
  id: string;
  title: string;
  body: LegalText[];
}

export interface LegalDoc {
  title: string;
  updated: string;
  sections: LegalSection[];
}

export type LegalPageKey = 'privacy' | 'terms';

/** The company's mail and phone (src/public/privacy.html, the shop's line in WhatsAppOrder.tsx). */
const EMAIL: LegalText = { ltr: 'info@brimatex.ly', href: 'mailto:info@brimatex.ly', contact: 'email' };
const PHONE: LegalText = { ltr: '093 577 00 70', href: 'tel:+218935770070', contact: 'phone' };

export const LEGAL: Record<LegalPageKey, LegalDoc> = {
  privacy: {
    title: 'سياسة الخصوصية',
    updated: '[التاريخ]',
    sections: [
      {
        id: 'data',
        title: 'البيانات التي نجمعها',
        body: ['رقم الهاتف (واتساب) للدخول برمز التحقق، والاسم، وعناوين التوصيل والمدينة، والصورة الشخصية إن أضفتها، وطلباتك وتقييماتك ومفضّلتك.'],
      },
      {
        id: 'use',
        title: 'كيف نستخدمها',
        body: ['لتنفيذ طلبك وتوصيله، ومتابعة الضمان وبلاغات المشاكل، وإرسال إشعارات الطلب، والعروض فقط إذا فعّلتها من الإعدادات.'],
      },
      {
        id: 'sharing',
        title: 'مع من نشاركها',
        body: ['نشارك الاسم ورقم الهاتف والعنوان مع فريق التوصيل لإيصال طلبك فقط. لا نبيع بياناتك لأي جهة.'],
      },
      {
        id: 'cookies',
        title: 'ملفات تعريف الارتباط',
        body: ['نستخدم ملفات ضرورية لتسجيل الدخول وحفظ السلة والمدينة المختارة. [ملفات القياس والإعلانات إن وُجدت].'],
      },
      {
        id: 'payment',
        title: 'الدفع',
        body: ['الدفع عند الاستلام، ولا يخزّن الموقع بيانات بطاقتك المصرفية.'],
      },
      {
        id: 'delete-account',
        title: 'حذف حسابك',
        body: ['يمكنك حذف حسابك وبياناتك في أي وقت من «حسابي» ثم «حذف الحساب».'],
      },
      {
        id: 'contact',
        title: 'التواصل معنا',
        body: ['لأي سؤال عن بياناتك: ', EMAIL, ' · ', PHONE, '.'],
      },
    ],
  },
  terms: {
    title: 'الشروط والأحكام',
    updated: '[التاريخ]',
    sections: [
      {
        id: 'account',
        title: 'الطلب والحساب',
        body: ['يمكن التصفّح والإضافة إلى السلة دون حساب، ويلزم تسجيل الدخول برقم واتساب لإتمام الطلب. المفضّلة تُحفظ على الجهاز دون حساب، وتنتقل إلى الحساب بعد الدخول.'],
      },
      {
        id: 'prices',
        title: 'الأسعار',
        body: ['الأسعار بالدينار الليبي وتشمل [الضريبة/لا تشمل]. التوصيل مجاني إلى كل المدن.'],
      },
      {
        id: 'payment',
        title: 'الدفع',
        body: ['الدفع عند الاستلام: نقداً أو ببطاقة مصرفية أو بحوالة مصرفية.'],
      },
      {
        id: 'delivery',
        title: 'التوصيل',
        body: ['يُحدَّد موعد التوصيل حسب جدول المنطقة، ويتصل بك السائق قبل الوصول. افحص المرتبة عند الاستلام.'],
      },
      {
        id: 'cancel',
        title: 'الإلغاء',
        body: ['يمكنك إلغاء الطلب من حسابك حتى خروجه للتوصيل.'],
      },
      {
        id: 'returns',
        title: 'الاستبدال والإرجاع',
        body: ['[مدة وشروط الاستبدال والإرجاع].'],
      },
      {
        id: 'warranty',
        title: 'الضمان',
        body: ['يبدأ الضمان من تاريخ الشراء، ومدته حسب المرتبة كما تظهر في صفحتها وفي «الضمان» داخل حسابك. [ما لا يشمله الضمان].'],
      },
    ],
  },
};
