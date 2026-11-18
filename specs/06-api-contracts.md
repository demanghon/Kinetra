# 06 — Contrats d'API, Bus d'Événements Temps Réel & Intégration Client 3D (`schemas/` & `client-app`)

- **Statut :** Normatif (Phase 1 — SDD)
- **Version :** 1.0.0
- **Modules cibles :** Tous les modules (`imu-engine`, `ballistic-core`, `video-sync`, `bag-scanner`, `sim-harness`, `client-app`)
- **Répertoire des schémas :** `schemas/*.schema.json` (JSON Schema Draft 2020-12)

---

## 1. Inventaire Normatif des Schémas de Données (`schemas/`)

Tous les échanges inter-modules sont gouvernés par **7 schémas JSON Draft 2020-12** situés dans `schemas/` avec `$id` canonique et interdiction des propriétés non déclarées (`"additionalProperties": false`) :

| Fichier de Schéma | `$id` Canonique | Producteur | Consommateur(s) | Rôle du Contrat |
| :--- | :--- | :--- | :--- | :--- |
| [club-profile.schema.json](../schemas/club-profile.schema.json) | `https://kinetra.golf/schemas/club-profile.schema.json` | `bag-scanner` / UI | `imu-engine`, `ballistic-core`, `client-app` | Définit un club du sac : matériau du shaft (`steel` \| `graphite`), flex (`L/A/R/S/X`), constantes mécaniques `ClubPhysicsCatalog` ($EI, GJ, \kappa_{\text{aniso}}$) et calibration `Keyed Butt-Cap Mount`. |
| [ball-profile.schema.json](../schemas/ball-profile.schema.json) | `https://kinetra.golf/schemas/ball-profile.schema.json` | `client-app` / `sim-harness` | `ballistic-core` | Définit les propriétés physiques et aérodynamiques de la balle (`tour_ball` vs `range_ball`). |
| [imu-telemetry.schema.json](../schemas/imu-telemetry.schema.json) | `https://kinetra.golf/schemas/imu-telemetry.schema.json` | `GeoTrick IMU` $\rightarrow$ `imu-engine` | `video-sync`, `ballistic-core`, `client-app` | Contient le burst $1000\text{ Hz}$ ($\pm 16\,g$), la signature d'écrêtage (`Impact Clipping Signature`), la localisation d'impact (`heel`/`center`/`toe`) et la `Compensated Clubface Orientation`. |
| [video-sync-session.schema.json](../schemas/video-sync-session.schema.json) | `https://kinetra.golf/schemas/video-sync-session.schema.json` | `video-sync` | `ballistic-core`, `client-app` | Session vidéo v1 mono-smartphone (`dtl` ou `face_on`) ou v2 `dual_camera`, `Spatial Calibration Frame`, `Impact Sync Anchor` ($t=0$), fenêtre de départ DTL et squelette 3D. |
| [bag-scanner.schema.json](../schemas/bag-scanner.schema.json) | `https://kinetra.golf/schemas/bag-scanner.schema.json` | `bag-scanner` | `client-app` | Événements de la machine à états d'onboarding interactif (consignes vocales TTS, résultat OCR/Vision, scores de confiance). |
| [ballistic-trajectory.schema.json](../schemas/ballistic-trajectory.schema.json) | `https://kinetra.golf/schemas/ballistic-trajectory.schema.json` | `ballistic-core` | `client-app`, `sim-harness` | Vecteur de lancement fusionné, indicateurs `is_dry_swing` / `is_virtual_ball`, points 3D du vol, *carry*, roule, dispersion et équivalent `tour_ball`. |
| [simulation-fixture.schema.json](../schemas/simulation-fixture.schema.json) | `https://kinetra.golf/schemas/simulation-fixture.schema.json` | `sim-harness` | `sim-harness` (CI/CD) | Contrat maître validant les manifests et les assertions `expected_outcomes.json` de `fixtures/simulation/`. |

---

## 2. Protocole d'Événements Temps Réel & Appels WASM/FFI

