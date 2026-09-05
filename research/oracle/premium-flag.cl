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

  ;; Keep a source-free package census.  The delivered image retains symbol
  ;; names, but invoking arbitrary functions or reading arbitrary values can
  ;; enter the stripped runtime's debugger.  DO-ALL-SYMBOLS plus BOUNDP is
  ;; deliberately boring and is enough to locate the engine's package.
  (handler-case
      (with-open-file (report "C:\\temp\\aaron-premium-introspection.txt"
                             :direction :output
                             :if-exists :supersede
                             :if-does-not-exist :create)
        (dolist (name '("*BUILD-PREMIUM*" "PREMIUM" "COMPOSE" "PAINT"
                        "DRAW-FIGURE-CFORMS" "FILL-POLYGON" "DRAW-LIST"
                        "DRAW-FN" "PLAN-REPLACE" "PLACE-ARM"
                        "SET-UP-SCREEN-SIZE" "KCAT-CC-UPGRADE"
                        "KCAT-UPGRADE" "KCAT-CURRENT-DAY-TIME" "INIT-RANDOM"
                        "RANDOM-INT" "NEW-RANDOM-FLOAT" "?RSEED?" "RSEED"
                        "SEED" "FIXSEED" "NEWSEED" "SMALL-IMAGE-SCREEN-WIDTH"
                        "SMALL-IMAGE-SCREEN-HEIGHT" "*RANDOM-STATE*"
                        "*INTERNAL-RANDOM-STATE*" "COPY-IMAGES" "SCREEN-AND-STORE"))
          (let ((matches nil))
            (do-all-symbols (symbol)
              (when (string-equal name (symbol-name symbol))
                (push (list (package-name (symbol-package symbol))
                            (boundp symbol))
                      matches)))
            (format report "~A => ~S~%" name (nreverse matches))
            (finish-output report))))
    (condition (condition)
      (with-open-file (error-report "C:\\temp\\aaron-premium-introspection-error.txt"
                                   :direction :output
                                   :if-exists :supersede
                                   :if-does-not-exist :create)
        (format error-report "~A~%" condition)
        (finish-output error-report))))
  (format t "~&AARON premium flag patch loaded; packages: ~S~%"
          (nreverse matches))
  (finish-output))
