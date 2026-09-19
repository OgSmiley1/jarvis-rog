# Source Notes for Claude

This pack was constructed from the owner's Local Jarvis Coach project dossier and JARVIS ROG architecture materials.

Important grounding constraints:

- The existing project reportedly has a hardened local-first implementation and should be audited before replacement.
- The existing architecture already uses Expo/React Native, llama.rn, local voice, TTS, bounded approved memory, and local workspaces.
- The broader blueprint contains aspirational distributed/accelerated components. Performance targets in that blueprint are not treated here as achieved facts.
- Exact physical ROG Phone performance must be measured.
- Exact legacy AsyncStorage keys were not specified in the dossier; inspect the actual repository before writing a migration.

When external API behavior matters, check current official documentation before changing native integration code.
