;;; Shared seed-only planning probe.
;;;
;;; The small wrapper files set AARON-PLANNING-SEED and load this file.  This
;;; file resolves Allegro's seed constructor dynamically, installs the state
;;; only in CL:*RANDOM-STATE*, loads the normal planning trace, and then adds
;;; bounded observers around the already-installed INIT-RANDOM wrapper and
;;; engine-local RAN.  It never calls RANDOM/RAN merely to identify a state.
(in-package :cl-user)

(with-open-file (marker "C:\\temp\\aaron-random-seed-loaded.txt"
                       :direction :output
                       :if-exists :supersede
                       :if-does-not-exist :create)
  (write-line "SOURCE-ENTERED T" marker)
  (finish-output marker))

(defun aaron-random-probe-log (line)
  (handler-case
      (with-open-file (marker "C:\\temp\\aaron-random-seed-loaded.txt"
                             :direction :output
                             :if-exists :append
                             :if-does-not-exist :create)
        (write-line line marker)
        (finish-output marker))
    (condition () nil)))

(unless (and (boundp 'aaron-planning-seed)
             (integerp aaron-planning-seed))
  (error "AARON-PLANNING-SEED is not an integer"))

(let* ((seed aaron-planning-seed)
       (set-rseed (and (boundp 'aaron-planning-set-rseed)
                       aaron-planning-set-rseed))
       (excl-package (find-package "EXCL"))
       (factory (and excl-package
                     (find-symbol "MAKE-RANDOM-STATE-FROM-SEED"
                                 excl-package)))
       (state (and factory
                   (fboundp factory)
                   (handler-case
                       ;; Call the dynamically found symbol directly. This is
                       ;; the form used by the validated random-reference
                       ;; probe and avoids depending on Allegro's function
                       ;; cell representation for an internal symbol.
                       (funcall factory seed)
                     (condition (problem)
                       (aaron-random-probe-log
                        (format nil "STATE-CONSTRUCTOR-ERROR-TYPE ~S"
                                (type-of problem)))
                       nil))))
       (common-lisp-package (find-package "COMMON-LISP"))
       (random-state-symbol (and common-lisp-package
                                 (find-symbol "*RANDOM-STATE*"
                                             common-lisp-package)))
       (rseed-count 0))
  (aaron-random-probe-log
   (format nil "FACTORY-FOUND ~S FBOUNDP ~S STATE-FOUND ~S RANDOM-STATE-SYMBOL ~S"
           (not (null factory)) (and factory (fboundp factory))
           (not (null state)) (not (null random-state-symbol))))
  (unless (and factory (fboundp factory) state random-state-symbol)
    (error "Could not resolve Allegro seeded random state constructor"))
  (when (constantp random-state-symbol)
    (error "COMMON-LISP:*RANDOM-STATE* is unexpectedly constant"))
  ;; Do not assign this object to EXCL::*INTERNAL-RANDOM-STATE*: the census
  ;; shows that variable is a BIGNUM, not a RANDOM-STATE object.
  (set random-state-symbol state)
  (when set-rseed
    (do-all-symbols (symbol)
      (when (and (string-equal "?RSEED?" (symbol-name symbol))
                 (not (constantp symbol)))
        (handler-case
            (progn (set symbol seed) (incf rseed-count))
          (condition () nil)))))
  (with-open-file (marker "C:\\temp\\aaron-random-seed-loaded.txt"
                         :direction :output
                         :if-exists :append
                         :if-does-not-exist :create)
    (format marker "BEGIN planning-random-seed~%")
    (format marker "SEED ~D~%" seed)
    (format marker "STATE-CONSTRUCTOR-RESOLVED T~%")
    (format marker "STATE-INSTALLED-IN COMMON-LISP:*RANDOM-STATE* T~%")
    (format marker "RSEED-REQUESTED ~S~%" (not (null set-rseed)))
    (format marker "RSEED-SYMBOLS-SET ~D~%" rseed-count)
    (finish-output marker)))

(load "C:\\temp\\planning-call-trace.cl")

(defun aaron-random-state-snapshot ()
  (let ((rows nil))
    (do-all-symbols (symbol)
      (when (member (symbol-name symbol)
                    '("*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*" "?RSEED?")
                    :test #'string-equal)
        (handler-case
            (let ((is-bound (boundp symbol))
                  (name (symbol-name symbol)))
              (push (list :package (and (symbol-package symbol)
                                        (package-name (symbol-package symbol)))
                          :name name
                          :bound is-bound
                          :type (and is-bound (type-of (symbol-value symbol)))
                          :value (when (and is-bound
                                            (string-equal name "?RSEED?")
                                            (numberp (symbol-value symbol)))
                                   (symbol-value symbol)))
                    rows))
          (condition () nil)))
    (nreverse rows)))

(defun aaron-random-emit (line)
  (handler-case
      (with-open-file (report "C:\\temp\\aaron-random-samples.txt"
                              :direction :output
                              :if-exists :append
                              :if-does-not-exist :create)
        (write-line line report)
        (finish-output report))
    (condition () nil)))

(unless (boundp 'aaron-ran-sample-count)
  (set 'aaron-ran-sample-count 0))
(set 'aaron-ran-sample-count 0)

(unless (boundp 'aaron-random-observers-installed)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (init-symbol (and owner (find-symbol "INIT-RANDOM" owner)))
         (ran-symbol (and owner (find-symbol "RAN" owner))))
    (unless (and init-symbol (fboundp init-symbol)
                 ran-symbol (fboundp ran-symbol))
      (error "Could not resolve INIT-RANDOM and engine-local RAN"))
    (let ((original-init (symbol-function init-symbol))
          (original-ran (symbol-function ran-symbol)))
      (setf (symbol-function init-symbol)
            (lambda (&rest args)
              (aaron-random-emit
               (format nil "INIT-BEFORE STATE ~S"
                       (aaron-random-state-snapshot)))
              (multiple-value-prog1
                  (apply original-init args)
                (aaron-random-emit
                 (format nil "INIT-AFTER STATE ~S"
                         (aaron-random-state-snapshot))))))
      (setf (symbol-function ran-symbol)
            (lambda (&rest args)
              ;; The original RAN is called exactly once and all values are
              ;; returned. Logging is capped and never draws from the state.
              (let ((values (multiple-value-list (apply original-ran args))))
                (when (< aaron-ran-sample-count 32)
                  (incf aaron-ran-sample-count)
                  (aaron-random-emit
                   (format nil "RAN-SAMPLE ~D ARGS ~S VALUES ~S"
                           aaron-ran-sample-count args values)))
                (values-list values))))))
    (set 'aaron-random-observers-installed t)))

(aaron-random-emit
 (format nil "PRE-INIT STATE ~S" (aaron-random-state-snapshot)))
