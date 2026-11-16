import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { Alert, StyleSheet, View } from 'react-native';

import { CompanyMark } from '@/components/company-mark';
import { PlaceRow, usePlaces } from '@/components/project-picker';
import { ThemedText } from '@/components/themed-text';
import { QueryState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { isCoreProject, projectNameInCompany } from '@/lib/project-name';
import type { PlaceInput } from '@/lib/query';
import { useChangeTask } from '@/lib/tasks';
import type { TaskDetail } from '@/lib/types';

/**
 * Moves a task to another project, picked from the task page: each company
 * with its projects, then Personal. A sheet of its own: the page's old
 * in-page Modal often didn't open, or opened once only.
 */
export default function TaskMoveScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const change = useChangeTask();
  const { tabs, projects, query } = usePlaces();
  const { data } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api<TaskDetail>(`/api/mobile/tasks/${id}`),
  });
  const selected = data?.task.projectId ?? null;
  const personalPicked = projects.some((p) => p.isPersonal && p.id === selected);

  const pick = (place: PlaceInput, same: boolean) => {
    if (data && !same)
      change.mutate(
        { taskId: data.task.id, place },
        { onError: (e) => Alert.alert('The task didn’t move', e.message || 'Please try again.') },
      );
    router.back();
  };

  return (
    <Screen edgeTop={false}>
      {!query.data ? (
        <QueryState
          loading={query.isPending}
          error={query.error}
          onRetry={() => void query.refetch()}
          what="your projects"
        />
      ) : (
        tabs.map((t) => (
          <View key={t.key} style={styles.group}>
            <View style={styles.head}>
              <CompanyMark id={t.key} name={t.name} logo={t.logo} color={t.color} personal={t.personal} size={18} />
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t.name}
              </ThemedText>
            </View>
            {t.personal ? (
              <PlaceRow
                mark={<CompanyMark id="personal" name="Personal" personal size={40} />}
                title="Personal"
                detail="Your own work. Only you see it."
                on={personalPicked}
                onPress={() => pick({ personal: true }, personalPicked)}
              />
            ) : (
              t.projects.map((p) => (
                <PlaceRow
                  key={p.id}
                  mark={
                    isCoreProject(p) ? (
                      <CompanyMark id={t.key} name={t.name} color={t.color} logo={t.logo} size={40} />
                    ) : (
                      <CompanyMark id={p.id} name={p.name} color={p.color} logo={p.logo} size={40} />
                    )
                  }
                  title={projectNameInCompany(p, t.name)}
                  detail={isCoreProject(p) ? 'The company’s general work' : undefined}
                  on={selected === p.id}
                  onPress={() => pick({ projectId: p.id }, selected === p.id)}
                />
              ))
            )}
          </View>
        ))
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: { gap: Spacing.two, marginBottom: Spacing.four },
  head: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
