# Architecture

```
Écriture : Angular ─► Java (Spring Boot 4.1, Java 25) ─► Kafka 4.4 ─► Adaptateur (Node 24 + viem) ─► Web3Signer 26.10 ─► Besu 26.11 (QBFT)
Lecture  : Besu ─► Ponder 0.18 ─► PostgreSQL 18 (vues tela_read) ─► Java ─► Angular
```

## Composants et réseaux
```mermaid
flowchart LR
  subgraph ui["ui"]
    FE["Frontend Angular 22 + nginx"]
  end
  subgraph data["data"]
    BE["Backend Spring Boot"]
    PG[("PostgreSQL 18")]
  end
  subgraph bus["bus"]
    K[["Kafka 4.4"]]
  end
  subgraph chain["chain"]
    AD["Adaptateur viem"]
    IX["Ponder"]
    BS["Besu QBFT"]
  end
  subgraph signing["signing (interne)"]
    W3["Web3Signer"]
  end
  FE -->|REST| BE
  BE -->|outbox| K
  K <-->|commandes / résultats| AD
  K -->|résultats| BE
  AD -->|eth_signTransaction| W3
  AD -->|sendRawTransaction, reçus| BS
  BS -->|logs| IX
  IX --> PG
  BE --> PG
```

| Réseau | Membres |
|---|---|
| `chain` | besu, adapter, indexer |
| `signing` (internal) | web3signer, besu, adapter, déployeur ponctuel |
| `data` | postgres, backend, indexer, adapter |
| `bus` | kafka, backend, adapter |
| `ui` | frontend, backend |

Ports hôte (127.0.0.1 uniquement) : UI 4200, API 8080, Besu 8545 (`ETH,NET,WEB3`), PostgreSQL 5432. Web3Signer et Kafka ne sont pas publiés.

## Séquence d'un transfert
```mermaid
sequenceDiagram
  autonumber
  participant BE as Java
  participant DB as PostgreSQL
  participant K as Kafka
  participant AD as Adaptateur
  participant W3 as Web3Signer
  participant BS as Besu
  participant IX as Ponder
  BE->>DB: RECEIVED + réservation + outbox (1 transaction)
  BE->>K: commands.v1 (clé = émetteur → nonces ordonnés)
  K->>AD: commande
  AD->>BS: simulation
  AD->>W3: eth_signTransaction
  AD->>DB: journal rawTx + hash AVANT diffusion
  AD->>BS: eth_sendRawTransaction
  AD->>K: BROADCAST puis CONFIRMED / FAILED / REJECTED / UNKNOWN
  K->>BE: résultats (idempotents, tolérants au désordre)
  BS-->>IX: TransferWithReference(ref)
  IX->>DB: solde + exécution (même lot)
  BE->>DB: preuve indexée identique → SETTLED, réservation libérée
```

## États d'une opération
```mermaid
stateDiagram-v2
  [*] --> RECEIVED
  RECEIVED --> PUBLISHED : outbox
  PUBLISHED --> BROADCAST
  PUBLISHED --> REJECTED : revert simulé
  BROADCAST --> CONFIRMED : reçu 1
  BROADCAST --> FAILED : reçu 0
  BROADCAST --> UNKNOWN : RPC coupé / timeout
  UNKNOWN --> CONFIRMED : réconciliation
  CONFIRMED --> SETTLED : preuve indexée
  UNKNOWN --> SETTLED : preuve indexée (D-14)
  SETTLED --> [*]
  FAILED --> [*]
  REJECTED --> [*]
  note right of UNKNOWN : conserve la réservation
```
Le règlement (D-14) se fait sur **preuve indexée** depuis n'importe quel état non terminal : des étapes intermédiaires peuvent être sautées si l'indexeur est plus rapide que les résultats Kafka.

## Garanties d'effet unique (Constitution §IV)
| Couche | Mécanisme |
|---|---|
| HTTP | Idempotency-Key (rejouée → même opération ; corps différent → 409) |
| Base | `disponible = indexé − réservations non indexées`, lu dans **un seul snapshot SQL** (D-21) |
| Kafka → adaptateur | journal `tx_attempt` : jamais deux signatures pour un operationId |
| Chaîne | `transferWithReference` : référence `keccak256(operationId)` consommable une fois **par émetteur** |
| Lecture | `SETTLED` uniquement sur événement indexé avec `to`/`amount` identiques ; garde de watermark + `reorgWindow: 0` (D-23) |
