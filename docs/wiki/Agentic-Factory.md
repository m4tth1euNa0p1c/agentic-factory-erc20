# Agentic Factory

## Agents (`.claude/agents/`)
```mermaid
flowchart TB
  H(("👤 Propriétaire"))
  O["orchestrator"]
  subgraph impl["Spécialistes"]
    ND["network-devops"]
    SC["smart-contracts"]
    BJ["backend-java"]
    BA["blockchain-adapter"]
    IX["indexer"]
    FE["frontend"]
  end
  V["verifier"]
  S["security-auditor"]
  H --> O --> impl --> V --> O
  impl --> S --> O
  O -->|"PR"| H
```

| Agent | Périmètre | Preuve exigée |
|---|---|---|
| orchestrator | specs, schemas, registre, délégation | tâches cochées + registre |
| network-devops | infra/, scripts/, compose, .github | `sandbox.sh check` |
| smart-contracts | contracts/ | forge test + couverture + Slither |
| backend-java | backend/ | `mvnw verify` (Testcontainers) |
| blockchain-adapter | adapter/ | vitest + scénario e2e |
| indexer | indexer/ | indexé = balanceOf |
| frontend | frontend/ | tests unitaires + Playwright |
| verifier | evidence/, tests/e2e | rapport PASS/FAIL ré-exécuté |
| security-auditor | lecture seule | revue skill `security-audit` |
| knowledge-curator | docs/wiki, docs/knowledge, tests/knowledge (**imposé** par `.claude/hooks/knowledge-curator-guard.mjs`) | `knowledge-lint` sans erreur |

Seul le périmètre de `knowledge-curator` est **imposé** par un hook propre à l'agent (21 cas testés). Pour les autres agents, c'est encore une **convention** (prose) ; la généralisation, sur le même modèle, est prévue dans #31 (spec 008).

## Skills
- Spec Kit : `speckit-specify / plan / tasks / analyze / implement / converge / clarify / checklist / constitution`
- `security-audit` (Cloudflare, vendorisé, MIT) · `smart-contract-security` · `factory-run`

## Cycle `/factory-run NNN`
```mermaid
flowchart LR
  A[sync] --> B["/speckit-analyze"] --> C{"tâche débloquée ?"}
  C -- non --> Z(["porte humaine G1/G2"])
  C -- oui --> D["spécialiste"] --> E["verifier"]
  E -- FAIL --> D
  E -- PASS --> F{"zone sensible ?"}
  F -- oui --> G["security-auditor"] --> KC
  F -- non --> KC["knowledge-curator<br/>pages stale + lint"]
  KC --> I["preuve + registre + commit"]
  I --> J["PR + 9 checks"] --> K(["G4 fusion 👤"])
```
Avant le commit, l'étape 7 de `.claude/skills/factory-run/SKILL.md` fait recompiler par `knowledge-curator` les pages rendues périmées par le changement, pour qu'explications et code soient revus ensemble ([[Base-de-connaissances]]). Les portes humaines sont détaillées dans [[Validations-humaines]].

## Garde-fous
- Hook `PreToolUse` (`.claude/hooks/guard.mjs`, 25 cas testés) : bloque lecture de `.env`/clés, introspection de conteneurs, `/proc/*/environ`, force-push simple, push vers `main`, `--no-verify`, contournement de la protection de branche. **Défense en profondeur, pas une frontière** : l'audit 008 a montré 22 contournements possibles sur une infra réelle (push `+main`, `kubectl`, `helm`, `terraform`, `ssh`, `vault`, `glab`…) → durcissement #31 avant toute cible Talan.
- `main` protégée côté serveur : PR obligatoire, 9 checks requis, admins inclus.
- Code cible exécuté via `scripts/sandbox-exec.sh` : copie `git archive`, `--network none`, FS lecture seule, limites.

## Ce que la factory a appris en exécutant
- Revue M-4 : références globales → squatting possible → références scopées par émetteur.
- E2E : couper `chain` ne coupait pas Besu (Besu aussi sur `signing`).
- E2E : Ponder peut indexer avant que l'adaptateur ne redémarre → règlement sur preuve on-chain (D-14).
- Échantillonneur d'invariant : Ponder revenait à un checkpoint antérieur après crash → `reorgWindow: 0` + watermark (D-23, P-15/P-16).
- Campagnes : deux échecs dus au **harnais** (limite `eth_getLogs` 5000 blocs, `pipefail`) documentés comme tels (P-19, P-20), pas cachés.
