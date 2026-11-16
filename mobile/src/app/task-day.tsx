import { useQuery } from '@tanstack/react-query';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet } from 'react-native';

import { MonthGrid } from '@/components/month-grid';
import { ThemedText } from '@/components/themed-text';
import { Card, Screen } from '@/components/ui';
import { MenuItem } from '@/components/popover';
import { Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-now';
import { api } from '@/lib/api';
import { addDays, fromKey, monthOf, shiftMonth } from '@/lib/dates';
import { useChangeTask } from '@/lib/tasks';
import type { TaskDetail } from '@/lib/types';

/** Monday after `today` (a week ahead when it is Monday), as on the website. */
function nextMonday(today: string) {
  const day = fromKey(today).getDay();
  return addDays(today, (8 - day) % 7 || 7);
}

const short = (key: string) =>
  fromKey(key).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/**
 * Move to: the day a task is planned (and due) for, picked from the task
 * page, with the website's quick days and a calendar. A sheet of its own:
 * the page's old in-page Modal often didn't open, or opened once only.
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

  const quick: { label: string; date: string | null }[] = [
    { label: 'Today', date: today },
    { label: 'Tomorrow', date: addDays(today, 1) },
    { label: 'Day after', date: addDays(today, 2) },
    { label: 'Next week', date: nextMonday(today) },
    { label: 'Next month', date: `${shiftMonth(monthOf(today), 1)}-01` },
    { label: 'Later', date: null },
  ];

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
      <Card style={styles.quick}>
        {quick.map((q) => (
          <MenuItem
            key={q.label}
            label={q.label}
            hint={q.date ? short(q.date) : 'No day yet'}
            selected={q.date === forDate}
            onPress={() => pick(q.date)}
          />
        ))}
      </Card>
      <ThemedText type="smallBold" themeColor="textSecondary" style={styles.label}>
        Or pick a day
      </ThemedText>
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
  quick: { padding: Spacing.one, marginBottom: Spacing.three },
  label: { marginBottom: Spacing.two },
});
