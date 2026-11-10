# Règles d'écriture d'une page

1. **Source avant phrase.** Toute affirmation factuelle porte une citation : `chemin`, `chemin:ligne`, `evidence/<spec>/<x>/runs/<RUN_ID>/`, ou un ID du registre. Les liens entre pages utilisent `[[Nom-de-page]]` vers une page qui existe.
2. **Statut épistémique visible.** Fait (F-xx, preuve P-xx, code lu) ≠ hypothèse (H-xx, « à confirmer ») ≠ décision (D-xx, « choisi parce que… »). Ne jamais promouvoir une H en fait.
3. **Pas d'écrasement silencieux.** Si une source plus récente contredit la page : conserver l'ancien énoncé, ajouter `## Contradictions / mises à jour` avec date, ancienne affirmation, nouvelle source, et ce qui reste à trancher.
4. **Chiffres = preuve.** Toute mesure (latence, nombre de crashs, couverture) cite le `run.json`/`evidence.json` et le commit mesuré.
5. **Pas de copie de données sensibles.** Pas de secret, de `.env`, de clé privée, de log brut, d'adresse autre que les adresses publiques de test déjà documentées.
6. **Diagrammes** en Mermaid, suivis d'un paragraphe « Comment lire ».
7. **Limites honnêtes.** Ce qui n'est pas imposé techniquement est dit « convention » ; ce qui n'est pas mesuré est dit « non mesuré ».
8. **Taille.** Une page = un sujet. Au-delà de ~200 lignes, scinder et lier.
