// ===== Clone Item - Scriptable Item =====
// Shared script for both Male/Female Clone prefabs

const SQUAT_THRESHOLD = 0.35; // meters: head drops more than this = squatting
const INIT_TIMEOUT    = 5.0;  // seconds: self-destruct if assignPlayer not received

// === Non-VR Test Mode Settings ===
const TEST_MODE_ENABLED   = true;  // Set to false for production
const TEST_SQUAT_INTERVAL = 3.0;   // seconds between simulated squats
const TEST_SQUAT_COUNT    = 20;    // total number of simulated squats

// Muscle pump animation settings
const MUSCLE_GROW_DURATION   = 1;  // seconds
const MUSCLE_SHRINK_DURATION = 0.2;  // seconds
const MUSCLE_GROW_AMOUNT     = 0.5;  // inflate amount
const MUSCLE_SHRINK_AMOUNT   = 0.45;  // shrink amount for first 15 squats (net gain = 0.1)
const SQUAT_CAP              = 15;   // after this many squats, net gain becomes 0

// Fixed rotation offsets for lower arms and hands
// Right side: Z +90, Left side: Z -90
const RIGHT_ARM_OFFSET = { axis: 'Z', degrees: 90 };
const LEFT_ARM_OFFSET = { axis: 'Z', degrees: -90 };

// All possible 90-degree rotation offsets to test
// Format: { axis: 'X'|'Y'|'Z', degrees: 90|-90, label: string }
const OFFSET_CONFIGS = [
  { axis: 'X', degrees: 90, label: 'X +90' },
  { axis: 'X', degrees: -90, label: 'X -90' },
  { axis: 'Y', degrees: 90, label: 'Y +90' },
  { axis: 'Y', degrees: -90, label: 'Y -90' },
  { axis: 'Z', degrees: 90, label: 'Z +90' },
  { axis: 'Z', degrees: -90, label: 'Z -90' },
];

const animators = []; // Content retrieved in onStart