### 2.1 Interface WebAssembly (`imu-engine` & `ballistic-core` $\leftrightarrow$ `client-app` / `sim-harness`)
Les moteurs Rust exposent trois fonctions pures déterministes sérialisant/désérialisant des structures validées par les schémas JSON :
1. `analyze_imu_swing(burst_json: &str, club_profile_json: &str) -> Result<String, KinetraError>`
   - Entrées : flux brut $1000\text{ Hz}$ + `Club Profile`.
   - Sortie : objet `ImuSwingAnalysis` conforme à `imu-telemetry.schema.json` (incluant `Impact Clipping Signature` et `Compensated Clubface Orientation`).
2. `compute_ballistic_flight(imu_analysis_json: &str, video_sync_json: &str, ball_profile_json: &str) -> Result<String, KinetraError>`
   - Entrées : sortie `imu-engine` + sortie `video-sync` + `Ball Profile`.
   - Sortie : objet `BallisticFlightResult` conforme à `ballistic-trajectory.schema.json`.
3. `verify_address_tare(stream_100hz_window_json: &str, spatial_calibration_json: &str) -> Result<String, KinetraError>`
   - Vérifie l'immobilité de $0.8\text{ s}$ à l'adresse et retourne le quaternion de tare $\mathbf{q}_{\text{tare}}$.

### 2.2 Bus WebSocket (`client-app` $\leftrightarrow$ `video-sync` & `bag-scanner`)
Les messages échangés sur le bus WebSocket suivent une enveloppe JSON typée :
- `session.calibration.updated` : statut temps réel du niveau à bulle virtuel et de l'alignement au sol.
- `imu.address.locked` : notification de verrouillage de la tare d'adresse (`Address Pose Tare` validée, bip sonore "Prêt à swinguer").
- `swing.captured.raw` : réception du burst IMU $1000\text{ Hz}$ et du segment audio/vidéo.
- `swing.analysis.completed` : diffusion simultanée vers Highcharts (courbes de vitesse, déflexion shaft, saturation $16\,g$, torsion $\omega_z$) et Three.js (ruban 3D du plan de swing, animation de la déflexion du shaft et trajectoire balistique 3D).
- `bag_scanner.step.prompt` : émission de la consigne vocale TTS (`tts_utterance_fr`) et de l'état courant du scan de club.

---

## 3. Spécification de Restitution Client Mobile (`src/client-app` : React Native JSI + Skia 120Hz + VisionCamera v4 + Three.js + On-Device Voice/Vision AI)

1. **Vue Télémétrie $120\text{ Hz}$ (React Native Skia & Victory Native XL Synchronisés sur $t = 0$)** :
   - Curseur temporel vertical partagé à $120\text{ Hz}$ avec le lecteur vidéo image par image ($t \in [-1200\text{ ms}, +300\text{ ms}]$).
   - Courbe 1 : Vitesse tête de club compensée vs vitesse des mains (mise en évidence du *release* et du *kick* du shaft).
   - Courbe 2 : Déflexion du shaft en mm (*Lead/Lag* et *Toe-Down Droop*) + angle de torsion (*Twist* en degrés).
   - Courbe 3 : Signature d'impact à $1000\text{ Hz}$ (zoom sur $[-5\text{ ms}, +25\text{ ms}]$ montrant le plateau d'écrêtage à $16\,g$, le saut de torsion gyroscopique $\Delta \omega_z$ et le *ring-down* avec affichage graphique de la face de club et du point d'impact `Toe / Center / Heel`).
2. **Scène 3D Interactive (`@react-three/fiber` + `expo-gl` OpenGL ES / Metal) & Overlay Caméra Live (`VisionCamera v4` + `MediaPipe LiteRT`)** :
   - En direct pendant la session : superposition GPU zéro-copie à $60\text{ FPS}$ du niveau à bulle virtuel, des repères au sol et du squelette 3D MediaPipe exécuté localement sur le NPU/GPU du smartphone.
   - Interaction vocale locale en direct (`Sherpa-ONNX` / `Whisper.rn` STT + `Piper Neural TTS` embarqué) pour dialoguer hors-ligne avec le joueur ($< 150\text{ ms}$ de latence).
   - Rendu 3D post-swing du squelette, du ruban du plan de swing (*Backswing* en bleu, *Downswing* en orange) et de la trajectoire de balle avec cône de dispersion, sommet (*apex*), point de chute (*carry*), roule (*roll*), et superposition en pointillés de la courbe comparative `tour_ball` lorsque l'utilisateur tape des balles de practice (`range_ball`).
