// ===== Manager Item - Scriptable Item =====
// Handles player entry/exit detection, gender selector creation, and clone management

const TEMPLATE_SELECTOR = new WorldItemTemplateId("genderSelector");
const TEMPLATE_MALE     = new WorldItemTemplateId("cloneMale");
const TEMPLATE_FEMALE   = new WorldItemTemplateId("cloneFemale");
const SCAN_INTERVAL     = 0.5; // seconds

// Avatar assignment mode: "male", "female", or "choice"
// - "male": Auto-assign male model to all players
// - "female": Auto-assign female model to all players
// - "choice": Allow each player to choose (shows selector buttons)
const AVATAR_ASSIGNMENT_MODE = "choice";

// Initial placement: spread new players around a circle far from center
const INITIAL_RADIUS = 40;
const GOLDEN_ANGLE   = 2.399; // radians (~137.5°), ensures maximum angular spread

// Teleport destination after gender selection (near mirror)
const MIRROR_POS_X = 0;
const MIRROR_POS_Z = -3;
const MIRROR_RANDOM_RANGE = 0.5; // ± offset

$.onStart(() => {
  $.state.knownPlayers    = {};
  $.state.scanTimer       = 0;
  $.state.nextPlayerIndex = 0;
});

$.onUpdate((deltaTime) => {
  let timer = ($.state.scanTimer ?? 0) + deltaTime;
  if (timer < SCAN_INTERVAL) {
    $.state.scanTimer = timer;
    return;
  }
  $.state.scanTimer = 0;

  // --- Get current players list ---
  const currentPlayers = $.getPlayersNear($.getPosition(), Infinity);
  const currentIds = {};
  for (let i = 0; i < currentPlayers.length; i++) {
    currentIds[currentPlayers[i].id] = true;
  }

  const known = $.state.knownPlayers ?? {};

  // --- New player -> Create Clone or Selectors based on mode ---
  for (let i = 0; i < currentPlayers.length; i++) {
    const player = currentPlayers[i];
    if (known[player.id]) continue;

    const pos = player.getPosition();
    const rot = player.getRotation();
    if (!pos || !rot) continue;

    if (
      AVATAR_ASSIGNMENT_MODE === "male" ||
      AVATAR_ASSIGNMENT_MODE === "female"
    ) {
      // Direct assignment mode: create clone immediately
      const templateId =
        AVATAR_ASSIGNMENT_MODE === "male" ? TEMPLATE_MALE : TEMPLATE_FEMALE;
      const clone = $.createItem(templateId, pos, rot);
      clone.send("assignPlayer", player);

      known[player.id] = {
        selMale: null,
        selFemale: null,
        selObserver: null,
        clone: clone,
        playerId: player.id,
        gender: AVATAR_ASSIGNMENT_MODE,
      };

      $.log(
        "clone (" +
          AVATAR_ASSIGNMENT_MODE +
          ") auto-assigned to: " +
          player.userDisplayName,
      );
    } else {
      // Choice mode: teleport player to unique initial location, show selectors there
      const idx = $.state.nextPlayerIndex ?? 0;
      $.state.nextPlayerIndex = idx + 1;

      const angle = idx * GOLDEN_ANGLE;
      const initX = INITIAL_RADIUS * Math.cos(angle);
      const initZ = INITIAL_RADIUS * Math.sin(angle);
      const initPos = new Vector3(initX, 0, initZ);

      // Face toward center (0,0,0)
      const facingAngle = Math.atan2(-initX, -initZ); // angle from +Z toward center
      const halfA = facingAngle / 2;
      const facingRot = new Quaternion(0, Math.sin(halfA), 0, Math.cos(halfA));

      // Teleport player to initial location
      player.setPosition(initPos);
      player.setRotation(facingRot);

      // Place selectors in front of the player (in their facing direction)
      const fwdX = Math.sin(facingAngle); // forward vector from facing rotation
      const fwdZ = Math.cos(facingAngle);
      // Right vector (perpendicular to forward, Y-up)
      const rightX = fwdZ;
      const rightZ = -fwdX;

      // Title label: 1m forward, 1.5m up, centered
      const titlePos = new Vector3(initX + fwdX * 1, 1.5, initZ + fwdZ * 1);
      // Male/Female buttons: 1m forward, 1m up, ±0.5m left/right
      const malePos = new Vector3(
        initX + fwdX * 1 - rightX * 0.5,
        1,
        initZ + fwdZ * 1 - rightZ * 0.5,
      );
      const femalePos = new Vector3(
        initX + fwdX * 1 + rightX * 0.5,
        1,
        initZ + fwdZ * 1 + rightZ * 0.5,
      );
      // Observer button: 1m forward, 0.5m up, centered below
      const observerPos = new Vector3(initX + fwdX * 1, 0.5, initZ + fwdZ * 1);

      const standReminder = $.createItem(
        TEMPLATE_SELECTOR,
        titlePos,
        facingRot,
      );
      const selMale = $.createItem(TEMPLATE_SELECTOR, malePos, facingRot);
      const selFemale = $.createItem(TEMPLATE_SELECTOR, femalePos, facingRot);
      const selObserver = $.createItem(
        TEMPLATE_SELECTOR,
        observerPos,
        facingRot,
      );

      standReminder.send("init", {
        player: player,
        gender: null,
        label: "立ち上がってから\n選んでください",
      });
      selMale.send("init", {
        player: player,
        gender: "male",
        label: "男性",
      });
      selFemale.send("init", {
        player: player,
        gender: "female",
        label: "女性",
      });
      selObserver.send("init", {
        player: player,
        gender: "observer",
        label: "観察モード",
      });

      known[player.id] = {
        standReminder: standReminder,
        selMale: selMale,
        selObserver: selObserver,
        selFemale: selFemale,
        clone: null,
        playerId: player.id,
      };

      $.log(
        "selectors created for: " +
          player.userDisplayName +
          " at (" +
          initX.toFixed(1) +
          ", 0, " +
          initZ.toFixed(1) +
          ")",
      );
    }
  }

  // --- Player left -> Destroy related items ---
  const knownIds = Object.keys(known);
  for (let i = 0; i < knownIds.length; i++) {
    const pid = knownIds[i];
    if (currentIds[pid]) continue;

    const entry = known[pid];
    if (entry.standReminder && entry.standReminder.exists())
      entry.standReminder.send("selfDestruct", null);
    if (entry.selMale && entry.selMale.exists())
      entry.selMale.send("selfDestruct", null);
    if (entry.selObserver && entry.selObserver.exists())
      entry.selObserver.send("selfDestruct", null);
    if (entry.selFemale && entry.selFemale.exists())
      entry.selFemale.send("selfDestruct", null);
    if (entry.clone && entry.clone.exists())
      entry.clone.send("selfDestruct", null);
    delete known[pid];
    $.log("cleaned up for: " + pid);
  }

  // --- Clone existence check (fallback for re-creation) ---
  for (let i = 0; i < knownIds.length; i++) {
    const pid = knownIds[i];
    if (!currentIds[pid]) continue;
    const entry = known[pid];
    if (!entry) continue;

    // Clone was created but no longer exists -> re-create (skip observers)
    if (entry.clone && !entry.clone.exists()) {
      $.log(
        "clone lost for " +
          pid +
          ", will be re-created on next gender select or rejoin",
      );
      entry.clone = null;

      if (entry.gender && entry.gender !== "observer") {
        let ph = null;
        for (let j = 0; j < currentPlayers.length; j++) {
          if (currentPlayers[j].id === pid) {
            ph = currentPlayers[j];
            break;
          }
        }
        if (ph) {
          const p = ph.getPosition();
          const r = ph.getRotation();
          if (p && r) {
            const tid =
              entry.gender === "male" ? TEMPLATE_MALE : TEMPLATE_FEMALE;
            const newClone = $.createItem(tid, p, r);
            newClone.send("assignPlayer", ph);
            entry.clone = newClone;
            $.log("clone re-created for: " + pid);
          }
        }
      }
    }
  }

  $.state.knownPlayers = known;
});

