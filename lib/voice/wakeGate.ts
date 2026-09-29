/**
 * The wake-word gate in front of speech recognition.
 *
 * With the "hey jarvis" engine running, nothing is transcribed while JARVIS is
 * asleep: frames go to the engine only, and reach Whisper solely during the
 * awake window that a wake (or a spoken answer's follow-up) opens. That is
 * the privacy and battery point of a wake-word engine: the room is not being
 * turned into text all day. Pure decision, so it is tested.
 */
export interface GateInput {
  /** A wake-word engine is running for this session. */
  engineActive: boolean;
  /** JARVIS is not speaking (the microphone is muted while it talks). */
  accepting: boolean;
  /** An awake / follow-up window is open. */
  awake: boolean;
}

export interface GateDecision {
  /** Feed this frame to the wake-word engine. */
  toEngine: boolean;
  /** Feed this frame to speech recognition. */
  toSpeech: boolean;
}

export function gateFrame(input: GateInput): GateDecision {
  if (!input.accepting) return { toEngine: false, toSpeech: false };
  if (!input.engineActive) return { toEngine: false, toSpeech: true };
  // The engine keeps listening even while awake, so a second "hey jarvis"
  // during the window simply extends it.
  return { toEngine: true, toSpeech: input.awake };
}
