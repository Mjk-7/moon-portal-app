import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { type GroupTeam, StatusMark } from '@/components/day-sheet';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Card, QueryState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api, withQuery } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { dayTitle } from '@/lib/dates';
import { currentPick, pickOf } from '@/lib/status';
import type { Task } from '@/lib/types';

/** Someone's tasks in a project on a day (GET /api/me/day/teams). */
type Team = GroupTeam & {
  people: {
    id: string;
    name: string;
    avatar: string | null;
    tasks: Pick<Task, 'id' | 'title' | 'status' | 'flag'>[];
  }[];
};

/**
 * Everyone's tasks in a project on a day, by person, opened from a
 * project's "N mine / M total" on the Work tab. A sheet of its own: the
 * in-page Modal it was before didn't always open.
 */
export default function WorkTeamScreen() {
  const theme = useTheme();
  const { profile } = useAuth();
  const { projectId, date, name } = useLocalSearchParams<{ projectId: string; date: string; name?: string }>();
  const query = useQuery({
    queryKey: ['day', date, 'team', projectId],
    queryFn: () =>
      api<{ projects: Record<string, Team> }>(withQuery('/api/me/day/teams', { date, projects: projectId })),
  });
  const team = query.data?.projects[projectId];

  const open = (taskId: string) => {
    router.back();
    router.push({ pathname: '/task/[id]', params: { id: taskId } });
  };

  return (
    <Screen edgeTop={false}>
      <Stack.Screen options={{ title: name || 'Project' }} />
      <ThemedText type="small" themeColor="textSecondary">
        {dayTitle(date)}
        {team ? ` · ${team.mine} yours of ${team.total}` : ''}
      </ThemedText>
      <QueryState
        loading={query.isPending}
        error={query.data ? null : query.error}
        onRetry={() => void query.refetch()}
        what="the team’s tasks"
      />
      {(team?.people ?? []).map((person) => (
        <Card key={person.id} style={styles.card}>
          <View style={styles.who}>
            <Avatar uri={person.avatar} name={person.name} size={28} />
            <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
              {person.id === profile?.id ? 'You' : person.name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {person.tasks.length}
            </ThemedText>
          </View>
          {person.tasks.map((t) => {
            const status = currentPick(t);
            const finished = status === 'done' || status === 'archived';
            return (
              <Pressable
                key={t.id}
                onPress={() => open(t.id)}
                style={({ pressed }) => [styles.task, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
                <StatusMark status={status === 'todo' ? null : status} />
                <ThemedText style={[styles.flex, finished && { color: theme.textSecondary }]} numberOfLines={2}>
                  {t.title}
                </ThemedText>
                {status !== 'todo' && status !== 'done' && status !== 'archived' ? (
                  <ThemedText type="small" style={{ color: pickOf(status).color ?? theme.textSecondary }}>
                    {pickOf(status).label}
                  </ThemedText>
                ) : null}
              </Pressable>
            );
          })}
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: 0, marginTop: Spacing.three },
  who: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  task: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