// --- Receive gender selection notification from Selector ---
$.onReceive((messageType, arg, sender) => {
  if (messageType !== "genderSelected") return;

  const playerId = arg.playerId;
  const gender = arg.gender;
  if (!gender) return; // Ignore clicks on title label
  const known = $.state.knownPlayers ?? {};
  const entry = known[playerId];
  if (!entry) return;

  // Destroy all selectors
  if (entry.standReminder && entry.standReminder.exists())
    entry.standReminder.send("selfDestruct", null);
  if (entry.selMale && entry.selMale.exists())
    entry.selMale.send("selfDestruct", null);
  if (entry.selObserver && entry.selObserver.exists())
    entry.selObserver.send("selfDestruct", null);
  if (entry.selFemale && entry.selFemale.exists())
    entry.selFemale.send("selfDestruct", null);
  entry.standReminder = null;
  entry.selMale = null;
  entry.selObserver = null;
  entry.selFemale = null;
  entry.gender = gender;

  // Re-get PlayerHandle
  const players = $.getPlayersNear($.getPosition(), Infinity);
  let playerHandle = null;
  for (let i = 0; i < players.length; i++) {
    if (players[i].id === playerId) {
      playerHandle = players[i];
      break;
    }
  }
  if (!playerHandle) {
    $.state.knownPlayers = known;
    return;
  }

  // Teleport player to mirror area
  const rx = (Math.random() - 0.5) * MIRROR_RANDOM_RANGE * 2;
  const rz = (Math.random() - 0.5) * MIRROR_RANDOM_RANGE * 2;
  const mirrorTarget = new Vector3(MIRROR_POS_X + rx, 0, MIRROR_POS_Z + rz);
  const mirrorRot = new Quaternion(0, 0, 0, 1);
  playerHandle.setPosition(mirrorTarget);
  playerHandle.setRotation(mirrorRot);

  if (gender === "observer") {
    // Observer mode: no clone created
    entry.clone = null;
    $.state.knownPlayers = known;
    $.log("observer mode for: " + playerHandle.userDisplayName);
    return;
  }

  // Create Clone at mirror position
  const templateId = gender === "male" ? TEMPLATE_MALE : TEMPLATE_FEMALE;
  const clone = $.createItem(templateId, mirrorTarget, mirrorRot);
  clone.send("assignPlayer", playerHandle);

  entry.clone = clone;
  $.state.knownPlayers = known;
  $.log("clone (" + gender + ") created for: " + playerHandle.userDisplayName);
});
