import { useQuery } from '@tanstack/react-query';
import { Image } from 'expo-image';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useMemo, useRef, useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SafeAreaView } from 'react-native-screens/experimental';

import { CompanyMark } from '@/components/company-mark';
import { DaySheet, type GroupTeam } from '@/components/day-sheet';
import { Fab } from '@/components/fab';
import { Icon } from '@/components/icon';
import { MonthGrid } from '@/components/month-grid';
import { OfflineBanner } from '@/components/offline-banner';
import { StatusDot } from '@/components/status-dot';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Dot, IconButton, Notice, ProgressBar, QueryState } from '@/components/ui';
import { buffOf, buffProgress } from '@/constants/buff';
import { MaxContentWidth, Radius, Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { api, portalUrl, withQuery } from '@/lib/api';
import { companyKeyOf, type DayGroup, groupTally, placeOf, projectGroups } from '@/lib/day';
import { addDays, dayTitle, fromKey, monthOf, monthRange, monthTitle } from '@/lib/dates';
import { openLink } from '@/lib/links';
import { useMarkNotifications } from '@/lib/notifications';
import { useCompanyLookup } from '@/lib/project-name';
import { currentPick, pickOf } from '@/lib/status';
import type { Day, Days, MonthScore, Task } from '@/lib/types';
import { clearWorkReminders, linkOf, useMyTasks, useNeedsYou, useWorkNotifications } from '@/lib/work-badge';

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;
/** Days either side of the anchor the pager holds. */
const SPAN = 180;

/** The company tab that shows every company. */
const ALL = 'all';

/** Someone's tasks in a project on a day (GET /api/me/day/teams). */
type Team = GroupTeam & {
  people: {
    id: string;
    name: string;
    avatar: string | null;
    tasks: (Pick<Task, 'id' | 'title' | 'status' | 'flag'>)[];
  }[];
};

/**
 * The day's worklog, as on the website now: the day by project, with a tab
 * per company (All first) and a bar of what is finished. Each project shows
 * "N mine / M total" when others work there too, and a line to add its next
 * task; Personal is always there. Tasks waiting on the person or blocked
 * show first. Swipe for the day before or after; the date opens a calendar;
 * the month's badge sits top right; + adds a task or goal. At midnight the
 * page moves on to the new day by itself.
 */
export default function WorkScreen() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const params = useLocalSearchParams<{ date?: string }>();
  const today = useToday();
  const [date, setDate] = useState(today);
  const [tab, setTab] = useState(ALL);
  const [calendar, setCalendar] = useState(false);
  // The pager holds a year around this day; a day further away moves it.
  const [anchor, setAnchor] = useState(today);

  // Past midnight the open day was "today": move on with it.
  const [lastToday, setLastToday] = useState(today);
  if (today !== lastToday) {
    setLastToday(today);
    if (date === lastToday) {
      setDate(today);
      setAnchor(today);
    }
  }

  // A link to a day (a reminder, a notification) opens it.
  const [lastParam, setLastParam] = useState<string | undefined>(undefined);
  if (params.date !== lastParam) {
    setLastParam(params.date);
    if (params.date && DAY_KEY.test(params.date)) {
      setDate(params.date);
      if (Math.abs(fromKey(params.date).getTime() - fromKey(anchor).getTime()) > (SPAN - 7) * 86400000)
        setAnchor(params.date);
    }
  }

  // Opening the tab clears the work reminders it counts.
  useFocusEffect(
    useCallback(() => {
      void clearWorkReminders();
    }, []),
  );

  const days = useMemo(
    () => Array.from({ length: SPAN * 2 + 1 }, (_, i) => addDays(anchor, i - SPAN)),
    [anchor],
  );
  const index = days.indexOf(date);
  const list = useRef<FlatList<string>>(null);

  const go = (next: string) => {
    if (next === date) return;
    const i = days.indexOf(next);
    setDate(next);
    if (i < 0) {
      setAnchor(next);
      return;
    }
    list.current?.scrollToIndex({ index: i, animated: Math.abs(i - index) <= 7 });
  };

  const month = monthOf(date);
  const range = monthRange(month);
  const monthDays = useQuery({
    queryKey: ['days', range.from, range.to],
    queryFn: () => api<Days>(withQuery('/api/me/days', range)),
  });
  const score = useQuery({
    queryKey: ['month', month],
    queryFn: () => api<MonthScore>(withQuery('/api/me/month', { month })),
  });

  return (
    <View style={[styles.flex, { backgroundColor: theme.background, paddingTop: insets.top }]}>
      <View style={styles.header}>
        <View style={styles.top}>
          <Pressable
            onPress={() => setCalendar(true)}
            accessibilityRole="button"
            accessibilityHint="Pick a day"
            style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.7 : 1 }]}>
            <ThemedText type="title" numberOfLines={1}>
              {dayTitle(date, today)}
            </ThemedText>
            <View style={styles.dateLine}>
              <ThemedText type="small" themeColor="textSecondary">
                {fromKey(date).toLocaleDateString(undefined, {
                  weekday: 'long',
                  day: 'numeric',
                  month: 'long',
                })}
              </ThemedText>
              <Icon name="chevronDown" size={12} color={theme.textSecondary} />
            </View>
          </Pressable>
          <MonthBadge score={score.data} onPress={() => setCalendar(true)} />
        </View>
        <WeekStrip date={date} today={today} days={monthDays.data} onPick={go} />
        <CompanyTabs date={date} value={tab} onChange={setTab} />
      </View>

      {/* Ends above the tab bar, so the last task and the + clear it. */}
      <SafeAreaView edges={{ bottom: true }} style={styles.flex}>
        <FlatList
          key={anchor}
          ref={list}
          style={styles.flex}
          data={days}
          // The pages show the picked company: draw them again when it changes.
          extraData={tab}
          keyExtractor={(d) => d}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={Math.max(0, index)}
          getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
          initialNumToRender={1}
          maxToRenderPerBatch={2}
          windowSize={3}
          onMomentumScrollEnd={(e) => {
            const i = Math.round(e.nativeEvent.contentOffset.x / width);
            if (days[i] && days[i] !== date) setDate(days[i]);
          }}
          renderItem={({ item }) => <DayPage date={item} today={today} tab={tab} width={width} />}
        />
        <Fab label="Add a task, goal or idea" onPress={() => router.push('/new-task')} />
      </SafeAreaView>

      <CalendarSheet
        visible={calendar}
        date={date}
        onClose={() => setCalendar(false)}
        onPick={(d) => {
          setCalendar(false);
          go(d);
        }}
      />
    </View>
  );
}

