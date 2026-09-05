;;; Disposable random-state probe.  It does not inspect or copy Lisp code;
;;; it only asks Allegro for a seeded state and installs it in the visible
;;; random-state variables before AARON starts its normal composition.
(in-package :cl-user)

(let ((state (handler-case
                 (excl:make-random-state-from-seed 1234)
               (condition () nil))))
  (when state
    (do-all-symbols (symbol)
      (when (and (member (symbol-name symbol)
                         '("*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*"
                           "?RSEED?")
                         :test #'string-equal)
                 (not (constantp symbol)))
        (handler-case
            (set symbol state)
          (condition () nil))))))

(with-open-file (marker "C:\\temp\\aaron-seed-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (write-line "seed 1234 probe loaded" marker)
  (finish-output marker))
