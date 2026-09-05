;;; Same clean-room random-state probe as seed-1234.cl, with another seed.
(in-package :cl-user)

(let ((state (handler-case
                 (excl:make-random-state-from-seed 5678)
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
  (write-line "seed 5678 probe loaded" marker)
  (finish-output marker))
