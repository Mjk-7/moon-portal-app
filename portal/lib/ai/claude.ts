import Anthropic from '@anthropic-ai/sdk';

/**
 * The portal's one door to Claude. Server only: the key is read from
 * ANTHROPIC_API_KEY and must never get a NEXT_PUBLIC_ name.
 *
 * Two sizes of model. Small, frequent jobs (matching a work line to a
 * project, a task to a goal, a short title) take the small one; long
 * writing or reasoning over a lot of text takes the big one.
 */
export const CLAUDE_MODELS = {
  small: process.env.ANTHROPIC_SMALL_MODEL || 'claude-haiku-5-5',
  big: process.env.ANTHROPIC_BIG_MODEL || 'claude-opus-5-5',
} as const;

export type ClaudeSize = keyof typeof CLAUDE_MODELS;

/** Whether the server has a key; AI helpers quietly step aside without one. */
export const claudeReady = () => !!process.env.ANTHROPIC_API_KEY;

let client: Anthropic | null = null;
const claude = () => (client ??= new Anthropic({ maxRetries: 1 }));

/**
 * Asks Claude for JSON in the given shape and returns it parsed, or null
 * when there is no key, Claude declines, or the answer is cut short.
 * `schema` is a JSON Schema object (every property required, nullable ones
 * as anyOf with null, additionalProperties false).
 */
export async function askClaudeForJson<T>({
  prompt,
  schema,
  size = 'small',
  maxTokens = 8000,
  system,
}: {
  prompt: string;
  schema: Record<string, unknown>;
  size?: ClaudeSize;
  maxTokens?: number;
  /** Standing instructions, kept apart from what users wrote. */
  system?: string;
}): Promise<T | null> {
  if (!claudeReady()) return null;
  const response = await claude().messages.create({
    model: CLAUDE_MODELS[size],
    max_tokens: maxTokens,
    output_config: {
      effort: size === 'small' ? 'low' : 'medium',
      format: { type: 'json_schema', schema },
    },
    ...(system && { system }),
    messages: [{ role: 'user', content: prompt }],
  });
  if (response.stop_reason !== 'end_turn') return null;
  const text = response.content
    .map((block) => (block.type === 'text' ? block.text : ''))
    .join('');
  return JSON.parse(text) as T;
}

/** A string, or null: the nullable form structured outputs take. */
export const nullableString = { anyOf: [{ type: 'string' }, { type: 'null' }] };
