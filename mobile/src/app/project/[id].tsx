import { useQuery } from '@tanstack/react-query';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { PlanCard } from '@/components/plan-card';
import { ProjectHeader } from '@/components/project-header';
import { ProjectWorklogs } from '@/components/project-worklogs';
import { TaskRow } from '@/components/task-list';
import { ThemedText } from '@/components/themed-text';
import {
  Avatar,
  Card,
  IconButton,
  PressableCard,
  Notice,
  ProgressBar,
  QueryState,
  Row,
  Screen,
  Segmented,
} from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useToday } from '@/hooks/use-now';
import { useTheme } from '@/hooks/use-theme';
import { api, messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { accentOf, pickKit } from '@/lib/brand';
import { addDays, fromKey } from '@/lib/dates';
import { goalLine } from '@/lib/goals';
import { openWebsite } from '@/lib/links';
import { usePlans } from '@/lib/plans';
import { projectPagesQuery, projectQuery } from '@/lib/project';
import { isCoreProject, useCompanyLookup, useProjectLabel } from '@/lib/project-name';
import { queryClient } from '@/lib/query';
import { statusLabel } from '@/lib/tasks';
import type { ChatConversation, ProjectGoal, ProjectPage, Task } from '@/lib/types';

type TaskView = 'mine' | 'open' | 'done';
type Tab = 'home' | 'tasks' | 'goals' | 'logs' | 'pages' | 'plans';

const TABS: { value: Tab; label: string }[] = [
  { value: 'home', label: 'Home' },
  { value: 'tasks', label: 'Tasks' },
  { value: 'goals', label: 'Goals' },
  { value: 'logs', label: 'Logs' },
  { value: 'pages', label: 'Pages' },
  { value: 'plans', label: 'Plans' },
];

/** The Monday of the week that holds a YYYY-MM-DD day. */
const mondayOf = (day: string) => addDays(day, -((fromKey(day).getDay() + 6) % 7));

/**
 * A project, as on the website: its brand at the top (banner, logo,
 * colours; its leads pick the banner), then tabs along the top: Home (the
 * week in numbers, goals and team), Tasks, Goals, Logs, and Pages and Plans,
 * each with its own list, like the website's sidebar.
 */
export default function ProjectScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const theme = useTheme();
  const label = useProjectLabel();
  const companyOf = useCompanyLookup();
  const { profile } = useAuth();
  const me = profile?.id ?? '';
  const today = useToday();
  const [tab, setTab] = useState<Tab>('home');
  const [view, setView] = useState<TaskView>('mine');
  const [goalView, setGoalView] = useState<TaskView>('mine');
  const [opening, setOpening] = useState(false);
  const query = useQuery(projectQuery(id));
  const pages = useQuery(projectPagesQuery(id));
  const plans = usePlans();
  const project = query.data?.project;
  const people = query.data?.people ?? [];
  const onTeam = !!project && (project.leadIds.includes(me) || project.memberIds.includes(me));
  const isLead = !!project && project.leadIds.includes(me);

  const isMine = (t: Task) => t.ownerId === me || (t.assigneeIds ?? []).includes(me);
  const live = (query.data?.tasks ?? []).filter((t) => t.status !== 'ARCHIVED' && t.status !== 'IGNORED');
  const lists: Record<TaskView, Task[]> = {
    mine: live.filter((t) => isMine(t) && t.status !== 'DONE'),
    open: live.filter((t) => t.status !== 'DONE'),
    done: live
      .filter((t) => t.status === 'DONE')
      .sort((a, b) => (b.completedAt ?? '').localeCompare(a.completedAt ?? ''))
      .slice(0, 30),
  };
  // Goals the same way: yours (naming you, or the whole team's), open, met.
  const progressOf = (goalId: string) => project?.goalProgress?.find((p) => p.goalId === goalId);
  const goalMet = (g: ProjectGoal) => {
    const progress = progressOf(g.id);
    if (g.kind === 'target') return !!g.achievedAt || !!progress?.achieved;
    return !!progress && progress.done >= progress.target;
  };
  const goals = project?.goals ?? [];
  const forMe = (g: ProjectGoal) => (g.assigneeIds?.length ? g.assigneeIds.includes(me) : onTeam);
  const goalLists: Record<TaskView, ProjectGoal[]> = {
    mine: goals.filter((g) => forMe(g) && !goalMet(g)),
    open: goals.filter((g) => !goalMet(g)),
    done: goals.filter(goalMet),
  };
  const nameOf = (userId?: string | null) =>
    userId === me ? 'You' : (people.find((p) => p.id === userId)?.name ?? null);

  const openChat = async () => {
    setOpening(true);
    try {
      const res = await api<{ conversation: ChatConversation }>('/api/chat/projects', {
        method: 'POST',
        body: { projectId: id },
      });
      router.push({ pathname: '/chat/[id]', params: { id: res.conversation.id } });
    } catch (e) {
      Alert.alert('Couldn’t open the project chat', messageOf(e));
    } finally {
      setOpening(false);
    }
  };

  const company = companyOf(project?.companyId);
  const core = isCoreProject(project);
  // The project's own kit; the company's for its core project.
  const kit = pickKit(project?.brandKit, core ? company?.brandKit : null);
  const accent = accentOf(kit) ?? project?.color ?? company?.color ?? null;
  const openCount = live.filter((t) => t.status !== 'DONE').length;
  // The week runs Monday to Sunday, as on the website.
  const monday = mondayOf(today);
  const sunday = addDays(monday, 6);
  const dayOf = (iso?: string | null) => (iso ? iso.slice(0, 10) : null);
  const doneThisWeek = live.filter((t) => {
    const day = t.completedAt ? dayOf(new Date(t.completedAt).toISOString()) : null;
    return t.status === 'DONE' && !!day && day >= monday && day <= sunday;
  }).length;
  const overdue = live.filter((t) => t.status !== 'DONE' && !!t.dueDate && dayOf(t.dueDate)! < today).length;
  const goalsMet = goals.filter(goalMet).length;
  const projectPlans = (plans.data?.plans ?? []).filter((p) => p.projectId === id);

  return (
    <Screen
      edgeTop={false}
      // The tabs stay on top as the page scrolls (header, query state and
      // Stack.Screen come before them).
      stickyHeaderIndices={project ? [3] : undefined}
      refreshControl={
        <RefreshControl
          refreshing={query.isRefetching}
          onRefresh={() => {
            void query.refetch();
            void pages.refetch();
            void plans.refetch();
            void queryClient.invalidateQueries({ queryKey: ['project', id, 'worklogs'] });
          }}
        />
      }>
      <Stack.Screen options={{ title: project ? label(project).name : 'Project' }} />
      <QueryState
        loading={query.isPending}
        error={query.data ? null : query.error}
        onRetry={() => void query.refetch()}
        what="this project"
      />
      {project ? (
          <ProjectHeader
            name={label(project).name}
            handle={[
              core ? 'Company work' : project.slug ? `@${project.slug}` : null,
              core ? null : company?.name,
            ]
              .filter(Boolean)
              .join(' · ')}
            stats={[
              `${people.length} ${people.length === 1 ? 'person' : 'people'}`,
              `${openCount} open ${openCount === 1 ? 'task' : 'tasks'}`,
              project.progress?.total ? `${Math.round(project.progress.percent)}% done` : null,
            ]
              .filter(Boolean)
              .join(' · ')}
            description={project.description ?? (core ? company?.description : null)}
            kit={kit}
            banner={project.headerImage}
            onEditBanner={
              isLead
                ? () => router.push({ pathname: '/header-image', params: { id: project.id } })
                : undefined
            }
            logo={core ? (company?.logo ?? null) : (project.logo ?? null)}
            color={project.color ?? company?.color}
            actions={
              <>
                {onTeam ? (
                  <Pressable
                    disabled={opening}
                    onPress={() => void openChat()}
                    style={({ pressed }) => [
                      styles.chatPill,
                      { backgroundColor: theme.accent, opacity: opening ? 0.6 : pressed ? 0.8 : 1 },
                    ]}>
                    <Icon name="chat" size={16} color={theme.onAccent} />
                    <ThemedText type="smallBold" style={{ color: theme.onAccent }}>
                      {opening ? 'Opening…' : 'Chat'}
                    </ThemedText>
                  </Pressable>
                ) : null}
                <IconButton
                  name="globe"
                  label="Open on the website"
                  onPress={() => void openWebsite(`/projects/${project.id}`)}
                />
              </>
            }
          />
      ) : null}
      {project ? <TabBar value={tab} onChange={setTab} counts={{ tasks: openCount, goals: goals.length - goalsMet, plans: projectPlans.length }} /> : null}
      {project ? (
        <View style={styles.body}>
          {tab === 'home' ? (
            <>
              <View style={styles.tiles}>
                <Tile label="Open" value={openCount} onPress={() => { setView('open'); setTab('tasks'); }} />
                <Tile label="Done this week" value={doneThisWeek} color={theme.success} onPress={() => { setView('done'); setTab('tasks'); }} />
                <Tile label="Overdue" value={overdue} color={overdue ? theme.danger : undefined} onPress={() => { setView('open'); setTab('tasks'); }} />
                <Tile label="Goals met" value={goalsMet} of={goals.length} onPress={() => setTab('goals')} />
              </View>
            {project.progress?.total ? (
              <Card>
                <View style={styles.row}>
                  <ThemedText type="smallBold" style={styles.flex}>
                    Progress
                  </ThemedText>
                  <ThemedText type="smallBold">{Math.round(project.progress.percent)}%</ThemedText>
                </View>
                <ProgressBar percent={project.progress.percent} color={accent} />
                <ThemedText type="small" themeColor="textSecondary">
                  {project.progress.done} of {project.progress.total} tasks done
                  {project.progress.major ? ` · ${project.progress.majorDone} of ${project.progress.major} major` : ''}
                </ThemedText>
              </Card>
            ) : null}


              {goals.length ? (
                <Card>
                  <View style={styles.row}>
                    <ThemedText type="label" themeColor="textSecondary" style={styles.flex}>
                      Goals
                    </ThemedText>
                    <Pressable hitSlop={8} onPress={() => setTab('goals')}>
                      <ThemedText type="smallBold" themeColor="textSecondary">
                        All
                      </ThemedText>
                    </Pressable>
                  </View>
                  {goals.slice(0, 4).map((g) => {
                    const progress = progressOf(g.id);
                    return (
                      <View key={g.id} style={styles.goalLine}>
                        <View style={styles.row}>
                          <ThemedText type="small" numberOfLines={1} style={styles.flex}>
                            {goalMet(g) ? '✓ ' : ''}
                            {g.title}
                          </ThemedText>
                          <ThemedText type="small" themeColor="textSecondary">
                            {goalLine(g, progress)}
                          </ThemedText>
                        </View>
                        {progress ? <ProgressBar percent={progress.percent} color={goalMet(g) ? theme.success : accent} /> : null}
                      </View>
                    );
                  })}
                </Card>
              ) : null}
            {people.length ? (
              <View style={styles.group}>
                <ThemedText type="label" themeColor="textSecondary">
                  Team · {people.length}
                </ThemedText>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.team}>
                  {[...people]
                    .sort((a, b) => Number(project.leadIds.includes(b.id)) - Number(project.leadIds.includes(a.id)))
                    .map((p) => (
                      <View key={p.id} style={styles.person}>
                        <Avatar uri={p.avatar} name={p.name} size={44} />
                        <ThemedText type="small" numberOfLines={1} style={styles.personName}>
                          {p.id === me ? 'You' : (p.name?.split(' ')[0] ?? '—')}
                        </ThemedText>
                        {project.leadIds.includes(p.id) ? (
                          <ThemedText type="small" themeColor="textSecondary">
                            Lead
                          </ThemedText>
                        ) : null}
                      </View>
                    ))}
                </ScrollView>
              </View>
            ) : null}

            </>
          ) : null}

          {tab === 'tasks' ? (
            <View style={styles.group}>
              <ThemedText type="label" themeColor="textSecondary">
                Tasks
              </ThemedText>
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: 'mine', label: `Yours ${lists.mine.length}` },
                  { value: 'open', label: `Open ${lists.open.length}` },
                  { value: 'done', label: 'Done' },
                ]}
              />
              {lists[view].length ? (
                <Card style={styles.tasks}>
                  {lists[view].map((t) =>
                    isMine(t) ? (
                      <TaskRow key={t.id} task={t} showDay />
                    ) : (
                      <View key={t.id} style={styles.other}>
                        <ThemedText>{t.title}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {[nameOf(t.assigneeIds?.[0] ?? t.ownerId), statusLabel(t)].filter(Boolean).join(' · ')}
                        </ThemedText>
                      </View>
                    ),
                  )}
                </Card>
              ) : (
                <ThemedText themeColor="textSecondary">
                  {view === 'mine' ? 'Nothing open for you here.' : view === 'open' ? 'No open tasks.' : 'Nothing finished yet.'}
                </ThemedText>
              )}
            </View>
          ) : null}

          {tab === 'goals' ? (
            <View style={styles.group}>
              <ThemedText type="label" themeColor="textSecondary">
                Goals
              </ThemedText>
              <Segmented
                value={goalView}
                onChange={setGoalView}
                options={[
                  { value: 'mine', label: `Yours ${goalLists.mine.length}` },
                  { value: 'open', label: `Open ${goalLists.open.length}` },
                  { value: 'done', label: `Done ${goalLists.done.length}` },
                ]}
              />
              {!goals.length ? (
                <Notice title="No goals yet" body="Add one with + on the Worklogs tab, or on the website." />
              ) : goalLists[goalView].length ? (
                goalLists[goalView].map((g) => {
                  const progress = progressOf(g.id);
                  return (
                    <PressableCard
                      key={g.id}
                      onPress={() =>
                        router.push({
                          pathname: '/goal/[projectId]/[goalId]',
                          params: { projectId: project.id, goalId: g.id },
                        })
                      }>
                      <ThemedText type="smallBold">{g.title}</ThemedText>
                      {progress ? <ProgressBar percent={progress.percent} color={accent} /> : null}
                      <ThemedText type="small" themeColor="textSecondary">
                        {goalLine(g, progress)}
                      </ThemedText>
                    </PressableCard>
                  );
                })
              ) : (
                <ThemedText themeColor="textSecondary">
                  {goalView === 'mine'
                    ? 'No open goals for you here.'
                    : goalView === 'open'
                      ? 'Every goal is met.'
                      : 'No goal met yet.'}
                </ThemedText>
              )}
            </View>
          ) : null}

          {tab === 'logs' ? <ProjectWorklogs projectId={project.id} me={me} color={accent} /> : null}

          {tab === 'pages' ? (
            <PagesTree
              projectId={project.id}
              objective={pages.data?.objective ?? null}
              pages={pages.data?.pages}
              loading={pages.isPending}
              error={pages.data ? null : pages.error}
              onRetry={() => void pages.refetch()}
            />
          ) : null}

          {tab === 'plans' ? (
            <View style={styles.group}>
              <QueryState
                loading={plans.isPending}
                error={plans.data ? null : plans.error}
                onRetry={() => void plans.refetch()}
                what="plans"
              />
              {plans.data && !projectPlans.length ? (
                <Notice title="No plans in this project yet" body="Plans made for this project show here." />
              ) : null}
              {plans.data ? projectPlans.map((plan) => <PlanCard key={plan.id} plan={plan} list={plans.data!} />) : null}
              <Row icon="map" title="All plans" detail="Across your companies" chevron onPress={() => router.push('/plans')} />
            </View>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

/* --------------------------------- Tabs ---------------------------------- */

/** The tabs along the top, as on the website, underlined when picked. */
function TabBar({
  value,
  onChange,
  counts,
}: {
  value: Tab;
  onChange: (tab: Tab) => void;
  counts: Partial<Record<Tab, number>>;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.tabBar, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.tabs}>
        {TABS.map((t) => {
          const on = t.value === value;
          const count = counts[t.value];
          return (
            <Pressable
              key={t.value}
              accessibilityRole="tab"
              accessibilityState={{ selected: on }}
              onPress={() => onChange(t.value)}
              style={[styles.tab, on && { borderColor: theme.text }]}>
              <ThemedText type={on ? 'smallBold' : 'small'} themeColor={on ? 'text' : 'textSecondary'}>
                {t.label}
                {count ? (
                  <ThemedText type="small" themeColor="textSecondary">
                    {' '}
                    {count}
                  </ThemedText>
                ) : null}
              </ThemedText>
            </Pressable>
          );
        })}
      </ScrollView>
    </View>
  );
}

/** A number on the Home tab: open, done this week, overdue, goals met. */
function Tile({
  label,
  value,
  of,
  color,
  onPress,
}: {
  label: string;
  value: number;
  of?: number;
  color?: string;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [
        styles.tile,
        { backgroundColor: theme.backgroundElement, borderColor: theme.border, opacity: pressed ? 0.7 : 1 },
      ]}>
      <ThemedText type="label" themeColor="textSecondary" numberOfLines={1}>
        {label}
      </ThemedText>
      <ThemedText style={[styles.tileValue, color ? { color } : null]}>
        {value}
        {of !== undefined ? (
          <ThemedText themeColor="textSecondary" style={styles.tileOf}>
            {' '}
            of {of}
          </ThemedText>
        ) : null}
      </ThemedText>
    </Pressable>
  );
}

