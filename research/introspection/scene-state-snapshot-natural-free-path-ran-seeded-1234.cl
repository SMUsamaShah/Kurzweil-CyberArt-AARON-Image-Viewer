;;; Observe natural FREE-PATH points and its nested RAN calls.
(in-package :cl-user)

(unless (boundp 'aaron-scene-natural-free-path-ran-seeded-1234-loaded)
  (set 'aaron-scene-natural-free-path-ran-seeded-1234-loaded t)
  (load "C:\\temp\\scene-state-snapshot-seeded-1234.cl")
  (load "C:\\temp\\aaron-natural-free-path-capture.cl")
  (load "C:\\temp\\aaron-natural-free-path-ran-capture.cl"))
