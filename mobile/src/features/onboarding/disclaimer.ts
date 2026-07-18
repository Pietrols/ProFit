// Single client-side source of the medical disclaimer (AUDIT C3). The server
// counterpart is TEMPLATE_DISCLAIMER in backend/src/services/
// starterTemplates.ts — keep the copy identical; the starter-template test
// asserts the canonical "not medical advice" phrase server-side.
export const MEDICAL_DISCLAIMER =
  'ProFit offers general fitness information, not medical advice. Check with ' +
  'your doctor before starting a new exercise program — especially if you ' +
  'have joint, heart, or other existing health conditions.';
