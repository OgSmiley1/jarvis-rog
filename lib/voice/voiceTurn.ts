/**
 * One voice turn at a time. What was heard is added to the input box; sending
 * takes the whole box as the command and empties it, and the live transcript
 * is cleared with it — so nothing said for turn 1 can ride along into turn 2.
 * Pure, so the rule is unit-tested rather than trusted to a component.
 */

/** Adds a finalized utterance to what is already in the input. */
export function appendHeard(current: string, heard: string): string {
  const words = heard.trim();
  if (!words) return current;
  return `${current} ${words}`.trim();
}

export interface Turn {
  /** What is sent to JARVIS. */
  command: string;
  /** What the input box holds afterwards: always empty. */
  nextInput: '';
  /** The voice transcript is cleared at the same moment. */
  clearTranscript: true;
}

/** The turn for this input, or null when there is nothing to send. */
export function startTurn(input: string): Turn | null {
  const command = input.trim();
  if (!command) return null;
  return { command, nextInput: '', clearTranscript: true };
}
