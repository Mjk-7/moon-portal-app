import { useQuery } from '@tanstack/react-query';
import * as Haptics from 'expo-haptics';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CompanyMark } from '@/components/company-mark';
import { Icon } from '@/components/icon';
import { MeetingCard } from '@/components/meeting-card';
import { MonthGrid } from '@/components/month-grid';
import { MenuItem, Popover, useAnchor } from '@/components/popover';
import { ProjectPicker } from '@/components/project-picker';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Chip, IconButton, QueryState, Screen } from '@/components/ui';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { addDays, clock, fromKey, monthOf } from '@/lib/dates';
import { useProjectLabel } from '@/lib/project-name';
import { currentPick, pickOf, STATUS_PICKS, type StatusPick } from '@/lib/status';
import { POINT_LABEL, useChangeTask } from '@/lib/tasks';
import type { TaskDetail } from '@/lib/types';

/**
 * One task, read top down: its status and project as two dropdowns, the
 * title large, one quiet line with the exact day it is planned for and when
 * it is due, then its history. Done, at the bottom, finishes it and goes
 * back to the Work tab. Archiving sits at the end and asks first.
 */
export default function TaskScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { profile } = useAuth();
  const change = useChangeTask();
  const label = useProjectLabel();
  const { anchor: statusAnchor, rect: statusRect, open: openStatus, close: closeStatus } = useAnchor();
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [moving, setMoving] = useState(false);
  const [picking, setPicking] = useState(false);
  const [pickMonth, setPickMonth] = useState<string | null>(null);
  const [moreText, setMoreText] = useState(false);
  const [barHeight, setBarHeight] = useState(90);
  const query = useQuery({
    queryKey: ['task', id],
    queryFn: () => api<TaskDetail>(`/api/mobile/tasks/${id}`),
  });
  const data = query.data;
  const task = data?.task;
  const today = useToday();
  const current = task ? currentPick(task) : null;
  const archived = current === 'archived';
  const goal = task?.goalId ? data?.project?.goals?.find((g) => g.id === task.goalId) : null;
  const project = data?.project ? { ...label(data.project), personal: !!data.project.isPersonal } : null;

  const setStatus = (status: StatusPick) => {
    if (!task || status === current) return;
    void Haptics.selectionAsync().catch(() => null);
    change.mutate({ taskId: task.id, status });
  };

  const setDay = (forDate: string | null) => {
    if (task && forDate !== (task.forDate ?? null)) change.mutate({ taskId: task.id, forDate });
    setPicking(false);
    setPickMonth(null);
  };

  const rename = () => {
    if (!task) return;
    setTitle(task.title);
    setEditing(true);
  };

  // Finishes the task (when it is not yet) and goes back to the day.
  const finish = () => {
    if (!task) return;
    if (current !== 'done') {
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => null);
      change.mutate({ taskId: task.id, status: 'done' });
    }
    router.dismissTo('/work');
  };

  const archive = () => {
    if (!task) return;
    Alert.alert('Archive this task?', 'It leaves your day and your lists. Its history is kept.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Archive',
        style: 'destructive',
        onPress: () => {
          change.mutate({ taskId: task.id, status: 'archived' });
          router.back();
        },
      },
    ]);
  };

  const nameOf = (userId: string) =>
    userId === profile?.id ? 'You' : (data?.people.find((p) => p.id === userId)?.name ?? 'Someone');

  // Newest first, grouped by day.
  const byDay = new Map<string, NonNullable<typeof data>['points']>();
  for (const p of [...(data?.points ?? [])].reverse())
    byDay.set(p.date, [...(byDay.get(p.date) ?? []), p]);
  const updates = data?.points.length ?? 0;

  return (
    <View style={[styles.flex, { backgroundColor: theme.background }]}>
      <Screen
        edgeTop={false}
        contentContainerStyle={[styles.page, { paddingBottom: (task && !archived ? barHeight : 0) + Spacing.four }]}
        refreshControl={
          <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
        }>
        <Stack.Screen
          options={{
            title: goal ? 'Goal' : 'Task',
            headerRight: () =>
              task && !editing ? <IconButton name="pencil" label="Rename" onPress={rename} /> : null,
          }}
        />
        <QueryState
          loading={query.isPending}
          error={query.data ? null : query.error}
          onRetry={() => void query.refetch()}
          what="this task"
        />
        {task && current ? (
          <>
            {/* Status and project: two dropdowns, side by side. */}
            {archived ? (
              <View style={[styles.archived, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
                <Icon name="trash" size={16} color={theme.textSecondary} />
                <ThemedText type="smallBold" themeColor="textSecondary" style={styles.flex}>
                  Archived
                </ThemedText>
                <Button
                  title="Open again"
                  kind="secondary"
                  small
                  onPress={() => change.mutate({ taskId: task.id, status: 'todo' })}
                />
              </View>
            ) : (
              <View style={styles.controls}>
                <Pressable
                  ref={statusAnchor}
                  accessibilityRole="button"
                  accessibilityLabel={`Status: ${pickOf(current).label}. Change it`}
                  onPress={openStatus}
                  style={({ pressed }) => [
                    styles.dropdown,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  <StatusDot status={current} size={12} />
                  <ThemedText type="smallBold">{pickOf(current).label}</ThemedText>
                  <Icon name="chevronDown" size={11} color={theme.textSecondary} />
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`Project: ${project?.name ?? 'none'}. Move it`}
                  onPress={() => setMoving(true)}
                  style={({ pressed }) => [
                    styles.dropdown,
                    styles.shrink,
                    { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
                  ]}>
                  {project && data?.project ? (
                    <CompanyMark
                      id={data.project.id}
                      name={project.name}
                      color={project.color}
                      logo={project.logo}
                      personal={project.personal}
                      size={18}
                    />
                  ) : (
                    <View style={[styles.noProject, { borderColor: theme.textSecondary }]} />
                  )}
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
                    {project?.name ?? 'No project'}
                  </ThemedText>
                  <Icon name="chevronDown" size={11} color={theme.textSecondary} />
                </Pressable>
              </View>
            )}

            {editing ? (
              <View style={styles.editing}>
                <TextInput
                  value={title}
                  onChangeText={setTitle}
                  autoFocus
                  multiline
                  maxLength={200}
                  submitBehavior="blurAndSubmit"
                  returnKeyType="done"
                  onSubmitEditing={() => {
                    if (title.trim()) change.mutate({ taskId: task.id, title: title.trim() });
                    setEditing(false);
                  }}
                  style={[styles.title, styles.titleInput, { color: theme.text, borderColor: theme.border }]}
                />
                <View style={styles.row}>
                  <Button title="Cancel" kind="secondary" small onPress={() => setEditing(false)} style={styles.flex} />
                  <Button
                    title="Save"
                    small
                    disabled={!title.trim()}
                    onPress={() => {
                      change.mutate({ taskId: task.id, title: title.trim() });
                      setEditing(false);
                    }}
                    style={styles.flex}
                  />
                </View>
              </View>
            ) : (
              <Pressable onLongPress={rename} accessibilityHint="Long press to rename">
                <ThemedText
                  style={[
                    styles.title,
                    current === 'done' && { textDecorationLine: 'line-through', color: theme.textSecondary },
                  ]}>
                  {task.title}
                </ThemedText>
              </Pressable>
            )}

            <DateLine
              forDate={task.forDate}
              dueDate={task.dueDate}
              done={current === 'done'}
              today={today}
              onDay={archived ? undefined : () => setPicking(true)}
            />

            {goal ? (
              <Pressable
                disabled={!data?.project}
                onPress={() =>
                  router.push({
                    pathname: '/goal/[projectId]/[goalId]',
                    params: { projectId: data!.project!.id, goalId: goal.id },
                  })
                }
                style={({ pressed }) => [styles.goal, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.7 : 1 }]}>
                <Icon name="target" size={14} color={theme.text} />
                <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                  {goal.kind === 'target' ? 'Counts toward ' : 'Part of '}
                  <ThemedText type="smallBold">{goal.title}</ThemedText>
                </ThemedText>
                <Icon name="forward" size={11} color={theme.textSecondary} />
              </Pressable>
            ) : null}

            {task.description ? (
              <Pressable onPress={() => setMoreText((v) => !v)}>
                <ThemedText themeColor="textSecondary" numberOfLines={moreText ? undefined : 4}>
                  {task.description}
                </ThemedText>
              </Pressable>
            ) : null}
            {task.meeting ? <MeetingCard meeting={task.meeting} title={task.title} /> : null}

            {/* The history, right under the title. */}
            <View style={styles.historyHead}>
              <ThemedText type="label" themeColor="textSecondary" style={styles.flex}>
                History
              </ThemedText>
              {updates ? (
                <ThemedText type="small" themeColor="textSecondary">
                  {updates} {updates === 1 ? 'update' : 'updates'}
                </ThemedText>
              ) : null}
            </View>
            {!archived ? (
              <Pressable
                accessibilityRole="button"
                onPress={() => router.push({ pathname: '/log', params: { taskId: task.id } })}
                style={({ pressed }) => [styles.logWork, { borderColor: theme.textSecondary, opacity: pressed ? 0.6 : 1 }]}>
                <Icon name="pencil" size={15} color={theme.text} />
                <ThemedText type="smallBold">Log work</ThemedText>
              </Pressable>
            ) : null}
            {byDay.size === 0 ? (
              <ThemedText type="small" themeColor="textSecondary" style={styles.center}>
                Nothing logged yet. What you log shows here, newest first.
              </ThemedText>
            ) : (
              Array.from(byDay.entries()).map(([date, points]) => (
                <View key={date} style={styles.dayBlock}>
                  <ThemedText type="smallBold" themeColor="textSecondary">
                    {exactDay(date, today)}
                  </ThemedText>
                  {points.map((p, i) => {
                    const last = i === points.length - 1;
                    return (
                      <View key={p.id} style={styles.entry}>
                        <View style={styles.rail}>
                          <View style={styles.node}>
                            {p.status && p.status !== 'not_done' ? (
                              <StatusDot status={p.status} size={10} />
                            ) : (
                              <View style={[styles.plainNode, { backgroundColor: theme.textSecondary }]} />
                            )}
                          </View>
                          {!last ? <View style={[styles.line, { backgroundColor: theme.border }]} /> : null}
                        </View>
                        <View style={[styles.flex, !last && styles.entryGap]}>
                          <View style={styles.row}>
                            <ThemedText type="smallBold" numberOfLines={1} style={styles.shrink}>
                              {p.by !== 'person'
                                ? `${p.by.charAt(0).toUpperCase()}${p.by.slice(1)} for ${nameOf(p.userId) === 'You' ? 'you' : nameOf(p.userId)}`
                                : nameOf(p.userId)}
                            </ThemedText>
                            <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                              {clock(p.at)}
                            </ThemedText>
                            {p.status ? (
                              <ThemedText
                                type="small"
                                style={{
                                  color:
                                    p.status === 'done'
                                      ? theme.success
                                      : p.status === 'not_done'
                                        ? theme.textSecondary
                                        : (pickOf(p.status).color ?? theme.textSecondary),
                                }}>
                                {POINT_LABEL[p.status] ?? p.status}
                              </ThemedText>
                            ) : null}
                          </View>
                          {p.text ? <ThemedText style={styles.entryText}>{p.text}</ThemedText> : null}
                        </View>
                      </View>
                    );
                  })}
                </View>
              ))
            )}

            {!archived ? (
              <Pressable
                accessibilityRole="button"
                onPress={archive}
                hitSlop={8}
                style={({ pressed }) => [styles.archive, { opacity: pressed ? 0.6 : 1 }]}>
                <Icon name="trash" size={14} color={theme.danger} />
                <ThemedText type="small" themeColor="danger">
                  Archive this task
                </ThemedText>
              </Pressable>
            ) : null}
          </>
        ) : null}
      </Screen>

      {task && current && !archived ? (
        <View
          onLayout={(e) => setBarHeight(e.nativeEvent.layout.height)}
          style={[
            styles.bar,
            { backgroundColor: theme.background, borderColor: theme.border, paddingBottom: insets.bottom + Spacing.two },
          ]}>
          {/* As wide as the page above it (an iPad). */}
          <View style={styles.barInner}>
            <Button
              title={current === 'done' ? 'Back to Work' : 'Done'}
              accessibilityLabel={current === 'done' ? 'Back to Work' : 'Mark done and go back to Work'}
              kind={current === 'done' ? 'secondary' : 'primary'}
              icon={
                current === 'done' ? null : <Icon name="check" size={16} color={theme.onAccent} />
              }
              onPress={finish}
              style={styles.done}
            />
          </View>
        </View>
      ) : null}

      {/* The status menu, dropped from its button. */}
      <Popover rect={statusRect} onClose={closeStatus} width={250}>
        {STATUS_PICKS.map((s) => (
          <MenuItem
            key={s.value}
            label={s.label}
            hint={s.hint}
            leading={<StatusDot status={s.value} size={12} />}
            selected={s.value === current}
            onPress={() => {
              closeStatus();
              setStatus(s.value);
            }}
          />
        ))}
      </Popover>

      <Modal
        visible={picking}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setPicking(false)}>
        <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.sheet}>
          <View style={styles.sheetHead}>
            <ThemedText type="subtitle" style={styles.flex}>
              Which day?
            </ThemedText>
            <IconButton name="close" label="Close" onPress={() => setPicking(false)} />
          </View>
          <View style={styles.chips}>
            <Chip label="Today" selected={task?.forDate === today} onPress={() => setDay(today)} />
            <Chip
              label="Tomorrow"
              selected={task?.forDate === addDays(today, 1)}
              onPress={() => setDay(addDays(today, 1))}
            />
            <Chip label="Later" selected={!task?.forDate} onPress={() => setDay(null)} />
          </View>
          <Card>
            <MonthGrid
              month={pickMonth ?? monthOf(task?.forDate ?? today)}
              onMonth={setPickMonth}
              selected={task?.forDate ?? undefined}
              onDay={setDay}
            />
          </Card>
        </ScrollView>
      </Modal>

      <Modal
        visible={moving}
        animationType="slide"
        presentationStyle="pageSheet"
        onRequestClose={() => setMoving(false)}>
        <View style={[styles.flex, { backgroundColor: theme.background }]}>
          <View style={[styles.sheetHead, styles.sheetPad]}>
            <ThemedText type="subtitle" style={styles.flex}>
              Move to
            </ThemedText>
            <IconButton name="close" label="Close" onPress={() => setMoving(false)} />
          </View>
          <ProjectPicker
            selected={task?.projectId}
            onPick={(place) => {
              if (task) change.mutate({ taskId: task.id, place });
              setMoving(false);
            }}
          />
        </View>
      </Modal>
    </View>
  );
}

