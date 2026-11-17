# 04 — Moteur Balistique, Fusion Hybride, Profils de Balles & Mode Swing à Vide (`ballistic-core`)

- **Statut :** Normatif (Phase 1 — SDD)
- **Version :** 1.0.0
- **Module cible :** `src/ballistic-core` (Rust natif & WebAssembly)
- **Schémas associés :** [ballistic-trajectory.schema.json](../schemas/ballistic-trajectory.schema.json), [ball-profile.schema.json](../schemas/ball-profile.schema.json)
- **ADRs liés :** [ADR-0002](../docs/adr/0002-rust-wasm-deterministic-physics-core.md), [ADR-0003](../docs/adr/0003-single-smartphone-v1-and-16g-impact-signature.md)

---

## 1. Modèle de Collision Balle-Club & Fusion Hybride (IMU + Vidéo DTL)

### 1.1 Calcul du Vecteur d'Impact depuis l'IMU Compensée
À l'instant $t = 0$ (`Impact Sync Anchor`), le module `imu-engine` fournit :
- La vitesse linéaire du centre de la tête de club $V_{\text{head}}$ (en $\text{m/s}$).
- Le chemin de club (*Club Path* $\gamma_{\text{path}}$, en degrés dans le plan horizontal : $>0$ *in-to-out*, $<0$ *out-to-in* pour un droitier) et l'angle d'attaque ($\alpha_{\text{aoa}}$, en degrés : $<0$ descendant, $>0$ remontant).
- L'orientation compensée de la face (**`Compensated Clubface Orientation`**) : angle de face $\theta_{\text{face,comp}}$ et loft dynamique $\theta_{\text{loft,comp}}$.
- L'excentricité horizontale de frappe $y_{\text{impact}} \in [-30, +30]\text{ mm}$ (`heel` | `center` | `toe`) issue de l'**`Impact Clipping Signature`** ($\pm 16\,g$ + $\Delta \omega_z$ + *ring-down*).

Le **Spin Loft** tridimensionnel $\Lambda_{\text{spin}}$ est défini par :
$$\Lambda_{\text{spin}} = \theta_{\text{loft,comp}} - \alpha_{\text{aoa}}$$

### 1.2 Effet de Décentrage (*Smash Factor Penalty* & *Gear Effect*)
L'excentricité d'impact $y_{\text{impact}}$ modifie la restitution énergétique et le spin latéral (*Gear Effect* sur les têtes à volume profond comme les bois/drivers) :
1. **Rendement de collision (*Smash Factor* / Vitesse initiale de balle $V_{\text{ball,imu}}$)** :
   $$V_{\text{ball,imu}} = V_{\text{head}} \cdot \frac{1 + e_{\text{COR}} \cdot \eta_{\text{offcenter}}(y_{\text{impact}})}{1 + \frac{m_{\text{ball}}}{m_{\text{head}}}} \cdot \cos(\Lambda_{\text{spin}} \cdot k_{\text{oblique}})$$
   avec l'atténuation de décentrage $\eta_{\text{offcenter}}(y_{\text{impact}}) = \max\left(0.82,\; 1 - k_y \cdot y_{\text{impact}}^2\right)$ où $e_{\text{COR}}$ provient du **`Ball Profile`** (`tour_ball` vs `range_ball`).
2. **Correction de *Gear Effect* sur l'axe de spin ($\Delta \omega_{\text{gear}}$)** :
   Un impact en pointe ($y_{\text{impact}} < 0$) sur un bois/driver induit un spin de *draw/hook* ($\Delta \omega_{\text{side}} < 0$), et inversement au talon.

### 1.3 Loi de Fusion Hybride Bayésienne (Mode `dtl` vs Mode `face_on`)
- **En mode `dtl` (avec visibilité de départ de balle `launch_visibility_confidence >= 0.50`)** :
  Les angles initiaux de départ $(\theta_{\text{launch}}, \phi_{\text{launch}})$ et la vitesse initiale $V_{\text{ball},0}$ sont calculés par fusion pondérée par l'inverse des variances entre la prédiction mécanique IMU et la mesure optique issue du `DTL Launch Window` :
  $$\theta_{\text{launch}} = w_{\text{vid}} \cdot \theta_{\text{launch,video}} + (1 - w_{\text{vid}}) \cdot \theta_{\text{launch,imu}} \quad \text{avec} \quad w_{\text{vid}} = 0.70 \cdot \text{confidence}_{\text{video}}$$
- **En mode `face_on` (ou si la balle sort du champ / occlusion vidéo)** :
  $w_{\text{vid}} = 0$ : le vecteur de départ initial repose à $100\%$ sur le modèle d'impact compensé IMU + `Impact Clipping Signature`.

