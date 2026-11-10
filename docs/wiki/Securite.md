# Sécurité

## Contrôles en place
- **Clés** : générées localement, keystores V3 chiffrés, détenues **uniquement** par Web3Signer (réseau interne `signing`) ; l'adaptateur ne signe que pour les comptes clients listés (`ADAPTER_SIGNABLE_ACCOUNTS`), jamais pour les clés admin/minter.
- **Besu** : RPC `ETH,NET,WEB3` seulement (admin, QBFT vote, txpool désactivés — vérifié par `sandbox.sh check`), `--host-allowlist`, découverte désactivée.
- **PostgreSQL** : rôles séparés (`tela_backend` ne lit que `tela_read`, `tela_ponder`, `tela_adapter`).
- **Contrats** : AccessControl (admin / minter / pauser distincts), Pausable, références par émetteur, Slither 0 finding, fuzz + invariants.
- **Messages** : schémas JSON stricts (zod), `to` en liste blanche, `chainId` explicite.
- **Frontend** : nginx avec allowlist Host (421 sinon), utilisateur non-root.
- **CI** : gitleaks, Trivy, Slither, tests des hooks (dont le périmètre du curateur), contrôle de la base de connaissances (`scripts/knowledge-lint.mjs`, refus des chemins sensibles), actions épinglées par SHA, Dependabot.
- **Wiki** : `scripts/publish-wiki.sh` publie seulement depuis `main` (sauf dérogation explicite), refuse un `docs/wiki/` non commité et passe gitleaks avant de pousser (revue K-3, PR #40).
- **Factory** : hook PreToolUse, allowlist, sandbox d'exécution sans réseau, `main` protégée, environnement `factory` limité à `main`. Voir [[Validations-humaines]].

## Revues `security-auditor`
| PR | Suivi |
|---|---|
| #16 (001) | #17 |
| #18 (002) | #20 |
| #25 (002 validation) | #27 |
| #28 (005 UI) | #29 |
| #24 (007) | revue « fusionner après correctifs » (M-1, M-2, M-3, L-1) |

## Ouvert
- #12 Authentification/autorisation de l'API — **avant tout environnement partagé**.
- #31 Garde-fous v2 — **avant toute cible Talan** (22 contournements identifiés, audit 008).
- #17/#20/#27/#29 : SASL/ACL Kafka, secrets Compose, digests d'images, durcissements UI.
