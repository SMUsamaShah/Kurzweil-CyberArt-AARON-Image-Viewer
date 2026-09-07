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

(let* ((user-package (find-package "CL-USER"))
       (seed-symbol (and user-package
                        (find-symbol "AARON-PLANNING-SEED" user-package))))
  (aaron-random-probe-log
   (format nil "SEED-SYMBOL-FOUND ~S BOUND ~S VALUE-TYPE ~S"
           (not (null seed-symbol))
           (and seed-symbol (boundp seed-symbol))
           (and seed-symbol (boundp seed-symbol)
                (type-of (symbol-value seed-symbol))))))

(unless (and (boundp 'aaron-planning-seed)
             (integerp aaron-planning-seed))
  (error "AARON-PLANNING-SEED is not an integer"))

(aaron-random-probe-log "SEED-CHECK-PASSED")

;; Keep each runtime lookup in a separate flushed stage.  The original
;; Allegro image can terminate the process when an unavailable internal
;; symbol is touched, so a single large LET* obscures which lookup failed.
(let ((seed aaron-planning-seed))
  (aaron-random-probe-log "SEED-COPIED")
  (let ((set-rseed (and (boundp 'aaron-planning-set-rseed)
                        aaron-planning-set-rseed)))
    (aaron-random-probe-log
     (format nil "RSEED-OPTION-READ ~S" (not (null set-rseed))))
    (let ((excl-package (find-package "EXCL")))
      (aaron-random-probe-log
       (format nil "EXCL-PACKAGE-FOUND ~S" (not (null excl-package))))
      (let ((factory (and excl-package
                          (find-symbol "MAKE-RANDOM-STATE-FROM-SEED"
                                      excl-package))))
        (aaron-random-probe-log
         (format nil "FACTORY-SYMBOL-FOUND ~S" (not (null factory))))
        (let ((common-lisp-package (find-package "COMMON-LISP")))
          (aaron-random-probe-log
           (format nil "COMMON-LISP-PACKAGE-FOUND ~S"
                   (not (null common-lisp-package))))
          (let ((random-state-symbol
                  (and common-lisp-package
                       (find-symbol "*RANDOM-STATE*"
                                    common-lisp-package))))
            (aaron-random-probe-log
             (format nil "RANDOM-STATE-SYMBOL-FOUND ~S"
                     (not (null random-state-symbol))))
            (let ((callable nil)
                  (state nil)
                  (constructor-error nil))
              (handler-case
                  (setf callable (and factory (fboundp factory)))
                (condition (problem)
                  (setf constructor-error (type-of problem))
                  (aaron-random-probe-log
                   (format nil "FBOUNDP-ERROR-TYPE ~S" constructor-error))))
              (aaron-random-probe-log
               (format nil "FACTORY-CALLABLE ~S" (not (null callable))))
              (when callable
                (aaron-random-probe-log "STATE-CONSTRUCTOR-CALL-BEGIN")
                (handler-case
                    ;; Call the dynamically found symbol directly. This is
                    ;; the form used by the validated random-reference probe.
                    (setf state (funcall factory seed))
                  (condition (problem)
                    (setf constructor-error (type-of problem))
                    (aaron-random-probe-log
                     (format nil "STATE-CONSTRUCTOR-ERROR-TYPE ~S"
                             constructor-error))))
                (aaron-random-probe-log
                 (format nil "STATE-CONSTRUCTOR-CALL-END STATE-FOUND ~S"
                         (not (null state)))))
              (unless (and state random-state-symbol)
                (error "Could not resolve Allegro seeded random state constructor"))
              (when (constantp random-state-symbol)
                (error "COMMON-LISP:*RANDOM-STATE* is unexpectedly constant"))
              ;; Do not assign this object to EXCL::*INTERNAL-RANDOM-STATE*:
              ;; the census shows that variable is a BIGNUM, not a
              ;; RANDOM-STATE object.
              (set random-state-symbol state)
              (let ((rseed-count 0))
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
                  (finish-output marker))))))))))

(load "C:\\temp\\planning-call-trace.cl")

(defun aaron-random-state-preview ()
  ;; Preview a copy only.  The engine's live state is never advanced by this
  ;; diagnostic, so the following INIT-RANDOM/RAN calls remain untouched.
  (handler-case
      (let* ((common-lisp-package (find-package "COMMON-LISP"))
             (random-state-symbol
               (and common-lisp-package
                    (find-symbol "*RANDOM-STATE*" common-lisp-package)))
             (state (and random-state-symbol
                         (boundp random-state-symbol)
                         (symbol-value random-state-symbol)))
             (copy (and state (make-random-state state))))
        (if copy
            (list :random-100-1 (random 100 copy)
                  :random-100-2 (random 100 copy)
                  :random-100-3 (random 100 copy))
          (list :unavailable t)))
    (condition (problem)
      (list :error (type-of problem)))))

(defun aaron-random-state-snapshot ()
  (let ((rows nil))
    (do-all-symbols (symbol)
      (when (member (symbol-name symbol)
                    '("*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*" "?RSEED?")
                    :test #'string-equal)
        (handler-case
            (let* ((is-bound (boundp symbol))
                   (name (symbol-name symbol))
                   (raw-value (and is-bound (symbol-value symbol))))
              (push (list :package (and (symbol-package symbol)
                                        (package-name (symbol-package symbol)))
                          :name name
                          :bound is-bound
                          :type (and is-bound (type-of raw-value))
                          :value (cond
                                   ((and (string-equal name "?RSEED?")
                                         (stringp raw-value))
                                    (subseq raw-value 0
                                            (min 64 (length raw-value))))
                                   ((and (string-equal name "?RSEED?")
                                         (numberp raw-value))
                                    raw-value)
                                   (t nil)))
                    rows))
          (condition () nil))))
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

(defun aaron-random-rseed-path ()
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (symbol (and owner (find-symbol "?RSEED?" owner))))
    (and symbol (boundp symbol) (symbol-value symbol))))

(defun aaron-random-rseed-file-summary ()
  (handler-case
      (let ((path (aaron-random-rseed-path)))
        (if (and (stringp path) (probe-file path))
            (with-open-file (stream path :direction :input)
              (list :exists t
                    :bytes (file-length stream)
                    :first-line (read-line stream nil nil)))
          (list :exists nil :path path)))
    (condition (problem)
      (list :error (type-of problem)))))

(defun aaron-random-print-length ()
  (and (boundp '*print-length*) (symbol-value '*print-length*)))

(defun aaron-random-install-seed (seed)
  ;; Controlled intervention used only after the original INIT-RANDOM has
  ;; returned.  It changes the visible Common Lisp state and leaves Allegro's
  ;; internal bignum state untouched, matching the validated seed-only setup.
  (handler-case
      (let* ((excl-package (find-package "EXCL"))
             (factory (and excl-package
                           (find-symbol "MAKE-RANDOM-STATE-FROM-SEED"
                                       excl-package)))
             (common-lisp-package (find-package "COMMON-LISP"))
             (random-state-symbol
               (and common-lisp-package
                    (find-symbol "*RANDOM-STATE*"
                                 common-lisp-package)))
             (state (and factory (funcall factory seed))))
        (when (and state random-state-symbol
                   (not (constantp random-state-symbol)))
          (set random-state-symbol state)
          t))
    (condition () nil)))

(defun aaron-random-set-with-unlimited-print (original-set)
  ;; SET-RANDOM binds *PRINT-LENGTH* itself, so a caller's dynamic binding is
  ;; not enough.  Temporarily wrap the standard PRINT function and bind the
  ;; printer inside that wrapper.  Restore the function cell even when the
  ;; original save routine signals.
  (let* ((common-lisp-package (find-package "COMMON-LISP"))
         (print-symbol (and common-lisp-package
                           (find-symbol "PRINT" common-lisp-package)))
         (original-print (and print-symbol
                              (fboundp print-symbol)
                              (symbol-function print-symbol))))
    (unless original-print
      (error "Could not resolve COMMON-LISP:PRINT"))
    (unwind-protect
        (progn
          (setf (symbol-function print-symbol)
                (lambda (&rest args)
                  (let ((*print-length* nil))
                    (apply original-print args))))
          (funcall original-set))
      (setf (symbol-function print-symbol) original-print))))

(defun aaron-random-file-roundtrip (original-set original-get original-ran)
  ;; SET-RANDOM and GET-RANDOM are not part of ordinary startup.  Exercise
  ;; them only after INIT-RANDOM has completed, in a disposable process, to
  ;; determine whether the visible rseed file is a usable state checkpoint.
  (unless (boundp 'aaron-random-file-roundtrip-done)
    (set 'aaron-random-file-roundtrip-done t)
    (aaron-random-emit "RSEED-ROUNDTRIP-BEGIN")
    (aaron-random-emit
     (format nil "RSEED-PRINT-LENGTH-BEFORE ~S"
             (aaron-random-print-length)))
    (aaron-random-emit
     (format nil "RSEED-FILE-BEFORE ~S"
             (aaron-random-rseed-file-summary)))
    (handler-case
        (progn
          (funcall original-set)
          (aaron-random-emit "RSEED-SET-DEFAULT SUCCEEDED")
          (aaron-random-emit
           (format nil "RSEED-FILE-AFTER-DEFAULT ~S"
                   (aaron-random-rseed-file-summary)))
          ;; A complete RANDOM-STATE requires all 624 vector elements.  If
          ;; SET-RANDOM honors the dynamic print setting, this second file is
          ;; a valid replay candidate; if it still truncates, that is itself
          ;; evidence about the original save format.
          (aaron-random-set-with-unlimited-print original-set)
          (aaron-random-emit "RSEED-SET-UNLIMITED SUCCEEDED")
          (aaron-random-emit
           (format nil "RSEED-FILE-AFTER-UNLIMITED ~S"
                   (aaron-random-rseed-file-summary)))
          (let ((before (aaron-random-state-preview)))
            (multiple-value-list (funcall original-ran 0 100))
            (aaron-random-emit
             (format nil "RSEED-ADVANCE PREVIEW-BEFORE ~S" before))
            (aaron-random-emit
             (format nil "RSEED-ADVANCE PREVIEW-AFTER ~S"
                     (aaron-random-state-preview))))
          (handler-case
              (progn
                (funcall original-get)
                (aaron-random-emit "RSEED-GET SUCCEEDED")
                (aaron-random-emit
                 (format nil "RSEED-GET PREVIEW-AFTER ~S"
                         (aaron-random-state-preview))))
            (condition (problem)
              (aaron-random-emit
               (format nil "RSEED-GET ERROR-TYPE ~S"
                       (type-of problem))))))
      (condition (problem)
        (aaron-random-emit
         (format nil "RSEED-ROUNDTRIP ERROR-TYPE ~S"
                 (type-of problem)))))
    (aaron-random-emit "RSEED-ROUNDTRIP-END")))

(unless (boundp 'aaron-ran-sample-count)
  (set 'aaron-ran-sample-count 0))
(set 'aaron-ran-sample-count 0)
(unless (boundp 'aaron-ran-sample-limit)
  (set 'aaron-ran-sample-limit 32))

(unless (boundp 'aaron-random-observers-installed)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (init-symbol (and owner (find-symbol "INIT-RANDOM" owner)))
         (ran-symbol (and owner (find-symbol "RAN" owner)))
         (day-symbol (and owner (find-symbol "KCAT-CURRENT-DAY-TIME" owner)))
         (file-symbol (and owner (find-symbol "SET-FILE-ADDRESSES" owner)))
         (set-symbol (and owner (find-symbol "SET-RANDOM" owner)))
         (get-symbol (and owner (find-symbol "GET-RANDOM" owner))))
    (unless (and init-symbol (fboundp init-symbol)
                 ran-symbol (fboundp ran-symbol))
      (error "Could not resolve INIT-RANDOM and engine-local RAN"))
    (let ((original-init (symbol-function init-symbol))
          (original-ran (symbol-function ran-symbol))
          (original-day (and day-symbol (fboundp day-symbol)
                             (symbol-function day-symbol)))
          (original-file (and file-symbol (fboundp file-symbol)
                              (symbol-function file-symbol)))
          (original-set (and set-symbol (fboundp set-symbol)
                             (symbol-function set-symbol)))
          (original-get (and get-symbol (fboundp get-symbol)
                             (symbol-function get-symbol))))
      (setf (symbol-function init-symbol)
            (lambda (&rest args)
              (aaron-random-emit
               (format nil "INIT-BEFORE STATE ~S"
                       (aaron-random-state-snapshot)))
              (aaron-random-emit
               (format nil "STATE-PREVIEW INIT-BEFORE ~S"
                       (aaron-random-state-preview)))
              (multiple-value-prog1
                  (apply original-init args)
                (aaron-random-emit
                 (format nil "INIT-AFTER STATE ~S"
                         (aaron-random-state-snapshot)))
                (aaron-random-emit
                 (format nil "STATE-PREVIEW INIT-AFTER ~S"
                         (aaron-random-state-preview)))
                (when (and (boundp 'aaron-planning-reseed-after-init)
                           aaron-planning-reseed-after-init
                           (boundp 'aaron-planning-seed)
                           (integerp aaron-planning-seed))
                  (let ((installed
                          (aaron-random-install-seed aaron-planning-seed)))
                    (aaron-random-emit
                     (format nil "POST-INIT-RESEED INSTALLED ~S" installed))
                    (aaron-random-emit
                     (format nil "STATE-PREVIEW POST-INIT-RESEED ~S"
                             (aaron-random-state-preview)))))
                (when (and (boundp 'aaron-planning-rseed-roundtrip)
                           aaron-planning-rseed-roundtrip
                           original-set original-get original-ran)
                  (aaron-random-file-roundtrip
                   original-set original-get original-ran)))))
      (setf (symbol-function ran-symbol)
            (lambda (&rest args)
              ;; The original RAN is called exactly once and all values are
              ;; returned. Logging is capped and never draws from the state.
              (let ((values (multiple-value-list (apply original-ran args))))
                (when (< aaron-ran-sample-count aaron-ran-sample-limit)
                  (incf aaron-ran-sample-count)
                  (aaron-random-emit
                   (format nil "RAN-SAMPLE ~D ARGS ~S VALUES ~S"
                           aaron-ran-sample-count args values)))
                ;; planning-call-trace.cl publishes this bounded stack as a
                ;; diagnostic bridge.  Keep it on a separate line so existing
                ;; RAN-SAMPLE fixtures remain byte-for-byte parseable.
                (when (and (<= aaron-ran-sample-count aaron-ran-sample-limit)
                           (boundp 'aaron-trace-current-stack))
                  (aaron-random-emit
                   (format nil "RAN-CONTEXT ~D STACK ~S"
                           aaron-ran-sample-count
                           aaron-trace-current-stack)))
                (values-list values))))
      (when original-day
        (setf (symbol-function day-symbol)
              (lambda (&rest args)
                (aaron-random-emit
                 (format nil "CURRENT-DAY-TIME-BEFORE ARGS ~S" args))
                (let ((values (multiple-value-list (apply original-day args))))
                  (aaron-random-emit
                   (format nil "CURRENT-DAY-TIME-AFTER VALUES ~S" values))
                  (values-list values)))))
      (when original-file
        (setf (symbol-function file-symbol)
              (lambda (&rest args)
                (aaron-random-emit
                 (format nil "SET-FILE-ADDRESSES-BEFORE STATE ~S"
                         (aaron-random-state-snapshot)))
                (multiple-value-prog1
                    (apply original-file args)
                  (aaron-random-emit
                   (format nil "SET-FILE-ADDRESSES-AFTER STATE ~S"
                           (aaron-random-state-snapshot)))))))
      (when original-set
        (setf (symbol-function set-symbol)
              (lambda (&rest args)
                (aaron-random-emit
                 (format nil "SET-RANDOM-BEFORE ARGS ~S" args))
                (multiple-value-prog1
                    (apply original-set args)
                  (aaron-random-emit "SET-RANDOM-AFTER")))))
      (when original-get
        (setf (symbol-function get-symbol)
              (lambda (&rest args)
                (aaron-random-emit
                 (format nil "GET-RANDOM-BEFORE ARGS ~S" args))
                (multiple-value-prog1
                    (apply original-get args)
                  (aaron-random-emit "GET-RANDOM-AFTER")))))
    (set 'aaron-random-observers-installed t))))

(aaron-random-emit
 (format nil "PRE-INIT STATE ~S" (aaron-random-state-snapshot)))
(aaron-random-emit
 (format nil "STATE-PREVIEW PRE-INIT ~S" (aaron-random-state-preview)))
