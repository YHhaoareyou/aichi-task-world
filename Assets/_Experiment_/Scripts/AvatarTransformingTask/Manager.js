// ===== Manager Item - Scriptable Item =====
// Handles player entry/exit detection, gender selector creation, and clone management

const TEMPLATE_SELECTOR = new WorldItemTemplateId("genderSelector");
const TEMPLATE_MALE     = new WorldItemTemplateId("cloneMale");
const TEMPLATE_FEMALE   = new WorldItemTemplateId("cloneFemale");
const SCAN_INTERVAL     = 0.5; // seconds

$.onStart(() => {
  $.state.knownPlayers = {};
  $.state.scanTimer    = 0;
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

  // --- New player -> Create Selectors ---
  for (let i = 0; i < currentPlayers.length; i++) {
    const player = currentPlayers[i];
    if (known[player.id]) continue;

    const malePos = player.getPosition().clone().add(new Vector3(-0.5, 1, 1));
    const femalePos = player.getPosition().clone().add(new Vector3(0.5, 1, 1));
    const rot = player.getRotation();
    if (!malePos || !femalePos || !rot) continue;

    // Create 2 selectors in front of player
    const selMale = $.createItem(TEMPLATE_SELECTOR, malePos, rot);
    const selFemale = $.createItem(TEMPLATE_SELECTOR, femalePos, rot);

    // Send player and gender info to each selector
    selMale.send("init", {
      player: player,
      gender: "male",
      label:  "Male"
    });
    selFemale.send("init", {
      player: player,
      gender: "female",
      label:  "Female"
    });

    known[player.id] = {
      selMale:   selMale,
      selFemale: selFemale,
      clone:     null,
      playerId:  player.id
    };

    $.log("selectors created for: " + player.userDisplayName);
  }

  // --- Player left -> Destroy related items ---
  const knownIds = Object.keys(known);
  for (let i = 0; i < knownIds.length; i++) {
    const pid = knownIds[i];
    if (currentIds[pid]) continue;

    const entry = known[pid];
    if (entry.selMale && entry.selMale.exists())
      entry.selMale.send("selfDestruct", null);
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

    // Clone was created but no longer exists -> re-create
    if (entry.clone && !entry.clone.exists()) {
      $.log("clone lost for " + pid + ", will be re-created on next gender select or rejoin");
      entry.clone = null;

      if (entry.gender) {
        // Re-get PlayerHandle
        let ph = null;
        for (let j = 0; j < currentPlayers.length; j++) {
          if (currentPlayers[j].id === pid) { ph = currentPlayers[j]; break; }
        }
        if (ph) {
          const p = ph.getPosition();
          const r = ph.getRotation();
          if (p && r) {
            const tid = (entry.gender === "male") ? TEMPLATE_MALE : TEMPLATE_FEMALE;
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
  const gender   = arg.gender; // "male" or "female"
  const known    = $.state.knownPlayers ?? {};
  const entry    = known[playerId];
  if (!entry) return;

  // Destroy both selectors
  if (entry.selMale && entry.selMale.exists())
    entry.selMale.send("selfDestruct", null);
  if (entry.selFemale && entry.selFemale.exists())
    entry.selFemale.send("selfDestruct", null);
  entry.selMale   = null;
  entry.selFemale = null;
  entry.gender    = gender; // Remember for re-creation

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

  // Create Clone
  const pos = playerHandle.getPosition();
  const rot = playerHandle.getRotation();
  if (!pos || !rot) {
    $.state.knownPlayers = known;
    return;
  }

  const templateId = (gender === "male") ? TEMPLATE_MALE : TEMPLATE_FEMALE;
  const clone = $.createItem(templateId, pos, rot);
  clone.send("assignPlayer", playerHandle);

  entry.clone = clone;
  $.state.knownPlayers = known;
  $.log("clone (" + gender + ") created for: " + playerHandle.userDisplayName);
});
