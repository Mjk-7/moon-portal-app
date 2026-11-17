import { useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { AccessibilityInfo, Animated, Easing, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { openLink } from '@/lib/links';
import { queryClient } from '@/lib/query';

/*
 * On Home: wins the person hasn't seen yet (goals met, streaks, levels,
 * badges, big tasks; the portal's lib/wins), with a burst of confetti.
 * Several step through one by one; closing marks them seen, here and on
 * the website.
 */

export type Win = { id: string; emoji: string; title: string; body: string; url: string };
export type Wins = { on: boolean; wins: Win[] };

export const winsKey = ['wins'] as const;
export const useWins = () => useQuery({ queryKey: winsKey, queryFn: () => api<Wins>('/api/me/wins') });

const COLORS = ['#f59e0b', '#10b981', '#3b82f6', '#ef4444', '#a855f7', '#ec4899'];

function Confetti() {
  const pieces = useMemo(
    () =>
      Array.from({ length: 18 }, (_, i) => ({
        left: `${(i * 37) % 100}%` as const,
        drift: ((i * 53) % 80) - 40,
        color: COLORS[i % COLORS.length],
        delay: (i % 6) * 70,
        progress: new Animated.Value(0),
      })),
    [],
  );
  const [still, setStill] = useState(false);
  useEffect(() => {
    void AccessibilityInfo.isReduceMotionEnabled().then((reduce) => {
      if (reduce) return setStill(true);
      Animated.stagger(
        30,
        pieces.map((p) =>
          Animated.timing(p.progress, {
            toValue: 1,
            duration: 1300,
            delay: p.delay,
            easing: Easing.out(Easing.quad),
            useNativeDriver: true,
          }),
        ),
      ).start();
    });
  }, [pieces]);
  if (still) return null;
  return (
    <View pointerEvents="none" style={styles.confetti}>
      {pieces.map((p, i) => (
        <Animated.View
          key={i}
          style={[
            styles.piece,
            {
              left: p.left,
              backgroundColor: p.color,
              opacity: p.progress.interpolate({ inputRange: [0, 0.8, 1], outputRange: [1, 1, 0] }),
              transform: [
                { translateY: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, -110] }) },
                { translateX: p.progress.interpolate({ inputRange: [0, 1], outputRange: [0, p.drift] }) },
                { rotate: p.progress.interpolate({ inputRange: [0, 1], outputRange: ['0deg', '540deg'] }) },
              ],
            },
          ]}
        />
      ))}
    </View>
  );
}

export function WinsCard() {
  const theme = useTheme();
  const wins = useWins();
  const list = wins.data?.wins ?? [];
  const [index, setIndex] = useState(0);
  if (!list.length) return null;
  const win = list[Math.min(index, list.length - 1)];
  const last = index >= list.length - 1;

  const close = () => {
    const seen = list.map((w) => w.id);
    queryClient.setQueryData<Wins>(winsKey, (d) => (d ? { ...d, wins: [] } : d));
    setIndex(0);
    void api('/api/me/wins', { method: 'POST', body: { seen } }).catch(() => null);
  };

  return (
    <Card style={styles.card}>
      <Confetti key={win.id} />
      <View style={styles.top}>
        <ThemedText style={styles.emoji}>{win.emoji}</ThemedText>
        <View style={styles.flex}>
          <ThemedText type="smallBold">{win.title}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {win.body}
          </ThemedText>
        </View>
        <Pressable hitSlop={10} accessibilityRole="button" accessibilityLabel="Close" onPress={close}>
          <Icon name="close" size={16} color={theme.textSecondary} />
        </Pressable>
      </View>
      <View style={styles.actions}>
        {list.length > 1 ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {index + 1} of {list.length}
          </ThemedText>
        ) : (
          <View style={styles.flex} />
        )}
        {win.url ? (
          <Button
            small
            kind="secondary"
            title="View"
            onPress={() => {
              close();
              void openLink(win.url);
            }}
          />
        ) : null}
        <Button small title={last ? 'Nice!' : 'Next'} onPress={() => (last ? close() : setIndex((i) => i + 1))} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  card: { gap: Spacing.two, overflow: 'visible' },
  top: { flexDirection: 'row', alignItems: 'flex-start', gap: Spacing.two },
  emoji: { fontSize: 30, lineHeight: 36 },
  actions: { flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-end', gap: Spacing.two },
  confetti: { position: 'absolute', left: 0, right: 0, top: 8, height: 0 },
  piece: { position: 'absolute', width: 6, height: 9, borderRadius: 2 },
});
