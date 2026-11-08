# Actions humaines requises

Tout ce qui est automatisable est généré par `scripts/bootstrap-env.sh` (clés, mots de passe, ids).
Restent à la main de l'humain :

| # | Action | Pourquoi | Où stocker | Bloquant pour |
|---|---|---|---|---|
| 1 | Fournir le dépôt TELA existant (ou une archive code + configs **sans secrets**) : sources Solidity, ABI, adresses, OpenAPI Java, formats Kafka, config Besu | Transformer les hypothèses H-01…H-09 en faits | Déposer dans `sources/tela/` (gitignored si sensible) ou donner l'URL du dépôt | 003 (clarifs), 004 (bloquée), fidélité globale |
| 2 | Ajouter `ANTHROPIC_API_KEY` comme **secret de l'environnement `factory`** (Settings → Environments → factory → Add secret), **pas** comme secret de dépôt | L'environnement n'accepte que `main`, qui est protégée (PR + 9 checks). Les « required reviewers » ne sont pas disponibles sur ce plan GitHub | Secret d'environnement GitHub, jamais dans `.env` | Factory en mode autonome CI |
| 3 | ~~Protection de `main`~~ **fait le 2026-11-08** : PR obligatoire, 9 checks requis (dont e2e 001/002), admins inclus, force-push et suppression interdits | — | — | — |
| 4 | Pour un environnement non-sandbox : choisir le coffre de clés (HashiCorp Vault, AWS KMS ou Azure Key Vault) pour Web3Signer | Les keystores fichiers ne conviennent qu'au dev | Config Web3Signer (`--aws-kms-*`, `--azure-*`, Vault) | Hors sandbox |
| 6 | Initialiser le Wiki : GitHub → onglet Wiki → « Create the first page » → Save (1 clic). Ensuite `scripts/publish-wiki.sh` publie `docs/wiki/` | GitHub ne crée le dépôt `.wiki.git` qu'après une première page via l'UI | — | Wiki |
| 5 | Répondre aux `[NEEDS CLARIFICATION]` de 003 et 004 (ou fournir les sources, point 1) | Taux figé ?, swap inverse ?, nature de TIF | Commentaire sur l'issue correspondante | 003, 004 |

Variables `.env` : **aucune saisie manuelle** pour le sandbox. Voir `.env.example` pour la liste.
