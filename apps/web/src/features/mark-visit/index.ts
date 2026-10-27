export type { DemoProximity, VisitLocationEvaluation } from './model/mark-visit-model';
export {
  applyOptimisticVisit,
  clampVisitComment,
  DEMO_PROXIMITY_TOGGLE_LABEL,
  ensurePlaceAndMarkVisit,
  evaluateVisitLocation,
  EXPECTATION_OPTIONS,
  getDemoVisitLocation,
  isPrefersReducedMotion,
  isVisitDemoModeEnabled,
  MARK_VISIT_BUTTON_LABEL,
  MAX_NOTE_LENGTH,
  requestCurrentVisitLocation,
  updateLatestVisitInMockDb,
  VISIT_MARKED_TODAY_CAPTION,
  VISIT_SAVED_TOAST_MESSAGE,
  VISIT_VERIFICATION_RADIUS_M,
} from './model/mark-visit-model';
export type { MarkVisitButtonProps } from './ui/mark-visit-button';
export { MarkVisitButton } from './ui/mark-visit-button';
export type { MarkVisitModalProps } from './ui/mark-visit-modal';
export { MarkVisitModal } from './ui/mark-visit-modal';
