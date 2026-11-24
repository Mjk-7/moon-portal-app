'use client';

import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';

import { CatAvatar } from '@/components/screens/Messages/parts';
import type { FeedbackInboxItem } from '@/lib/feedback/admin';
import { PortalSdk } from '@/utils/services/PortalSdk';

import {
  AdminButton,
  EmptyState,
  Icon,
  Panel,
  Pill,
  type PillTone,
  Segmented,
  SkeletonRows,
  ToggleSwitch,
  UserAvatar,
} from '../shared/AdminUI';
import { errorText } from '../Workspace/shared';

type Filter = 'all' | 'filed' | 'merged' | 'saved' | 'failed' | 'discarded';

const FILTERS: { value: Filter; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'filed', label: 'Filed' },
  { value: 'merged', label: '+1s' },
  { value: 'saved', label: 'Saved here' },
  { value: 'failed', label: 'Failed' },
  { value: 'discarded', label: 'Dropped' },
];

const STATUS: Record<string, { label: string; tone: PillTone }> = {
  draft: { label: 'Draft', tone: 'neutral' },
  filing: { label: 'Filing', tone: 'info' },
  filed: { label: 'Filed', tone: 'positive' },
  merged: { label: '+1 on an issue', tone: 'positive' },
  saved: { label: 'Saved here', tone: 'warning' },
  failed: { label: 'Failed', tone: 'danger' },
  discarded: { label: 'Dropped', tone: 'neutral' },
};

const KIND_TONE: Record<string, PillTone> = {
  bug: 'danger',
  error: 'danger',
  'feature request': 'info',
  improvement: 'positive',
  design: 'purple',
  performance: 'warning',
};

const PLATFORM: Record<string, string> = {
  web: 'Web',
  ios: 'iPhone',
  android: 'Android',
};

const when = (value: string | null) =>
  value
    ? new Date(value).toLocaleString(undefined, {
        day: 'numeric',
        month: 'short',
        hour: 'numeric',
        minute: '2-digit',
      })
    : '';

type Settings = { enabled: boolean; githubConnected: boolean; repo: string };

/**
 * The Feedback Cat's reports. Who sent each one shows only here; the GitHub
 * issue has a reporter code instead. Reports saved while GitHub wasn't
 * connected (or that failed) can be filed from here.
 */
