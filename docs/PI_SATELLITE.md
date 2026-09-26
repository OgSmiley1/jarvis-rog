# Raspberry Pi satellite — architecture (design only, no code yet)

Status: **proposal for the owner's approval.** Build brief Phase F says no Pi
code until phases A–E are accepted on the ROG. This document is what that code
would follow.

## The idea in one line

The phone stays the brain. A Raspberry Pi on the desk becomes an always-on
ear, mouth and screen for it, talking to the phone over the home Wi-Fi only.

## What runs where

| | Phone (ROG Phone 8 Pro) | Pi 4/5 (heatsinked board) | Pi Zero 2 W |
|---|---|---|---|
| Wake word "Jarvis" | when away from the desk | **yes** — always listening, on-device | yes (lighter model) |
| Speech-to-text | Whisper (existing) | Whisper tiny/base via whisper.cpp | no — streams audio to the phone |
| Brain (Qwen3 4B) | **yes — only here** | no | no |
| Eyes (SmolVLM2) | **yes — only here** | optional USB camera, frame sent to phone on request | no |
| Memory, projects, tools | **yes — only here** | no | no |
| Text-to-speech | Kokoro / system | Piper (on the Pi, so audio never crosses the network) | Piper |
| Dashboard (orb, clock, status) | the HUD | Chromium kiosk on the attached screen | small SPI display: clock + state only |

Nothing is duplicated that holds personal data: memory, contacts, messages
and the model all stay on the phone.

## Protocol — tiny on purpose

JSON over a WebSocket on the LAN. The phone is the server (it has the brain);
the Pi connects to it.

```
Pi → phone   {"type":"hello","device":"desk-pi","version":1,"token":"…"}
phone → Pi   {"type":"welcome","owner":"…","lang":"en"}
Pi → phone   {"type":"utterance","text":"what's on tomorrow","at":1769…}
phone → Pi   {"type":"state","hud":"THINKING"}
phone → Pi   {"type":"say","text":"Two things tomorrow…","private":false}
phone → Pi   {"type":"state","hud":"LISTENING"}
Pi → phone   {"type":"halt"}                      // "stop" said at the desk
phone → Pi   {"type":"status","time":"…","battery":0.64,"model":"Qwen3 4B"}
```

- **Text, not audio**, crosses the network: the Pi transcribes and speaks
  locally. A Zero-class board that cannot run Whisper is the one exception
  (16 kHz PCM frames to the phone), and only after its wake word fires.
- `private: true` replies (messages, calls, contacts, camera) are shown on
  the phone only and the Pi says "It's on your phone" instead of reading them
  out in the room.

## Pairing — once, with a code

1. Settings → Desk satellite → Pair: the phone shows a 6-digit code and its
   LAN address, and listens for 2 minutes.
2. On the Pi: `jarvis-sat pair 482913`. The phone checks the code and hands
   the Pi a long random token, which the Pi stores and the phone keeps in the
   Android keystore.
3. Every connection after that presents the token. Unknown devices are
   refused. The phone can revoke a Pi from the same screen.

Same privacy model as the rest of JARVIS: no cloud, no accounts, no port
forwarding. The WebSocket binds to the Wi-Fi interface only.

## When the phone is away

The Pi keeps the clock and date on its screen, shows "Brain away — phone not
on this network", and answers the wake word with that sentence spoken by its
own Piper voice. It never queues what was said for later.

## Phone-side work this needs (later)

- A foreground-service WebSocket server (a small Kotlin module like the
  existing `expo-jarvis-*` ones), started only when a satellite is paired.
- The HUD's `ask` path, unchanged, fed by `utterance` messages.
- A Settings card: pair, list, revoke.

## Acceptance (when built)

- Wake at the desk → spoken answer from the Pi in under 5 s with the phone in
  the room (same budget as the phone itself).
- Phone leaves the network → the Pi says so within 10 s; nothing is queued.
- `tcpdump` on the router shows only Pi↔phone LAN traffic.
