;;; Observe natural FREE-PATH calls in the independent controlled seed-5678 scene.
(in-package :cl-user)

(unless (boundp 'aaron-scene-natural-free-path-seeded-5678-loaded)
  (set 'aaron-scene-natural-free-path-seeded-5678-loaded t)
  (set 'aaron-planning-seed 5678)
  (set 'aaron-planning-set-rseed nil)
  (set 'aaron-planning-reseed-after-init t)
  (set 'aaron-ran-sample-limit 0)
  (load "C:\\temp\\scene-state-snapshot.cl")
  (load "C:\\temp\\planning-random-seed-common.cl")
  (load "C:\\temp\\aaron-natural-free-path-capture.cl"))