/**
 * "Today, 15 Nov", "Mon, 17 Nov", with the year when it is another;
 * "today" and the like in lower case in the middle of a sentence.
 */
function exactDay(key: string, today: string, inline = false) {
  const d = fromKey(key);
  const near =
    key === today ? 'Today' : key === addDays(today, 1) ? 'Tomorrow' : key === addDays(today, -1) ? 'Yesterday' : null;
  const word = near ? (inline ? near.toLowerCase() : near) : d.toLocaleDateString(undefined, { weekday: 'short' });
  const other = key.slice(0, 4) !== today.slice(0, 4);
  return `${word}, ${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', ...(other ? { year: 'numeric' } : {}) })}`;
}

/**
 * Under the title, small: the exact day the task is planned for (a tap
 * moves it) and the day it is due, red once it is late.
 */
function DateLine({
  forDate,
  dueDate,
  done,
  today,
  onDay,
}: {
  forDate?: string | null;
  dueDate?: string | null;
  done: boolean;
  today: string;
  onDay?: () => void;
}) {
  const theme = useTheme();
  const due = dueDate ? dueDate.slice(0, 10) : null;
  const late = !!due && !done && due < today;
  return (
    <View style={styles.dateLine}>
      <Pressable
        disabled={!onDay}
        onPress={onDay}
        accessibilityRole="button"
        accessibilityLabel={`Planned for ${forDate ? exactDay(forDate, today) : 'no day yet'}. Change the day`}
        style={({ pressed }) => [styles.dateItem, { opacity: pressed ? 0.6 : 1 }]}>
        <Icon name="calendar" size={13} color={theme.textSecondary} />
        <ThemedText type="small" themeColor={forDate ? 'text' : 'textSecondary'}>
          {forDate ? exactDay(forDate, today) : 'No day yet'}
        </ThemedText>
        {onDay ? <Icon name="chevronDown" size={10} color={theme.textSecondary} /> : null}
      </Pressable>
      {due ? (
        <View style={styles.dateItem}>
          <Icon name="flag" size={13} color={late ? theme.danger : theme.textSecondary} />
          <ThemedText
            type="small"
            themeColor={late ? 'danger' : 'textSecondary'}
            accessibilityLabel={`${late ? 'Overdue, was due' : 'Due'} ${exactDay(due, today, true)}`}>
            Due {exactDay(due, today, true)}
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  shrink: { flexShrink: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  page: { gap: Spacing.three },
  center: { textAlign: 'center' },
  controls: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  dropdown: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two - 2,
    height: 34,
    paddingHorizontal: Spacing.three - 2,
    borderRadius: 17,
    borderWidth: StyleSheet.hairlineWidth,
  },
  noProject: { width: 18, height: 18, borderRadius: 5, borderWidth: 1.5, borderStyle: 'dashed' },
  archived: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    paddingLeft: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  title: { fontSize: 28, lineHeight: 34, fontWeight: 700, letterSpacing: -0.3 },
  titleInput: {
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  editing: { gap: Spacing.two },
  dateLine: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', columnGap: Spacing.three, rowGap: Spacing.one, marginTop: -Spacing.two },
  dateItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  goal: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
  },
  historyHead: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.two },
  logWork: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two + 4,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  dayBlock: { gap: Spacing.two },
  entry: { flexDirection: 'row', gap: Spacing.two + 2 },
  rail: { width: 12, alignItems: 'center' },
  node: { height: 20, justifyContent: 'center' },
  plainNode: { width: 6, height: 6, borderRadius: 3 },
  line: { flex: 1, width: 1.5, borderRadius: 1, marginTop: 2 },
  entryGap: { paddingBottom: Spacing.three },
  entryText: { marginTop: 2 },
  archive: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.one + 2,
    marginTop: Spacing.three,
    paddingVertical: Spacing.two,
  },
  bar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two + 2,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  barInner: { width: '100%', maxWidth: MaxContentWidth, alignSelf: 'center' },
  done: { height: 52, borderRadius: Radius.large },
  chips: { flexDirection: 'row', gap: Spacing.two },
  sheet: { padding: Spacing.three, gap: Spacing.three },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  sheetPad: { padding: Spacing.three, paddingBottom: 0 },
});
