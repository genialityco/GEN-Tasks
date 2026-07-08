'use client';

import { useParams } from 'next/navigation';
import { Paper, Loader, Alert } from '@mantine/core';
import { UserRole } from '@gen-task/shared';
import { useProject } from '../../../../../../../hooks/useProjects';
import { useOrganization } from '../../../../../../../hooks/useOrganizations';
import { useAsync } from '../../../../../../../hooks/useAsync';
import { activitiesApi } from '../../../../../../../services/api/activities.api';
import { ActivityDetail } from '../../../../../../../components/activities/ActivityDetail';
import { useAuth } from '../../../../../../../services/auth/AuthProvider';
import { isSuperAdmin, roleInOrganization } from '../../../../../../../services/auth/roles';

export default function ActivityDetailPage() {
  const params = useParams<{
    organizationId: string;
    projectId: string;
    activityId: string;
  }>();
  const { profile } = useAuth();
  const role = roleInOrganization(profile, params.organizationId);
  const canManageResponsibles =
    isSuperAdmin(profile) || role === UserRole.ADMIN;

  const { data: project, loading: loadingProject, error: errorProject } = useProject(params.projectId);
  const { data: organization } = useOrganization(params.organizationId);
  const contactsEnabled =
    organization?.enabledFeatures.contactsEnabled ?? false;
  const { data: activity, loading: loadingActivity, error: errorActivity } = useAsync(
    () => activitiesApi.get(params.activityId),
    [params.activityId],
  );

  const backHref = `/organizations/${params.organizationId}/projects/${params.projectId}`;
  const error = errorProject || errorActivity;

  return (
    <main style={{ padding: 24 }}>
      <Paper p="lg" shadow="sm" radius="md" withBorder>
        {error && <Alert color="red">{error}</Alert>}
        {(loadingProject || loadingActivity) && <Loader color="blue" type="bars" />}
        {project && activity && (
          <ActivityDetail
            activity={activity}
            project={project}
            backHref={backHref}
            canManageResponsibles={canManageResponsibles}
            contactsEnabled={contactsEnabled}
          />
        )}
      </Paper>
    </main>
  );
}
