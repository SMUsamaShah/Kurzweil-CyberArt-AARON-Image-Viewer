;;; Observe natural FREE-PATH calls after the seeded trace has been installed.
(in-package :cl-user)

(unless (boundp 'aaron-scene-natural-free-path-seeded-1234-loaded)
  (set 'aaron-scene-natural-free-path-seeded-1234-loaded t)
  (load "C:\\temp\\scene-state-snapshot-seeded-1234.cl")
  (load "C:\\temp\\aaron-natural-free-path-capture.cl"))
