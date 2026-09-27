;;; Capture a bounded sequence of naturally occurring STORE-IN-FILE calls.
;;; Only verified VISPT readers and the existing output stream's position are
;;; queried; no writer call, stream flush, or file read is added.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-sequence-seeded-1234-loaded)
  (set 'aaron-scene-writer-sequence-seeded-1234-loaded t)
  (set 'aaron-scene-writer-sequence-limit 64)
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl"))
