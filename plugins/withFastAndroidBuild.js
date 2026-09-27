const { withAppBuildGradle, withGradleProperties } = require('expo/config-plugins');

/**
 * Keep every EAS Android build comfortably inside the free tier's 45-minute limit.
 *
 * Measured from this project's own EAS logs, not estimated:
 *
 *   - Seven preview builds were CANCELED at the 45-minute mark while Gradle was
 *     still compiling C++. They built all four ABIs.
 *   - b9c88cb built arm64 only, missed the compile cache, and spent 37.0 min in
 *     Gradle — 19.1 min of it in `:llama.rn:buildCMakeRelWithDebInfo`. It
 *     finished about five minutes from the limit.
 *   - e6e0246 built arm64 only, HIT the compile cache, and took 17.2 min.
 *
 * So the difference between a good build and a dead one is whether ccache
 * happens to hit, and every dependency change makes it miss. The fix is to make
 * the cold build fast on its own, not to hope for the cache:
 *
 * 1. llama.rn compiles one JNI bridge per CPU-feature variant — seven of them —
 *    even though the engine itself is prebuilt. `rnllamaVariants` is llama.rn's
 *    own supported switch for narrowing that list. We keep exactly the chain
 *    `RNLlama.java` walks on a Snapdragon 8 Gen 3 (which has dotprod and i8mm):
 *    the Hexagon/OpenCL variant first, the same CPU path without GPU/DSP as its
 *    fallback, and the generic library as the final fallback the loader always
 *    tries. The four we drop are for older cores this phone is not.
 *
 * 2. The ABI list is pinned to arm64-v8a in gradle.properties. The preview
 *    profile already passes `-PreactNativeArchitectures=arm64-v8a`, but a build
 *    that forgets the flag — another profile, the GitHub workflow — silently
 *    falls back to four ABIs and walks straight back into the 45-minute wall.
 *    That already happened seven times; this makes it impossible.
 *
 * 3. Release lint analysis is skipped. It is advisory, it runs across every
 *    native module, and it adds minutes to a build whose deadline is fixed.
 *
 * 4. Gradle gets a heap sized for the 15.6 GB EAS worker instead of the 2 GB
 *    template default, so it is not garbage-collecting through the compile.
 */

const ROG_RNLLAMA_VARIANTS = [
  'rnllama_v8_2_dotprod_i8mm_hexagon_opencl',
  'rnllama_v8_2_dotprod_i8mm',
  'rnllama',
].join(',');

const GRADLE_PROPERTIES = {
  rnllamaVariants: ROG_RNLLAMA_VARIANTS,
  reactNativeArchitectures: 'arm64-v8a',
  'org.gradle.jvmargs': '-Xmx6144m -XX:MaxMetaspaceSize=1024m -XX:+HeapDumpOnOutOfMemoryError -Dfile.encoding=UTF-8',
  'org.gradle.parallel': 'true',
  'org.gradle.caching': 'true',
};

function setProperty(properties, key, value) {
  const existing = properties.find((item) => item.type === 'property' && item.key === key);
  if (existing) existing.value = value;
  else properties.push({ type: 'property', key, value });
}

function withGradleSpeed(config) {
  return withGradleProperties(config, (next) => {
    for (const [key, value] of Object.entries(GRADLE_PROPERTIES)) {
      setProperty(next.modResults, key, value);
    }
    return next;
  });
}

const LINT_MARKER = '// jarvis: release lint disabled for build time';

function withReleaseLintOff(config) {
  return withAppBuildGradle(config, (next) => {
    const source = next.modResults.contents;
    if (source.includes(LINT_MARKER)) return next;

    const anchor = /android\s*\{/;
    if (!anchor.test(source)) {
      // Fail loudly: a silently skipped patch would bring the slow build back
      // with no signal anywhere.
      throw new Error('withFastAndroidBuild: could not find the android { } block in app/build.gradle');
    }

    next.modResults.contents = source.replace(
      anchor,
      (match) => `${match}\n    ${LINT_MARKER}\n    lint {\n        checkReleaseBuilds false\n        abortOnError false\n    }\n`,
    );
    return next;
  });
}

module.exports = function withFastAndroidBuild(config) {
  return withReleaseLintOff(withGradleSpeed(config));
};

module.exports.ROG_RNLLAMA_VARIANTS = ROG_RNLLAMA_VARIANTS;
module.exports.GRADLE_PROPERTIES = GRADLE_PROPERTIES;
