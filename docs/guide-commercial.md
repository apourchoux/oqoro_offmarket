# Guide d'utilisation — OQORO Off Market

Pour les agents OQORO qui publient les biens sur `offmarket.oqoro.com`.

---

## 1. Publier un bien

5 étapes dans le formulaire, 5 à 10 minutes en tout.

### Se connecter

`offmarket.oqoro.com/admin/login` → email + mot de passe OQORO.

### Créer un bien

Tableau de bord → **Ajouter un bien**. Le formulaire s'ouvre en 5 étapes
(indiquées en haut de page). On peut naviguer librement entre les étapes,
rien n'est perdu tant qu'on ne ferme pas l'onglet.

### Étape 1 — Le bien

Titre, adresse, ville, type, surface, pièces, étage, description.

Le **slug** est l'URL publique du bien (ex. `colocation-meublee-lyon-3`).
Cliquer **Auto** pour le générer depuis l'adresse.

### Étape 2 — Photos

Drag & drop. La première photo est utilisée en couverture — pour en choisir
une autre, cocher le bouton radio « Principale » sur celle qu'on veut.

### Étape 3 — Argent

- **Prix de vente FAI** et **taux de frais de notaire** (0,08 = 8 %).
- **Occupation locative** : taux d'occupation moyen du quartier (donnée
  OQORO). Saisir un nombre entre 0 et 100. Voir plus bas pour l'impact.
- **Lots** : un lot par bail (une chambre en coloc, ou le bien entier).
  Saisir loyer hors charges + charges + statut (loué / vacant / préavis).
- **Charges et frais** (optionnel) : charges de copro, taxe foncière,
  gestion. Si laissé vide, des estimations sont calculées automatiquement.

### Étape 4 — Quartier & énergie

DPE, coordonnées GPS, transports (à pied / vélo / métro). Sous-section
« Marché local » pour les indicateurs de zone (prix m², loyer médian,
tension, etc.) — tout est optionnel.

### Étape 5 — Présentation

- **Historique locatif** : taux d'occupation et loyers encaissés par année,
  si on les a (sinon on saute, ça affichera juste rien).
- **Conseiller affecté** : qui s'occupe du bien (sinon Camille Loubet par
  défaut).
- **SEO** : meta title + description pour le référencement.
- **Coche « Publié »** pour rendre le bien visible.

### Sauvegarder

Deux boutons en bas du formulaire :

- **Enregistrer le brouillon** : sauve sans publier. Le bien reste invisible.
- **Publier & rebuild** : sauve, marque publié, et déclenche la régénération
  des pages statiques (~ 2-3 minutes).

Pour modifier plus tard : **Biens** → **Éditer** → on retombe dans le même
formulaire en mode édition.

Pour forcer une régénération sans modification (ex. après une correction
sur un bien déjà publié) : sur la liste **Biens**, bouton **Regénérer le
site** en haut à droite.

---

## 2. Comment sont calculées les métriques

### Sur la page d'accueil

**Biens disponibles** : nombre de biens actuellement publiés.

**Rendement brut moyen** : moyenne des rendements bruts de tous les biens
publiés. Trois biens à 6 % / 7 % / 8 % → on affiche **7 %**.

**Occupation moyenne du marché** : moyenne des taux d'occupation du quartier
saisis. Un bien sans cette donnée n'est pas comptabilisé.

**7 ans d'historique de gestion** : valeur fixe (à modifier dans le code si
ça change).

### Sur la page d'un bien

**Prix au m²** : prix de vente divisé par la surface totale.

**Total projet** : prix de vente + frais de notaire.

**Rendement brut** : ce que rapporte le bien à l'année rapporté au prix
d'achat. Un bien à 300 000 € qui génère 21 000 € de loyers par an (5 chambres
à 350 € + charges) → rendement brut **7 %**.

**Occupation zone** : exactement le pourcentage saisi en admin, sans
transformation. Si on a tapé 94, on affiche **94 %**.

**Loyer / mois** : somme des loyers (HC + charges) de tous les lots saisis,
indépendamment de leur statut. Cinq chambres à 350 € + 25 € = **1 875 €**.

### Le bloc « Calcul de rentabilité »

Le tableau suit cette logique :

1. **Loyer plein** — ce que rapportent les lots quand tout est loué.
2. **Vacance locative** — la part qu'on déduit parce que le marché n'est
   jamais occupé à 100 % du temps. Calculée depuis le taux d'occupation du
   quartier : occupation 95 % → on déduit 5 % du loyer.
3. **Charges, taxe foncière, gestion** — valeurs admin si renseignées,
   sinon estimations (environ 8 % du loyer chacune).
4. **Cashflow net** — ce qui reste pour le propriétaire après tout ça.

**Exemple concret** :

| Poste | Mensuel |
| --- | ---: |
| Loyer plein (5 chambres × 315 €) | 1 576 € |
| Vacance locative (occupation zone 95 %) | – 79 € |
| Charges de copropriété | – 100 € |
| Taxe foncière | – 113 € |
| Gestion OQORO + assurance | – 126 € |
| **Cashflow net** | **1 158 €** |

Soit environ 13 900 € / an dans la poche du propriétaire.

---

## 3. Que se passe-t-il si je laisse un champ vide ?

| Champ vide | Conséquence |
| --- | --- |
| Une photo | Place réservée grise |
| Description, DPE, transports, historique locatif | Section masquée sur la fiche |
| Taux d'occupation du quartier | Pas de ligne vacance, pas d'affichage « Occupation zone », pas de prise en compte dans la moyenne home |
| Charges / taxe foncière / gestion | Estimations automatiques (≈ 8,8 % / 7,2 % / 8 % du loyer) |
| URL Matterport | Bouton « Visite 3D » masqué |
| Conseiller | Camille Loubet par défaut |

---

## 4. FAQ

**Faut-il saisir les charges réelles si on ne les a pas ?**
Non, laisser vide. On affiche une estimation conservatrice. Mais si on a
les valeurs réelles fournies par le propriétaire, c'est mieux : le tableau
le dit explicitement à l'investisseur.

**Pourquoi mon bien n'apparaît pas sur la home après publication ?**
La page du bien (`/biens/xxx`) est dynamique : visible immédiatement après
sauvegarde. La home et la liste sont régénérées par **Publier & rebuild**
(~ 2-3 min). Si le bouton n'a pas été cliqué, la home n'est pas à jour.

**À quelle fréquence mettre à jour le taux d'occupation du quartier ?**
Une fois à la création, puis une fois par trimestre / semestre selon les
évolutions de marché. Ce n'est pas une donnée par bien mais par zone.

**J'ai un message d'erreur rouge au moment de sauvegarder.**
Le message affiche le détail technique. Si ça mentionne « column X does
not exist » ou un truc de base de données → migration SQL pas encore
appliquée, contacter la tech.

**Comment supprimer un bien ?**
Pas de bouton « supprimer » côté admin : passer le statut en brouillon
(décocher « Publié ») suffit à le retirer du site. Suppression définitive
= demande à la tech.
