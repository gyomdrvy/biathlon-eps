# Biathlon EPS

Application d’évaluation pour une épreuve de 4 × 200 m avec quatre passages de tir laser et cinq cibles par passage.

## Publier sur GitHub Pages

1. Crée un dépôt GitHub nommé `biathlon-eps`. Avec GitHub Free, utilise un dépôt public pour GitHub Pages.
2. Décompresse l’archive et ajoute le contenu à la racine du dépôt. Le fichier `index.html` doit apparaître directement dans l’onglet **Code**. Conserve le dossier `vendor`.
3. Dans **Settings → Pages**, choisis **Deploy from a branch**, puis **main** et **/(root)**. Clique sur **Save**.
4. Ouvre l’adresse affichée par GitHub Pages dans Safari sur l’iPad. Dans **Partager**, choisis **Sur l’écran d’accueil**.

L’application fonctionne hors ligne lorsque la mise en cache initiale a abouti. Les classes et les résultats sont conservés dans le navigateur ou l’application installée sur cet appareil.

## Utilisation

- **Classes**. Crée une classe et ajoute des élèves à la main ou importe un classeur `.xlsx`. Utilise la première feuille et les colonnes `Nom`, `Prénom` et, facultativement, `Référence 200 m`. Le modèle Excel est disponible dans l’application. Les imports ajoutent des élèves à la classe sélectionnée. Saisis ou corrige la référence directement dans la liste. Elle est enregistrée en quittant le champ. Le bouton **Supprimer** retire l’élève et son résultat après confirmation.
- **Épreuve**. Renseigne le temps total de l’épreuve, tir compris, puis la durée, les cibles touchées et le nombre de tirs réalisés pour chaque passage. Tu peux saisir des secondes (42,5) ou des minutes.secondes (4.48). Touche la première, deuxième, troisième, quatrième ou cinquième cible pour indiquer le nombre de touches. Le bouton **0 cible** indique zéro touche. Les boutons **Précédent** et **Suivant** suivent l’ordre de la liste de classe. Les saisies en cours restent disponibles pendant la navigation. Utilise **Enregistrer** pour conserver le résultat et rester sur la saisie. Le bouton **Voir le bilan** ouvre le dernier résultat enregistré.
- **Bilan**. Consulte la vitesse de course hors tir, la vitesse globale de l’épreuve, l’écart à l’objectif et l’évolution des quatre passages de tir. La comparaison avec l’objectif apparaît dès que la référence de l’élève est renseignée.

Le temps cible correspond à quatre fois la référence individuelle sur 200 m, plus 120 secondes de tir. Les vitesses sont calculées sur 800 m. L’écart de temps correspond au temps total réel moins le temps cible.

Le taux de réussite de chaque passage correspond aux cibles touchées divisées par le nombre de tirs réalisés. Le bilan affiche un tiret si aucun tir n’a été réalisé ou si le nombre de tirs manque dans un résultat ancien.

Dans le bilan de l’épreuve, la réussite globale correspond au total des cibles touchées divisé par le total des tirs réalisés sur les quatre passages. Elle est affichée quand les quatre nombres de tirs sont connus et que leur somme est positive.

## Évaluation sur 20

Dans la liste des élèves, choisis Fille ou Garçon avant la référence 200 m. Le choix du barème de vitesse s’enregistre automatiquement. Dans le bilan individuel, saisis la note manuelle d’investissement sur 4. Le détail affiche les seuils de vitesse sur 5, l’objectif individuel sur 5, la réussite au tir sur 4 et le temps de tir sur 2. La note finale apparaît quand les données des quatre critères et l’investissement sont renseignés.

L’onglet **Bilan de classe** récapitule les cinq critères pour chaque élève de la classe sélectionnée.

Le **Bilan individuel** propose les boutons **Précédent** et **Suivant**. Le **Bilan de classe** permet de saisir l’investissement directement dans le tableau et affiche la note finale sur 20 dès que les cinq critères sont renseignés. L’investissement s’enregistre en quittant la case ou en appuyant sur Entrée.

Vitesse hors tir sur 5 · 5 points dès 16 km/h pour les garçons et 15 km/h pour les filles. Chaque palier de 1 km/h en dessous retire 0,5 point, avec un minimum de 0.

Objectif individuel sur 5 · 5 points sous 10 % de retard, puis un demi-point de moins par tranche de 10 %, jusqu’à 0,5 point de 90 % à moins de 100 %. À partir de 100 %, 0 point.

Réussite au tir · 4 points dès 80 %, puis un demi-point de moins par tranche de 10 %. Sous 10 %, 0 point.

Temps total au tir · 2 points en moins de 2.00, 1,5 en moins de 2.40, 1 en moins de 3.20, 0,5 en moins de 4.00, puis 0.

En haut du **Bilan de classe**, les moyennes des cinq critères et de la note finale comptent les notes disponibles, y compris les zéros. Chaque carte indique l’effectif pris en compte.

## Sauvegarde et export iDoceo

Dans **Bilan de classe**, **Sauvegarder la classe (JSON)** enregistre la liste des élèves, les références, les résultats enregistrés de l’épreuve et l’investissement. Dans **Classes**, **Réimporter la classe** ouvre cette sauvegarde dans une nouvelle classe. Les copies d’une classe existante reçoivent un numéro.

**Exporter vers iDoceo (CSV)** télécharge un fichier contenant le nom, le prénom, les cinq critères et la note finale sur 20. Les notes non renseignées restent vides. Dans l’assistant d’importation iDoceo, associe les colonnes Nom et Prénom et sélectionne les colonnes de notes à importer.
