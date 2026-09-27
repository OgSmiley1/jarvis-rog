import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const target = resolve(
  process.cwd(),
  'node_modules/react-native-audio-api/android/src/main/java/com/swmansion/audioapi/AudioAPIModule.kt',
);

let source = readFileSync(target, 'utf8');

if (
  source.includes('context.assertOnJSQueueThread()') &&
  source.includes('mHybridData = initHybrid(workletsModule, jsContext, jsCallInvokerHolder)')
) {
  console.log('[JARVIS] react-native-audio-api initHybrid fix already present.');
  process.exit(0);
}

const vulnerableHybrid = '  private val mHybridData: HybridData';
if (!source.includes(vulnerableHybrid)) {
  throw new Error(
    '[JARVIS] AudioAPIModule.kt does not match the audited react-native-audio-api 0.9.3 source. Refusing to patch an unknown native layout.',
  );
}
source = source.replace(
  vulnerableHybrid,
  '  private lateinit var mHybridData: HybridData',
);

const vulnerableInit = `  init {
    try {
      System.loadLibrary("react-native-audio-api")
      val jsCallInvokerHolder = reactContext.jsCallInvokerHolder as CallInvokerHolderImpl

      var workletsModule: Any? = null
      if (BuildConfig.RN_AUDIO_API_ENABLE_WORKLETS) {
        try {
          workletsModule = reactContext.getNativeModule("WorkletsModule")
        } catch (ex: Exception) {
          throw RuntimeException("WorkletsModule not found - make sure react-native-worklets is properly installed")
        }
      }
      mHybridData = initHybrid(workletsModule, reactContext.javaScriptContextHolder!!.get(), jsCallInvokerHolder)
    } catch (exception: UnsatisfiedLinkError) {
      throw RuntimeException("Could not load native module AudioAPIModule", exception)
    }
  }

  override fun install(): Boolean {
    MediaSessionManager.initialize(WeakReference(this), reactContext)
    injectJSIBindings()

    return true
  }`;

const fixedInit = `  init {
    try {
      System.loadLibrary("react-native-audio-api")
    } catch (exception: UnsatisfiedLinkError) {
      throw RuntimeException("Could not load native module AudioAPIModule", exception)
    }
  }

  @OptIn(markerClass = [FrameworkAPI::class])
  override fun install(): Boolean {
    val context = reactContext.get() ?: return false
    context.assertOnJSQueueThread()

    val jsContext = context.javaScriptContextHolder!!.get()
    val jsCallInvokerHolder = context.jsCallInvokerHolder as CallInvokerHolderImpl

    var workletsModule: Any? = null
    if (BuildConfig.RN_AUDIO_API_ENABLE_WORKLETS) {
      try {
        workletsModule = context.getNativeModule("WorkletsModule")
      } catch (_: Exception) {
        throw RuntimeException("WorkletsModule not found - make sure react-native-worklets is properly installed")
      }
    }

    mHybridData = initHybrid(workletsModule, jsContext, jsCallInvokerHolder)
    MediaSessionManager.initialize(WeakReference(this), reactContext)
    injectJSIBindings()

    return true
  }`;

if (!source.includes(vulnerableInit)) {
  throw new Error(
    '[JARVIS] Expected vulnerable AudioAPIModule init/install block was not found. Refusing a partial patch.',
  );
}

source = source.replace(vulnerableInit, fixedInit);

if (
  !source.includes('context.assertOnJSQueueThread()') ||
  !source.includes('mHybridData = initHybrid(workletsModule, jsContext, jsCallInvokerHolder)') ||
  source.includes('mHybridData = initHybrid(workletsModule, reactContext.javaScriptContextHolder!!.get(), jsCallInvokerHolder)')
) {
  throw new Error('[JARVIS] Audio API patch verification failed.');
}

writeFileSync(target, source);
console.log('[JARVIS] Backported upstream react-native-audio-api PR #971 startup crash fix.');
