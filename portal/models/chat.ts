/*
 * Messages between portal users, WhatsApp style.
 *
 * - `direct`: two people who share an active company; with no company in
 *   common they cannot see or message each other.
 * - `group`: a named group anyone can start with people from their
 *   companies. Its admins add and remove people; someone added later sees
 *   messages from when they joined.
 * - `project`: one group per project, started from the project page. Its
 *   members are always the project's team (everyone in the company for a
 *   CORE project), nobody can add or remove people by hand, and anyone who
 *   joins the team sees the whole history. Its name and photo are the
 *   project's own.
 *
 * MongoDB is the source of truth. Ably only carries "something changed"
 * events to open browsers (see lib/chat/realtime.ts), so nothing is lost when
 * a connection drops.
 */

export type ChatKind = 'text' | 'image' | 'video' | 'file' | 'system';

export type ChatConversationKind = 'direct' | 'group' | 'project';

/** What a `system` message in a group records. */
export type ChatSystemAction =
  | 'created'
  | 'added'
  | 'removed'
  | 'left'
  | 'renamed'
  | 'photo'
  | 'admin';

/**
 * A line like "Asha added Ravi" in a group. Names are kept as they were,
 * so the line still reads well after someone leaves.
 */
export interface ChatSystemNote {
  action: ChatSystemAction;
  actorName: string;
  targetIds?: string[];
  targetNames?: string[];
  /** The new group name, for `renamed`. */
  name?: string | null;
}

/** A photo, video or file. Stored privately in Spaces under `chat/`. */
export interface ChatAttachment {
  key: string;
  name: string;
  mime: string;
  size: number;
  width?: number | null;
  height?: number | null;
  /** Seconds, for videos. */
  duration?: number | null;
  /** A small preview: a resized photo, or a video's first frame. */
  thumbKey?: string | null;
  /** Set when the file was removed (media is kept for 90 days). */
  expiredAt?: string | null;
}

export interface ChatReaction {
  userId: string;
  emoji: string;
}

/** A short copy of the message being replied to, shown above the reply. */
export interface ChatReplyPreview {
  id: string;
  senderId: string;
  kind: ChatKind;
  text: string;
}

/** A message as the API returns it. */
export interface ChatMessage {
  id: string;
  conversationId: string;
  senderId: string;
  /** Made by the sender's browser, so a retried send is saved only once. */
  clientId: string;
  kind: ChatKind;
  text: string;
  attachment?: ChatAttachment | null;
  replyTo?: ChatReplyPreview | null;
  forwarded?: boolean;
  /** For `system` messages in groups. */
  system?: ChatSystemNote | null;
  /** Group members named with @ in the text (the mobile app); they hear
   * about it even when the chat is muted. */
  mentions?: string[];
  reactions: ChatReaction[];
  createdAt: string;
  editedAt?: string | null;
  /** When the other person's device received it (two grey ticks). In a
   * group: when everyone's had. */
  deliveredAt?: string | null;
  /** When the other person saw it (two blue ticks). In a group: when
   * everyone has. */
  readAt?: string | null;
  /** Groups, own messages only: how many of the others have seen it. */
  readCount?: number | null;
  /** Groups, own messages only: how many it was sent to. */
  recipientCount?: number | null;
  /** "This message was deleted": text and file are gone. */
  deletedAt?: string | null;
  /** The feedback cat's cards: the welcome chips or a draft issue. Older
   * apps ignore it and show `text`, which always reads on its own. */
  feedback?: FeedbackCard | null;
}

/** Labels a feedback issue can get. */
export type FeedbackType =
  | 'bug'
  | 'error'
  | 'feature request'
  | 'improvement'
  | 'design'
  | 'performance';

export type FeedbackPriority = 'P1' | 'P2' | 'P3';

/**
 * A card under one of the feedback cat's messages.
 * - `welcome`: quick-start chips; tapping one sends its words.
 * - `draft`: the issue it is about to file, with File it / Change buttons.
 *   It moves to `filed` (with the issue), `saved` (kept in the portal
 *   because GitHub isn't set up), `merged` (added to an open issue as a +1)
 *   or `discarded`.
 */
