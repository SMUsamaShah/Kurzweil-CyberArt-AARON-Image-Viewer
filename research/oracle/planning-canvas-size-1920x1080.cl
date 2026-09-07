;;; Controlled canvas-state holdout: request 1920x1080 before the trace loads.
;;; The trace itself is staged at C:\temp\planning-call-trace.cl by the
;;; dedicated workflow. This file does not seed or otherwise instrument RNG.
(in-package :cl-user)

(defun aaron-set-matching-value (name value)
  (do-all-symbols (symbol)
    (when (and (string-equal name (symbol-name symbol))
               (not (constantp symbol)))
      (handler-case (set symbol value)
        (condition () nil)))))

(with-open-file (marker "C:\\temp\\aaron-canvas-size-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (format marker "BEGIN planning-canvas-size-1920x1080~%")
  (format marker "REQUESTED-SIZE 1920 1080~%")
  (finish-output marker))

(aaron-set-matching-value "*BUILD-PREMIUM*" t)
(aaron-set-matching-value "SMALL-IMAGE-SCREEN-WIDTH" 1920)
(aaron-set-matching-value "SMALL-IMAGE-SCREEN-HEIGHT" 1080)
(load "C:\\temp\\planning-call-trace.cl")

(with-open-file (marker "C:\\temp\\aaron-canvas-size-loaded.txt"
                       :direction :output
                       :if-exists :append
                       :if-does-not-exist :create)
  (format marker "TRACE-SOURCE-LOADED T~%")
  (finish-output marker))
