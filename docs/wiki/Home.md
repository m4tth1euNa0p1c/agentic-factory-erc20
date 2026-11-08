# TELA Agentic Factory — Wiki

Reproduction de l'infrastructure **TELA** par une factory d'agents spécialisés, en Spec-Driven Development (GitHub Spec Kit 1.3.2) et sécurité par défaut (skill Cloudflare `security-audit`).

> Source de vérité : le dépôt. Ce wiki est synchronisé depuis `docs/wiki/` par `scripts/publish-wiki.sh`.

## Pages
- [[Architecture]] — chaînes d'écriture / lecture, réseaux, rôles, statuts
- [[Agentic-Factory]] — agents, skills, garde-fous, cycle `/factory-run`
- [[Runbook-Sandbox]] — démarrer, déployer, rejouer les scénarios
- [[Scenarios-et-preuves]] — les 4 tests exigés et leurs preuves
- [[Securite]] — contrôles, revues, follow-ups

## État (2026-11-08)
| Spec | Statut | PR |
|---|---|---|
| 000 Agentic factory | ✅ livrée | main |
| 001 Sandbox + jetons | ✅ fusionnée | #16 |
| 002 Transfert TCE E2E + incidents | ✅ 4/4 scénarios PASS, en revue | #18 |
| 003 Swap TCE→TCD | 📝 Draft (clarifications) | #9 |
| 004 TIF | ⛔ bloquée (sources TELA) | #10 |
| 005 UI Angular | 📝 Draft | #11 |
