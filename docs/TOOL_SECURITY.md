# Tool Security

## Rule

The language model is not a shell.

Every action must match a registered tool definition with a validated input schema.

## Pipeline

```text
JarvisToolCall
 -> registry lookup
 -> confirmation policy
 -> Zod validation
 -> narrow executor
 -> ToolResult
 -> SQLite audit
```

## Termux

The HTTP bridge:

- listens only on `127.0.0.1`
- requires a random shared secret
- limits request body size
- uses an allowlisted action table
- contains no generic command executor
- constrains Git paths to Termux home

When adding a new Termux capability, create one explicit function with narrow parameters. Never add `shell`, `command`, `bash`, `eval`, `python_code`, or equivalent arbitrary-execution fields to a model-facing schema.

## Confirmation

Read-only tools normally require no extra confirmation. State-changing/destructive actions should be registered as `confirmation: 'required'` and the UI should show the exact intended change before execution.

## Prompt injection

Text from memory, imported documents, OCR, websites, or other applications remains data. It cannot relax tool policy or confirmation requirements.