/**
 * The project's pages as the website's sidebar shows them: the objective,
 * then every page with the pages inside it, opened and closed in place.
 */
function PagesTree({
  projectId,
  objective,
  pages,
  loading,
  error,
  onRetry,
}: {
  projectId: string;
  objective: ProjectPage | null;
  pages?: ProjectPage[];
  loading: boolean;
  error: Error | null;
  onRetry: () => void;
}) {
  const theme = useTheme();
  const [open, setOpen] = useState<Set<string>>(new Set());
  const all = pages ?? [];
  const childrenOf = (parentId: string | null) =>
    all.filter((p) => (p.parentId ?? null) === parentId && p.kind !== 'OBJECTIVE');
  const openPage = (pageId: string) =>
    router.push({ pathname: '/page/[projectId]/[pageId]', params: { projectId, pageId } });
  const toggle = (pageId: string) =>
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(pageId)) next.delete(pageId);
      else next.add(pageId);
      return next;
    });

  const branch = (parentId: string | null, depth: number): React.ReactNode =>
    childrenOf(parentId).map((p) => {
      const kids = childrenOf(p.id).length;
      const expanded = open.has(p.id);
      return (
        <View key={p.id}>
          <Pressable
            onPress={() => openPage(p.id)}
            style={({ pressed }) => [
              styles.pageRow,
              { paddingLeft: Spacing.two + depth * Spacing.four, opacity: pressed ? 0.6 : 1 },
            ]}>
            <Pressable
              hitSlop={8}
              disabled={!kids}
              accessibilityLabel={expanded ? 'Hide the pages inside' : 'Show the pages inside'}
              onPress={() => toggle(p.id)}
              style={[styles.pageToggle, { transform: [{ rotate: expanded ? '90deg' : '0deg' }] }]}>
              {kids ? <Icon name="chevron" size={12} color={theme.textSecondary} /> : null}
            </Pressable>
            {p.emoji ? (
              <ThemedText style={styles.pageEmoji}>{p.emoji}</ThemedText>
            ) : (
              <Icon name="page" size={16} color={theme.textSecondary} />
            )}
            <ThemedText numberOfLines={1} style={styles.flex}>
              {p.title || 'Untitled'}
            </ThemedText>
            {kids && !expanded ? (
              <ThemedText type="small" themeColor="textSecondary">
                {kids}
              </ThemedText>
            ) : null}
          </Pressable>
          {expanded ? branch(p.id, depth + 1) : null}
        </View>
      );
    });

  return (
    <View style={styles.group}>
      <QueryState loading={loading} error={error} onRetry={onRetry} what="the pages" />
      {pages ? (
        <Card style={styles.tree}>
          {objective ? (
            <Pressable
              onPress={() => openPage(objective.id)}
              style={({ pressed }) => [styles.pageRow, { opacity: pressed ? 0.6 : 1 }]}>
              <View style={styles.pageToggle} />
              <Icon name="flag" size={16} color={theme.textSecondary} />
              <ThemedText type="smallBold" numberOfLines={1} style={styles.flex}>
                {objective.title || 'Objective'}
              </ThemedText>
            </Pressable>
          ) : null}
          {branch(null, 0)}
          {!objective && !childrenOf(null).length ? (
            <ThemedText type="small" themeColor="textSecondary" style={styles.treeEmpty}>
              No pages yet.
            </ThemedText>
          ) : null}
          <Pressable
            onPress={() => openPage('new')}
            style={({ pressed }) => [styles.pageRow, { opacity: pressed ? 0.6 : 1 }]}>
            <View style={styles.pageToggle} />
            <Icon name="add" size={16} color={theme.textSecondary} />
            <ThemedText themeColor="textSecondary">New page</ThemedText>
          </Pressable>
        </Card>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  chatPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    borderRadius: 999,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  group: { gap: Spacing.two },
  team: { gap: Spacing.three },
  person: { alignItems: 'center', width: 64, gap: 2 },
  personName: { maxWidth: 64 },
  tasks: { gap: 0, paddingVertical: Spacing.one },
  body: { gap: Spacing.three },
  tabBar: { borderBottomWidth: StyleSheet.hairlineWidth, marginHorizontal: -Spacing.three },
  tabs: { paddingHorizontal: Spacing.three, gap: Spacing.three },
  tab: { paddingVertical: Spacing.two + Spacing.one, borderBottomWidth: 2, borderColor: 'transparent' },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  tile: {
    flexGrow: 1,
    flexBasis: '45%',
    gap: Spacing.one,
    padding: Spacing.three,
    borderRadius: Radius.large,
    borderWidth: StyleSheet.hairlineWidth,
  },
  tileValue: { fontSize: 30, lineHeight: 36, fontWeight: 700 },
  tileOf: { fontSize: 18 },
  goalLine: { gap: Spacing.one },
  tree: { gap: 0, paddingVertical: Spacing.one, paddingHorizontal: 0 },
  treeEmpty: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  pageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 44,
    paddingRight: Spacing.three,
    paddingLeft: Spacing.two,
  },
  pageToggle: { width: 18, alignItems: 'center' },
  pageEmoji: { width: 16, textAlign: 'center', fontSize: 14 },
  other: { paddingVertical: Spacing.two + Spacing.one, gap: 2 },
});
