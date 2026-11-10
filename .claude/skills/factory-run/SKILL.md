---
name: factory-run
description: Lance un cycle complet de la TELA Agentic Factory sur une spec (sélection de l'issue débloquée, implémentation par l'agent spécialiste, vérification indépendante, revue sécurité, preuve, PR). À utiliser quand on demande de « faire avancer la factory », « traiter la prochaine issue » ou « /factory-run NNN ».
---

# Cycle de la factory

Argument : numéro de spec (`001`, `002`…). Sans argument : plus petite spec ayant des issues ouvertes.

1. **Sync** : `git fetch && git switch NNN-<name> && git pull --ff-only`. Lire `specs/NNN-*/{spec,plan,tasks}.md`.
2. **Matrice de validation** : chaque FR **et chaque SC** de la spec a une ligne dans `validation-matrix.md` (tâche, test, preuve). Un SC sans test ⇒ créer la tâche avant tout le reste.
2b. **Balayage des specs** : exécuter `/speckit-analyze` si `tasks.md` a changé depuis la dernière analyse (`specs/NNN-*/.analyze-stamp`). Toute incohérence CRITICAL bloque le cycle.
3. **Sélection** : prochaine tâche `- [ ]` de `tasks.md` dont les dépendances sont cochées ; retrouver l'issue GitHub correspondante (`gh issue list --search "TNNN in:body"`).
4. **Délégation** : sous-agent du périmètre (cf. `.claude/agents/`), prompt = tâche + critères d'acceptation + fichiers autorisés + preuve attendue.
5. **Vérification** : sous-agent `verifier` (indépendant, ré-exécute). FAIL → retour à 4 (max 3 essais, puis label `blocked`).
6. **Sécurité** : si fichiers touchés ∈ {contracts/, adapter/, infra/, backend/**/security, .github/} → sous-agent `security-auditor`.
7. **Connaissance** (avant le commit, pour que les explications soient revues avec le changement) : sous-agent `knowledge-curator` (skill `knowledge-maintenance`, mode `ingest`) sur les pages rendues `stale` ; exiger `node scripts/knowledge-lint.mjs` sans erreur.
7b. **Clôture** : cocher la tâche, ajouter la PREUVE au registre, commit Conventional Commits `Refs #issue` (code + pages), push, commentaire d'issue avec lien vers `evidence/`.
8. Quand toutes les tâches d'une user story sont cochées : PR `NNN-<name>` → `main` (ou mise à jour), fermer l'issue de la story via `Closes #N`.

Livraison : toujours une branche de spec + PR ; `main` est protégée côté serveur (PR + 9 checks requis).
Garde-fous : jamais de `--force`, jamais de lecture de `.env`/`infra/.secrets/`, jamais d'exécution de code non revu hors `scripts/sandbox-exec.sh`.