3. **Jauge de Batterie & Suivi d'Avancement de Charge du Capteur GeoTrick (`Battery & Charge Status Widget`)** :
   - **En session de jeu (`DISCHARGING`)** : affichage permanent dans l'en-tête de `client-app` du pourcentage de batterie (`battery_percent`), de la tension (`battery_mv`), du club actuellement détecté (`mount_slot_id`), de l'autonomie restante estimée en heures de jeu (`estimated_remaining_play_hours`) et d'une alerte visuelle/vocale dès que `battery_percent <= 15%`.
   - **En cours de recharge USB-C (`CHARGING_CC` / `CHARGING_CV` / `CHARGE_COMPLETE`)** : affichage d'une jauge animée d'avancement de la charge en temps réel ($0\% \rightarrow 100\%$), de la phase de charge (`Courant Constant 50 mA` puis `Finition Tension Constante 4.2 V`), du temps restant estimé en minutes (`estimated_minutes_to_full`), d'une notification lorsque la charge atteint $100\%$ (`CHARGE_COMPLETE`), et d'une alerte spécifique si le câble USB-C est branché alors que l'interrupteur physique `ESP101` est resté sur `OFF` (`SWITCH_OFF_DURING_CHARGE_WARNING`).

---

## 4. Codes d'Erreur Normalisés

| Code d'Erreur | Module Émetteur | Signification & Action Système |
| :--- | :--- | :--- |
| `ERR_SCHEMA_VALIDATION_FAILED` | Tous | Le payload JSON viole le schéma Draft 2020-12 correspondant. |
| `ERR_MOUNT_NOT_LOCKED` | `imu-engine` | Le capteur GeoTrick n'est pas enclenché à fond dans la `Keyed Butt-Cap Mount` (`KEYED_MOUNT_LOCKED == 0`). |
| `ERR_ADDRESS_TARE_UNSTABLE` | `imu-engine` | Le joueur a démarré son backswing sans marquer la pause de $0.8\text{ s}$ à l'adresse. |
| `ERR_BLE_BURST_CRC_MISMATCH` | `imu-engine` | Trame corrompue dans le burst $1000\text{ Hz}$ $\implies$ demande de retransmission BLE automatique du bloc. |
| `ERR_CAMERA_TILT_OUT_OF_BOUNDS` | `video-sync` | Le smartphone a bougé hors des tolérances du niveau à bulle ($|\text{roll}| > 1^\circ$ ou $|\text{pitch}| > 3^\circ$). |

---

## 5. Exigences Normatives (`REQ-API-*`)

### `REQ-API-001` — Validation Systématique JSON Schema Draft 2020-12
> **When** un événement ou un résultat d'analyse est émis sur le bus WebSocket ou retourné par le module WebAssembly, **the system shall** garantir qu'il passe sans erreur la validation contre son schéma dans `schemas/*.schema.json`.

### `REQ-API-002` — Synchronisation Curseur Vidéo ↔ Highcharts ↔ Scène 3D
> **While** l'utilisateur déplace le curseur temporel de lecture d'un swing dans `client-app`, **the system shall** synchroniser à $\le 1\text{ frame}$ près l'image vidéo affichée, le marqueur vertical sur les courbes Highcharts et la pose 3D du club dans Three.js en utilisant `Impact Sync Anchor` ($t = 0$) comme origine commune.

### `REQ-API-003` — Affichage Temps Réel de l'État Batterie & de l'Avancement de la Charge
> **While** le capteur GeoTrick IMU est connecté en BLE (en session de swing ou branché sur son chargeur USB-C), **the system shall** afficher dans `client-app` le niveau de batterie (`battery_percent`, `battery_mv`), l'état du chargeur (`charging_state`), la barre de progression de la charge avec le décompte en minutes (`estimated_minutes_to_full`) jusqu'à $100\%$, ainsi qu'une alerte immédiate si `charging_state == "SWITCH_OFF_DURING_CHARGE_WARNING"` ou si `battery_percent <= 15.0`.
