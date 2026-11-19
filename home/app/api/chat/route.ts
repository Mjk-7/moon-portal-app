import Anthropic from '@anthropic-ai/sdk';

export const runtime = 'edge';

/** The site's advisor chat is a small job: the small Claude model. */
const MODEL = process.env.ANTHROPIC_SMALL_MODEL || 'claude-haiku-5-5';

/** Anyone can call this route, so what one call may send is capped. */
const MAX_MESSAGES = 20;
const MAX_MESSAGE_CHARS = 2000;

const SYSTEM = `You're a tech advisor for our platform. first chat & get users requirements in 2-3 questions, 
    at the end, analyze the user's project idea and recommend:
  
    1. Tech Stack - Choose technologies based on scalability, security, and speed.
    2. Best Plan - Select the most suitable MVP/Unit-Based option with a clear explanation.
    3. Team - Suggest key developer roles and required skills that our platform offers included in the plan.
  
    Available MVP Plans:
    - Simpleton MVP ($3,999, 3-4 weeks): Fixed-price package with a simple end-to-end solution (design, build, deploy), up to 2x complexity, and 2 free consults with fractional CTOs. Includes weekly syncs, progress tracking, and long-term bug-fix support.
    - Premium MVP ($2,999+/week): Scales up the Simpleton MVP, handling up to 4x complexity with double speed and efficiency, daily worklogs, 4+ hours of timezone overlap, and direct team communication. Also offers investor network access and an intensive MVP sprint approach.
    - Complex MVP (Custom Pricing): Tailored for high-security and high-performance projects, supporting up to 10x complexity, 99.99% on-time sprints, and a dedicated fractional CTO. Provides multi-region dev team support, in-house AI security models, and SLA-backed long-term scaling solutions.
  
    Unit-Based Hiring:
    - Fullstack Developer: Senior developers with 6+ years of experience across industries and stacks. $32 - $52 per hour.
    - Fractional CTO: Consult with industry experts for guidance and tech advice. $150 - $400 per hour.
    - DevOps Engineer: Automate and architect cloud infrastructure. $38 - $92 per hour.
    - UX/UI Engineer: Hybrid developers with stunning design skills. $36 - $85 per hour.
    - Code Review: Expert AI-driven code review at $25 per ~3k codelines.
    - Tech Lead: Train your startup tech team. $8k - $16k per month.
  
    If unsure, users can book a free consultation.
  
    Keep responses concise (under 200 tokens) and provide a directly actionable recommendation.`;

type ChatMessage = { role: 'user' | 'assistant'; content: string };

/** Only user and assistant turns, as plain text, the latest few. */
function cleanMessages(input: unknown): ChatMessage[] {
  const out: ChatMessage[] = [];
  for (const m of Array.isArray(input) ? input : []) {
    if (m?.role !== 'user' && m?.role !== 'assistant') continue;
    if (typeof m.content !== 'string' || !m.content.trim()) continue;
    out.push({ role: m.role, content: m.content.slice(0, MAX_MESSAGE_CHARS) });
  }
  const recent = out.slice(-MAX_MESSAGES);
  // The conversation Claude sees has to open with the visitor.
  while (recent.length && recent[0].role !== 'user') recent.shift();
  return recent;
}

export async function POST(req: Request) {
  const request = await req.json().catch(() => null);
  const messages = cleanMessages(request?.messages);
  if (!messages.length || !process.env.ANTHROPIC_API_KEY)
    return Response.json({ error: 'Chat is unavailable' }, { status: 400 });

  const client = new Anthropic();
  const encoder = new TextEncoder();
  // Written in the AI SDK's data stream format, which useChat() reads:
  // `0:` text parts, then `e:` and `d:` with why it ended and the token use.
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (line: string) => controller.enqueue(encoder.encode(line));
      try {
        const stream = client.messages.stream({
          model: MODEL,
          max_tokens: 400,
          thinking: { type: 'disabled' },
          output_config: { effort: 'low' },
          system: SYSTEM,
          messages,
        });
        stream.on('text', (text) => send(`0:${JSON.stringify(text)}\n`));
        const final = await stream.finalMessage();
        const end = {
          finishReason: final.stop_reason === 'max_tokens' ? 'length' : 'stop',
          usage: {
            promptTokens: final.usage.input_tokens,
            completionTokens: final.usage.output_tokens,
          },
        };
        send(`e:${JSON.stringify({ ...end, isContinued: false })}\n`);
        send(`d:${JSON.stringify(end)}\n`);
      } catch (error) {
        console.error('Advisor chat failed:', error);
        send(`3:${JSON.stringify('The chat is unavailable right now.')}\n`);
      } finally {
        controller.close();
      }
    },
  });

  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'x-vercel-ai-data-stream': 'v1',
    },
  });
}