---

## 2. Profils Normatifs de Balles (`Ball Profile` : `tour_ball` vs `range_ball`)

Les balles de practice (*range balls* 2 pièces à noyau dur et coque Surlyn épaisse, souvent usées ou bridées) présentent des caractéristiques physiques nettement différentes des balles de parcours multi-couches uréthane (type Titleist Pro V1). `ballistic-core` intègre ces différences nativement via `ball-profile.schema.json` :

| Paramètre Physique | **`tour_ball` (Parcours — ex. Pro V1)** | **`range_ball` (Practice — 2 pièces Surlyn)** | Effet sur la trajectoire |
| :--- | :--- | :--- | :--- |
| **Masse $m_{\text{ball}}$** | $45.93\text{ g}$ | $45.60\text{ g}$ | — |
| **Diamètre $d_{\text{ball}}$** | $42.67\text{ mm}$ | $42.70\text{ mm}$ | — |
| **Coefficient de restitution nominal ($e_{\text{COR}}$)** | **$0.825$** | **$0.765$** | Perte de $\sim 4\text{ à }6\%$ sur la vitesse initiale de balle en practice. |
| **Facteur de génération de spin ($k_{\text{spin}}$)** | **$1.00$** (coque uréthane haute friction) | **$0.84$** aux fers / **$1.08$** au driver | Moins de *backspin* d'arrêt aux fers/wedges, mais plus de *spin* parasite au driver en practice. |
| **Multiplicateur de traînée ($m_{C_D}$)** | **$1.00$** | **$1.08$** ($+8\%$ de traînée) | Freinage aérodynamique accru sur les balles de practice. |
| **Multiplicateur de portance Magnus ($m_{C_L}$)** | **$1.00$** | **$0.94$** ($-6\%$ de portance) | Sommet de trajectoire (*apex*) et *carry* réduits de $8\text{ à }12\%$ en practice. |

> [!TIP]
> **Conversion Croisée ("Équivalent Parcours") :** Lorsqu'un joueur s'entraîne au practice avec `ball_profile: "range_ball"`, `ballistic-core` calcule d'abord la trajectoire réelle de sa balle de practice (pour qu'elle corresponde exactement à ce que le joueur voit tomber devant lui sur le practice), et peut fournir en parallèle la métrique `tour_ball_equivalent_carry_m` montrant ce que ce même swing aurait produit avec une balle Pro V1.

---

## 3. Intégrateur Aérodynamique 3D à 6 DDL (RK4, $\Delta t = 1\text{ ms}$)

### 3.1 Équations Différentielles du Vol
La position $\vec{r}(t) = (X(t), Y(t), Z(t))$ et la vitesse $\vec{v}(t) = \dot{\vec{r}}(t)$ du centre de la balle dans $\mathcal{R}_{\text{world}}$ obéissent à l'équation fondamentale de la dynamique intégrée par **Runge-Kutta d'ordre 4 (RK4)** avec un pas fixe déterministe $\Delta t = 0.001\text{ s}$ ($1\text{ ms}$) :
$$m_{\text{ball}} \frac{d\vec{v}}{dt} = m_{\text{ball}} \vec{g} + \vec{F}_{\text{drag}}(\vec{v}_{\text{rel}}, \vec{\omega}) + \vec{F}_{\text{magnus}}(\vec{v}_{\text{rel}}, \vec{\omega})$$
où $\vec{v}_{\text{rel}} = \vec{v} - \vec{v}_{\text{wind}}$ est la vitesse relative par rapport au vent, et :
- **Force de traînée ($\vec{F}_{\text{drag}}$)** :
  $$\vec{F}_{\text{drag}} = -\frac{1}{2} \rho_{\text{air}} A_{\text{ball}} \, m_{C_D} \, C_D(\text{Re}, S) \, \|\vec{v}_{\text{rel}}\| \, \vec{v}_{\text{rel}}$$
- **Force de portance Magnus ($\vec{F}_{\text{magnus}}$)** :
  $$\vec{F}_{\text{magnus}} = \frac{1}{2} \rho_{\text{air}} A_{\text{ball}} \, m_{C_L} \, C_L(\text{Re}, S) \, \|\vec{v}_{\text{rel}}\|^2 \, \frac{\vec{\omega} \times \vec{v}_{\text{rel}}}{\|\vec{\omega} \times \vec{v}_{\text{rel}}\|}$$
- **Nombre de Spin ($S$) et Décroissance Exponentielle du Spin** :
  $$S(t) = \frac{\|\vec{\omega}(t)\| \cdot R_{\text{ball}}}{\|\vec{v}_{\text{rel}}(t)\|}, \qquad \vec{\omega}(t) = \vec{\omega}_0 \, \exp\left(-\frac{t}{\tau_{\text{spin}}}\right) \quad (\tau_{\text{spin}} = 28.0\text{ s})$$

