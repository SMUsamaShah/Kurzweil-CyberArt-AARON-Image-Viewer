;;; Loaded with Allegro CL's -L startup switch for a disposable oracle run.
;;; The runtime image retains a symbol named *BUILD-PREMIUM*.  Set every
;;; matching symbol we can see so the probe can distinguish a real premium
;;; build branch from the ordinary trial UI.  This file is intentionally
;;; side-effect-only and is never loaded by the JavaScript engine.
(in-package :cl-user)

(with-open-file (marker "C:\\temp\\aaron-premium-flag-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (format marker "premium-flag.cl loaded~%"))

(let ((matches nil))
  (do-all-symbols (symbol)
    (when (string-equal (symbol-name symbol) "*BUILD-PREMIUM*")
      (let ((package-name (package-name (symbol-package symbol))))
        (push package-name matches)
        (unless (constantp symbol)
          (handler-case
              (set symbol t)
            (condition (condition)
              (format t "~&AARON premium flag patch failed in ~A: ~A~%"
                      package-name condition)))))))
  (with-open-file (marker "C:\\temp\\aaron-premium-flag-loaded.txt"
                         :direction :output
                         :if-exists :supersede
                         :if-does-not-exist :create)
    (format marker "packages: ~S~%" (nreverse matches)))
  (format t "~&AARON premium flag patch loaded; packages: ~S~%"
          (nreverse matches))
  (finish-output))
