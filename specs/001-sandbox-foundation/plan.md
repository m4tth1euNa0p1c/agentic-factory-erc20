# Implementation Plan: Sandbox TELA et jetons de base

**Branch**: `001-sandbox-foundation` | **Date**: 2026-11-08 | **Spec**: [spec.md](./spec.md)

## Summary
Docker Compose reproductible (Besu QBFT, Web3Signer eth1, Kafka KRaft, PostgreSQL 18) bootstrapé par script, et jetons ERC-20 `TelaToken` (TCE/TCD/TIF) avec `transferWithReference` anti-rejeu, déployés via Foundry en signant **par Web3Signer** (`forge script --unlocked`).

## Technical Context
**Language/Version**: Solidity 0.8.30 (EVM cancun), Bash, YAML · **Primary Dependencies**: OpenZeppelin 5.6.1, Foundry 1.9.0 (conteneur) · **Storage**: volumes Docker · **Testing**: forge test (unit + fuzz + invariant), `sandbox.sh check` · **Target Platform**: Docker Desktop (Win/Mac) et Linux CI · **Constraints**: aucun port hors 127.0.0.1, aucune clé hors Web3Signer.

## Constitution Check
| Principe | Statut |
|---|---|
| I. Evidence-closed | ✅ `evidence/001/` produit par `sandbox.sh check` + forge |
| II. Hypothèses visibles | ✅ H-02, H-04, H-09 référencées |
| III. Contrats d'abord | ✅ ABI exportées avant 002 |
| IV. Effet unique | ✅ `transferWithReference` (D-03) |
| V. Sécurité | ✅ réseaux séparés, `signing` interne, APIs Besu restreintes, rôles PG |
| VI. Reproductible | ✅ versions figées, une commande |
| VII. Simplicité | ✅ un seul contrat jeton paramétré pour TCE/TCD/TIF |

## Project Structure
```
compose.yaml
infra/besu/genesis.template.json      infra/postgres/init/01-roles.sh
infra/generated/ (gitignored)         infra/.secrets/ (gitignored)
scripts/{lib,bootstrap-env,sandbox,forge,deploy-contracts,slither}.sh
contracts/
  foundry.toml  remappings.txt
  src/TelaToken.sol  src/TalanFixedRateSwap.sol (squelette, logique en 003)
  script/Deploy.s.sol
  test/TelaToken.t.sol
  abi/*.json
deployments/local.json (gitignored)
.github/workflows/ci.yml
```

## Design decisions
- **Déploiement sans clé exportée** : le conteneur Foundry rejoint le réseau interne `signing` et appelle Web3Signer (`eth_sendTransaction`), qui relaie vers Besu. `--legacy --with-gas-price 0` (H-04).
- **Référence** : `mapping(bytes32 => bool) usedReferences` ; vérification avant transfert (CEI) ; événement `TransferWithReference(bytes32 indexed reference, address indexed from, address indexed to, uint256 amount)`.
- **Rôles** : `DEFAULT_ADMIN_ROLE` → deployer (à transférer à une multisig hors sandbox), `MINTER_ROLE` → treasury, `PAUSER_ROLE` → operator.

## Complexity Tracking
| Écart | Pourquoi | Alternative rejetée |
|---|---|---|
| Foundry en conteneur sur réseau `signing` | Clés jamais hors Web3Signer | Clé privée en variable d'env pour `forge script` (fuite possible) |
