---
name: smart-contract-security
description: Checklist de sécurité spécifique aux contrats TELA (ERC-20 TCE/TCD/TIF, TalanFixedRateSwap) et à la chaîne de signature Web3Signer/Besu. À utiliser en complément du skill security-audit lors de toute revue touchant contracts/ ou adapter/.
---

# Smart contract & signing security — TELA

Complète `.claude/skills/security-audit/SKILL.md` (méthode, preuves, format des findings). Un finding
n'est confirmé qu'avec un principal affecté, une ressource et un effet de sécurité concrets.

## 1. Contrats (contracts/src)
- [ ] Contrôle d'accès : `mint`, `burn`, `pause`, `setRate`, retrait de liquidité réservés à un rôle ; `DEFAULT_ADMIN_ROLE` distinct des rôles opérationnels.
- [ ] Rejeu : `transferWithReference` et `swap` rejettent une référence déjà consommée **avant** tout transfert (CEI).
- [ ] Arithmétique : `amountOut = amountIn * rateNum / rateDen` arrondi à l'inférieur ; pas de dépassement ; montant nul rejeté ; tests fuzz.
- [ ] Liquidité : swap revert si liquidité insuffisante (pas de transfert partiel).
- [ ] Jetons : `SafeERC20` pour tout appel externe ; pas de hook d'appel externe non maîtrisé (pas d'ERC-777).
- [ ] Pause : toutes les fonctions de mouvement respectent `whenNotPaused`.
- [ ] Événements : chaque effet émet un événement indexable (référence en `indexed`).
- [ ] Slither : aucun High/Medium non justifié.

## 2. Signature (adapter + Web3Signer)
- [ ] Web3Signer joignable uniquement depuis l'adaptateur (réseau Docker `signing`), jamais publié sur l'hôte.
- [ ] `from` de la transaction = compte attendu pour l'opération (pas de choix libre via message Kafka non validé).
- [ ] `chainId` explicite dans chaque transaction (anti-rejeu inter-chaînes).
- [ ] Destination (`to`) limitée à la liste blanche des adresses de contrats déployés.
- [ ] Nonce : un seul écrivain par compte (partition Kafka = compte) ; nonce persisté avant diffusion.
- [ ] Aucun log de clé, de mot de passe de keystore ni de rawTx complet.

## 3. Messages Kafka
- [ ] Schéma JSON validé (zod) avant tout effet ; message invalide → DLQ, jamais d'exécution.
- [ ] `schemaVersion` vérifiée ; champs inconnus rejetés.
- [ ] Montants transportés en chaîne décimale entière (unités minimales), jamais en flottant.

## 4. Sortie
Pour chaque point non conforme : fichier:ligne, scénario d'exploitation local reproductible (sandbox), correctif minimal. Résultat ajouté au commentaire de PR et, si confirmé, en issue `security`.
