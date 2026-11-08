# Sécurité

## Contrôles en place
- Clés : générées localement, keystores V3 chiffrés, détenues **uniquement** par Web3Signer (réseau interne `signing`) ; déploiement via `--unlocked` (aucune clé exportée).
- Besu : RPC `ETH,NET,WEB3` seulement, `--host-allowlist`, découverte désactivée.
- PostgreSQL : rôles séparés (`tela_backend` lit seulement `tela_read`, `tela_ponder`, `tela_adapter` sur sa base).
- Contrats : AccessControl (admin / minter / pauser distincts), Pausable, références par émetteur, Slither 0 finding, fuzz + invariants.
- Messages : schémas JSON stricts (zod côté adaptateur), `to` en liste blanche, `chainId` explicite.
- CI : gitleaks (allowlist limitée aux clés publiques nommées), Trivy, Slither, tests des hooks, actions épinglées par SHA, Dependabot.
- Agents : hook PreToolUse, allowlist fermée, sandbox d'exécution sans réseau.

## Revues `security-auditor`
- PR #16 : M-1…M-4, F-1 → corrigés ; follow-ups #17.
- PR #18 : voir le commentaire de revue sur la PR.

## Ouvert
- #12 Authentification/autorisation de l'API (avant tout environnement partagé).
- #17 SASL/ACL Kafka, secrets Compose, digests d'images, sha256 solc, environnement protégé pour `factory.yml`.
