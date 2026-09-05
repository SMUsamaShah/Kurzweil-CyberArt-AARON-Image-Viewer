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

  ;; Keep a small, source-free snapshot of the relevant runtime symbols.  A
  ;; delivered Allegro image may retain compiled function names and values
  ;; even though its original Lisp source is absent.  This gives the oracle
  ;; a safe way to tell whether a lead is a variable, a function, or neither.
  (with-open-file (report "C:\\temp\\aaron-premium-introspection.txt"
                         :direction :output
                         :if-exists :supersede
                         :if-does-not-exist :create)
    (let ((*print-level* 3)
          (*print-length* 8))
      (dolist (name '("*BUILD-PREMIUM*" "PREMIUM" "COMPOSE" "PAINT"
                      "DRAW-FIGURE-CFORMS" "FILL-POLYGON" "DRAW-LIST"
                      "DRAW-FN" "PLAN-REPLACE" "PLACE-ARM"
                      "SET-UP-SCREEN-SIZE" "KCAT-CC-UPGRADE"
                      "KCAT-UPGRADE" "KCAT-CURRENT-DAY-TIME" "INIT-RANDOM"
                      "RANDOM-INT" "NEW-RANDOM-FLOAT" "?RSEED?"
                      "COPY-IMAGES" "SCREEN-AND-STORE"))
        (dolist (package (list-all-packages))
          (multiple-value-bind (symbol status) (find-symbol name package)
            (when (and symbol (eq status :internal))
              (format report "~&~A::~A bound=~S constant=~S"
                      (package-name package) name (boundp symbol) (constantp symbol))
              (when (boundp symbol)
                (handler-case
                    (format report " value=~S" (symbol-value symbol))
                  (condition (condition)
                    (format report " value-error=~A" condition))))
              (format report " fbound=~S~%" (fboundp symbol))
              (when (fboundp symbol)
                (handler-case
                    (multiple-value-bind (lambda-expression closure function-name)
                        (function-lambda-expression (symbol-function symbol))
                      (declare (ignore closure))
                      (format report "  lambda=~S function-name=~S~%"
                              lambda-expression function-name))
                  (condition (condition)
                    (format report "  lambda-error=~A~%" condition))))))))
  (finish-output))
  (format t "~&AARON premium flag patch loaded; packages: ~S~%"
          (nreverse matches))
  (finish-output)))
