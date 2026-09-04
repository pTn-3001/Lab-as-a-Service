'use client';

import React from 'react';
import { InstructorLayout } from '@laas-portal/ui';
import { SettingsView } from '../../../components/settings/settings-view';

export default function InstructorSettingsPage() {
  return (
    <InstructorLayout basePath="/instructor">
      <SettingsView role="INSTRUCTOR" />
    </InstructorLayout>
  );
}
