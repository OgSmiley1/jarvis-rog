/**
 * The camera page's live view, when it is on screen.
 *
 * While the owner has the camera page open, "what do you see" takes its photo
 * from the live view they are already looking at, instead of opening Android's
 * camera screen. The page registers a capture function when its preview is
 * running and clears it the moment it stops, so nothing can take a picture
 * from a camera the owner cannot see.
 */
export type LiveCapture = () => Promise<string | null>;

let current: LiveCapture | null = null;

/** Registers the live view's capture; returns the function that unregisters exactly this one. */
export function setLiveCapture(capture: LiveCapture): () => void {
  current = capture;
  return () => {
    if (current === capture) current = null;
  };
}

export function liveCapture(): LiveCapture | null {
  return current;
}
