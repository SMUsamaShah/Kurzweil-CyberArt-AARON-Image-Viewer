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

  ;; Keep a small, source-free snapshot of the relevant runtime symbols.  The
  ;; delivered image retains their names and values, but reflection APIs such
  ;; as FUNCTION-LAMBDA-EXPRESSION are unsafe in this stripped runtime.  Use
  ;; only FIND-SYMBOL/BOUNDP/FBOUNDP in the package where the flag was found.
  (with-open-file (report "C:\\temp\\aaron-premium-introspection.txt"
                         :direction :output
                         :if-exists :supersede
                         :if-does-not-exist :create)
    (let ((package (find-package "COMMON-GRAPHICS-USER")))
      (dolist (name '("*BUILD-PREMIUM*" "PREMIUM" "COMPOSE" "PAINT"
                      "DRAW-FIGURE-CFORMS" "FILL-POLYGON" "DRAW-LIST"
                      "DRAW-FN" "PLAN-REPLACE" "PLACE-ARM"
                      "SET-UP-SCREEN-SIZE" "KCAT-CC-UPGRADE"
                      "KCAT-UPGRADE" "KCAT-CURRENT-DAY-TIME" "INIT-RANDOM"
                      "RANDOM-INT" "NEW-RANDOM-FLOAT" "?RSEED?"
                      "COPY-IMAGES" "SCREEN-AND-STORE"))
        (handler-case
            (multiple-value-bind (symbol status) (find-symbol name package)
              (format report "~&~A status=~S bound=~S fbound=~S"
                      name status (and symbol (boundp symbol))
                      (and symbol (fboundp symbol)))
              (when (and symbol (boundp symbol))
                (handler-case
                    (format report " value=~S" (symbol-value symbol))
                  (condition (condition)
                    (format report " value-error=~A" condition))))
              (terpri report)
              (finish-output report))
          (condition (condition)
            (format report "~&~A error=~A~%" name condition)
            (finish-output report))))))
  (format t "~&AARON premium flag patch loaded; packages: ~S~%"
          (nreverse matches))
  (finish-output))