export const AdminFeedback = () => {
  const [filter, setFilter] = useState<Filter>('all');
  const [reports, setReports] = useState<FeedbackInboxItem[]>([]);
  const [settings, setSettings] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [working, setWorking] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await PortalSdk.getData(
        `/api/feedback/reports?status=${filter}`,
        null,
      );
      setReports(res?.data?.reports ?? []);
      setSettings(res?.data?.settings ?? null);
    } catch (err) {
      toast.error(errorText(err, 'Could not load feedback.'));
    } finally {
      setLoading(false);
    }
  }, [filter]);

  useEffect(() => {
    load();
  }, [load]);

  const toggle = async (enabled: boolean) => {
    setWorking('settings');
    try {
      const res = await PortalSdk.patchData('/api/feedback/settings', {
        enabled,
      });
      setSettings((s) => (s ? { ...s, enabled: !!res?.data?.enabled } : s));
      toast.success(enabled ? 'The Feedback Cat is on' : 'Feedback paused');
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setWorking(null);
    }
  };

  const file = async (report: FeedbackInboxItem) => {
    setWorking(report.id);
    try {
      const res = await PortalSdk.postData(
        `/api/feedback/reports/${report.id}`,
        {},
      );
      const done = res?.data?.report as FeedbackInboxItem | undefined;
      toast.success(
        done?.issueNumber ? `Filed as #${done.issueNumber}` : 'Filed',
      );
      await load();
    } catch (err) {
      toast.error(errorText(err));
    } finally {
      setWorking(null);
    }
  };

  return (
    <div className="space-y-4">
      <Panel className="flex flex-col gap-4 p-5 sm:flex-row sm:items-center">
        <CatAvatar size={56} />
        <div className="min-w-0 flex-1 space-y-1">
          <p className="text-sm font-semibold text-neutral-100 auto-light:text-neutral-900">
            Feedback Cat
          </p>
          <p className="text-xs text-neutral-500">
            Lives in everyone’s Messages. It takes feedback only, asks a short
            question when needed, and files issues
            {settings ? (
              <>
                {' '}
                in <span className="font-mono">{settings.repo}</span>
              </>
            ) : null}{' '}
            with names and emails removed.
          </p>
          {settings && !settings.githubConnected && (
            <p className="flex items-center gap-1 text-xs text-amber-300 auto-light:text-amber-700">
              <Icon name="warning" className="text-[14px]" />
              GitHub isn’t connected, so reports are saved here. Set
              FEEDBACK_GITHUB_TOKEN on the server to file them.
            </p>
          )}
        </div>
        {settings && (
          <ToggleSwitch
            className="sm:w-64"
            checked={settings.enabled}
            disabled={working === 'settings'}
            onChange={toggle}
            label={settings.enabled ? 'Taking feedback' : 'Paused'}
            description="When paused, the cat tells people feedback is off."
          />
        )}
      </Panel>

      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      <Panel>
        {loading ? (
          <SkeletonRows rows={4} className="p-5" />
        ) : !reports.length ? (
          <EmptyState
            icon="pets"
            title="No feedback here yet"
            description="When someone tells the Feedback Cat something and agrees to send it, it shows here."
          />
        ) : (
          <ul className="divide-y divide-white/[0.06] auto-light:divide-black/[0.06]">
            {reports.map((r) => {
              const status = STATUS[r.status] ?? STATUS.draft;
              return (
                <li key={r.id} className="flex flex-col gap-3 px-5 py-4">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-neutral-500">
                    <Pill tone={status.tone}>{status.label}</Pill>
                    {r.fixedAt && <Pill tone="positive">Fix pushed</Pill>}
                    <Pill tone={KIND_TONE[r.kind] ?? 'neutral'}>{r.kind}</Pill>
                    {r.area && <Pill>{r.area}</Pill>}
                    <Pill>{r.priority}</Pill>
                    <span>{when(r.createdAt)}</span>
                  </div>
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      src={r.sender.avatar}
                      name={r.sender.name}
                      size={32}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs text-neutral-500">
                        {r.sender.name || 'Someone'} · {r.reporterCode}
                        {r.platform
                          ? ` · ${PLATFORM[r.platform] ?? r.platform}`
                          : ''}
                        {r.appVersion ? ` ${r.appVersion}` : ''}
                        {r.page ? ` · ${r.page}` : ''}
                      </p>
                      <p className="mt-1 text-sm font-medium text-neutral-100 auto-light:text-neutral-900">
                        {r.title}
                      </p>
                      <p className="mt-1 whitespace-pre-wrap break-words text-sm text-neutral-400 auto-light:text-neutral-600">
                        {r.summary}
                      </p>
                      {!!r.details.length && (
                        <ul className="mt-2 list-disc space-y-0.5 pl-5 text-xs text-neutral-400 auto-light:text-neutral-600">
                          {r.details.map((d, i) => (
                            <li key={i}>{d}</li>
                          ))}
                        </ul>
                      )}
                      {r.error && (
                        <p className="mt-2 text-xs text-rose-300 auto-light:text-rose-600">
                          {r.error}
                        </p>
                      )}
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {r.issueUrl && r.issueNumber && (
                        <a
                          href={r.issueUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-sm font-medium text-sky-300 hover:underline auto-light:text-sky-700"
                        >
                          #{r.issueNumber}
                          <Icon name="open_in_new" className="text-[14px]" />
                        </a>
                      )}
                      {r.fixPrUrl && r.fixPrNumber && (
                        <a
                          href={r.fixPrUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="flex items-center gap-1 text-xs text-emerald-300 hover:underline auto-light:text-emerald-700"
                        >
                          Fix: PR #{r.fixPrNumber}
                          <Icon name="open_in_new" className="text-[13px]" />
                        </a>
                      )}
                      {(r.status === 'saved' || r.status === 'failed') && (
                        <AdminButton
                          size="sm"
                          icon="send"
                          disabled={!settings?.githubConnected}
                          loading={working === r.id}
                          onClick={() => file(r)}
                        >
                          File to GitHub
                        </AdminButton>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Panel>
    </div>
  );
};
