;;; Bounded clean-room observation wrapper for the original RAN-HAND helper.
;;;
;;; This is loaded after planning-random-seed-common.cl.  It records the
;;; helper's arguments, return values, joint-variable bindings, and visible
;;; RAN sample counter without changing the original function's values or
;;; random source.  The wrapper is deliberately limited to one zero-argument
;;; helper so the broad planning trace remains an independent control.
(in-package :cl-user)

;; This marker is deliberately outside the one-time guard.  It distinguishes
;; a source-load failure from a wrapper that loaded but could not resolve the
;; target function.  Keep it in a separate file so the report's superseding
;; stream cannot erase the checkpoint.
(handler-case
    (with-open-file (marker "C:\\temp\\aaron-ran-hand-source-entered.txt"
                           :direction :output
                           :if-exists :supersede
                           :if-does-not-exist :create)
      (write-line "SOURCE-ENTERED T" marker)
      (finish-output marker))
  (condition () nil))

(unless (boundp 'aaron-ran-hand-trace-loaded)
  (set 'aaron-ran-hand-trace-loaded t)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (symbol (and owner (find-symbol "RAN-HAND" owner)))
         (report-path "C:\\temp\\aaron-ran-hand-trace.txt")
         (event-limit 256)
         (event-count 0)
         (binding-names
           '("TJ3X" "TJ2X" "TJ1Z" "TJ1Y"
             "FJ3X" "FJ2X" "FJ1X" "FJ1Z"
             "IJ3X" "IJ2X" "IJ1X" "IJ1Z"
             "MJ3X" "MJ2X" "MJ1X" "MJ1Z"
             "PJ3X" "PJ2X" "PJ1X" "PJ1Z")))
    (labels
        ((safe-summary (value)
           (handler-case
               (cond
                 ((numberp value) value)
                 ((symbolp value)
                  (list :symbol
                        (and (symbol-package value)
                             (package-name (symbol-package value)))
                        (symbol-name value)))
                 ((stringp value) (list :string-length (length value)))
                 ((vectorp value) (list :vector-type (type-of value)
                                         :length (length value)))
                 ((consp value)
                  (let ((rest value) (count 0))
                    (do ()
                        ((or (null rest) (>= count 8))
                         (list :list-length-at-most count
                               :truncated (not (null rest))))
                      (setf rest (cdr rest))
                      (incf count))))
                 (t (list :type (type-of value))))
             (condition () (list :type :summary-error))))
         (binding-summary (name)
           (handler-case
               (let ((binding (and owner (find-symbol name owner))))
                 (cond
                   ((null binding) (list name :missing-symbol))
                   ((not (boundp binding)) (list name :unbound))
                   (t (list name (type-of (symbol-value binding))
                            (safe-summary (symbol-value binding))))))
             (condition (problem)
               (list name :binding-error (type-of problem)))))
         (bindings-summary ()
           (let ((rest binding-names) (result nil))
             (do ()
                 ((null rest) (nreverse result))
               (push (binding-summary (car rest)) result)
               (setf rest (cdr rest)))))
         (sample-count ()
           (and (boundp 'aaron-ran-sample-count)
                aaron-ran-sample-count))
         (emit (control &rest args)
           (handler-case
               (with-open-file (stream report-path
                                       :direction :output
                                       :if-exists :append
                                       :if-does-not-exist :create)
                 (apply #'format stream control args)
                 (finish-output stream))
             (condition () nil))))
      (with-open-file (stream report-path
                              :direction :output
                              :if-exists :supersede
                              :if-does-not-exist :create)
        (write-line "BEGIN ran-hand-trace" stream)
        (format stream "TARGET-PRESENT ~S~%"
                (not (null symbol)))
        (format stream "TARGET-FBOUNDP ~S~%"
                (and symbol (fboundp symbol)))
        (format stream "EVENT-LIMIT ~D~%" event-limit)
        (finish-output stream))
      (unless (and symbol (fboundp symbol))
        (error "Could not resolve COMMON-GRAPHICS-USER:RAN-HAND"))
      (let ((original (symbol-function symbol)))
        (setf (symbol-function symbol)
              (lambda (&rest args)
                (let ((before-count (sample-count))
                      (before-bindings (bindings-summary))
                      (event-number nil))
                  (when (< event-count event-limit)
                    (incf event-count)
                    (setf event-number event-count))
                  (handler-case
                      (let ((values (multiple-value-list
                                      (apply original args))))
                        (when event-number
                          (emit "HAND-CALL ~D SAMPLE-BEFORE ~S SAMPLE-AFTER ~S ARGS ~S VALUES ~S BEFORE ~S AFTER ~S~%"
                                event-number before-count (sample-count)
                                args values before-bindings
                                (bindings-summary)))
                        (values-list values))
                    (condition (problem)
                      (when event-number
                        (emit "HAND-ERROR ~D SAMPLE-BEFORE ~S SAMPLE-AFTER ~S ARGS ~S TYPE ~S BEFORE ~S AFTER ~S~%"
                              event-number before-count (sample-count)
                              args (type-of problem) before-bindings
                              (bindings-summary)))
                      (error problem))))))
        (emit "TARGET-INSTALLED T TYPE ~S~%" (type-of original)))
      (emit "TRACE-READY T~%"))))
