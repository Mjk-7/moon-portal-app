import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { MonthGrid } from '@/components/month-grid';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Dot, ProgressBar, Screen } from '@/components/ui';
import { buffOf, buffProgress } from '@/constants/buff';
import { Radius, Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { api, portalUrl, withQuery } from '@/lib/api';
import { monthOf, monthRange, monthTitle } from '@/lib/dates';
import { pickDay } from '@/lib/day-pick';
import type { Days, MonthScore } from '@/lib/types';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * The Work tab's calendar: the month's score and its days, marked by what
 * happened on them; a tap opens that day on the Work tab. A sheet of its
 * own: the in-page Modal it was before didn't always open.
 */
export default function WorkCalendarScreen() {
  const theme = useTheme();
  const today = useToday();
  const params = useLocalSearchParams<{ date?: string }>();
  const date = params.date && DAY_KEY.test(params.date) ? params.date : today;
  const [month, setMonth] = useState(monthOf(date));
  const range = monthRange(month);
  const days = useQuery({
    queryKey: ['days', range.from, range.to],
    queryFn: () => api<Days>(withQuery('/api/me/days', range)),
  });
  const score = useQuery({
    queryKey: ['month', month],
    queryFn: () => api<MonthScore>(withQuery('/api/me/month', { month })),
  });
  const points = score.data?.points ?? 0;
  const buff = buffOf(points);
  const lines = (day: string) => days.data?.days[day] ?? [];

  const pick = (day: string) => {
    pickDay(day);
    router.back();
  };

  return (
    <Screen edgeTop={false}>
      <Card style={styles.buffCard}>
        <Image source={{ uri: portalUrl(buff.src) }} style={styles.buffImage} contentFit="contain" />
        <View style={[styles.flex, styles.buffText]}>
          <ThemedText type="label" themeColor="textSecondary">
            {monthTitle(month)} · {score.data?.days ?? 0} days
          </ThemedText>
          <ThemedText type="subtitle">{buff.title}</ThemedText>
          <ProgressBar percent={buffProgress(points)} />
          <ThemedText type="small" themeColor="textSecondary">
            {points} pts · {score.data?.finished ?? 0} tasks finished · {Math.max(0, buff.next - points)} to the next
          </ThemedText>
        </View>
      </Card>
      <Card style={styles.gap}>
        <MonthGrid
          month={month}
          onMonth={setMonth}
          selected={date}
          onDay={pick}
          tone={(day) => (lines(day).length ? theme.backgroundSelected : null)}
          mark={(day) => {
            const l = lines(day);
            if (!l.length) return null;
            const missed = l.some((x) => x.goalMissed);
            const done = l.some((x) => x.status === 'done');
            return <Dot size={5} color={missed ? theme.danger : done ? theme.success : theme.textSecondary} />;
          }}
        />
      </Card>
      {date !== today ? <Button title="Go to today" kind="secondary" onPress={() => pick(today)} /> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  gap: { marginVertical: Spacing.three },
  buffCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  buffImage: { width: 72, height: 72, borderRadius: Radius.medium },
  buffText: { gap: Spacing.one },
});
