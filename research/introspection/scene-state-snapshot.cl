;;; Read-only scene-state snapshots around the normal planning/drawing path.
;;;
;;; This companion attaches an observer to the existing bounded call trace.
;;; It deliberately does not redefine any function cell a second time: the
;;; trace's already-validated wrappers report the scene boundaries here while
;;; this file only inspects package-qualified bindings.  No PLAN is
;;; manufactured, no slot writer is called, and no object printer or
;;; unbounded list traversal is used.
(in-package :cl-user)

(unless (boundp 'aaron-scene-state-snapshot-loaded)
  (set 'aaron-scene-state-snapshot-loaded t)

  ;; Leave an entry marker before loading the existing trace.  If the nested
  ;; load fails, this file still distinguishes a loader failure from a probe
  ;; that never received a runtime call.
  (with-open-file (report "C:\\temp\\aaron-scene-state-snapshot.txt"
                          :direction :output
                          :if-exists :supersede
                          :if-does-not-exist :create)
    (write-line "BEGIN scene-state-snapshot" report)
    (write-line "SOURCE-ENTERED" report)
    (finish-output report))

  (let* ((report-path "C:\\temp\\aaron-scene-state-snapshot.txt")
         (owner (find-package "COMMON-GRAPHICS-USER"))
         (state-names
           '("MPLAN" "SCRIPT" "SDEX" "FIGDEX" "CFLIST" "IDLIST"
             "CFRAME" "COMPLAN" "RPLANE" "PLACES" "BRUSH" "FILL-MAP"
             "RGB-MAP" "COLORDEX" "PREFS"))
         (after-rparse nil)
         (rparse-depth 0)
         (first-draw-cform nil)
         (first-screen-and-store nil)
         (pre-draw-written nil)
         (pre-screen-written nil)
         (finalized nil)
         (required-installed-count 0)
         (main-installed nil))
    (labels
        ((emit-line (line)
           ;; Always reopen the report.  The initialization stream is closed
           ;; before the normal screensaver invocation begins.
           (handler-case
               (with-open-file (report report-path
                                       :direction :output
                                       :if-exists :append
                                       :if-does-not-exist :create)
                 (write-line line report)
                 (finish-output report))
             (condition () nil)))
         (emit-form (control &rest args)
           (handler-case
               (emit-line (apply #'format nil control args))
             (condition () nil)))
         (safe-package-name (package)
           (handler-case
               (and package (package-name package))
             (condition () "UNKNOWN-PACKAGE")))
         (safe-symbol-token (symbol)
           (handler-case
               (if (symbolp symbol)
                   (format nil "~A::~A"
                           (or (safe-package-name (symbol-package symbol))
                               "UNINTERNED")
                           (symbol-name symbol))
                 "NON-SYMBOL")
             (condition () "SYMBOL-ERROR")))
         (safe-type-token (value)
           (handler-case
               (if (symbolp (type-of value))
                   (safe-symbol-token (type-of value))
                 "TYPE-OBJECT")
             (condition () "TYPE-ERROR")))
         (safe-status-token (status)
           (cond
             ((eq status :external) "EXTERNAL")
             ((eq status :internal) "INTERNAL")
             ((eq status :inherited) "INHERITED")
             (t "NOT-FOUND")))
         (safe-number-token (value)
           (handler-case
               (cond
                 ((integerp value)
                  (if (<= (abs value) 1000000000)
                      (format nil "INT:~D" value)
                    (format nil "INT-SIGN=~A-BITS=~D"
                            (if (minusp value) "NEGATIVE" "POSITIVE")
                            (integer-length (abs value)))))
                 ((floatp value)
                  (format nil "FLOAT:~A:~G"
                          (safe-type-token value) value))
                 (t "NUMBER"))
             (condition () "NUMBER-ERROR")))
         (shallow-token (value)
           (handler-case
               (cond
                 ((null value) "NIL")
                 ((symbolp value) (format nil "SYMBOL:~A" (safe-symbol-token value)))
                 ((numberp value) (safe-number-token value))
                 ((stringp value) (format nil "STRING-LENGTH=~D" (length value)))
                 ((consp value) "CONS")
                 ((arrayp value) (format nil "ARRAY-RANK=~D" (array-rank value)))
                 (t (format nil "OBJECT:~A" (safe-type-token value))))
             (condition () "SHALLOW-ERROR")))
         (join-tokens (tokens)
           (with-output-to-string (stream)
             (let ((rest tokens) (first t))
               (do ()
                   ((null rest))
                 (unless first (write-char #\, stream))
                 (write-string (car rest) stream)
                 (setf first nil)
                 (setf rest (cdr rest))))))
         (array-token (value)
           (handler-case
               (let* ((rank (array-rank value))
                      (bounded-rank (min rank 8))
                      (dimensions nil)
                      (index 0))
                 (do ()
                     ((>= index bounded-rank))
                   (push (format nil "D~D=~D" index
                                 (array-dimension value index)) dimensions)
                   (incf index))
                 (format nil "ARRAY-RANK=~D-~A-TOTAL=~D-ELEMENT=~A"
                         rank
                         (join-tokens (nreverse dimensions))
                         (array-total-size value)
                         (shallow-token (array-element-type value))))
             (condition () "ARRAY-ERROR")))
         (cons-token (value)
           (handler-case
               (let ((rest value)
                     (steps 0)
                     (items nil)
                     (proper nil)
                     (dotted nil)
                     (capped nil))
                 (do ()
                     ((or (null rest) (not (consp rest)) (>= steps 16)))
                   (when (< steps 8)
                     (push (shallow-token (car rest)) items))
                   (setf rest (cdr rest))
                   (incf steps))
                 (cond
                   ((null rest) (setf proper t))
                   ((>= steps 16) (setf capped t))
                   (t (setf dotted t)))
                 (format nil "CONS-STEPS=~D-PROPER=~A-DOTTED=~A-CAPPED=~A-ITEMS=~A"
                         steps (if proper "T" "NIL") (if dotted "T" "NIL")
                         (if capped "T" "NIL")
                         (join-tokens (nreverse items))))
             (condition () "CONS-ERROR")))
         (value-token (value)
           (handler-case
               (cond
                 ((null value) "NIL")
                 ((symbolp value) (format nil "SYMBOL:~A" (safe-symbol-token value)))
                 ((numberp value) (safe-number-token value))
                 ((stringp value) (format nil "STRING-LENGTH=~D" (length value)))
                 ((consp value) (cons-token value))
                 ((arrayp value) (array-token value))
                 (t (format nil "OBJECT:~A" (safe-type-token value))))
             (condition () "VALUE-ERROR")))
         (emit-binding (name)
           (handler-case
               (let ((package-status (if owner "FOUND" "MISSING"))
                     (symbol nil)
                     (status nil))
                 (when owner
                   (multiple-value-setq (symbol status)
                     (find-symbol name owner)))
                 (if (null symbol)
                     (emit-form
                      "BINDING name=~A requested-package=COMMON-GRAPHICS-USER package-status=~A symbol-status=NOT-FOUND actual-package=NONE actual-name=NONE bound=NIL type=NONE summary=MISSING-SYMBOL"
                      name package-status)
                   (if (not (boundp symbol))
                       (emit-form
                        "BINDING name=~A requested-package=COMMON-GRAPHICS-USER package-status=~A symbol-status=~A actual-package=~A actual-name=~A bound=NIL type=UNBOUND summary=UNBOUND"
                        name package-status (safe-status-token status)
                        (safe-package-name (symbol-package symbol))
                        (symbol-name symbol))
                     (let ((value (symbol-value symbol)))
                       (emit-form
                        "BINDING name=~A requested-package=COMMON-GRAPHICS-USER package-status=~A symbol-status=~A actual-package=~A actual-name=~A bound=T type=~A summary=~A"
                        name package-status (safe-status-token status)
                        (safe-package-name (symbol-package symbol))
                        (symbol-name symbol) (safe-type-token value)
                        (value-token value))))))
             (condition ()
               (emit-form
                "BINDING name=~A requested-package=COMMON-GRAPHICS-USER package-status=ERROR symbol-status=ERROR actual-package=NONE actual-name=NONE bound=UNKNOWN type=ERROR summary=BINDING-ERROR"
                name))))
         (snapshot (label)
           (handler-case
               (progn
                 (emit-form "SNAPSHOT-BEGIN label=~A" label)
                 (let ((rest state-names) (rows 0))
                   (do ()
                       ((null rest))
                     (emit-binding (car rest))
                     (incf rows)
                     (setf rest (cdr rest)))
                   ;; There is no verified PLAN reader allowlist in the
                   ;; retained evidence.  Keep this explicit and separate
                   ;; from the 15 binding rows.
                   (emit-line "PLAN-ACCESSORS-SKIPPED reason=NO-VERIFIED-READERS")
                   (emit-form "SNAPSHOT-END label=~A rows=~D" label rows)))
             (condition ()
               (emit-form "SNAPSHOT-ERROR label=~A" label))))
         (finish-probe (reason)
           (unless finalized
             (setf finalized t)
             (unless after-rparse
               (emit-form "BOUNDARY-NOT-OBSERVED label=AFTER-RPARSE reason=~A" reason))
             (unless first-draw-cform
               (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-DRAW-CFORM reason=~A" reason))
             (unless first-screen-and-store
               (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=~A" reason))
             (emit-line "END scene-state-snapshot")))
         (scene-observer (event name args entry-depth)
           ;; The trace invokes this callback inside its own condition guard.
           ;; Keep this function defensive because it must never alter the
           ;; original engine's call, return, or condition path.
           (declare (ignore args entry-depth))
           (cond
             ((eq event :install)
              (cond
                ((or (string= name "RPARSE")
                     (string= name "DRAW-CFORM")
                     (string= name "SCREEN-AND-STORE"))
                 (incf required-installed-count)
                 (emit-form "TARGET-INSTALLED name=~A actual-package=~A actual-name=~A kind=~A"
                            name (safe-package-name owner) name name))
                ((string= name "MAIN")
                 (setf main-installed t)
                 (emit-form "TARGET-INSTALLED name=~A actual-package=~A actual-name=~A kind=~A"
                            name (safe-package-name owner) name name))))
             ((and (eq event :enter) (string= name "RPARSE"))
              (incf rparse-depth))
             ((and (or (eq event :exit) (eq event :error))
                   (string= name "RPARSE"))
              (unwind-protect
                  (when (and (eq event :exit)
                             (= rparse-depth 1)
                             (not after-rparse))
                    (setf after-rparse t)
                    (emit-line "BOUNDARY label=AFTER-RPARSE")
                    (snapshot "AFTER-RPARSE"))
                (when (> rparse-depth 0)
                  (decf rparse-depth))))
             ((and (eq event :enter) (string= name "DRAW-CFORM"))
              (if after-rparse
                  (unless first-draw-cform
                    (setf first-draw-cform t)
                    (emit-line "BOUNDARY label=FIRST-DRAW-CFORM")
                    (snapshot "FIRST-DRAW-CFORM"))
                (unless pre-draw-written
                  (setf pre-draw-written t)
                  (emit-line "BOUNDARY-NOT-OBSERVED label=FIRST-DRAW-CFORM reason=PRE-RPARSE-BOUNDARY"))))
             ((and (eq event :enter) (string= name "SCREEN-AND-STORE"))
              (if after-rparse
                  (unless first-screen-and-store
                    (setf first-screen-and-store t)
                    (emit-line "BOUNDARY label=FIRST-SCREEN-AND-STORE")
                    (snapshot "FIRST-SCREEN-AND-STORE"))
                (unless pre-screen-written
                  (setf pre-screen-written t)
                  (emit-line "BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=PRE-RPARSE-BOUNDARY"))))
             ((and (or (eq event :exit) (eq event :error))
                   (string= name "MAIN"))
              (finish-probe (if (eq event :exit) "MAIN-RETURNED" "MAIN-EXIT"))))))
      ;; Install the observer before loading the validated trace.  The trace
      ;; captures this function once, then invokes it for its own successful
      ;; target installations and runtime events.
      (set 'aaron-scene-state-hook #'scene-observer)
      (load "C:\\temp\\planning-call-trace.cl")
      (with-open-file (report report-path
                              :direction :output
                              :if-exists :append
                              :if-does-not-exist :create)
        (write-line "TRACE-LOADED" report)
        (finish-output report))
      ;; The trace has already installed and reported its wrapped targets via
      ;; SCENE-OBSERVER.  Do not replace those function cells again here.
      (if (and (= required-installed-count 3) main-installed)
          (progn
            (emit-form "READY required-targets=3 installed-targets=~D" required-installed-count)
            (emit-line "PROBE-READY"))
        (emit-form "NOT-READY required-targets=3 installed-targets=~D main-installed=~A"
                   required-installed-count (if main-installed "T" "NIL"))))))
