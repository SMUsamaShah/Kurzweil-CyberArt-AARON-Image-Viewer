;;; Controlled scene-state run with two extra real writer boundaries.
;;;
;;; The planning trace still calls the saved original functions. The
;;; seed-1234 companion provides the already-validated post-INIT-RANDOM
;;; calibration and the three read-only scene snapshots.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-seeded-1234-loaded)
  (set 'aaron-scene-writer-seeded-1234-loaded t)
  (unless (boundp 'aaron-planning-extra-targets)
    (set 'aaron-planning-extra-targets '("PREP-LINE" "STORE-IN-FILE")))
  (load "C:\\temp\\scene-state-snapshot-seeded-1234.cl"))