export interface FeedbackCard {
  type: 'welcome' | 'draft';
  chips?: string[];
  /** Drafts: the cat's line above the card ("Here's what I'll send"). */
  lead?: string | null;
  status?:
    | 'draft'
    | 'filing'
    | 'filed'
    | 'saved'
    | 'merged'
    | 'fixed'
    | 'discarded';
  title?: string;
  summary?: string;
  kind?: FeedbackType;
  area?: string | null;
  priority?: FeedbackPriority;
  issueNumber?: number | null;
  issueUrl?: string | null;
}

/** One person's settings and counters in a conversation. */
export interface ChatMemberState {
  unread: number;
  muted?: boolean;
  pinned?: boolean;
  archived?: boolean;
  /** "Clear chat": messages before this are hidden for this person. */
  clearedAt?: string | null;
  /** Groups (not project groups): messages before this are hidden. */
  joinedAt?: string | null;
}

export interface ChatPerson {
  id: string;
  name: string | null;
  username?: string | null;
  avatar?: string | null;
  positionTitle?: string | null;
  /** The companies both people are in, by name. */
  companies?: string[];
  /** Set for the feedback cat (lib/feedback): not a person, can't be
   * blocked, has no "last seen". */
  bot?: 'feedback' | null;
}

/** A group's details, for its header, info panel and sender names. */
export interface ChatGroupInfo {
  name: string;
  avatar: string | null;
  description?: string | null;
  /** Everyone in it now, the viewer included, A to Z. */
  members: ChatPerson[];
  adminIds: string[];
  createdById: string | null;
  /** Project groups: the project it belongs to. */
  projectId?: string | null;
  /** Project groups: the project's company. */
  companyName?: string | null;
  /** The viewer may rename it, change its photo and add or remove people. */
  canManage: boolean;
}

/** A conversation as the chats list shows it, from the viewer's side. */
export interface ChatConversation {
  id: string;
  kind: ChatConversationKind;
  /**
   * The other person in a direct chat. For groups a stand-in with the
   * group's name and photo (id `group:<chatId>`), so lists and pickers can
   * treat every chat alike.
   */
  partner: ChatPerson;
  /** Groups and project groups only. */
  group?: ChatGroupInfo | null;
  lastMessage: ChatMessage | null;
  lastMessageAt: string | null;
  unread: number;
  muted: boolean;
  pinned: boolean;
  archived: boolean;
  /** The partner's last time in the portal, for "last seen". */
  partnerLastSeenAt: string | null;
  /** Direct chats: the viewer has blocked the other person. */
  blocked?: boolean;
}

/** `open` until an admin removes the message or leaves it (`dismissed`). */
export type ChatReportStatus = 'open' | 'removed' | 'dismissed';

/** A reported message, as the admins' list shows it. */
export interface ChatReport {
  id: string;
  messageId: string;
  conversationId: string;
  chatKind: ChatConversationKind;
  chatName: string;
  reporter: ChatPerson;
  sender: ChatPerson;
  reason: string;
  /** What the message said when it was reported. */
  text: string;
  kind: ChatKind;
  /** It has been deleted for everyone since (by its sender or an admin). */
  messageRemoved: boolean;
  status: ChatReportStatus;
  createdAt: string;
  resolvedAt: string | null;
  /** The admin who answered it, by name. */
  resolvedBy: string | null;
}

/** Events sent to each person's inbox channel (lib/chat/realtime.ts). */
export type ChatEvent =
  | { type: 'message'; conversationId: string; message: ChatMessage }
  | { type: 'update'; conversationId: string; message: ChatMessage }
  | {
      type: 'receipt';
      conversationId: string;
      /** Who received or read the messages. */
      by: string;
      status: 'delivered' | 'read';
      /** Every message sent up to this time is now delivered or read. */
      upTo: string;
      at: string;
    }
  | { type: 'conversation'; conversationId: string };

export const CHAT_LIMITS = {
  /** Largest video or file. */
  maxFileBytes: 100 * 1024 * 1024,
  /** Largest photo, after it is resized in the browser. */
  maxImageBytes: 20 * 1024 * 1024,
  maxTextLength: 8000,
  /** Most people in one group. */
  maxGroupMembers: 256,
  maxGroupNameLength: 80,
  /** Messages can be edited this long after sending. */
  editWindowMs: 15 * 60 * 1000,
  /** "Delete for everyone" works this long after sending. */
  deleteWindowMs: 48 * 60 * 60 * 1000,
  /** Photos, videos and files are removed after this many days. */
  mediaRetentionDays: 90,
} as const;
