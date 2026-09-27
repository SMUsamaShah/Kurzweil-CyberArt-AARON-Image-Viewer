;;; Inspect natural VISPT arguments and *TEMP* stream positions at the first
;;; STORE-IN-FILE call, without reading or replacing the output stream.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-stream-seeded-1234-loaded)
  (set 'aaron-scene-writer-stream-seeded-1234-loaded t)
  (set 'aaron-scene-writer-stream-enabled t)
  (load "C:\\temp\\scene-state-snapshot-writer-seeded-1234.cl"))
