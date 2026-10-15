;;; Independent complete writer tape for a fresh seed-456069 holdout.
(in-package :cl-user)

(unless (boundp 'aaron-scene-writer-full-seeded-456069-loaded)
  (set 'aaron-scene-writer-full-seeded-456069-loaded t)
  (set 'aaron-scene-writer-full-enabled t)
  ;; Preserve an allowlisted focused companion's targets. The default full
  ;; writer capture requests only the two writer boundaries.
  (unless (member (and (boundp 'aaron-planning-extra-targets)
                       (symbol-value 'aaron-planning-extra-targets))
                  '(("PREP-LINE" "STORE-IN-FILE")
                    ("PREP-LINE" "STORE-IN-FILE" "BRUSH-STROKE")
                    ("PREP-LINE" "STORE-IN-FILE" "BRUSH-STROKE" "PICK"))
                  :test #'equal)
    (set 'aaron-planning-extra-targets '("PREP-LINE" "STORE-IN-FILE")))
  (set 'aaron-planning-seed 456069)
  (set 'aaron-planning-set-rseed nil)
  (set 'aaron-planning-reseed-after-init t)
  (set 'aaron-ran-sample-limit 0)
  (load "C:\\temp\\scene-state-snapshot.cl")
  (load "C:\\temp\\planning-random-seed-common.cl"))
