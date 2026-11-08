# Feature Specification: Expériences mesurables et décisions bornées

**Feature Branch**: `007-experiment-governance`
**Created**: 2026-11-08
**Status**: In progress
**Input**: Renforcer la factory avec six questions : Problème, Hypothèse, Référence, Critère, Budget, Décision.
**Suivi**: US1 #21, US2 #22, US3 #23; milestone `000-agentic-factory` (extension de la factory).

## Problème

Le responsable de validation et l'orchestrateur peuvent accepter un récit de réussite sans
comparaison explicite, couverture de tous les critères de succès, ni bilan des ressources.
La spec 002 distingue déjà quatre scénarios et quatre SC : une CI verte ne signifie pas
que les campagnes de 100 crashs, p95 et 1 000 demandes ont été réalisées.

## User stories

### US1 — Préparer un essai avant de déléguer

Un agent `experiment-designer` remplit une fiche versionnée avec les six rubriques,
la personne concernée, la méthode actuelle, un résultat réfutable, des seuils, un budget
et les règles de décision. Une valeur inconnue est explicite, jamais remplacée par zéro.
Le skill `design-experiment` produit une fiche DRAFT puis READY lorsque le cadrage est complet.

### US2 — Évaluer les observations avec leurs preuves

Le `verifier` applique `evaluate-experiment` à un rapport séparé du protocole.
Un outil local, sans dépendances ni réseau, vérifie les seuils, échantillons, artefacts,
empreintes, provenance déclarée et budget. Il rend GO, MODIFY, STOP ou INCONCLUSIVE.
Le GO concerne le périmètre de la fiche et n'autorise ni déploiement ni dépenses nouvelles.

### US3 — Orchestrer avec une limite et une décision

L'orchestrateur utilise un seul nouvel agent, réutilise les spécialistes existants et le
vérificateur, conserve les plafonds entre tentatives et arrête les boucles sans progrès.
Une autorisation déjà présente reste valable dans son périmètre. Les inconnues sont
collectées en un seul retour utile ; le travail indépendant peut continuer.

## Requirements

- **FR-001**: Un seul nouveau rôle : `experiment-designer`, sans écriture du code produit ni auto-validation.
- **FR-002**: Deux skills : `design-experiment` et `evaluate-experiment`; intégrer le cycle à `factory-run`, `orchestrator` et `verifier`.
- **FR-003**: Fiches et rapports JSON séparés, schémas versionnés; six rubriques obligatoires.
- **FR-004**: `validate` contrôle la structure; `start` exige READY et un budget explicite; `evaluate` ne peut donner GO sur un DRAFT, un run invalide, des données manquantes, des preuves absentes ou des échantillons insuffisants.
- **FR-005**: Vérifier l'empreinte de la fiche et des artefacts; refuser les chemins sortants et les emplacements sensibles. Ne jamais exécuter les commandes provenant d'un JSON.
- **FR-006**: Coût ou attention non mesurés restent inconnus. Accepter une borne conservatrice du coût uniquement si sa source est renseignée. Un budget dépassé ou un garde-fou violé entraîne STOP.
- **FR-007**: Une comparaison d'amélioration exige une référence mesurée et étayée; un test absolu peut justifier l'absence de comparaison quantitative sans prétendre à un gain.
- **FR-008**: En mode `spec_acceptance`, chaque SC défini dans la spec doit être couvert par au moins un critère requis. Le mode `experiment` ne vaut pas clôture de la spec entière.
- **FR-009**: Intégrer les tests du contrôle au job existant `factory hooks tests`; ne pas créer de boucle payante ni modifier les services TELA.
- **FR-010**: Fournir une fiche DRAFT pour la validation 002. Ne pas inventer de mesures ou déclarer les problèmes 002 corrigés par cette évolution de la factory.

## Success criteria

- **SC-001**: Les tests discriminants refusent GO pour preuve absente/altérée, run invalide, seuil changé, baseline manquante, coût inconnu, échantillon insuffisant et SC oublié.
- **SC-002**: Les tests distinguent GO complet, MODIFY borné, STOP sur budget/garde-fou et INCONCLUSIVE sur données insuffisantes.
- **SC-003**: Un essai indépendant des skills sur un dossier synthétique produit une décision justifiée sans inventer de coût ou de preuve.
- **SC-004**: Les documents, agents, schémas, fiche pilote et CI utilisent le même contrat; les tests existants du hook restent verts.

## Limites explicites

Le contrôle vérifie les données qui lui sont soumises et les artefacts locaux. Il n'atteste
pas la véracité physique d'une mesure, l'identité réelle d'un agent ou la facturation d'un
fournisseur. Les plafonds sont contrôlés aux points de passage; les limites du runner et
du fournisseur doivent également être configurées avant une exécution payante. Les seuils
ne sont pas abaissés après observation : une nouvelle hypothèse exige une nouvelle révision.