const MUSCLE_ADJUSTABLE_SUBNODE_NAMES = [
    "BodyMesh",
    "JeansMesh"
];

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
  $.state.muscleValue    = 0;     // 0.0 ~ 1.0
  $.state.standingHeight = null;  // Initial head height measurement
  $.state.wasSquatting   = false;
  $.state.initTimer      = 0;
  $.state.initialized    = false;

  // Muscle pump animation state
  $.state.muscleAnimPhase  = "none";  // "none" | "growing" | "shrinking"
  $.state.muscleAnimTimer  = 0;
  $.state.muscleBaseValue  = 0;       // value at animation start
  $.state.musclePeakValue  = 0;       // peak value (capped at 1.0)
  $.state.muscleFinalValue = 0;       // final value = base + 0.1 (capped at 1.0)

  // Squat counter (for determining net gain)
  $.state.squatCount = 0;

  // Non-VR test mode state
  $.state.testSquatTimer = 0;
  $.state.testSquatsDone = 0;

  // Rotation offset testing state
  $.state.offsetTestTimer = 0;
  $.state.offsetConfigIndex = 0;

  // Get Animators (must be done in onStart, not top level)
  for (const subNodeName of MUSCLE_ADJUSTABLE_SUBNODE_NAMES) {
    if (!$.subNode(subNodeName)) continue;
    $.log(subNodeName);
    animators.push($.subNode(subNodeName).getUnityComponent("Animator"));
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

// Helper: Create quaternion for axis-angle rotation
function createAxisRotation(axis, degrees) {
  const radians = degrees * Math.PI / 180;
  const halfAngle = radians / 2;
  const sinHalf = Math.sin(halfAngle);
  const cosHalf = Math.cos(halfAngle);

  if (axis === 'X') {
    return new Quaternion(sinHalf, 0, 0, cosHalf);
  } else if (axis === 'Y') {
    return new Quaternion(0, sinHalf, 0, cosHalf);
  } else { // Z
    return new Quaternion(0, 0, sinHalf, cosHalf);
  }
}

// Helper: Check if bone is lower arm or hand
function isLowerArmOrHand(bone) {
  return bone === HumanoidBone.LeftLowerArm ||
         bone === HumanoidBone.RightLowerArm ||
         bone === HumanoidBone.LeftHand ||
         bone === HumanoidBone.RightHand;
}

// Helper: Check if bone is right side lower arm or hand
function isRightLowerArmOrHand(bone) {
  return bone === HumanoidBone.RightLowerArm ||
         bone === HumanoidBone.RightHand;
}

// Helper: Check if bone is left side lower arm or hand
function isLeftLowerArmOrHand(bone) {
  return bone === HumanoidBone.LeftLowerArm ||
         bone === HumanoidBone.LeftHand;
}

// Helper: Multiply two quaternions
function multiplyQuaternions(q1, q2) {
  return new Quaternion(
    q1.w * q2.x + q1.x * q2.w + q1.y * q2.z - q1.z * q2.y,
    q1.w * q2.y - q1.x * q2.z + q1.y * q2.w + q1.z * q2.x,
    q1.w * q2.z + q1.x * q2.y - q1.y * q2.x + q1.z * q2.w,
    q1.w * q2.w - q1.x * q2.x - q1.y * q2.y - q1.z * q2.z
  );
}

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
    // Pre-compute fixed offset rotations for left/right arms
    const rightArmOffsetRot = createAxisRotation(RIGHT_ARM_OFFSET.axis, RIGHT_ARM_OFFSET.degrees);
    const leftArmOffsetRot = createAxisRotation(LEFT_ARM_OFFSET.axis, LEFT_ARM_OFFSET.degrees);

    for (let i = 0; i < boneNodes.length; i++) {
      const entry = boneNodes[i];
      if (entry.node) {
        const boneRot = player.getHumanoidBoneRotation(entry.bone);
        if (boneRot) {
          if (isRightLowerArmOrHand(entry.bone)) {
            // Fixed offset for right lower arm and hand: Z +90
            const correctedRot = multiplyQuaternions(boneRot, rightArmOffsetRot);
            entry.node.setRotation(correctedRot);
          } else if (isLeftLowerArmOrHand(entry.bone)) {
            // Fixed offset for left lower arm and hand: Z -90
            const correctedRot = multiplyQuaternions(boneRot, leftArmOffsetRot);
            entry.node.setRotation(correctedRot);
          } else {
            entry.node.setRotation(boneRot);
          }
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

      const isSquatting  = (standingHeight - currentHeadHeight) > SQUAT_THRESHOLD;
      const wasSquatting = $.state.wasSquatting ?? false;
      if (isSquatting) {
        $.log(standingHeight - currentHeadHeight);}

      // squat -> stand up = 1 cycle = trigger pump animation
      if (wasSquatting && !isSquatting && $.state.muscleAnimPhase === "none") {
        const squatNum = ($.state.squatCount ?? 0) + 1;
        $.state.squatCount = squatNum;

        const base = $.state.muscleValue ?? 0;
        // After SQUAT_CAP squats, shrink amount equals grow amount (net gain = 0)
        const shrinkAmount = squatNum > SQUAT_CAP ? MUSCLE_GROW_AMOUNT : MUSCLE_SHRINK_AMOUNT;
        const netGain = MUSCLE_GROW_AMOUNT - shrinkAmount;

        $.state.muscleAnimPhase  = "growing";
        $.state.muscleAnimTimer  = 0;
        $.state.muscleBaseValue  = base;
        $.state.musclePeakValue  = Math.min(base + MUSCLE_GROW_AMOUNT, 1.0);
        $.state.muscleFinalValue = Math.min(base + netGain, 1.0);
        $.log("squat #" + squatNum + "! Starting muscle pump... (net gain: " + netGain + ")");
      }

      $.state.wasSquatting = isSquatting;
    }

    // === Non-VR Test Mode: Simulate squats ===
    if (TEST_MODE_ENABLED && $.state.testSquatsDone < TEST_SQUAT_COUNT) {
      let testTimer = ($.state.testSquatTimer ?? 0) + deltaTime;

      if (testTimer >= TEST_SQUAT_INTERVAL && $.state.muscleAnimPhase === "none") {
        const squatNum = ($.state.squatCount ?? 0) + 1;
        $.state.squatCount = squatNum;

        // Trigger muscle pump animation as if player completed a squat
        const base = $.state.muscleValue ?? 0;
        // After SQUAT_CAP squats, shrink amount equals grow amount (net gain = 0)
        const shrinkAmount = squatNum > SQUAT_CAP ? MUSCLE_GROW_AMOUNT : MUSCLE_SHRINK_AMOUNT;
        const netGain = MUSCLE_GROW_AMOUNT - shrinkAmount;

        $.state.muscleAnimPhase  = "growing";
        $.state.muscleAnimTimer  = 0;
        $.state.muscleBaseValue  = base;
        $.state.musclePeakValue  = Math.min(base + MUSCLE_GROW_AMOUNT, 1.0);
        $.state.muscleFinalValue = Math.min(base + netGain, 1.0);

        $.log("[TEST] Simulated squat #" + squatNum + "/" + TEST_SQUAT_COUNT + " (net gain: " + netGain + ")");

        $.state.testSquatsDone = squatNum;
        testTimer = 0;
      }

      $.state.testSquatTimer = testTimer;
    }

    // === Muscle pump animation ===
    const phase = $.state.muscleAnimPhase ?? "none";
    if (phase !== "none") {
      let timer = ($.state.muscleAnimTimer ?? 0) + deltaTime;

      if (phase === "growing") {
        const progress = Math.min(timer / MUSCLE_GROW_DURATION, 1.0);
        $.state.muscleValue = $.state.muscleBaseValue +
            ($.state.musclePeakValue - $.state.muscleBaseValue) * progress;

        if (timer >= MUSCLE_GROW_DURATION) {
          $.state.muscleAnimPhase = "shrinking";
          timer = 0;
        }
      } else if (phase === "shrinking") {
        const progress = Math.min(timer / MUSCLE_SHRINK_DURATION, 1.0);
        $.state.muscleValue = $.state.musclePeakValue -
            ($.state.musclePeakValue - $.state.muscleFinalValue) * progress;

        if (timer >= MUSCLE_SHRINK_DURATION) {
          $.state.muscleAnimPhase = "none";
          $.state.muscleValue = $.state.muscleFinalValue;
          $.log("Muscle -> " + ($.state.muscleFinalValue * 100).toFixed(0) + "%");
        }
      }

      $.state.muscleAnimTimer = timer;
    }

    // === Apply blendshape value to Animator ===
    for (const animator of animators) {
      animator.setFloat("MuscleWeight", $.state.muscleValue ?? 0);
    }
});
