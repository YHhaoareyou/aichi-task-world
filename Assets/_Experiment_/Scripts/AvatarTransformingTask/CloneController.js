// ===== Clone Item - Scriptable Item =====
// Shared script for both Male/Female Clone prefabs

const SQUAT_THRESHOLD = 0.35; // meters: head drops more than this = squatting
const COOLDOWN        = 1.0;  // seconds: cooldown after squat detection
const INIT_TIMEOUT    = 5.0;  // seconds: self-destruct if assignPlayer not received

let animator = null; // Retrieved in onStart

// Mapping: HumanoidBone enum -> bone node name in hierarchy (Character Creator naming)
const BONE_MAP = [
  { bone: HumanoidBone.Hips, name: "CC_Base_Hip" },
  { bone: HumanoidBone.Spine, name: "CC_Base_Spine01" },
  { bone: HumanoidBone.Chest, name: "CC_Base_Spine02" },
  { bone: HumanoidBone.Neck, name: "CC_Base_NeckTwist01" },
  { bone: HumanoidBone.Head, name: "CC_Base_Head" },
  { bone: HumanoidBone.LeftShoulder, name: "CC_Base_L_Clavicle" },
  { bone: HumanoidBone.LeftUpperArm, name: "CC_Base_L_Upperarm" },
  { bone: HumanoidBone.LeftLowerArm, name: "CC_Base_L_Forearm" },
  { bone: HumanoidBone.LeftHand, name: "CC_Base_L_Hand" },
  { bone: HumanoidBone.RightShoulder, name: "CC_Base_R_Clavicle" },
  { bone: HumanoidBone.RightUpperArm, name: "CC_Base_R_Upperarm" },
  { bone: HumanoidBone.RightLowerArm, name: "CC_Base_R_Forearm" },
  { bone: HumanoidBone.RightHand, name: "CC_Base_R_Hand" },
  { bone: HumanoidBone.LeftUpperLeg, name: "CC_Base_L_Thigh" },
  { bone: HumanoidBone.LeftLowerLeg, name: "CC_Base_L_Calf" },
  { bone: HumanoidBone.LeftFoot, name: "CC_Base_L_Foot" },
  { bone: HumanoidBone.LeftToes, name: "CC_Base_L_ToeBase" },
  { bone: HumanoidBone.RightUpperLeg, name: "CC_Base_R_Thigh" },
  { bone: HumanoidBone.RightLowerLeg, name: "CC_Base_R_Calf" },
  { bone: HumanoidBone.RightFoot, name: "CC_Base_R_Foot" },
  { bone: HumanoidBone.RightToes, name: "CC_Base_R_ToeBase" }
];

let boneNodes = []; // Cached bone node references

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
    // animator = modelNode.getUnityComponent("Animator");
  }

  // Cache bone node references
  boneNodes = [];
  for (let i = 0; i < BONE_MAP.length; i++) {
    const entry = BONE_MAP[i];
    const node = $.subNode(entry.name);
    if (!node) continue;
    boneNodes.push({ bone: entry.bone, node: node });
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
  /*
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
  */
    const player = $.state.player;
    if (!player || !player.exists()) return;
  
    // === Position/Rotation sync ===
    const pos = player.getPosition();
    const rot = player.getRotation();
    if (pos) $.setPosition(pos);
    if (rot) $.setRotation(rot);
    // $.subNode("HumanoidModel").setPosition(new Vector3(0, 1, 0));

    // === Apply all bone rotations from player to clone ===
    for (let i = 0; i < boneNodes.length; i++) {
      const entry = boneNodes[i];
      if (entry.node) {
        const boneRot = player.getHumanoidBoneRotation(entry.bone);
        if (boneRot) {
          entry.node.setRotation(boneRot);
        }
      }
    }
  
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
      // animator.setFloat("MuscleWeight", $.state.muscleValue ?? 0);
    }
});
