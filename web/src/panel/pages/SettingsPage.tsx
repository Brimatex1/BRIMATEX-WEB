import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { toast } from 'sonner';

import { cn } from '@/lib/utils';

import { panelApi, type PanelMe, type TeamMember } from '../api';
import { Card, CardHead, Icon, ROLE_LABEL, buttonClass, formatPhone } from '../ui';
import { PlaceholderPage } from './PlaceholderPage';

const ROLE_OPTIONS: TeamMember['role'][] = ['admin', 'marketing', 'support', 'customer'];

/**
 * الإعدادات - still to come, apart from two things that cannot wait: the way
 * to the classic dashboard (reviews, customers, the Meta pixel and the Odoo
 * connection live there for now) and who may open this panel.
 */
export function SettingsPage({ me, token }: { me: PanelMe; token: string }) {
  return (
    <PlaceholderPage me={me} section="settings">
      <Card className="flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex flex-col gap-1">
          <b className="text-[17px]">الإعدادات المتقدمة</b>
          <span className="text-sm text-[#5F6373]">التقييمات والعملاء وبكسل ميتا والاتصال بأودو في اللوحة السابقة حالياً.</span>
        </span>
        <a href="/admin/classic" className={cn(buttonClass('outline'), 'no-underline')}>
          <Icon name="external" size={18} />
          الإعدادات المتقدمة
        </a>
      </Card>
      {me.role === 'admin' ? <Team me={me} token={token} /> : null}
    </PlaceholderPage>
  );
}

/** Who may open the panel: the staff, and a search to add someone by name or number. */
function Team({ me, token }: { me: PanelMe; token: string }) {
  const [users, setUsers] = useState<TeamMember[] | null>(null);
  const [q, setQ] = useState('');
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(
    (query = '') => {
      setError(null);
      panelApi
        .team(token, query)
        .then((r) => setUsers(r.users))
        .catch((err: Error) => setError(err.message));
    },
    [token]
  );
  useEffect(() => load(), [load]);

  async function change(user: TeamMember, role: TeamMember['role']) {
    try {
      await panelApi.setRole(token, user.id, role);
      setUsers((prev) => prev?.map((u) => (u.id === user.id ? { ...u, role } : u)) ?? prev);
      toast.success(`حُفظت صلاحية ${user.name || user.phone}: ${ROLE_LABEL[role]}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'تعذّر الحفظ');
    }
  }

  function search(e: FormEvent) {
    e.preventDefault();
    load(q.trim());
  }

  return (
    <Card>
      <CardHead title="فريق الإدارة" />
      <p className="-mt-2 mb-4 text-sm text-[#5F6373]">مدير: كل الأقسام. تسويق: الواجهة والإشعارات وساعدني أختار والمراتب. خدمة العملاء: نظرة عامة والطلبات.</p>
      <form onSubmit={search} className="mb-3 flex gap-2">
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="ابحث بالاسم أو رقم الهاتف لإضافة عضو"
          aria-label="بحث عن مستخدم"
          className="h-10 min-w-0 flex-1 rounded-[10px] bg-[#F5F6FA] px-3 text-sm outline-none placeholder:text-[#5F6373]"
        />
        <button type="submit" className={buttonClass('outline', 'sm')}>
          بحث
        </button>
      </form>
      {error ? <p className="text-sm text-[#A12020]">{error}</p> : null}
      <ul className="flex flex-col">
        {users?.length === 0 ? <li className="border-t border-[#E4E6EE] py-3 text-sm text-[#5F6373]">لا أحد يطابق البحث.</li> : null}
        {users?.map((u) => (
          <li key={u.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-[#E4E6EE] py-3 text-sm">
            <span className="flex flex-col">
              <b>{u.name || '—'}</b>
              <bdi dir="ltr" className="text-right text-[12.5px] text-[#5F6373]">
                {formatPhone(u.phone)}
              </bdi>
            </span>
            {u.locked || u.id === me.user.id ? (
              <span className="text-[13px] text-[#5F6373]">{ROLE_LABEL[u.role]}{u.locked ? ' · من إعدادات الخادم' : ''}</span>
            ) : (
              <select
                value={u.role}
                onChange={(e) => void change(u, e.target.value as TeamMember['role'])}
                aria-label={`صلاحية ${u.name}`}
                className="h-9 rounded-[10px] bg-white px-2 text-[13.5px] shadow-[inset_0_0_0_1px_#E4E6EE]"
              >
                {ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r}>
                    {ROLE_LABEL[r]}
                  </option>
                ))}
              </select>
            )}
          </li>
        ))}
      </ul>
    </Card>
  );
}
