'use client';

import React from 'react';
import { StudentLayout } from '@laas-portal/ui';
import { SettingsView } from '../../../components/settings/settings-view';

export default function StudentSettingsPage() {
  return (
    <StudentLayout>
      <SettingsView role="STUDENT" />
    </StudentLayout>
  );
}
