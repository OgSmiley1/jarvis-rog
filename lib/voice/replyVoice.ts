import { SentenceBuffer, ThinkFilter } from './streamingSpeak';
import type { SpeechQueue } from './speechQueue';
import { stripThinking } from './stripThinking';

/**
 * One answer's voice: tokens in, spoken sentences out, while the model is
 * still writing. `finish` speaks whatever is left; when nothing streamed (a
 * tool's one-line answer) it speaks the final text whole. `cancel` drops the
 * rest of this answer so none of it leaks into the next turn.
 */
export class ReplyVoice {
  private readonly filter = new ThinkFilter();
  private readonly buffer = new SentenceBuffer();
  private streamed = false;
  private cancelled = false;

  constructor(private readonly queue: SpeechQueue) {}

  push(token: string): void {
    if (this.cancelled || !token) return;
    this.streamed = true;
    this.buffer.append(this.filter.push(token));
    for (const sentence of this.buffer.drain()) this.queue.enqueue(sentence);
  }

  finish(finalText: string): void {
    if (this.cancelled) return;
    if (!this.streamed) {
      this.buffer.append(stripThinking(finalText));
    } else {
      this.buffer.append(this.filter.flush());
    }
    for (const sentence of this.buffer.flush()) this.queue.enqueue(sentence);
  }

  cancel(): void {
    this.cancelled = true;
    this.filter.reset();
    this.buffer.reset();
  }
}
