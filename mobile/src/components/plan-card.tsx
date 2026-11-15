import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { CompanyMark } from '@/components/company-mark';
import { ProgressRing } from '@/components/project-bits';
import { ThemedText } from '@/components/themed-text';
import { Avatar } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { dayTitle } from '@/lib/dates';
import { PLAN_STATUS, stepCount } from '@/lib/plans';
import { projectName } from '@/lib/project-name';
import type { Plan, PlansList } from '@/lib/types';

export const PLAN_STATUS_COLOR: Record<string, string> = {
  ACTIVE: '#34d399',
  IDEA: '#fcd34d',
  DONE: '#737373',
  DROPPED: '#fb7185',
};

/**
 * A plan as the projects page's cards show it: its project, status, end
 * date, owner and a ring for the steps done.
 */
export function PlanCard({ plan, list }: { plan: Plan; list: PlansList }) {
  const theme = useTheme();
  const steps = stepCount(plan);
  const project = list.projects.find((p) => p.id === plan.projectId);
  const company = list.companies.find((c) => c.id === plan.companyId);
  const owner = list.people.find((p) => p.id === plan.ownerId);
  const color = project?.color || company?.color || '#10b981';
  return (
    <Pressable
      onPress={() => router.push({ pathname: '/plan/[id]', params: { id: plan.id } })}
      style={({ pressed }) => [
        styles.card,
        { backgroundColor: theme.backgroundElement, borderColor: pressed ? color : theme.border },
      ]}>
      <View style={styles.cardTop}>
        <CompanyMark
          id={project?.id ?? plan.companyId}
          name={project ? projectName(project, company?.name) : (company?.name ?? plan.title)}
          color={project?.color ?? company?.color}
          size={40}
        />
        <View style={styles.flex}>
          <ThemedText type="smallBold" numberOfLines={2}>
            {plan.title}
          </ThemedText>
          <View style={styles.meta}>
            <View style={[styles.dot, { backgroundColor: PLAN_STATUS_COLOR[plan.status] ?? '#737373' }]} />
            <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.flex}>
              {[
                PLAN_STATUS[plan.status],
                project ? projectName(project, company?.name) : `${company?.name ?? 'Company'} plan`,
                plan.endOn ? `by ${dayTitle(plan.endOn)}` : null,
              ]
                .filter(Boolean)
                .join(' · ')}
            </ThemedText>
          </View>
        </View>
        {steps.total ? <ProgressRing percent={Math.round((steps.done / steps.total) * 100)} color={color} /> : null}
      </View>
      {plan.notes ? (
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {plan.notes}
        </ThemedText>
      ) : null}
      <View style={styles.foot}>
        {owner ? <Avatar uri={owner.avatar} name={owner.name} size={20} /> : null}
        <ThemedText type="small" themeColor="textSecondary" style={styles.flex} numberOfLines={1}>
          {owner?.name ? `${owner.name} · ` : ''}
          {steps.total ? `${steps.done} of ${steps.total} steps done` : 'No steps yet'}
        </ThemedText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  dot: { width: 7, height: 7, borderRadius: 4 },
  card: { gap: Spacing.two + Spacing.one, padding: Spacing.three, borderRadius: Radius.large, borderWidth: 1 },
  cardTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.three },
  meta: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 2 },
  foot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
