import { chatRoute, readJson } from '@/lib/chat/api';
import { ChatError, feedbackDraftFor } from '@/lib/chat/server';
import {
  askWhatToChange,
  discardFromChat,
  fileFromChat,
} from '@/lib/feedback/reply';

export const dynamic = 'force-dynamic';
// Writing the issue with the big model and filing it can take a while.
export const maxDuration = 60;

type Params = { params: { messageId: string } };

/** The draft card's buttons: `{ action: 'file' | 'change' | 'discard' }`. */
export async function POST(request: Request, { params }: Params) {
  const body = await readJson(request);
  return chatRoute(async (user) => {
    const draft = await feedbackDraftFor(user.id, params.messageId);
    if (draft.card.status !== 'draft')
      throw new ChatError(409, 'That draft was already handled.');
    switch (body.action) {
      case 'file':
        await fileFromChat(user.id, draft.id);
        break;
      case 'change':
        await askWhatToChange(user.id, draft.conversationId);
        break;
      case 'discard':
        await discardFromChat(user.id, draft.id);
        break;
      default:
        throw new ChatError(400, 'Unknown action.');
    }
    return { ok: true };
  });
}
