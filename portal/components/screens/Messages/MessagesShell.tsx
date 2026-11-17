'use client';

import { useParams } from 'next/navigation';

import { Bottombar } from '@/components/global/Bottombar';
import media from '@/styles/media';

import { MessagesPage } from './MessagesPage';

/**
 * Lives in the messages layout, so the chats list stays mounted (and loaded)
 * while you switch between chats and groups: only the open chat changes.
 * On phones an open chat takes the whole screen, so the tab bar hides there.
 */
export const MessagesShell = () => {
  const params = useParams<{ conversationId?: string }>();
  const conversationId = params?.conversationId ?? null;
  return (
    <>
      <MessagesPage conversationId={conversationId} />
      {conversationId ? (
        <Bottombar visibleOnlyOn={media.moreTablet} />
      ) : (
        <Bottombar visible={true} />
      )}
    </>
  );
};
