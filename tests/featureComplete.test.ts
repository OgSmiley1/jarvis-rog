import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { listToolNames } from '@/lib/tools/registry';
import { routeDeterministicTool } from '@/lib/tools/deterministicRouter';

/**
 * The owner's feature list, as a test: if anything agreed in these sessions
 * goes missing from the build, this fails before an APK is ever made.
 */
const read = (file: string) => readFileSync(join(process.cwd(), file), 'utf8');

const AGREED_TOOLS = [
  // Phone control
  'phone.call', 'phone.text', 'phone.read_messages', 'phone.recent_calls', 'phone.calendar', 'phone.add_event', 'phone.open_app', 'phone.battery', 'phone.web_search',
  // Eyes
  'vision.look',
  // Desk-assistant basics
  'utility.time', 'utility.calculate', 'utility.system_status',
  // Live data (free, keyless or free-key)
  'live.weather', 'live.prayer', 'live.brief', 'live.quran', 'live.headlines', 'live.space_news', 'live.joke', 'live.quote', 'live.where_am_i',
  // Local, offline
  'local.timer', 'local.alarm', 'local.show_timers', 'local.qr', 'local.note_add', 'local.notes_read',
  // Device
  'device.settings_panel', 'device.open_url', 'device.open_camera', 'device.compose_email',
];

describe('every agreed feature is in the build', () => {
  it('registers every agreed tool', () => {
    const names = new Set(listToolNames());
    expect(AGREED_TOOLS.filter((tool) => !names.has(tool))).toEqual([]);
  });

  it.each([
    ['what time is it', 'utility.time'],
    ['calculate 200 plus 400', 'utility.calculate'],
    ["what's the weather in Ajman", 'live.weather'],
    ['when is maghrib', 'live.prayer'],
    ['say ayat al kursi', 'live.quran'],
    ['read me the headlines', 'live.headlines'],
    ['set a timer for 5 minutes', 'local.timer'],
    ['remind me in 10 minutes to stretch', 'local.timer'],
    ['wake me up at 6:30', 'local.alarm'],
    ['make a qr code for example.com', 'local.qr'],
    ['take a note: buy milk', 'local.note_add'],
    ['what do you see', 'vision.look'],
    ['call mom', 'phone.call'],
    ['open bluetooth settings', 'device.settings_panel'],
  ])('voice route: "%s" → %s', (text, tool) => {
    expect(routeDeterministicTool(text)?.call.tool).toBe(tool);
  });

  it('the Core is the Skia LED face, guarded, and the main screen holds only it', () => {
    const orb = read('components/JarvisOrb.tsx');
    expect(orb).toMatch(/from '@shopify\/react-native-skia'/);
    expect(orb).toMatch(/<CoreErrorBoundary/);
    for (const layer of ['Hub', 'DottedRings', 'RadialSpokes', 'TealArcs', 'Sweep', 'WarpParticles', 'Readouts']) {
      expect(orb).toContain(`<${layer}`);
    }
    const hud = read('components/JarvisHud.tsx');
    expect(hud).toMatch(/onLongPress=\{\(\) => setSheet\('menu'\)\}/);
    expect(hud).toMatch(/PanResponder/);
    expect(hud).toMatch(/FirstRunCard/);
    // No tab bar, page bar or grid backdrop on the main layer any more.
    expect(hud).not.toMatch(/<PageBar|<HudBackdrop|Tabs/);
  });

  it('the voice loop keeps its guarantees', () => {
    const hud = read('components/JarvisHud.tsx');
    expect(hud).toMatch(/session\.beginTurn/);
    expect(hud).toMatch(/session\.isCurrent\(turn\.turnId\)/);
    expect(hud).toMatch(/new SpeechStream/);
    expect(hud).toMatch(/recordTurn\(timer\)/);
    expect(hud).toMatch(/followUpCommand/);
    expect(read('lib/inference/standaloneModel.native.ts')).toMatch(/createThinkFilter/);
    expect(read('lib/inference/promptBuilder.ts')).toMatch(/LIVE_DATA_RULE/);
  });

  it('zero cost, storage, cloud, wake word and settings are all still wired', () => {
    expect(read('lib/online/cloudBrain.ts')).toMatch(/checkProvider/);
    expect(read('app/(hud)/online.tsx')).toMatch(/checkProvider\('puter'/);
    expect(read('modules/expo-jarvis-brain/android/src/main/java/expo/modules/jarvisbrain/ExpoJarvisBrainModule.kt')).toMatch(/JARVIS\/models/);
    expect(read('modules/expo-jarvis-phone/android/src/main/java/expo/modules/jarvisphone/ExpoJarvisPhoneModule.kt')).toMatch(/ACTION_SET_TIMER/);
    expect(existsSync(join(process.cwd(), 'lib/voice/wakeWordEngine.native.ts'))).toBe(true);
    expect(read('app/(hud)/settings.tsx')).toMatch(/<LiveDataCard/);
    expect(read('app.config.ts')).toMatch(/SET_ALARM/);
  });
});