/* ------------------------------ Company tabs ------------------------------ */

/** The day's groups by company, in the order the tabs show them. */
function useCompanyGroups(day: Day | undefined, date: string) {
  const lookup = useCompanyLookup();
  if (!day) return { groups: [] as DayGroup[], companies: [] };
  const groups = projectGroups(day, date);
  const keys: string[] = [];
  for (const g of groups) {
    const key = companyKeyOf(g, day);
    if (key !== 'none' && key !== 'personal' && !keys.includes(key)) keys.push(key);
  }
  const tally = (key: string) =>
    groupTally(
      groups.filter((g) => companyKeyOf(g, day) === key),
      day,
      date,
    );
  // Busiest first, Personal last, as on the website.
  const companies = keys
    .map((key) => {
      const company = lookup(key);
      const name = company?.name ?? day.companies?.find((c) => c.id === key)?.name ?? 'Company';
      return { key, name, color: company?.color ?? null, logo: company?.logo ?? null, personal: false, ...tally(key) };
    })
    .sort((a, b) => b.total - a.total);
  companies.push({ key: 'personal', name: 'Personal', color: null, logo: null, personal: true, ...tally('personal') });
  return { groups, companies };
}

function CompanyTabs({ date, value, onChange }: { date: string; value: string; onChange: (tab: string) => void }) {
  const theme = useTheme();
  const day = useQuery({
    queryKey: ['day', date],
    queryFn: () => api<Day>(withQuery('/api/me/day', { date })),
  });
  const { groups, companies } = useCompanyGroups(day.data, date);
  if (!day.data) return <View style={styles.tabsPlaceholder} />;
  const all = groupTally(groups, day.data, date);
  const colorOf = (c: (typeof companies)[number]) => (c.personal ? theme.success : (c.color ?? theme.accent));

  return (
    <View style={styles.tabsWrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        <Pressable
          onPress={() => onChange(ALL)}
          style={({ pressed }) => [
            styles.tab,
            {
              borderColor: value === ALL ? theme.text : theme.border,
              backgroundColor: value === ALL ? theme.backgroundSelected : theme.backgroundElement,
              opacity: pressed ? 0.7 : 1,
            },
          ]}>
          <ThemedText type="smallBold">All</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {all.done}/{all.total}
          </ThemedText>
        </Pressable>
        {companies.map((c) => {
          const on = value === c.key;
          return (
            <Pressable
              key={c.key}
              accessibilityLabel={`${c.name}, ${c.done} of ${c.total} done`}
              onPress={() => onChange(on ? ALL : c.key)}
              style={({ pressed }) => [
                styles.tab,
                styles.tabMark,
                {
                  borderColor: on ? theme.text : theme.border,
                  backgroundColor: on ? theme.backgroundSelected : theme.backgroundElement,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <CompanyMark id={c.key} name={c.name} color={c.color} logo={c.logo} personal={c.personal} size={24} />
              {/* Only the picked company shows its name, as on the website. */}
              {on ? (
                <>
                  <ThemedText type="smallBold" numberOfLines={1} style={styles.tabName}>
                    {c.name}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {c.done}/{c.total}
                  </ThemedText>
                </>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      {/* One stretch per company, filled as its tasks finish. */}
      {all.total ? (
        <View style={styles.barRow}>
          <View style={styles.bar}>
            {companies
              .filter((c) => c.total)
              .map((c) => (
                <View
                  key={c.key}
                  style={[
                    styles.barPart,
                    { flex: c.total, backgroundColor: theme.backgroundSelected },
                    value !== ALL && value !== c.key && styles.barDim,
                  ]}>
                  <View
                    style={[styles.barFill, { width: `${(c.done / c.total) * 100}%`, backgroundColor: colorOf(c) }]}
                  />
                </View>
              ))}
          </View>
          <ThemedText type="small" themeColor="textSecondary">
            {all.done}/{all.total} done
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

/* ------------------------------- Month badge ------------------------------ */

function MonthBadge({ score, onPress }: { score?: MonthScore; onPress: () => void }) {
  const theme = useTheme();
  const points = score?.points ?? 0;
  const buff = buffOf(points);
  return (
    <Pressable
      onPress={onPress}
      accessibilityLabel={`${buff.title}, ${points} points this month`}
      style={({ pressed }) => [
        styles.badge,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <Image source={{ uri: portalUrl(buff.src) }} style={styles.badgeImage} contentFit="contain" />
      <View>
        <ThemedText type="smallBold" numberOfLines={1} style={styles.badgeTitle}>
          {buff.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" style={styles.badgePoints}>
          {score ? `${points} pts` : '…'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

/* -------------------------------- Week strip ------------------------------ */

const LETTERS = ['M', 'T', 'W', 'T', 'F', 'S', 'S'];

function WeekStrip({
  date,
  today,
  days,
  onPick,
}: {
  date: string;
  today: string;
  days?: Days;
  onPick: (day: string) => void;
}) {
  const theme = useTheme();
  const monday = addDays(date, -((fromKey(date).getDay() + 6) % 7));
  return (
    <View style={styles.week}>
      {LETTERS.map((letter, i) => {
        const day = addDays(monday, i);
        const on = day === date;
        const worked = (days?.days[day] ?? []).length > 0;
        return (
          <Pressable key={day} onPress={() => onPick(day)} style={styles.weekDay}>
            <ThemedText type="small" themeColor="textSecondary">
              {letter}
            </ThemedText>
            <View
              style={[
                styles.weekNumber,
                on && { backgroundColor: theme.accent },
                !on && day === today && { borderColor: theme.text, borderWidth: 1.5 },
              ]}>
              <ThemedText
                type={on || day === today ? 'smallBold' : 'small'}
                style={on && { color: theme.onAccent }}>
                {Number(day.slice(8))}
              </ThemedText>
            </View>
            <Dot size={4} color={worked ? theme.success : 'transparent'} />
          </Pressable>
        );
      })}
    </View>
  );
}

/* --------------------------------- A day --------------------------------- */

function DayPage({
  date,
  today,
  tab,
  width,
}: {
  date: string;
  today: string;
  tab: string;
  width: number;
}) {
  const theme = useTheme();
  const day = useQuery({
    queryKey: ['day', date],
    queryFn: () => api<Day>(withQuery('/api/me/day', { date })),
  });
  const [teamOf, setTeamOf] = useState<string | null>(null);
  const { groups: all } = useCompanyGroups(day.data, date);
  const groups = day.data && tab !== ALL ? all.filter((g) => companyKeyOf(g, day.data!) === tab) : all;
  // Who else works in the day's projects (not Personal).
  const projectIds = all
    .filter((g) => g.key.startsWith('project:') && !g.place?.personal)
    .map((g) => g.key.slice(8))
    .slice(0, 24);
  const teams = useQuery({
    queryKey: ['day', date, 'teams', projectIds.join(',')],
    queryFn: () =>
      api<{ projects: Record<string, Team> }>(
        withQuery('/api/me/day/teams', { date, projects: projectIds.join(',') }),
      ),
    enabled: projectIds.length > 0,
  });
  const ahead = date > today;
  const empty = !!day.data && !groups.some((g) => g.tasks.length);
  const team = teamOf ? teams.data?.projects[teamOf] : null;
  const teamName = teamOf ? groups.find((g) => g.key === `project:${teamOf}`)?.title : null;

  return (
    <ScrollView
      style={{ width }}
      // Room under the last task for the + button.
      contentContainerStyle={[styles.page, { paddingBottom: Spacing.six * 2 + Spacing.three }]}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl
          refreshing={day.isRefetching}
          onRefresh={() => {
            void day.refetch();
            void teams.refetch();
          }}
        />
      }>
      {date === today ? <OfflineBanner /> : null}
      {date === today ? <NeedsYou day={day.data} /> : null}
      {date === today ? <WorkUpdates /> : null}
      <QueryState
        loading={day.isPending}
        error={day.data ? null : day.error}
        onRetry={() => void day.refetch()}
        what="this day"
      />
      {empty ? (
        <Notice
          title={ahead ? 'Nothing planned yet' : 'Nothing on this day'}
          body={ahead ? 'Add a task for this day below.' : 'Log what you worked on, or add a task below.'}
        />
      ) : null}
      {day.data ? (
        <DaySheet
          day={day.data}
          date={date}
          mode="summary"
          groups={groups}
          teams={teams.data?.projects}
          onTeam={setTeamOf}
        />
      ) : null}
      {day.data ? (
        <Pressable
          accessibilityRole="button"
          onPress={() => router.push('/log')}
          style={({ pressed }) => [styles.logWork, { borderColor: theme.textSecondary, opacity: pressed ? 0.6 : 1 }]}>
          <Icon name="pencil" size={16} color={theme.text} />
          <ThemedText type="smallBold">Log work</ThemedText>
        </Pressable>
      ) : null}
      <TeamSheet team={team ?? null} name={teamName ?? 'Project'} date={date} onClose={() => setTeamOf(null)} />
    </ScrollView>
  );
}

/** Everyone's tasks in a project on the day, by person, from "N mine / M total". */
function TeamSheet({
  team,
  name,
  date,
  onClose,
}: {
  team: Team | null;
  name: string;
  date: string;
  onClose: () => void;
}) {
  const theme = useTheme();
  return (
    <Modal visible={!!team} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView style={{ backgroundColor: theme.background }} contentContainerStyle={styles.sheet}>
        <View style={styles.sheetHead}>
          <View style={styles.flex}>
            <ThemedText type="subtitle" numberOfLines={1}>
              {name}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {dayTitle(date)} · {team?.mine ?? 0} mine / {team?.total ?? 0} total
            </ThemedText>
          </View>
          <IconButton name="close" label="Close" onPress={onClose} />
        </View>
        {(team?.people ?? []).map((person) => (
          <Card key={person.id} style={styles.teamCard}>
            <View style={styles.teamWho}>
              <Avatar uri={person.avatar} name={person.name} size={28} />
              <ThemedText type="smallBold" style={styles.flex} numberOfLines={1}>
                {person.name}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary">
                {person.tasks.length}
              </ThemedText>
            </View>
            {person.tasks.map((t) => {
              const status = currentPick(t);
              return (
                <Pressable
                  key={t.id}
                  onPress={() => {
                    onClose();
                    router.push({ pathname: '/task/[id]', params: { id: t.id } });
                  }}
                  style={({ pressed }) => [styles.teamTask, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
                  {status === 'done' ? (
                    <Icon name="checkCircle" size={16} color={theme.success} />
                  ) : status !== 'archived' ? (
                    <StatusDot status={status} size={10} />
                  ) : null}
                  <ThemedText
                    style={[styles.flex, status === 'done' && { color: theme.textSecondary }]}
                    numberOfLines={2}>
                    {t.title}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {status === 'archived' ? 'Archived' : pickOf(status).label}
                  </ThemedText>
                </Pressable>
              );
            })}
          </Card>
        ))}
      </ScrollView>
    </Modal>
  );
}

/**
 * Tasks waiting on the person or blocked, wherever they are: the Work tab's
 * number, shown first on today's page.
 */
function NeedsYou({ day }: { day?: Day }) {
  const theme = useTheme();
  const tasks = useNeedsYou();
  const mine = useMyTasks().data;
  if (!tasks.length) return null;
  const projects = [...(day?.projects ?? []), ...(mine?.projects ?? [])];
  return (
    <Card style={[styles.updates, { borderColor: theme.danger }]}>
      <ThemedText type="label" themeColor="textSecondary">
        Needs you · {tasks.length}
      </ThemedText>
      {tasks.map((task) => {
        const status = currentPick(task);
        const place = placeOf(task, { projects, companies: day?.companies });
        return (
          <Pressable
            key={task.id}
            onPress={() => router.push({ pathname: '/task/[id]', params: { id: task.id } })}
            style={({ pressed }) => [styles.update, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.needDot}>
              {status !== 'archived' ? <StatusDot status={status} size={10} /> : null}
            </View>
            <View style={styles.flex}>
              <ThemedText type="smallBold" numberOfLines={2}>
                {task.title}
              </ThemedText>
              <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
                {[status === 'blocked' ? 'Blocked' : 'Waiting on you', place.key !== 'none' ? place.name : null]
                  .filter(Boolean)
                  .join(' · ')}
              </ThemedText>
            </View>
            <Icon name="forward" size={14} color={theme.textSecondary} />
          </Pressable>
        );
      })}
    </Card>
  );
}

/** Unread notifications about work, on today's page. */
function WorkUpdates() {
  const theme = useTheme();
  const updates = useWorkNotifications();
  const mark = useMarkNotifications();
  if (!updates.length) return null;
  return (
    <Card style={styles.updates}>
      <ThemedText type="label" themeColor="textSecondary">
        Work updates · {updates.length}
      </ThemedText>
      {updates.slice(0, 4).map((n) => (
        <Pressable
          key={n.id}
          onPress={() => {
            mark.mutate({ ids: [n.id], isRead: true });
            void openLink(linkOf(n));
          }}
          style={({ pressed }) => [styles.update, { borderColor: theme.border, opacity: pressed ? 0.6 : 1 }]}>
          <Dot color={theme.danger} size={8} />
          <View style={styles.flex}>
            <ThemedText type="smallBold" numberOfLines={1}>
              {n.title}
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
              {n.description}
            </ThemedText>
          </View>
        </Pressable>
      ))}
    </Card>
  );
}

/* -------------------------------- Calendar -------------------------------- */

function CalendarSheet({
  visible,
  date,
  onClose,
  onPick,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
  onPick: (day: string) => void;
}) {
  const theme = useTheme();
  const today = useToday();
  const [month, setMonth] = useState(monthOf(date));
  const [shownFor, setShownFor] = useState(date);
  // Opening on another day shows its month.
  if (shownFor !== date) {
    setShownFor(date);
    setMonth(monthOf(date));
  }
  const range = monthRange(month);
  const days = useQuery({
    queryKey: ['days', range.from, range.to],
    queryFn: () => api<Days>(withQuery('/api/me/days', range)),
    enabled: visible,
  });
  const score = useQuery({
    queryKey: ['month', month],
    queryFn: () => api<MonthScore>(withQuery('/api/me/month', { month })),
    enabled: visible,
  });
  const points = score.data?.points ?? 0;
  const buff = buffOf(points);
  const lines = (day: string) => days.data?.days[day] ?? [];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <ScrollView
        style={{ backgroundColor: theme.background }}
        contentContainerStyle={styles.sheet}>
        <View style={styles.sheetHead}>
          <ThemedText type="subtitle" style={styles.flex}>
            Pick a day
          </ThemedText>
          <IconButton name="close" label="Close" onPress={onClose} />
        </View>
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
        <Card>
          <MonthGrid
            month={month}
            onMonth={setMonth}
            selected={date}
            onDay={onPick}
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
        {date !== today ? <Button title="Go to today" kind="secondary" onPress={() => onPick(today)} /> : null}
      </ScrollView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  header: {
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  top: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  dateLine: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingLeft: Spacing.one,
    paddingRight: Spacing.three,
    paddingVertical: Spacing.one,
    maxWidth: 170,
  },
  badgeImage: { width: 38, height: 38 },
  badgeTitle: { fontSize: 13, lineHeight: 16 },
  badgePoints: { fontSize: 12, lineHeight: 15 },
  week: { flexDirection: 'row' },
  weekDay: { flex: 1, alignItems: 'center', gap: 3 },
  weekNumber: {
    width: 34,
    height: 34,
    borderRadius: 17,
    alignItems: 'center',
    justifyContent: 'center',
  },
  page: {
    padding: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.three,
    width: '100%',
    maxWidth: MaxContentWidth,
    alignSelf: 'center',
  },
  needDot: { paddingTop: 5 },
  tabsWrap: { gap: Spacing.two },
  tabsPlaceholder: { height: 40 },
  tabs: { gap: Spacing.two, alignItems: 'center' },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one + 2,
    height: 40,
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: Spacing.three,
  },
  tabMark: { paddingHorizontal: 7 },
  tabName: { maxWidth: 140 },
  barRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  bar: { flex: 1, flexDirection: 'row', gap: 4 },
  barPart: { height: 5, borderRadius: 3, overflow: 'hidden' },
  barDim: { opacity: 0.35 },
  barFill: { height: 5, borderRadius: 3 },
  logWork: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
    borderStyle: 'dashed',
  },
  teamCard: { gap: 0 },
  teamWho: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, paddingBottom: Spacing.two },
  teamTask: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  updates: { gap: 0 },
  update: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  sheet: { padding: Spacing.three, gap: Spacing.three },
  sheetHead: { flexDirection: 'row', alignItems: 'center' },
  buffCard: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  buffImage: { width: 72, height: 72, borderRadius: Radius.medium },
  buffText: { gap: Spacing.one },
});
