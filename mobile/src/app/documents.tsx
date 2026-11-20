import { router } from 'expo-router';
import { Image } from 'expo-image';
import { Alert, Pressable, RefreshControl, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Notice, QueryState, Screen, SectionTitle } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { messageOf } from '@/lib/api';
import {
  companyApprovals,
  type MyDoc,
  type MyDocStatus,
  openDocument,
  type SavedSignature,
  SIGN_FONT,
  useApproveDocuments,
  useMyDocuments,
} from '@/lib/documents';
import { openWebsite } from '@/lib/links';

/*
 * The person's documents, as on the website's Documents tab: what waits for
 * them on top, with Approve for those the company signs through them (the
 * owner or hiring lead, with their saved signature), then the rest.
 */
export default function DocumentsScreen() {
  const theme = useTheme();
  const query = useMyDocuments();
  const approve = useApproveDocuments();
  const data = query.data;
  const waiting = data?.toSign ?? [];
  const rest = (data?.documents ?? []).filter((d) => d.status !== 'TO_SIGN');
  const companyRefs = companyApprovals(waiting).map((d) => d.ref);

  const start = (refs: string[]) => {
    if (!data?.signature) {
      router.push({ pathname: '/signature', params: { approve: refs.join(',') } });
      return;
    }
    approve.mutate(refs, {
      onSuccess: (res) => {
        if (res.failed.length)
          Alert.alert(
            `${refs.length - res.failed.length} of ${refs.length} approved`,
            res.failed[0].error,
          );
      },
      onError: (e) => Alert.alert('Couldn’t approve it', messageOf(e)),
    });
  };
  const busyRef = approve.isPending ? approve.variables : null;

  return (
    <Screen
      edgeTop={false}
      refreshControl={
        <RefreshControl refreshing={query.isRefetching} onRefresh={() => void query.refetch()} />
      }>
      <QueryState
        loading={query.isPending}
        error={data ? null : query.error}
        onRetry={() => void query.refetch()}
        what="your documents"
      />
      {data ? (
        <>
          <SectionTitle title="Waiting for you" />
          {waiting.length ? (
            <Card style={styles.list}>
              {waiting.map((d, i) => (
                <WaitingRow
                  key={d.ref}
                  doc={d}
                  first={i === 0}
                  busy={!!busyRef?.includes(d.ref)}
                  onApprove={() => start([d.ref])}
                />
              ))}
              {companyRefs.length > 1 ? (
                <View style={[styles.allRow, styles.divider, { borderColor: theme.border }]}>
                  <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
                    {companyRefs.length} documents need the company’s signature.
                  </ThemedText>
                  <Button
                    small
                    title={`Approve all ${companyRefs.length}`}
                    busy={busyRef?.length === companyRefs.length && companyRefs.length > 1}
                    disabled={approve.isPending}
                    onPress={() => start(companyRefs)}
                  />
                </View>
              ) : null}
            </Card>
          ) : (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                Nothing waits for your signature or approval.
              </ThemedText>
            </Card>
          )}

          <SignatureCard signature={data.signature} />

          {rest.length ? (
            <>
              <SectionTitle title="All documents" />
              <Card style={styles.list}>
                {rest.map((d, i) => (
                  <DocRow key={d.ref} doc={d} first={i === 0} />
                ))}
              </Card>
            </>
          ) : null}
          {!waiting.length && !rest.length ? (
            <Notice title="No documents yet" body="Documents you sign or approve in the Portal show here." />
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

const day = (iso?: string | null) =>
  iso ? new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : '';

function WaitingRow({
  doc,
  first,
  busy,
  onApprove,
}: {
  doc: MyDoc;
  first: boolean;
  busy: boolean;
  onApprove: () => void;
}) {
  const theme = useTheme();
  const company = doc.as === 'company';
  const sub = [
    company ? `For ${doc.companyName}` : doc.companyName,
    doc.others.length ? `with ${doc.others.join(', ')}` : null,
    doc.expiresOn ? `by ${day(doc.expiresOn)}` : null,
    doc.blocking ? 'needed before using the Portal' : null,
  ]
    .filter(Boolean)
    .join(' · ');
  const canRead = !!(doc.signUrl || doc.pdfUrl);
  return (
    <View style={[styles.row, !first && [styles.divider, { borderColor: theme.border }]]}>
      <View style={[styles.badge, { backgroundColor: company ? '#8b5cf622' : '#f59e0b22' }]}>
        <Icon name={company ? 'seal' : 'signature'} size={18} color={company ? '#8b5cf6' : '#d97706'} />
      </View>
      <Pressable
        disabled={!canRead}
        accessibilityRole="button"
        accessibilityHint="Opens the document to read"
        onPress={() => void openDocument(doc)}
        style={({ pressed }) => [styles.flex, { opacity: pressed ? 0.6 : 1 }]}>
        <ThemedText type="smallBold" numberOfLines={2}>
          {doc.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
          {sub}
        </ThemedText>
        {canRead ? (
          <ThemedText type="small" themeColor="textSecondary" style={styles.read}>
            Read it
          </ThemedText>
        ) : null}
      </Pressable>
      {doc.canApprove ? (
        <Button small title="Approve" busy={busy} onPress={onApprove} />
      ) : doc.signUrl ? (
        <Button small kind="secondary" title="Sign" onPress={() => void openWebsite(doc.signUrl!)} />
      ) : null}
    </View>
  );
}

const STATUS: Record<MyDocStatus, string> = {
  TO_SIGN: 'Waiting for you',
  UP_NEXT: 'You sign later',
  WAITING_OTHERS: 'Waiting for others',
  COMPLETED: 'Signed',
  DECLINED: 'Declined',
  VOIDED: 'Withdrawn',
  EXPIRED: 'Expired',
};

function DocRow({ doc, first }: { doc: MyDoc; first: boolean }) {
  const theme = useTheme();
  const canRead = !!(doc.pdfUrl || (doc.signUrl && doc.status !== 'COMPLETED'));
  const when = doc.completedAt ?? doc.signedAt ?? doc.sentAt;
  const tone =
    doc.status === 'COMPLETED' ? theme.success : doc.status === 'DECLINED' ? theme.danger : theme.textSecondary;
  return (
    <Pressable
      disabled={!canRead}
      onPress={() => void openDocument(doc)}
      style={({ pressed }) => [
        styles.row,
        !first && [styles.divider, { borderColor: theme.border }],
        { opacity: pressed ? 0.6 : 1 },
      ]}>
      <Icon name="doc" size={18} color={theme.textSecondary} />
      <View style={styles.flex}>
        <ThemedText type="small" numberOfLines={2} style={styles.title}>
          {doc.title}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary" numberOfLines={1}>
          {[doc.as === 'company' ? `For ${doc.companyName}` : doc.companyName, day(when)]
            .filter(Boolean)
            .join(' · ')}
        </ThemedText>
      </View>
      <ThemedText type="smallBold" style={[styles.status, { color: tone }]}>
        {STATUS[doc.status]}
      </ThemedText>
    </Pressable>
  );
}

/** The saved signature that Approve puts on documents. */
function SignatureCard({ signature }: { signature: SavedSignature }) {
  const theme = useTheme();
  return (
    <>
      <SectionTitle title="Your signature" />
      <Card style={styles.signature}>
        {signature ? (
          <View style={styles.paper}>
            {signature.image ? (
              <Image
                source={{ uri: signature.image }}
                contentFit="contain"
                contentPosition="left"
                style={styles.drawn}
                accessibilityLabel="Your saved signature"
              />
            ) : (
              <ThemedText style={styles.typed}>{signature.name}</ThemedText>
            )}
          </View>
        ) : (
          <ThemedText type="small" themeColor="textSecondary">
            Save a signature once, and approving a document is one tap after that.
          </ThemedText>
        )}
        <View style={styles.signatureFoot}>
          <ThemedText type="small" themeColor="textSecondary" style={styles.flex}>
            {signature
              ? `${signature.method === 'drawn' ? 'Drawn' : 'Typed'}${signature.updatedAt ? `, saved ${day(signature.updatedAt)}` : ''}`
              : ''}
          </ThemedText>
          <Button
            small
            kind="secondary"
            title={signature ? 'Change' : 'Save a signature'}
            icon={<Icon name="signature" size={16} color={theme.text} />}
            onPress={() => router.push('/signature')}
          />
        </View>
      </Card>
    </>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  list: { paddingVertical: 0, paddingHorizontal: 0, gap: 0, overflow: 'hidden' },
  divider: { borderTopWidth: StyleSheet.hairlineWidth },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  allRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
  },
  badge: { width: 34, height: 34, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  read: { textDecorationLine: 'underline', marginTop: 2 },
  title: { fontWeight: 600 },
  status: { fontSize: 13 },
  signature: { gap: Spacing.three },
  paper: {
    height: 72,
    justifyContent: 'flex-end',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  drawn: { height: 56, width: '100%' },
  typed: { color: '#0a0a0b', fontSize: 30, lineHeight: 38, fontFamily: SIGN_FONT },
  signatureFoot: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
});
