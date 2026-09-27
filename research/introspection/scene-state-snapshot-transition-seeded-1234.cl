;;; Controlled transition census around the real colour/painting calls.
;;;
;;; The targets are already wrapped by planning-call-trace.cl. This companion
;;; only asks the read-only scene observer to snapshot their first call pair.
(in-package :cl-user)

(unless (boundp 'aaron-scene-transition-seeded-1234-loaded)
  (set 'aaron-scene-transition-seeded-1234-loaded t)
  (set 'aaron-planning-extra-targets
       '("PREP-LINE" "STORE-IN-FILE" "MAKE-DYETAB" "COLORING"
         "ASSIGN-COLORS" "SELECT-BRUSH" "RECORD-BRUSH"))
  (set 'aaron-planning-return-targets '("SELECT-BRUSH"))
  (set 'aaron-scene-transition-targets
       '("INITIALISE-PICTURE-PLANE" "PROTOCOL" "MAKE-ARTWORK"
         "MAKE-PAINTING-COLORS" "MAKE-COLORSPEC" "PAINT-FILL"
         "DISPLAY-COLOR-PATCHES" "MAKE-DYETAB" "COLORING"
         "ASSIGN-COLORS" "SELECT-BRUSH" "RECORD-BRUSH"))
  (load "C:\\temp\\scene-state-snapshot-writer-seeded-1234.cl"))
