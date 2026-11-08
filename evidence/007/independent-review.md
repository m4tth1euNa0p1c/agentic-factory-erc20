# Revue indépendante — gouvernance des expériences

Date : 2026-11-08. Revue source en contexte neuf par un agent distinct de l'implémenteur.
Périmètre : diff de la factory, script, tests, schémas, templates, skills, agents, pilote et CI.
Skill de sécurité : `security-audit` vendorisé, guidance mode. Aucun audit global de TELA.

## Constats

### R1 — P2 : titre SC sans ponctuation ignoré

Une spec combinant `- **SC-001**: ...` et `### SC-002` pouvait n'exposer que SC-001 au
contrôle mécanique. Une acceptation de spec avec uniquement SC-001 pouvait alors passer.
Le parseur annonçait la prise en charge des titres ; cette omission est un défaut, pas une
simple limite sémantique. Correctif requis : reconnaître les titres nus/formatés et tester
la couverture du dossier complet, pas uniquement l'expression régulière.

Statut : corrigé, puis relu par le même réviseur indépendant. Les neuf formes de titre du test
font désormais rejeter une couverture manquante. Voir les traces rouge/verte dans ce dossier.

### R2 — Convention de temps cumulé à expliciter

Si un rapport déclarait dix minutes cumulées mais les dates de la seule deuxième tentative
de cinq minutes, le contrôle rendait INCONCLUSIVE. Les instructions et le schéma précisent
désormais que `startedAt` reste le début de campagne et `endedAt` la fin du bilan courant.
Les consommations restent cumulatives, y compris les tentatives invalides. Le CLI ne les
agrège pas automatiquement ; le verifier confronte le cumul aux traces antérieures.

Statut : clarifié et relu ; test de deuxième checkpoint de dix minutes et deux itérations réussi.

## Sécurité et CI

Aucune vulnérabilité confirmée dans ce périmètre. Le réviseur a vérifié dans les sources :

- les commandes de JSON restent inertes ;
- les chemins absolus, traversées et emplacements sensibles sont refusés ;
- la résolution canonique est contrôlée avant lecture des artefacts ;
- les empreintes SHA-256 sont recalculées ;
- la CI conserve ses permissions `contents: read`, son checkout sans credentials persistés
  et ses neuf jobs ; l'ajout ne lance pas le workflow `/factory` ;
- les limites relatives à la vérité des observations, la facturation, la chronologie du
  préenregistrement et l'indépendance réelle sont explicites.

## Limite de cette revue

Le réviseur n'a pas exécuté le code cible : le contrôle préalable d'isolation système a
échoué (`bwrap: loopback: Failed to create NETLINK_ROUTE socket: Operation not permitted`).
Il n'a pas contourné cette limite. Les défauts sont établis par lecture du code ; leur
reproduction et les tests de correction sont effectués séparément dans le cycle de développement.
La revue ne se présente donc pas comme une seconde exécution indépendante de tous les tests.

La relecture finale des correctifs conclut R1 et R2 résolus, sans défaut restant identifié
dans ce périmètre. Le réviseur a lu les sources et les traces rouge/verte ; il n'a pas exécuté
le code cible. La vérification locale finale de l'intégrateur est consignée séparément.
