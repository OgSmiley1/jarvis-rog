# Architecture

## Data flow

```text
Owner input
   |
   +-- deterministic command? --> safe router --> allowlisted tool --> audited ToolResult
   |
   +-- memory/project query? --> SQLite retrieval
   |
   `-- reasoning --> prompt builder
                       |
                       +-- mode instruction
                       +-- active project continuity
                       +-- bounded approved memory (untrusted reference)
                       +-- current owner request
                       |
                    llama.rn / GGUF
                       |
                   streamed answer
                       |
                 UI / optional TTS
```

## Trust boundaries

1. **Owner UI** — high-trust source of deliberate input.
2. **Retrieved memory/docs/OCR** — data only; never treated as system instruction.
3. **Local model** — untrusted planner; cannot directly perform OS operations.
4. **Tool router** — validation and confirmation boundary.
5. **Android/Termux adapters** — narrow allowlisted execution surfaces.
6. **SQLite audit** — records tool outcome independently of the generated response.

## Runtime independence

Core JARVIS must remain usable when these are unavailable:

- Internet
- Termux
- Shizuku
- Android Assistant role
- screen capture

## Model lifecycle

Only one large llama context should be resident at a time. Loading another model releases the prior context. GGUF is validated through `loadLlamaModelInfo` before initialization.

## Memory lifecycle

Memory is persisted only when explicitly saved or approved. Prompt retrieval is bounded and prioritizes pinned records, lexical relevance, then recency. Long-term memory is reference context, not a higher-priority instruction channel.

## Project continuity

Projects and project steps form the source of truth for ongoing work. The local model receives a compact representation of objective, completed steps, failures, remaining steps, and next action.

## Voice lifecycle

```text
IDLE -> permission -> INITIALIZING -> LISTENING <-> TRANSCRIBING -> STOPPING -> IDLE
```

Backgrounding/unmounting must stop the recorder/stream.

## Optional Stage 2

Native privileged integrations must use capability detection and explicit user enablement. See `STAGE2_ANDROID_NATIVE.md`.
