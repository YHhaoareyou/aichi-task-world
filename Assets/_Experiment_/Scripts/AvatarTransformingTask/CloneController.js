// ===== Clone Item - Scriptable Item =====
// Shared script for both Male/Female Clone prefabs

const SQUAT_THRESHOLD = 0.35; // meters: head drops more than this = squatting
const COOLDOWN        = 1.0;  // seconds: cooldown after squat detection
const INIT_TIMEOUT    = 5.0;  // seconds: self-destruct if assignPlayer not received

let animator = null; // Retrieved in onStart

$.onStart(() => {
  $.state.player         = null;  // PlayerHandle
  $.state.muscleValue  = 0;     // 0.0 ~ 1.0
  $.state.standingHeight = null;  // Initial head height measurement
  $.state.wasSquatting   = false;
  $.state.cooldown       = 0;
  $.state.initTimer      = 0;
  $.state.initialized    = false;

  // Get Animator (must be done in onStart, not top level)
  const modelNode = $.subNode("HumanoidModel");
  if (modelNode) {
    animator = modelNode.getUnityComponent("Animator");
  }
});

// --- Receive PlayerHandle from Manager ---
$.onReceive((messageType, arg, sender) => {
  if (messageType === "assignPlayer") {
    $.state.player      = arg; // PlayerHandle is Sendable
    $.state.initialized = true;
    $.log("clone assigned to: " + arg.userDisplayName);
  }

  if (messageType === "selfDestruct") {
    $.destroy();
  }
});

// --- Every frame ---
$.onUpdate((deltaTime) => {

  // === Init timeout check ===
  if (!$.state.initialized) {
    let timer = ($.state.initTimer ?? 0) + deltaTime;
    if (timer > INIT_TIMEOUT) {
      $.log("clone init timeout, self-destructing");
      $.destroy();
      return;
    }
    $.state.initTimer = timer;
    return;
  }

  const player = $.state.player;
  if (!player || !player.exists()) return;

  // === Position/Rotation sync ===
  const pos = player.getPosition();
  const rot = player.getRotation();
  if (pos) $.setPosition(pos);
  if (rot) $.setRotation(rot);

  // === Squat detection ===
  const headPos = player.getHumanoidBonePosition(HumanoidBone.Head);
  if (pos && headPos) {
    const currentHeadHeight = headPos.y - pos.y;

    // Record standing head height on first measurement
    let standingHeight = $.state.standingHeight;
    if (standingHeight === null) {
      standingHeight = currentHeadHeight;
      $.state.standingHeight = standingHeight;
    }

    let cooldown = Math.max(0, ($.state.cooldown ?? 0) - deltaTime);
    const isSquatting  = (standingHeight - currentHeadHeight) > SQUAT_THRESHOLD;
    const wasSquatting = $.state.wasSquatting ?? false;

    // squat -> stand up = 1 cycle = add 0.1
    if (wasSquatting && !isSquatting && cooldown <= 0) {
      let v = Math.min(($.state.muscleValue ?? 0) + 0.1, 1.0);
      $.state.muscleValue = v;
      cooldown = COOLDOWN;
      $.log("squat! Muscle -> " + (v * 100).toFixed(0) + "%");
    }

    $.state.wasSquatting = isSquatting;
    $.state.cooldown     = cooldown;
  }

  // === Apply blendshape value to Animator ===
  if (animator) {
    animator.setFloat("ArmatureWeight", $.state.muscleValue ?? 0);
  }
});
