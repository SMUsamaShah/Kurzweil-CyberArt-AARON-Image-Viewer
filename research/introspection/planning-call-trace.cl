;;; Bounded call trace for the original scene/planning startup path.
;;;
;;; This probe does not call a planner with guessed arguments and does not
;;; manufacture an MPLAN object.  It installs transparent wrappers around the
;;; real entry points before the normal screen-saver command runs.  Each
;;; wrapper calls the saved function with the original arguments and preserves
;;; all multiple values; it only records bounded argument, return, condition,
;;; and binding-state summaries.  The process is disposable, so the wrappers
;;; remain installed until the oracle terminates it.
(in-package :cl-user)

(unless (boundp 'aaron-planning-call-trace-loaded)
  (set 'aaron-planning-call-trace-loaded t)
  ;; Keep a separate reader/load checkpoint.  If the guarded body is rejected
  ;; before evaluation, this marker distinguishes that failure from a runtime
  ;; trace with no calls.  It must stay inside the one-time guard because the
  ;; premium file is loaded both by clinit.cl and by the explicit -L switch.
  (with-open-file (checkpoint "C:\\temp\\aaron-planning-call-trace.txt"
                              :direction :output :if-exists :supersede
                              :if-does-not-exist :create)
    (write-line "BEGIN planning-call-trace" checkpoint)
    (write-line "STAGE-0-LOAD-FORM-REACHED" checkpoint)
    (finish-output checkpoint))
  (with-open-file (report "C:\\temp\\aaron-planning-call-trace.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "STAGE-1-SECOND-FORM-REACHED" report)
    (finish-output report)
    (let ((*print-length* 16)
          (*print-level* 6)
          (*print-circle* nil)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (event-limit 512)
          (event-count 0)
          (overflow-written nil)
          (depth 0)
          (targets
           '("MAIN" "SET-UP-SCREEN-SIZE" "SELECT-CANVAS"
             "INIT-RANDOM" "SET-RANDOM" "GET-RANDOM" "INIT-MAPS"
             "MAKE-PAINTING-COLORS" "MAKE-COLORSPEC" "MASTER-PLAN"
             "MAKE-PLAN" "MAKE-LEAF-LIST" "DEVELOP-PLAN" "PROTOCOL"
             "RPARSE" "SCRIPT" "BUILD-FIGURE" "GENERATE-PERSON"
             "MAKE-POTTED-PLANT" "SCREEN-AND-STORE"))
          (state-names
           '("MPLAN" "PREFS" "SDEX" "FIGDEX" "CFLIST" "COLORDEX"
             "BRUSH" "SCRIPT" "FILL-MAP" "RGB-MAP" "IDLIST" "CFRAME"
             "COMPLAN" "RPLANE" "PLACES"))
      (write-line "STAGE-2-LET-INITIALIZERS-REACHED" report)
      (finish-output report)
      (labels
          ((package-name-safe (symbol)
             (handler-case
                 (and (symbolp symbol)
                      (symbol-package symbol)
                      (package-name (symbol-package symbol)))
               (error () nil)))
           (symbol-summary (symbol)
             (list :symbol (package-name-safe symbol)
                   (and (symbolp symbol) (symbol-name symbol))))
           (safe-type (value)
             (handler-case (type-of value)
               (error () :type-error)))
           (safe-length (value)
             (handler-case
                 (cond
                   ((stringp value) (list :string-length (length value)))
                   ((vectorp value) (list :vector-length (length value)))
                   ((consp value)
                    (let ((rest value) (count 0))
                      (do ()
                          ((or (null rest) (>= count 16))
                           (list :list-length-at-most count
                                 :truncated (not (null rest))))
                        (setf rest (cdr rest))
                        (incf count))))
                   (t nil))
               (error () nil)))
           (bounded-summary (value &optional (level 0))
             (handler-case
                 (cond
                   ((numberp value) value)
                   ((symbolp value) (symbol-summary value))
                   ((stringp value)
                    (list :string-length (length value)))
                   ((and (consp value) (< level 3))
                    (let ((rest value) (items nil) (count 0))
                      (do ()
                          ((or (null rest) (>= count 8))
                           (list :cons (nreverse items)
                                 :truncated (not (null rest))))
                        (push (bounded-summary (car rest) (1+ level)) items)
                        (setf rest (cdr rest))
                        (incf count))))
                   ((vectorp value)
                    (list :vector-type (safe-type value)
                          :length (length value)))
                   (t (list :type (safe-type value))))
               (error () (list :type :summary-error))))
           (args-summary (args)
             (let ((rest args) (items nil) (count 0))
               (do ()
                   ((or (null rest) (>= count 12))
                    (list :args (nreverse items)
                          :truncated (not (null rest))))
                 (push (bounded-summary (car rest)) items)
                 (setf rest (cdr rest))
                 (incf count))))
           (binding-summary (name)
             (handler-case
                 (let ((symbol (and owner (find-symbol name owner))))
                   (cond
                     ((null symbol) (list :missing-symbol name))
                     ((not (boundp symbol))
                      (list :symbol (symbol-summary symbol) :bound nil))
                     (t
                      (let ((value (symbol-value symbol)))
                        (list :symbol (symbol-summary symbol)
                              :bound t
                              :type (safe-type value)
                              :shape (safe-length value))))))
               (error (problem)
                 (list :binding-error name (safe-type problem)))))
           (binding-state ()
             (let ((rest state-names) (items nil))
               (do ()
                   ((null rest) (nreverse items))
                 (push (binding-summary (car rest)) items)
                 (setf rest (cdr rest)))))
           (emit-line (line)
             ;; Diagnostics must never change the original program's result.
             (handler-case
                 (progn (write-line line report) (finish-output report))
               (error () nil)))
           (emit-form (control &rest args)
             (handler-case
                 (emit-line (apply #'format nil control args))
               (error () nil)))
           (next-event ()
             (cond
               ((< event-count event-limit)
                (incf event-count)
                t)
               ((not overflow-written)
                (setf overflow-written t)
                (emit-form "TRACE-LIMIT-REACHED ~D" event-limit)
                nil)
               (t nil)))
           (trace-enter (name args entry-depth)
             (when (next-event)
               (emit-form "TRACE-ENTER ~D DEPTH ~D NAME ~A ARGS ~S STATE ~S"
                          event-count entry-depth name (args-summary args)
                          (binding-state))))
           (trace-exit (name entry-depth)
             (when (next-event)
               (emit-form "TRACE-EXIT ~D DEPTH ~D NAME ~A STATE ~S"
                          event-count entry-depth name (binding-state))))
           (trace-error (name entry-depth problem)
             (when (next-event)
               (emit-form "TRACE-ERROR ~D DEPTH ~D NAME ~A TYPE ~S STATE ~S"
                          event-count entry-depth name (safe-type problem)
                          (binding-state))))
           (install (name)
             (handler-case
                 (let ((symbol (and owner (find-symbol name owner))))
                   (cond
                     ((null symbol)
                      (emit-form "TARGET ~A MISSING-SYMBOL" name))
                     ((not (fboundp symbol))
                      (emit-form "TARGET ~A UNBOUND-FUNCTION" name))
                     (t
                      (let ((original (symbol-function symbol)))
                        ;; Capture the function object lexically.  The wrapper
                        ;; never re-reads its own function cell, so nested
                        ;; calls go to the original exactly once per edge.
                        (setf (symbol-function symbol)
                              (lambda (&rest args)
                                (let ((entry-depth depth))
                                  (incf depth)
                                  (trace-enter name args entry-depth)
                                  (handler-case
                                      (multiple-value-prog1
                                          (apply original args)
                                        (trace-exit name entry-depth)
                                        (decf depth))
                                    (error (problem)
                                      (trace-error name entry-depth problem)
                                      (decf depth)
                                      (error problem))))))
                        (emit-form "TARGET ~A INSTALLED TYPE ~S"
                                   name (safe-type original))))))
               (error (problem)
                 (emit-form "TARGET ~A INSTALL-ERROR TYPE ~S"
                            name (safe-type problem))))))
        (emit-line "BEGIN planning-call-trace")
        (emit-form "TRACE-LIMIT ~D" event-limit)
        (emit-form "TARGETS ~S" targets)
        (emit-form "BINDINGS-BEFORE ~S" (binding-state))
        (let ((rest targets))
          (do ()
              ((null rest))
            (install (car rest))
            (setf rest (cdr rest))))
        (emit-form "BINDINGS-AFTER-INSTALL ~S" (binding-state))
        ;; This marker means the setup form completed.  Runtime trace records
        ;; are appended after it by the normal screen-saver invocation.
        (emit-line "TRACE-READY")
        (emit-line "END planning-call-trace")
        (finish-output report))))))
