import { Dimensions, Platform } from 'react-native';

import { api } from './api';
import { APP_VERSION } from './config';
import type { ChatConversation } from './types';

/*
 * The Feedback Cat: a contact in Messages that takes feedback about the
 * portal and files it as a GitHub issue (portal/lib/feedback). Opening it
 * tells the portal the platform, app version and screen size, which go on
 * the issue. Nothing about the person does.
 */
export async function openFeedbackChat(screen?: string | null) {
  const { width, height } = Dimensions.get('window');
  const res = await api<{ conversation: ChatConversation }>('/api/chat/feedback', {
    method: 'POST',
    body: {
      platform: Platform.OS === 'ios' || Platform.OS === 'android' ? Platform.OS : 'web',
      appVersion: APP_VERSION,
      page: screen ?? null,
      screen: `${Math.round(width)}x${Math.round(height)}`,
    },
  });
  return res.conversation;
}

/** The draft card's buttons. */
export const feedbackAction = (messageId: string, action: 'file' | 'change' | 'discard') =>
  api<{ ok: boolean }>(`/api/chat/feedback/${messageId}`, { method: 'POST', body: { action } });
