# Live test link — let Claude watch a test as it happens

While the link is on, JARVIS posts what it hears, decides, says and fails at to a
**private** GitHub channel every few seconds. A Claude session subscribed to that
channel is woken by each post and can follow the test live — no screenshots, no
screen recording, no copy-paste.

Zero cost: GitHub issues and comments are free, and the watcher can be a
Haiku session, the cheapest Claude model.

## What is sent

One line per event, for example:

```
22:10:01.004 HEARD  jarvis what time is it · speaking=false awake=false
22:10:01.006 WAKE   wake word + command · command="what time is it"
22:10:01.010 ASK    what time is it · route=tool mode=fast
22:10:01.052 ANSWER It is 10:10 PM. · source=tool ms=42 firstTokenMs=null chars=15 voice=whole
22:10:01.060 SPEAK  It is 10:10 PM. · engine=neural
22:10:02.890 SPEAK  silent
```

Also: HUD state changes, brain load/ready/error, microphone state and errors, halts,
voice-engine failures. Your words and JARVIS's replies are included — that is the
point — which is why the channel must be a **private** repository. Anything that
looks like an API key (GitHub, Groq, Cerebras, Gemini, OpenAI, Hugging Face) is
replaced with `[redacted]` before it is recorded, and fields named key/token/secret
are never sent.

Limits: posts are at least 8 s apart, and a session ends itself after 30 minutes
(well inside GitHub's 500-comments-an-hour guidance). If the phone goes offline the
lines wait and are delivered when it is back.

Without any of this set up, **Share log** in the same card sends the last 400
events through Android's share sheet — paste it into the chat.

## One-time setup (about 3 minutes)

1. **Create the private channel repository** — on github.com: New repository →
   name `jarvis-live-tests` → **Private** → tick *Add a README* → Create.
   (Claude's GitHub app cannot create repositories for you, so this one step is by hand.)
2. **Tell Claude "channel ready".** Claude attaches the repository, opens pull
   request #1 in it as the channel, and subscribes a watcher to it.
3. **Make a token** — in JARVIS: Settings → Live test link → **Make a token**.
   Repository access: *Only select repositories* → `jarvis-live-tests`.
   Permissions: **Issues: Read and write**, **Pull requests: Read and write**.
   Generate, copy.
4. In the same card: paste the token → **Save token** (it goes to the Android
   keystore and is never shown again). Channel `OgSmiley1/jarvis-live-tests`,
   number `1`.

## Each test

Settings → Live test link → **Start live link**. A red **● LIVE** badge appears
beside the JARVIS wordmark. Test normally. Tap the badge (or **Stop live link**) to
end; it also ends by itself after 30 minutes.

Leave the number empty to have each test open its own issue instead; those
are kept as a record but do not wake a subscribed session, since only pull request
activity does.

## Errors you might see

| Card says | Meaning | Fix |
|---|---|---|
| GitHub rejected the token | wrong, expired or revoked | make a new one |
| The token cannot write to … | missing permission or wrong repository | Issues + Pull requests: Read and write, on the channel repo |
| GitHub asked to slow down | rate limit | nothing — it retries by itself |
| Network … retrying | offline | nothing — lines are kept |
