/*
 * "What's new" (Home shows the newest once, Settings lists them all). Add an
 * entry, newest first, with each store build or update worth telling about;
 * its id only has to be new.
 */

export type WhatsNew = { id: string; title: string; items: string[] };

export const WHATS_NEW: WhatsNew[] = [
  {
    id: 'documents-approve',
    title: 'Approve documents in the app',
    items: [
      'Documents that wait for your signature or approval show on Home.',
      'Approve them with your saved signature in one tap, or all at once. Read each one first from the list.',
      'Save or change your signature in Documents (Shortcuts or Settings).',
    ],
  },
  {
    id: '1.1.0',
    title: 'New in Portal 1.1',
    items: [
      'Portal links in mail or WhatsApp open right here in the app.',
      'Share text, a link or a photo from any app into a new task, a worklog or a chat.',
      'Long-press the app icon for New task, Log work, Chats and Search.',
      'Reply to a chat, or mark a task done, right from its notification.',
      'A reminder at 9 am on the day a task is due, and 10 minutes before each meeting.',
      'One search for tasks, projects, people, chats and messages.',
      'Type @ in a group chat to mention someone. They hear about it even when the chat is muted.',
      'Project leads can pick the image at the top of a project from its brand kit.',
      'A project’s goals are split into yours, open and done.',
      'App updates now show in Notifications.',
      'Portal runs on iPad, with two columns on Home.',
    ],
  },
];
