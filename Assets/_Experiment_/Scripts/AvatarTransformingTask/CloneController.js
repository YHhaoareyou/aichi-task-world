// ===== Clone Item - Scriptable Item =====
// Shared script for both Male/Female Clone prefabs

const SQUAT_THRESHOLD = 0.35; // meters: head drops more than this = squatting
const INIT_TIMEOUT    = 5.0;  // seconds: self-destruct if assignPlayer not received

// === Non-VR Test Mode Settings ===
const TEST_MODE_ENABLED   = false;  // Set to false for production
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

// Parent bone for each bone (null = parent is item root)
const BONE_PARENT = {
  [HumanoidBone.Hips]: null,
  [HumanoidBone.Spine]: HumanoidBone.Hips,
  [HumanoidBone.Chest]: HumanoidBone.Spine,
  [HumanoidBone.Neck]: HumanoidBone.Chest,
  [HumanoidBone.Head]: HumanoidBone.Neck,
  [HumanoidBone.LeftShoulder]: HumanoidBone.Chest,
  [HumanoidBone.LeftUpperArm]: HumanoidBone.LeftShoulder,
  [HumanoidBone.LeftLowerArm]: HumanoidBone.LeftUpperArm,
  [HumanoidBone.LeftHand]: HumanoidBone.LeftLowerArm,
  [HumanoidBone.RightShoulder]: HumanoidBone.Chest,
  [HumanoidBone.RightUpperArm]: HumanoidBone.RightShoulder,
  [HumanoidBone.RightLowerArm]: HumanoidBone.RightUpperArm,
  [HumanoidBone.RightHand]: HumanoidBone.RightLowerArm,
  [HumanoidBone.LeftUpperLeg]: HumanoidBone.Hips,
  [HumanoidBone.LeftLowerLeg]: HumanoidBone.LeftUpperLeg,
  [HumanoidBone.LeftFoot]: HumanoidBone.LeftLowerLeg,
  [HumanoidBone.LeftToes]: HumanoidBone.LeftFoot,
  [HumanoidBone.RightUpperLeg]: HumanoidBone.Hips,
  [HumanoidBone.RightLowerLeg]: HumanoidBone.RightUpperLeg,
  [HumanoidBone.RightFoot]: HumanoidBone.RightLowerLeg,
  [HumanoidBone.RightToes]: HumanoidBone.RightFoot,
};

let boneNodes = []; // Cached bone node references
let hipsNode = null; // Cached Hips subnode for position sync

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
    const parentBone = BONE_PARENT[entry.bone] !== undefined ? BONE_PARENT[entry.bone] : null;
    boneNodes.push({ bone: entry.bone, node: node, parentBone: parentBone });
    if (entry.bone === HumanoidBone.Hips) hipsNode = node;
  }
});

// --- Receive PlayerHandle from Manager ---
$.onReceive((messageType, arg, sender) => {
  if (messageType === "assignPlayer") {
    $.state.player      = arg; // PlayerHandle is Sendable
    $.state.initialized = true;
    $.log("clone assigned to: " + arg.userDisplayName);
  }

  if (messageType === "setScale") {
    const s = arg;
    const transform = $.getUnityComponent("Transform");
    transform.unityProp.localScale = new Vector3(s, s, s);
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

// Helper: Rotate a vector by a quaternion (v' = q * v * q_inv)
function rotateVector(q, x, y, z) {
  const qx = q.x, qy = q.y, qz = q.z, qw = q.w;
  // t = 2 * cross(q.xyz, v)
  const tx = 2 * (qy * z - qz * y);
  const ty = 2 * (qz * x - qx * z);
  const tz = 2 * (qx * y - qy * x);
  return new Vector3(
    x + qw * tx + (qy * tz - qz * ty),
    y + qw * ty + (qz * tx - qx * tz),
    z + qw * tz + (qx * ty - qy * tx)
  );
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

    // === Sync Hips position so the clone squats down with the player ===
    if (hipsNode && pos && rot) {
      const hipsWorldPos = player.getHumanoidBonePosition(HumanoidBone.Hips);
      if (hipsWorldPos) {
        const dx = hipsWorldPos.x - pos.x;
        const dy = hipsWorldPos.y - pos.y;
        const dz = hipsWorldPos.z - pos.z;
        const invRot = new Quaternion(-rot.x, -rot.y, -rot.z, rot.w);
        const hipsLocalPos = rotateVector(invRot, dx, dy, dz);
        hipsNode.setPosition(new Vector3(hipsLocalPos.x, hipsLocalPos.y + 0.1, hipsLocalPos.z));
      }
    }

    // === Apply all bone rotations from player to clone ===
    // Fetch all world bone rotations in one pass
    const worldRots = {};
    for (let i = 0; i < boneNodes.length; i++) {
      const boneRot = player.getHumanoidBoneRotation(boneNodes[i].bone);
      if (boneRot) worldRots[boneNodes[i].bone] = boneRot;
    }

    // Convert world rotations to parent-local for each bone
    // setRotation sets rotation relative to the parent node, so:
    //   localRot = inverse(parentWorldRot) * boneWorldRot
    for (let i = 0; i < boneNodes.length; i++) {
      const entry = boneNodes[i];
      const boneRot = worldRots[entry.bone];
      if (!entry.node || !boneRot) continue;

      // Determine parent's world rotation
      let parentWorldRot;
      if (entry.parentBone === null) {
        // Hips: parent is the item root
        parentWorldRot = rot;
      } else {
        parentWorldRot = worldRots[entry.parentBone];
        if (!parentWorldRot) {
          // Fallback to item root if parent rotation unavailable
          parentWorldRot = rot;
        }
      }

      const invParent = new Quaternion(-parentWorldRot.x, -parentWorldRot.y, -parentWorldRot.z, parentWorldRot.w);
      const localBoneRot = multiplyQuaternions(invParent, boneRot);
      entry.node.setRotation(localBoneRot);
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

      // stand -> squat down = trigger pump animation
      if (!wasSquatting && isSquatting && $.state.muscleAnimPhase === "none") {
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

        // TODO: Play muscle pump sound effect
        // $.subNode("MuscleAudioSource").getUnityComponent("AudioSource").play();
        // TODO: Enable VFX
        // $.subNode("MuscleVFX").setEnabled(true);
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

        // TODO: Play muscle pump sound effect
        // $.subNode("MuscleAudioSource").getUnityComponent("AudioSource").play();
        // TODO: Enable VFX
        // $.subNode("MuscleVFX").setEnabled(true);

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

          // TODO: Stop muscle pump sound effect
          // $.subNode("MuscleAudioSource").getUnityComponent("AudioSource").stop();
          // TODO: Disable VFX
          // $.subNode("MuscleVFX").setEnabled(false);
        }
      }

      $.state.muscleAnimTimer = timer;
    }

    // === Apply blendshape value to Animator ===
    for (const animator of animators) {
      animator.setFloat("MuscleWeight", $.state.muscleValue ?? 0);
    }
});
