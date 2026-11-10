# Règles de `scripts/knowledge-lint.mjs`

| Sév. | Règle | Déclenchement | Correction attendue |
|---|---|---|---|
| E | `broken-wiki-link` | `[[Page]]` sans `docs/wiki/Page.md` | créer la page ou corriger le lien |
| E | `broken-path` | chemin cité entre backticks (racines connues) inexistant | corriger le chemin ; si la cible n'est pas encore fusionnée, citer la PR |
| E | `unknown-registry-id` | `F-/H-/D-/P-NN` absent de `docs/registry/REGISTRE.md` | corriger l'ID ou proposer l'entrée au registre |
| E | `hypothesis-as-fact` | ligne citant `H-NN` avec « est confirmé », « prouvé », « c'est un fait » | reformuler en hypothèse, ou faire passer la porte G3 |
| E | `sources-missing` | source déclarée dans `sources.json` disparue | mettre à jour la déclaration |
| W | `stale-page` | sha256 d'une source ≠ empreinte enregistrée | mode `ingest` puis `--update-sources` |
| W | `orphan-page` | page wiki liée par aucune autre | lier depuis `Home.md` / `_Sidebar.md` |
| W | `unsourced-page` | page absente de `sources.json` | déclarer ses sources |

Les blocs de code (```…```) sont ignorés pour les contrôles de prose. Les chemins avec `<…>`, `*`, `{…}`, `$`, `NNN`, `...` ou `…` sont des gabarits et ne sont pas vérifiés.
