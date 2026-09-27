;;; Observe the first naturally occurring SCRIPT(PLAN) call and its return.
;;;
;;; This does not invoke SCRIPT an extra time or construct a substitute PLAN.
;;; planning-call-trace.cl preserves all original return values while passing
;;; a bounded first-result summary to the read-only scene observer.
(in-package :cl-user)

(unless (boundp 'aaron-scene-plan-seeded-1234-loaded)
  (set 'aaron-scene-plan-seeded-1234-loaded t)
  (set 'aaron-planning-extra-targets '("SCRIPT"))
  (set 'aaron-planning-quiet-targets '("SCRIPT"))
  (set 'aaron-planning-return-targets '("SCRIPT"))
  (set 'aaron-scene-transition-targets '("SCRIPT"))
  (load "C:\\temp\\scene-state-snapshot-seeded-1234.cl"))
