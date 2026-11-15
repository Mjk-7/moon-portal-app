import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { CompanyMark } from '@/components/company-mark';
import { PLAN_STATUS_COLOR, PlanCard } from '@/components/plan-card';
import { FilterChip } from '@/components/project-bits';
import { Notice, QueryState, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { usePlans } from '@/lib/plans';

type Filter = 'ACTIVE' | 'IDEA' | 'DONE';

/**
 * Plans across the person's companies, in the projects page's cards: being
 * done, ideas, and finished. Each shows its project, who owns it, its end
 * date and a ring for the steps done.
 */
export default function PlansScreen() {
  const [filter, setFilter] = useState<Filter>('ACTIVE');
  const [companyId, setCompanyId] = useState<string | null>(null);
  const query = usePlans();
  const data = query.data;
  const inCompany = (data?.plans ?? []).filter((p) => !companyId || p.companyId === companyId);
  const shown = inCompany.filter((p) =>
    filter === 'DONE' ? p.status === 'DONE' || p.status === 'DROPPED' : p.status === filter,
  );
  const companies = (data?.companies ?? []).filter((c) => (data?.plans ?? []).some((p) => p.companyId === c.id));
  const count = (status: Filter) =>
    inCompany.filter((p) => (status === 'DONE' ? p.status === 'DONE' || p.status === 'DROPPED' : p.status === status))
      .length;

  return (
    <Screen
      edgeTop={false}
      refreshControl={<RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
        {(['ACTIVE', 'IDEA', 'DONE'] as Filter[]).map((f) => (
          <FilterChip
            key={f}
            label={`${f === 'ACTIVE' ? 'Active' : f === 'IDEA' ? 'Ideas' : 'Finished'} ${count(f)}`}
            on={filter === f}
            onPress={() => setFilter(f)}
            mark={<View style={[styles.dot, { backgroundColor: PLAN_STATUS_COLOR[f] }]} />}
          />
        ))}
      </ScrollView>
      {companies.length > 1 ? (
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <FilterChip label="All companies" on={!companyId} onPress={() => setCompanyId(null)} />
          {companies.map((c) => (
            <FilterChip
              key={c.id}
              label={c.name}
              on={companyId === c.id}
              onPress={() => setCompanyId(c.id)}
              mark={<CompanyMark id={c.id} name={c.name} color={c.color} size={16} />}
            />
          ))}
        </ScrollView>
      ) : null}
      <QueryState
        loading={query.isPending}
        error={data ? null : query.error}
        onRetry={() => void query.refetch()}
        what="plans"
      />
      {data && !shown.length ? <Notice title="No plans here" /> : null}
      {shown.map((plan) => (
        <PlanCard key={plan.id} plan={plan} list={data!} />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: Spacing.two, alignItems: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4 },
});
