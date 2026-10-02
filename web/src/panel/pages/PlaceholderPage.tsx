import type { ReactNode } from 'react';

import type { PanelMe, Section } from '../api';
import { PageBody, PageHeader } from '../Shell';
import { Card, Icon, SECTION_META } from '../ui';

/** A section still to come: its title in the shell and «قيد البناء». */
export function PlaceholderPage({ me, section, children }: { me: PanelMe; section: Exclude<Section, 'overview' | 'orders'>; children?: ReactNode }) {
  return (
    <>
      <PageHeader section={section} me={me} />
      <PageBody>
        <Card className="flex items-center gap-4">
          <span className="grid size-12 shrink-0 place-items-center rounded-xl bg-[#EEF0FA] text-dark-ocean">
            <Icon name={SECTION_META[section].icon} size={22} />
          </span>
          <span className="flex flex-col gap-1">
            <b className="text-[17px]">قيد البناء</b>
            <span className="text-sm text-[#5F6373]">يصل قسم «{SECTION_META[section].label}» في مرحلة قادمة من لوحة الإدارة.</span>
          </span>
        </Card>
        {children}
      </PageBody>
    </>
  );
}
