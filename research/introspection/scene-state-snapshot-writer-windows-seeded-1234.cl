;;; Sample short, non-overlapping natural writer windows across one painting.
;;; The windows cover the early outline/color transition and later intervals.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-windows-seeded-1234-loaded)
  (set 'aaron-scene-writer-windows-seeded-1234-loaded t)
  (set 'aaron-scene-writer-sequence-limit 299)
  (set 'aaron-scene-writer-sequence-windows
       '((0 16) (512 16) (640 16) (656 32) (688 16) (704 16) (720 16)
         (752 16) (800 16) (1024 16) (2048 16) (4096 16)
         (3472 16) (8192 16) (16384 16) (24576 16)
         (28000 16) (28064 11)))
  (load "C:\\temp\\scene-state-snapshot-writer-stream-seeded-1234.cl"))
