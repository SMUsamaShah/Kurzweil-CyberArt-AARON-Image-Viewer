;;; Enable the complete natural STORE-IN-FILE call tape for the seeded scene.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-full-seeded-1234-loaded)
  (set 'aaron-scene-writer-full-seeded-1234-loaded t)
  (set 'aaron-scene-writer-full-enabled t)
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl"))
