;;; Independent complete writer tape for the established seed-5678 holdout.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-full-seeded-5678-loaded)
  (set 'aaron-scene-writer-full-seeded-5678-loaded t)
  (set 'aaron-scene-writer-full-enabled t)
  (set 'aaron-planning-extra-targets '("PREP-LINE" "STORE-IN-FILE"))
  (set 'aaron-planning-seed 5678)
  (set 'aaron-planning-set-rseed nil)
  (set 'aaron-planning-reseed-after-init t)
  (set 'aaron-ran-sample-limit 0)
  (load "C:\\temp\\scene-state-snapshot.cl")
  (load "C:\\temp\\planning-random-seed-common.cl"))
