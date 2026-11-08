# Agentic Factory

## Agents (`.claude/agents/`)
| Agent | Périmètre | Preuve exigée |
|---|---|---|
| orchestrator | specs, schemas, registre, délégation | tâches cochées + registre |
| network-devops | infra/, scripts/, compose, .github | `sandbox.sh check` |
| smart-contracts | contracts/ | forge test + couverture + Slither |
| backend-java | backend/ | `mvnw verify` (Testcontainers) |
| blockchain-adapter | adapter/ | vitest + scénario e2e |
| indexer | indexer/ | indexé = balanceOf |
| frontend | frontend/ | Playwright |
| verifier | evidence/, tests/e2e | rapport PASS/FAIL ré-exécuté |
| security-auditor | lecture seule | revue skill `security-audit` |

## Skills
- Spec Kit : `speckit-specify / plan / tasks / analyze / implement / converge / clarify / checklist / constitution`
- `security-audit` (Cloudflare, vendorisé @c1c8a8c, MIT) · `smart-contract-security` · `factory-run`

## Cycle `/factory-run NNN`
sync → balayage des specs (`/speckit-analyze`) → tâche débloquée → agent spécialiste → `verifier` (indépendant) → `security-auditor` si zone sensible → preuve + registre + commit `Refs #` → PR.

## Garde-fous
- Hook `PreToolUse` (`.claude/hooks/guard.mjs`, 21 tests) : bloque lecture de `.env`/clés, introspection de conteneurs, `/proc/*/environ`, `source .env`, montage de la racine, force-push, `--no-verify`.
- Permissions : allowlist fermée (scripts, gh issue/pr, docker compose ps/logs/up/down).
- Code cible exécuté via `scripts/sandbox-exec.sh` : copie `git archive`, `--network none`, FS lecture seule, limites.

## Ce que la factory a appris en exécutant (exemples de preuves qui ont corrigé la conception)
- Revue M-4 : références globales → squatting possible → références scopées par émetteur.
- E2E US4 : couper `chain` ne coupait pas Besu (Besu est aussi sur `signing`).
- E2E US2 : Ponder peut indexer avant que l'adaptateur ne redémarre → règlement sur preuve on-chain (D-14).
