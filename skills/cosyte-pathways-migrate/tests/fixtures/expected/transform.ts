// The channel's transform, converted by the cosyte-pathways-migrate skill from an exported
// channel. Each step of the export has a marker below. Rewrite the step in TypeScript from its
// file under migration/synth-adt-feed/source/ and change its marker from pending to rewritten, or
// to "dropped: <why>" when the step is not needed. Never run an exported script: read it.
// check-migration exits 0 only once no marker is pending.
//
// Node runs this file as it is, by stripping the types: import shared code as "./shared/<name>.ts".
import type { Transform } from "@cosyte/pathways";

// migrate: DEPLOY pending: channel script, "deploy script"
//   Source: migration/synth-adt-feed/source/DEPLOY-deploy-script.js. Pathways 0.0.3 has no start
//   script: code at the top of transform.ts runs whenever the channel's worker loads it, which can
//   be more than once.

export default ((msg, ctx) => {
  // migrate: F1 pending: source filter rule 1, "Admissions only"
  //   Source: migration/synth-adt-feed/source/F1-admissions-only.js. A filter rule script: rewrite
  //   it in the transform, returning null to filter the message out.
  // migrate: S1 pending: source transformer step 1, "Set receiving app"
  //   Source: migration/synth-adt-feed/source/S1-set-receiving-app.js. A script step: rewrite it in
  //   TypeScript.
  // migrate: S2 pending: source transformer step 2, "Patient class"
  //   Source: migration/synth-adt-feed/source/S2-patient-class.json. A mapping step: rewrite it as a
  //   value read in the transform.
  // migrate: S3 pending: source transformer step 3, "Old stylesheet"
  //   Disabled in the export.
  // migrate: D1-S1 pending: destination 1 transformer step 1, "Stamp"
  //   Source: migration/synth-adt-feed/source/D1-S1-stamp.js. Pathways 0.0.3 has no transform per
  //   destination: fold it into the channel transform if it holds for every destination, or move the
  //   destination to a channel of its own.
  // migrate: D2-R1 pending: destination 2 response transformer step 1, "Read reply"
  //   Source: migration/synth-adt-feed/source/D2-R1-read-reply.js. Pathways 0.0.3 gives a transform
  //   no destination reply, so a response step has no place yet.
  void ctx;
  return msg;
}) satisfies Transform;
