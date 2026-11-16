import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { MonthGrid } from '@/components/month-grid';
import { Card, Chip, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { addDays, monthOf } from '@/lib/dates';
import { useChangeTask } from '@/lib/tasks';
import type { TaskDetail } from '@/lib/types';

/**
 * The day a task is planned for, picked from the task page. A sheet of its
 * own: the page's old in-page Modal often didn't open, or opened once only.
 */
export default function TaskDayScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const today = useToday();
  const change = useChangeTask();
  const [month, setMonth] = useState<string | null>(null);
  const { data } = useQuery({
    queryKey: ['task', id],
    queryFn: () => api<TaskDetail>(`/api/mobile/tasks/${id}`),
  });
  const forDate = data?.task.forDate ?? null;

  const pick = (day: string | null) => {
    if (data && day !== forDate)
      change.mutate(
        { taskId: data.task.id, forDate: day },
        { onError: (e) => Alert.alert('The day didn’t change', e.message || 'Please try again.') },
      );
    router.back();
  };

  return (
    <Screen edgeTop={false}>
      <View style={styles.chips}>
        <Chip label="Today" selected={forDate === today} onPress={() => pick(today)} />
        <Chip label="Tomorrow" selected={forDate === addDays(today, 1)} onPress={() => pick(addDays(today, 1))} />
        <Chip label="Later" selected={!forDate} onPress={() => pick(null)} />
      </View>
      <Card>
        <MonthGrid
          month={month ?? monthOf(forDate ?? today)}
          onMonth={setMonth}
          selected={forDate ?? undefined}
          onDay={pick}
        />
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', gap: Spacing.two, marginBottom: Spacing.three },
});
