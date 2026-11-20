import { useMutation, useQuery } from '@tanstack/react-query';
import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import { Alert, Platform } from 'react-native';

import { api, authHeaders, messageOf, portalUrl } from './api';
import { useAuth } from './auth';
import { openWebsite } from './links';
import { queryClient } from './query';

/*
 * The person's documents, as on the website's Documents tab: what waits for
 * their signature or for their approval on the company's behalf, and the
 * rest. Approving puts their saved signature on it, the same as the
 * website's Approve button (GET /api/me/documents, POST …/approve).
 */

export type MyDocStatus =
  | 'TO_SIGN'
  | 'UP_NEXT'
  | 'WAITING_OTHERS'
  | 'COMPLETED'
  | 'DECLINED'
  | 'VOIDED'
  | 'EXPIRED';

export type MyDoc = {
  ref: string;
  source: 'portal' | 'onboarding' | 'imported';
  title: string;
  typeLabel: string;
  companyId: string;
  companyName: string;
  /** Signs as a party, for the company, or a letter issued to them. */
  as: 'party' | 'company' | 'recipient';
  status: MyDocStatus;
  from: string;
  others: string[];
  sentAt: string;
  signedAt: string | null;
  completedAt: string | null;
  expiresOn: string | null;
  /** The website page to read and sign it by hand. */
  signUrl: string | null;
  /** One tap with the saved signature. */
  canApprove: boolean;
  blocking?: boolean;
  pdfUrl: string | null;
};

export type SavedSignature = {
  name: string;
  method: 'typed' | 'drawn';
  image: string | null;
  initials: string | null;
  updatedAt: string | null;
} | null;

export type MyDocuments = {
  toSign: MyDoc[];
  documents: MyDoc[];
  signature: SavedSignature;
};

/** A handwriting face the phone already has, for a typed signature. */
export const SIGN_FONT = Platform.select({ ios: 'Snell Roundhand', android: 'cursive', default: 'cursive' });

export const documentsKey = ['me', 'documents'] as const;
const key = documentsKey;

export function useMyDocuments() {
  const { status } = useAuth();
  return useQuery({
    queryKey: key,
    queryFn: () => api<MyDocuments>('/api/me/documents'),
    enabled: status === 'signedIn',
  });
}

/** Approves documents with the saved signature; the list comes back fresh. */
export function useApproveDocuments() {
  return useMutation({
    mutationFn: (refs: string[]) =>
      api<MyDocuments & { failed: { ref: string; error: string }[] }>(
        '/api/me/documents/approve',
        { method: 'POST', body: { refs } },
      ),
    onSuccess: ({ failed, ...data }) => {
      queryClient.setQueryData(key, data);
    },
    onSettled: () => void queryClient.invalidateQueries({ queryKey: key }),
  });
}

/** Saves a typed signature (a drawn one is drawn on the website). */
export function useSaveSignature() {
  return useMutation({
    mutationFn: (name: string) =>
      api<{ signature: SavedSignature }>('/api/me/signature', {
        method: 'PUT',
        body: { name, image: null },
      }),
    onSuccess: ({ signature }) => {
      queryClient.setQueryData<MyDocuments>(key, (d) => (d ? { ...d, signature } : d));
    },
  });
}

/** Documents waiting for the company's approval from this person. */
export const companyApprovals = (docs: MyDoc[] = []) =>
  docs.filter((d) => d.as === 'company' && d.canApprove);

/**
 * Opens a document to read: its signing page on the website (which needs no
 * sign-in), or else its PDF, downloaded with the app's sign-in and shown in
 * the phone's viewer.
 */
export async function openDocument(doc: MyDoc) {
  if (doc.signUrl) return openWebsite(doc.signUrl);
  if (!doc.pdfUrl) return;
  try {
    const name = `${doc.title.replace(/[^\w\- ]+/g, '').trim().slice(0, 60) || 'document'}.pdf`;
    const file = await File.downloadFileAsync(
      portalUrl(`${doc.pdfUrl}&inline=1`),
      new File(Paths.cache, name),
      { headers: authHeaders(), idempotent: true },
    );
    await Sharing.shareAsync(file.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf' });
  } catch (e) {
    Alert.alert('Couldn’t open the document', messageOf(e));
  }
}
