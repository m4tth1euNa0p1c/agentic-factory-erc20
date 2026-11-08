# Actions humaines requises

Tout ce qui est automatisable est généré par `scripts/bootstrap-env.sh` (clés, mots de passe, ids).
Restent à la main de l'humain :

| # | Action | Pourquoi | Où stocker | Bloquant pour |
|---|---|---|---|---|
| 1 | Fournir le dépôt TELA existant (ou une archive code + configs **sans secrets**) : sources Solidity, ABI, adresses, OpenAPI Java, formats Kafka, config Besu | Transformer les hypothèses H-01…H-09 en faits | Déposer dans `sources/tela/` (gitignored si sensible) ou donner l'URL du dépôt | 003 (clarifs), 004 (bloquée), fidélité globale |
| 2 | Ajouter le secret GitHub `ANTHROPIC_API_KEY` (Settings → Secrets → Actions) | Permet au workflow `factory.yml` de faire tourner la factory en CI sur commentaire `/factory` | Secret du dépôt GitHub — **jamais** dans `.env` committé | Factory en mode autonome CI |
| 3 | Activer la protection de branche `main` (PR obligatoire, CI verte) si le plan GitHub le permet | Constitution §Delivery | Settings → Branches | — |
| 4 | Pour un environnement non-sandbox : choisir le coffre de clés (HashiCorp Vault, AWS KMS ou Azure Key Vault) pour Web3Signer | Les keystores fichiers ne conviennent qu'au dev | Config Web3Signer (`--aws-kms-*`, `--azure-*`, Vault) | Hors sandbox |
| 5 | Répondre aux `[NEEDS CLARIFICATION]` de 003 et 004 (ou fournir les sources, point 1) | Taux figé ?, swap inverse ?, nature de TIF | Commentaire sur l'issue correspondante | 003, 004 |

Variables `.env` : **aucune saisie manuelle** pour le sandbox. Voir `.env.example` pour la liste.
