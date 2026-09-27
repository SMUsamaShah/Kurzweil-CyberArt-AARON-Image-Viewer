;;; Independent controlled-seed holdout for natural SCREEN-AND-STORE units.
(in-package :cl-user)

(unless (boundp 'aaron-scene-screen-unit-seeded-5678-loaded)
  (set 'aaron-scene-screen-unit-seeded-5678-loaded t)
  (load "C:\\temp\\scene-state-snapshot-writer-full-seeded-5678.cl")
  (load "C:\\temp\\aaron-natural-screen-unit-capture.cl"))
