---
name: fleet
description: Monitor and manage multiple Claude Code agents using the Fleet CLI. Use this skill to list active sessions, check agent status, view token speed, inspect individual agents, stop runaway agents, and check rate-limit usage. Ideal for multi-agent coordination and observability.
allowed-tools: Bash
---

# Claude Fleet

Claude Fleet monitors all your running Claude Code sessions in real time via a desktop app and CLI.

## Prerequisites

Check if `fleet` is installed:

```bash
which fleet
```

If not found, install via the Claude Fleet app: open the app → **Account & Usage** panel → **Let AI Use Fleet** → install CLI.

Or download manually from: https://github.com/hoveychen/claude-fleet/releases

## Commands

```bash
# List all active agents
fleet agents

# List all agents including idle ones
fleet agents --all

# Show details for a specific agent (by ID prefix or workspace name)
fleet agent <id>

# Stop an agent (SIGTERM)
fleet stop <id>

# Force-stop an agent (SIGKILL)
fleet stop <id> --force

# Show account info and rate-limit usage
fleet account

# Show per-agent and aggregate token speed
fleet speed
```

## Output fields (fleet agents)

| Field | Description |
|-------|-------------|
| ID | Short session ID (8 chars) |
| WORKSPACE | Project directory name |
| STATUS | Thinking / Executing / Streaming / Delegating / WaitInput / Active / Idle |
| SPEED | Current token output speed (tok/s) |
| TOKENS | Total output tokens this session |
| MODEL | Claude model being used |

Subagents are indented under their parent with `└` prefix.

## Common use cases

- **Before spawning subagents**: check current system load → `fleet agents`
- **Check if a task is still running**: `fleet agent <workspace-name>`
- **Monitor overall throughput**: `fleet speed`
- **Stop a runaway agent**: `fleet stop <id>`
- **Check rate limits before heavy work**: `fleet account`
- **Get machine-readable output**: append `--json` to any command
