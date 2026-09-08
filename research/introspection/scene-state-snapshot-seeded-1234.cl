;;; Seeded scene-state companion.
;;;
;;; The seed is installed only after the original INIT-RANDOM returns by the
;;; already validated planning-random-seed-common observer.  This wrapper then
;;; loads the read-only scene-state companion.  It is a repeat-control source,
;;; not a claim about AARON's normal startup seed.
(in-package :cl-user)

(unless (boundp 'aaron-scene-state-seeded-1234-loaded)
  (set 'aaron-scene-state-seeded-1234-loaded t)
  (set 'aaron-planning-seed 1234)
  (set 'aaron-planning-set-rseed nil)
  (set 'aaron-planning-reseed-after-init t)
  (set 'aaron-ran-sample-limit 0)
  (load "C:\\temp\\planning-random-seed-common.cl")
  (load "C:\\temp\\scene-state-snapshot.cl"))
