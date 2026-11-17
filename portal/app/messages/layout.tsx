import { Suspense } from 'react';

import { PageAccess } from '@/components/global/PageAccess';
import { MessagesShell } from '@/components/screens/Messages/MessagesShell';

/**
 * The chats list and the open chat share this layout, so moving between
 * chats and groups keeps the list loaded instead of rebuilding the page.
 * The pages under it only set the title.
 */
const MessagesLayout = ({ children }: { children: React.ReactNode }) => (
  <PageAccess isAuthRequired={true}>
    <Suspense>
      <MessagesShell />
    </Suspense>
    {children}
  </PageAccess>
);

export default MessagesLayout;