### 3.2 Impact au Sol (*Carry*) & Modèle de Rebond/Roule (*Roll*)
Lorsque $Z(t)$ franchit $Z_{\text{ground}} = 0$ en phase descendante ($\dot{Z} < 0$) :
1. L'instant $t_{\text{carry}}$ et les coordonnées $(X_{\text{carry}}, Y_{\text{carry}})$ sont interpolés linéairement entre $t_{k-1}$ et $t_k$.
2. Le rebond et la roule sur fairway standard (ou green) sont calculés en fonction de l'angle d'atterrissage $\theta_{\text{land}}$, de la vitesse verticale d'impact et du *backspin* résiduel $\omega_{\text{back}}(t_{\text{carry}})$ (incluant le *backspin check / spin-back* si $\theta_{\text{land}} > 48^\circ$ et $\omega_{\text{back}} > 6500\text{ rpm}$).

---

## 4. Mode "Swing à Vide" (`Dry Swing`)

Lorsqu'un joueur s'entraîne chez lui ou sur tapis sans balle (`swing_Event_type == "dry_swing"` détecté par `imu-engine`) :
1. **Zéro erreur d'impact manquant** : le pipeline s'exécute nominalement avec $t = 0$ fixé au *Low Point* cinématique.
2. **Restitution cinématique 3D complète** : vitesse tête de club au *Low Point*, tempo backswing/downswing, plan de swing 3D, chemin de club, angle d'attaque et orientation de face compensée (`Compensated Clubface Orientation`).
3. **Simulation balistique virtuelle optionnelle (`simulate_virtual_ball: true`)** : si l'utilisateur a activé l'aperçu de trajectoire virtuelle, `ballistic-core` simule le vol qu'aurait eu une balle frappée au centre de la face (*Sweet Spot*, $y_{\text{impact}} = 0\text{ mm}$) avec cette cinématique exacte, en taguant explicitement le résultat avec `"is_virtual_ball": true`.

---

## 5. Exigences Normatives (`REQ-BAL-*`)

### `REQ-BAL-001` — Fusion Hybride IMU + Fenêtre Vidéo DTL
> **Where** la session est en mode `dtl` et `launch_visibility_confidence >= 0.50`, **when** un swing `ball_strike` est traité, **the system shall** fusionner les angles de lancement vidéo DTL et le modèle d'impact compensé IMU pour produire le vecteur de lancement initial $(V_{\text{ball},0}, \theta_{\text{launch}}, \phi_{\text{launch}}, \omega_{\text{back}}, \omega_{\text{side}})$.

### `REQ-BAL-002` — Calcul Balistique Autonome en Mode `Face-On` ou Occlusion Vidéo
> **If** la session est en mode `face_on` ou si `launch_visibility_confidence < 0.50`, **then the system shall** calculer le vecteur de lancement initial exclusivement à partir de la `Compensated Clubface Orientation`, de la vitesse tête de club $V_{\text{head}}$ et de la localisation d'impact `Impact Clipping Signature` ($y_{\text{impact}}$).

### `REQ-BAL-003` — Différenciation Physique `tour_ball` vs `range_ball`
> **When** `ballistic-core` intègre une trajectoire, **the system shall** appliquer les constantes du `Ball Profile` actif (`tour_ball` ou `range_ball`) et, lorsque `range_ball` est sélectionné, calculer en sus la métrique comparative `tour_ball_equivalent_carry_m`.

### `REQ-BAL-004` — Intégration RK4 Déterministe & Décimation d'Affichage
> **When** un vol balistique est simulé, **the system shall** exécuter l'intégrateur RK4 à pas fixe $\Delta t = 1\text{ ms}$ jusqu'à l'arrêt complet de la balle et exporter la courbe 3D échantillonnée toutes les $20\text{ ms}$ ($50\text{ Hz}$) dans `ballistic-trajectory.schema.json`, accompagnée des métriques agrégées (`carry_distance_m`, `total_distance_m`, `roll_distance_m`, `apex_height_m`, `lateral_offline_m`, `flight_time_s`).

### `REQ-BAL-005` — Support Natif du Mode `Dry Swing` (Sans Balle)
> **When** l'entrée est qualifiée de `dry_swing`, **the system shall** retourner un rapport cinématique valide sans erreur d'impact manquant, avec `is_dry_swing: true` et, selon le paramètre de session `simulate_virtual_ball`, omettre la trajectoire de balle ou calculer une trajectoire théorique centrée marquée `is_virtual_ball: true`.
