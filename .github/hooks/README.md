---
name: 'Copilot Hooks - Governance & Logging'
description: 'Combined governance audit and session logging for GitHub Copilot coding agent'
tags: ['security', 'governance', 'audit', 'logging', 'safety']
---

# Copilot Hooks - Governance & Logging

Comprehensive monitoring for GitHub Copilot coding agent sessions with real-time threat detection, audit logging, and session tracking.

## Overview

This combined hook system provides:

**Governance Controls:**
- **Threat detection**: Scans prompts for data exfiltration, privilege escalation, system destruction, prompt injection, and credential exposure
- **Governance levels**: Open, standard, strict, locked — from audit-only to full blocking
- **Audit trail**: Append-only JSON log of all governance events
- **Session summary**: Reports threat counts at session end

**Session Logging:**
- **Session tracking**: Log session start and end events with working directory context
- **Prompt logging**: Record when user prompts are submitted
- **Structured logging**: JSON format for easy parsing and analysis
- **Privacy aware**: Configurable to disable logging entirely

## Threat Categories

| Category | Examples | Severity |
|----------|----------|----------|
| `data_exfiltration` | "send all records to external API" | 0.7 - 0.95 |
| `privilege_escalation` | "sudo", "chmod 777", "add to sudoers" | 0.8 - 0.95 |
| `system_destruction` | "rm -rf /", "drop database" | 0.9 - 0.95 |
| `prompt_injection` | "ignore previous instructions" | 0.6 - 0.9 |
| `credential_exposure` | Hardcoded API keys, AWS access keys | 0.9 - 0.95 |

## Governance Levels

| Level | Behavior |
|-------|----------|
| `open` | Log threats only, never block |
| `standard` | Log threats, block only if `BLOCK_ON_THREAT=true` |
| `strict` | Log and block all detected threats |
| `locked` | Log and block all detected threats |

## Installation

1. Ensure all scripts are executable:
   ```bash
   chmod +x .github/hooks/*.sh
   ```

2. Create the logs directory and add to `.gitignore`:
   ```bash
   mkdir -p logs/copilot/governance
   echo "logs/" >> .gitignore
   ```

3. The hooks are automatically active via `hooks.json` configuration.

4. Commit to your repository's default branch.

## Configuration

Set environment variables in `hooks.json`:

```json
{
  "env": {
    "GOVERNANCE_LEVEL": "strict",
    "BLOCK_ON_THREAT": "true",
    "LOG_LEVEL": "INFO"
  }
}
```

### Governance Settings

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `GOVERNANCE_LEVEL` | `open`, `standard`, `strict`, `locked` | `standard` | Controls blocking behavior |
| `BLOCK_ON_THREAT` | `true`, `false` | `false` | Block prompts with threats (standard level) |
| `SKIP_GOVERNANCE_AUDIT` | `true` | unset | Disable governance audit entirely |

### Logging Settings

| Variable | Values | Default | Description |
|----------|--------|---------|-------------|
| `LOG_LEVEL` | `INFO`, `ERROR` | `INFO` | Logging verbosity level |
| `SKIP_LOGGING` | `true` | unset | Disable session logging entirely |

## Log Format

### Governance Audit Logs

Events are written to `logs/copilot/governance/audit.log` in JSON Lines format:

```json
{"timestamp":"2026-01-15T10:30:00Z","event":"session_start","governance_level":"standard","cwd":"/workspace/project"}
{"timestamp":"2026-01-15T10:31:00Z","event":"prompt_scanned","governance_level":"standard","status":"clean"}
{"timestamp":"2026-01-15T10:32:00Z","event":"threat_detected","governance_level":"standard","threat_count":1,"threats":[{"category":"privilege_escalation","severity":0.8,"description":"Elevated privileges","evidence":"sudo"}]}
{"timestamp":"2026-01-15T10:45:00Z","event":"session_end","total_events":12,"threats_detected":1}
```

### Session Logs

Session events are written to `logs/copilot/session.log`:

```json
{"timestamp":"2026-01-15T10:30:00Z","event":"sessionStart","cwd":"/workspace/project"}
{"timestamp":"2026-01-15T10:35:00Z","event":"sessionEnd"}
```

### Prompt Logs

Prompt events are written to `logs/copilot/prompts.log`:

```json
{"timestamp":"2026-01-15T10:31:00Z","event":"userPromptSubmitted","level":"INFO"}
```

## Requirements

- `jq` for JSON processing (pre-installed on most CI environments and macOS)
- `grep` with `-E` (extended regex) support
- `bc` for floating-point comparison (optional, gracefully degrades)

## Privacy & Security

- Full prompts are **never** logged — only matched threat patterns (minimal evidence snippets) and metadata are recorded
- Add `logs/` to `.gitignore` to keep audit data local
- Set `SKIP_GOVERNANCE_AUDIT=true` to disable governance audit
- Set `SKIP_LOGGING=true` to disable session logging
- All data stays local — no external network calls

## Files Structure

```
.github/hooks/
├── hooks.json                    # Combined hook configuration
├── README.md                     # This file
├── audit-prompt.sh              # Governance: Scan prompts for threats
├── audit-session-start.sh       # Governance: Log session start
├── audit-session-end.sh         # Governance: Log session end with stats
├── log-prompt.sh                # Logging: Log prompt submissions
├── log-session-start.sh         # Logging: Log session start
└── log-session-end.sh           # Logging: Log session end
```

## Hook Execution Order

Each hook event runs scripts in sequence:

1. **sessionStart**: Governance audit → Session logging
2. **userPromptSubmitted**: Governance scan (may block) → Prompt logging
3. **sessionEnd**: Governance summary → Session logging
