# TELA Agentic Factory — instructions agents

Monorepo reproduisant l'infra TELA (Angular → Java → Kafka → adaptateur TS/Viem → Web3Signer → Besu ; lecture Besu → Ponder → PostgreSQL → Java → Angular), construit par une factory d'agents en **Spec-Driven Development** (Spec Kit).

## À lire d'abord
1. `.specify/memory/constitution.md` — règles non négociables (preuves, hypothèses visibles, contrats d'abord, effet unique, sécurité).
2. `docs/registry/REGISTRE.md` — faits / hypothèses / décisions / preuves. Ne jamais présenter une hypothèse comme un fait.
3. `specs/NNN-*/` — spec, plan, tasks de la feature en cours ; `specs/ANALYSIS.md` — balayage croisé.
4. `docs/research/veille-2026-11.md` — versions figées. N'utilise aucune autre version sans décision.
5. `experiments/` — fiche de l'essai actif : Problème, Hypothèse, Référence, Critère, Budget, Décision. Réutiliser une fiche existante plutôt que multiplier les essais.

## Commandes
- Sandbox : `scripts/bootstrap-env.sh` (une fois), `scripts/sandbox.sh up|check|reset|down`
- Contrats : `scripts/forge.sh build|test`, `scripts/deploy-contracts.sh`, `scripts/slither.sh`
- Java : `scripts/mvn.sh -f backend verify` · Adaptateur : `cd adapter && npm test`
- E2E : `tests/e2e/run.sh <nominal|restart-after-broadcast|ponder-lag|failure-vs-unknown>`
- Factory : `/factory-run NNN` ; SDD : `/speckit-specify`, `/speckit-plan`, `/speckit-tasks`, `/speckit-analyze`, `/speckit-implement`
- Hooks : `node .claude/hooks/guard.test.mjs`
- Expériences : `node scripts/experiment-gate.mjs validate|start <fiche.json>` ; `node scripts/experiment-gate.mjs evaluate <fiche.json> <run.json>`
- Tests de décision : `node --test scripts/experiment-gate.test.mjs`

## Règles
- Ne lis jamais `.env` ni `infra/.secrets/`. Le hook couvre des accès testés, sans constituer une isolation universelle; les scripts chargent les paramètres pour toi.
- Agents : `.claude/agents/*.md` ; chacun n'écrit que dans son périmètre.
- Une tâche est finie quand `evidence/<task>/` contient la preuve et que `verifier` a rendu PASS.
- Cadrage : `experiment-designer` + `design-experiment`; mesure : `verifier` + `evaluate-experiment`; budget et décision : `orchestrator`.
- Ne jamais confondre GO d'une expérience et clôture d'une spec. Vérifier tous les SC avant cette clôture; conserver chaque run, son SHA/configuration et ses artefacts.
- Coûts ou attention non mesurés restent inconnus. Respecter le budget cumulé et les autorisations existantes; aucun seuil abaissé après observation pour obtenir GO.
- Toute PR touchant `contracts/ adapter/ infra/ backend/ .github/` passe par `security-auditor` (skill `security-audit`).
- Commits : Conventional Commits + `Refs #<issue>`. Jamais de `--force`, jamais de `--no-verify`.
- Montants : entiers en unités minimales (chaînes), 6 décimales (H-02). Jamais de flottants.
