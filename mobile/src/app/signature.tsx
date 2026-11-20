import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field, Screen } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { messageOf } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { SIGN_FONT, useApproveDocuments, useMyDocuments, useSaveSignature } from '@/lib/documents';
import { openWebsite } from '@/lib/links';

/**
 * Save (or change) the signature that Approve puts on documents: the full
 * name, typed. Opened before a first approval, it saves and then approves.
 */
export default function SignatureSheet() {
  const { approve: approveParam } = useLocalSearchParams<{ approve?: string }>();
  const refs = (approveParam ?? '').split(',').filter(Boolean);
  const { profile } = useAuth();
  const current = useMyDocuments().data?.signature ?? null;
  const save = useSaveSignature();
  const approve = useApproveDocuments();
  const [name, setName] = useState(current?.name ?? profile?.name ?? '');

  const busy = save.isPending || approve.isPending;
  const ok = name.trim().length >= 2;

  const submit = async () => {
    try {
      await save.mutateAsync(name.trim());
    } catch (e) {
      Alert.alert('Couldn’t save your signature', messageOf(e));
      return;
    }
    if (!refs.length) {
      router.back();
      return;
    }
    try {
      const res = await approve.mutateAsync(refs);
      router.back();
      if (res.failed.length)
        Alert.alert(`${refs.length - res.failed.length} of ${refs.length} approved`, res.failed[0].error);
    } catch (e) {
      router.back();
      Alert.alert('Saved, but couldn’t approve it', messageOf(e));
    }
  };

  return (
    <Screen edgeTop={false}>
      <View style={styles.body}>
        <ThemedText type="small" themeColor="textSecondary">
          {refs.length
            ? 'Sign once here. It’s saved to your profile and goes on this document, and after this every approval is one tap.'
            : 'It goes on documents you approve in the Portal, so you sign once and approve with one tap after that.'}
        </ThemedText>
        <ThemedText type="label" themeColor="textSecondary">
          Your full name, as you sign it
        </ThemedText>
        <Field
          value={name}
          onChangeText={setName}
          autoComplete="name"
          textContentType="name"
          autoCapitalize="words"
          returnKeyType="done"
          onSubmitEditing={() => ok && !busy && void submit()}
        />
        <View style={styles.paper}>
          <ThemedText style={[styles.typed, !name.trim() && styles.placeholder]} numberOfLines={1} adjustsFontSizeToFit>
            {name.trim() || 'Your signature'}
          </ThemedText>
        </View>
        {current?.method === 'drawn' ? (
          <ThemedText type="small" themeColor="textSecondary">
            Your saved signature is drawn. Saving here replaces it with this typed one.
          </ThemedText>
        ) : null}
        <Button
          title={refs.length ? (refs.length > 1 ? `Save and approve ${refs.length}` : 'Save and approve') : 'Save signature'}
          busy={busy}
          disabled={!ok}
          onPress={() => void submit()}
        />
        <ThemedText
          type="small"
          themeColor="textSecondary"
          style={styles.center}
          onPress={() => void openWebsite('/user?tab=documents')}>
          To draw it by hand, use the Documents tab on the website.
        </ThemedText>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { gap: Spacing.three },
  paper: {
    height: 84,
    justifyContent: 'flex-end',
    borderRadius: 10,
    backgroundColor: '#ffffff',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#d6d3cb',
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.two,
  },
  typed: { color: '#0a0a0b', fontSize: 34, lineHeight: 44, fontFamily: SIGN_FONT },
  placeholder: { color: '#b5b2aa' },
  center: { textAlign: 'center' },
});
