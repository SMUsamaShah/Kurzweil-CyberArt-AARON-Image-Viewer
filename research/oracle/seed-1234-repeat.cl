;;; Repeat of seed-1234.cl; this is a separate workflow entry so byte-level
;;; reproducibility can be tested across fresh Windows runners.
(in-package :cl-user)

(with-open-file (marker "C:\\temp\\aaron-seed-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (write-line "seed 1234 repeat probe entered" marker)
  (finish-output marker))

(let ((state (handler-case
                 (excl:make-random-state-from-seed 1234)
               (condition () nil))))
  (when state
    (do-all-symbols (symbol)
      (when (and (member (symbol-name symbol)
                         '("*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*")
                         :test #'string-equal)
                 (not (constantp symbol)))
        (handler-case
            (set symbol state)
          (condition () nil))))))

(do-all-symbols (symbol)
  (when (and (string-equal "?RSEED?" (symbol-name symbol))
             (not (constantp symbol)))
    (handler-case
        (set symbol 1234)
      (condition () nil))))

(with-open-file (marker "C:\\temp\\aaron-seed-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (write-line "seed 1234 repeat probe loaded" marker)
  (finish-output marker))
