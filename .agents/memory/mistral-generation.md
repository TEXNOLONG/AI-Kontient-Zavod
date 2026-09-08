---
name: Mistral generation fallback
description: Provider choice and resilience rule for AI content generation.
---

The content workflow uses Mistral when `MISTRAL_API_KEY` is available, but every AI call must have a useful local fallback so rate limits or provider outages do not block saving or editing content.

**Why:** Mistral can return rate-limit responses during early testing; a hard dependency would make the core content workflow appear broken.

**How to apply:** Keep provider calls behind one server helper, log only status/error metadata, and return deterministic brand-aware copy when the provider is unavailable.