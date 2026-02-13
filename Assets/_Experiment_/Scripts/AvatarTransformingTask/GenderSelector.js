// ===== Gender Selector - Scriptable Item =====
// Shared prefab for both male/female. Receives gender/label via "init" message.

const label = $.subNode("Label");
const textView = $.subNode("TextView");

$.onStart(() => {
  $.state.player  = null;  // PlayerHandle
  $.state.gender  = null;  // "male" or "female"
  $.state.manager = null;  // Manager ItemHandle
  $.state.initTimer = 0;   // Init timeout timer
  $.state.initialized = false;
});

$.onReceive((messageType, arg, sender) => {
  if (messageType === "init") {
    $.state.player  = arg.player;  // PlayerHandle (Sendable)
    $.state.gender  = arg.gender;
    $.state.manager = sender;      // Manager ItemHandle
    $.state.initialized = true;

    // Set label text
    textView.setText(arg.label);

    // Make this item visible only to the target player
    $.setVisiblePlayers([arg.player]);

    $.log("selector init: " + arg.gender + " for " + arg.player.userDisplayName);
  }

  if (messageType === "selfDestruct") {
    $.destroy();
  }
});

$.onInteract((interactPlayer) => {
  const assignedPlayer = $.state.player;
  if (!assignedPlayer) return;

  // Check if the interacting player is the assigned player
  if (interactPlayer.id !== assignedPlayer.id) return;

  // Notify Manager of gender selection
  const manager = $.state.manager;
  if (manager && manager.exists()) {
    manager.send("genderSelected", {
      playerId: assignedPlayer.id,
      gender:   $.state.gender
    });
  }

  // Destroy self (the other selector will be destroyed by Manager)
  $.destroy();
});

// --- Timeout: self-destruct if init is not received ---
$.onUpdate((deltaTime) => {
  if ($.state.initialized) return;

  let timer = ($.state.initTimer ?? 0) + deltaTime;
  if (timer > 5.0) {
    $.log("selector init timeout, self-destructing");
    $.destroy();
    return;
  }
  $.state.initTimer = timer;
});
