;;; Capture the first natural SCREEN-AND-STORE units with the full writer tape.
(in-package :cl-user)

(unless (boundp 'aaron-scene-screen-unit-seeded-1234-loaded)
  (set 'aaron-scene-screen-unit-seeded-1234-loaded t)
  (load "C:\\temp\\scene-state-snapshot-writer-full-seeded-1234.cl")
  (load "C:\\temp\\aaron-natural-screen-unit-capture.cl")
  (load "C:\\temp\\aaron-natural-screen-color-capture.cl"))
