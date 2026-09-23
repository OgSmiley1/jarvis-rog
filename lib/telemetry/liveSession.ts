import { GithubLiveChannel, type ChannelFetch, type ChannelStatus, type ChannelTarget } from '@/lib/telemetry/githubChannel';
import { liveLog, recordLive } from '@/lib/telemetry/liveLog';

/**
 * The one live link the app can have open, and its status, shaped for
 * React's useSyncExternalStore so the HUD badge and the Settings card agree.
 * The token is passed in by the caller (read from the Android keystore) and
 * is held only by the channel for the life of the session.
 */

type Listener = () => void;

const IDLE: ChannelStatus = { state: 'idle', posted: 0, pending: 0, dropped: 0 };

let channel: GithubLiveChannel | undefined;
let status: ChannelStatus = IDLE;
let detachLog: (() => void) | undefined;
let detachStatus: (() => void) | undefined;
const listeners = new Set<Listener>();

function publish(next: ChannelStatus): void {
  status = next;
  for (const listener of listeners) listener();
}

export function getLiveStatus(): ChannelStatus {
  return status;
}

export function subscribeLiveStatus(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function isLiveActive(value: ChannelStatus = status): boolean {
  return value.state === 'connecting' || value.state === 'live' || value.state === 'backoff';
}

export async function startLiveLink(input: {
  target: ChannelTarget;
  token: string;
  header: string;
  fetchImpl: ChannelFetch;
}): Promise<ChannelStatus> {
  await stopLiveLink();
  const next = new GithubLiveChannel(input);
  channel = next;
  detachStatus = next.onStatus((value) => {
    if (channel === next) publish(value);
    if (value.state === 'error' || value.state === 'stopped') {
      // The channel ended itself (bad token, time limit): stop feeding it.
      if (channel === next) {
        detachLog?.();
        detachLog = undefined;
      }
    }
  });
  const result = await next.start();
  if (result.state !== 'live' || channel !== next) return result;

  // Send what already happened in this app session first, so a link started
  // mid-test still shows the lead-up, then follow live.
  for (const event of liveLog.snapshot().slice(-40)) next.push(event);
  detachLog = liveLog.subscribe((event) => next.push(event));
  recordLive('link', 'live link started', { to: `${input.target.owner}/${input.target.repo}#${result.number ?? '?'}` });
  return next.status;
}

export async function stopLiveLink(reason?: string): Promise<void> {
  const current = channel;
  if (!current) return;
  detachLog?.();
  detachLog = undefined;
  await current.stop(reason);
  if (channel === current) {
    detachStatus?.();
    detachStatus = undefined;
    publish(current.status);
    channel = undefined;
  }
}
