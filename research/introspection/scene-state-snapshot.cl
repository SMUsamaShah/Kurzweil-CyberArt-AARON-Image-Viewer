;;; Read-only scene-state snapshots around the normal planning/drawing path.
;;;
;;; This companion loads the existing bounded call trace first, then wraps
;;; only RPARSE, DRAW-CFORM, SCREEN-AND-STORE, and MAIN.  The wrappers retain
;;; the original argument/return path and only inspect package-qualified
;;; bindings.  No PLAN is manufactured, no slot writer is called, and no
;;; object printer or unbounded list traversal is used.
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

  ;; The focused call trace supplies the already-validated transparent
  ;; wrappers.  The dedicated workflow stages this file at C:\\temp.
  (load "C:\\temp\\planning-call-trace.cl")

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
         (installed-count 0)
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
         (install (name kind)
           (handler-case
               (let ((symbol (and owner (find-symbol name owner))))
                 (cond
                   ((null symbol)
                    (emit-form "TARGET-MISSING name=~A" name)
                    nil)
                   ((not (fboundp symbol))
                    (emit-form "TARGET-UNBOUND name=~A" name)
                    nil)
                   (t
                    (let ((original (symbol-function symbol)))
                      (setf (symbol-function symbol)
                            (cond
                              ((eq kind :rparse)
                               (lambda (&rest args)
                                 (incf rparse-depth)
                                 ;; UNWIND-PROTECT keeps the depth balanced
                                 ;; across THROW/RETURN-FROM.  Do not catch or
                                 ;; re-signal conditions from the original;
                                 ;; the observer must not alter restart/error
                                 ;; behavior.
                                 (unwind-protect
                                     (multiple-value-prog1
                                         (apply original args)
                                       (when (and (= rparse-depth 1)
                                                  (not after-rparse))
                                         (setf after-rparse t)
                                         (emit-line "BOUNDARY label=AFTER-RPARSE")
                                         (snapshot "AFTER-RPARSE")))
                                   (decf rparse-depth))))
                              ((eq kind :draw-cform)
                               (lambda (&rest args)
                                 (if after-rparse
                                     (unless first-draw-cform
                                       (setf first-draw-cform t)
                                       (emit-line "BOUNDARY label=FIRST-DRAW-CFORM")
                                       (snapshot "FIRST-DRAW-CFORM"))
                                   (unless pre-draw-written
                                     (setf pre-draw-written t)
                                     (emit-line "BOUNDARY-NOT-OBSERVED label=FIRST-DRAW-CFORM reason=PRE-RPARSE-BOUNDARY")))
                                 (apply original args)))
                              ((eq kind :screen-and-store)
                               (lambda (&rest args)
                                 (if after-rparse
                                     (unless first-screen-and-store
                                       (setf first-screen-and-store t)
                                       (emit-line "BOUNDARY label=FIRST-SCREEN-AND-STORE")
                                       (snapshot "FIRST-SCREEN-AND-STORE"))
                                   (unless pre-screen-written
                                     (setf pre-screen-written t)
                                     (emit-line "BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=PRE-RPARSE-BOUNDARY")))
                                 (apply original args)))
                              ((eq kind :main)
                               (lambda (&rest args)
                                 (let ((returned nil))
                                   ;; Cleanup runs for nonlocal exits as well;
                                   ;; it only emits missing observations and
                                   ;; never catches/re-signals the original
                                   ;; condition or throw.
                                   (unwind-protect
                                       (multiple-value-prog1
                                           (apply original args)
                                         (setf returned t))
                                     (unless finalized
                                       (setf finalized t)
                                       (let ((reason (if returned "MAIN-RETURNED" "MAIN-EXIT")))
                                         (unless after-rparse
                                           (emit-form "BOUNDARY-NOT-OBSERVED label=AFTER-RPARSE reason=~A" reason))
                                         (unless first-draw-cform
                                           (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-DRAW-CFORM reason=~A" reason))
                                         (unless first-screen-and-store
                                           (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=~A" reason))
                                         (emit-line "END scene-state-snapshot"))))))
                              (t original)))
                      (incf installed-count)
                      (when (or (string= name "RPARSE")
                                (string= name "DRAW-CFORM")
                                (string= name "SCREEN-AND-STORE"))
                        (incf required-installed-count))
                      (when (string= name "MAIN")
                        (setf main-installed t))
                      (emit-form "TARGET-INSTALLED name=~A actual-package=~A actual-name=~A kind=~A"
                                 name (safe-package-name (symbol-package symbol))
                                 (symbol-name symbol) kind)
                      original))))
             (condition (problem)
               (emit-form "TARGET-INSTALL-ERROR name=~A type=~A"
                          name (safe-type-token problem))
               nil)))))
      (with-open-file (report report-path
                              :direction :output
                              :if-exists :append
                              :if-does-not-exist :create)
        (write-line "TRACE-LOADED" report)
        (finish-output report))
      ;; Keep an explicit checkpoint on each installation boundary.  The
      ;; first Windows holdout reached TRACE-LOADED and then stopped without
      ;; an error record, so the next disposable run must distinguish a
      ;; setter/closure failure from an append/report failure.
      (format t "~&SCENE-INSTALL-BEGIN RPARSE~%")
      (finish-output)
      (emit-line "INSTALL-BEGIN name=RPARSE")
      (install "RPARSE" :rparse)
      (format t "~&SCENE-INSTALL-DONE RPARSE~%")
      (finish-output)
      (emit-line "INSTALL-DONE name=RPARSE")
      (format t "~&SCENE-INSTALL-BEGIN DRAW-CFORM~%")
      (finish-output)
      (emit-line "INSTALL-BEGIN name=DRAW-CFORM")
      (install "DRAW-CFORM" :draw-cform)
      (format t "~&SCENE-INSTALL-DONE DRAW-CFORM~%")
      (finish-output)
      (emit-line "INSTALL-DONE name=DRAW-CFORM")
      (format t "~&SCENE-INSTALL-BEGIN SCREEN-AND-STORE~%")
      (finish-output)
      (emit-line "INSTALL-BEGIN name=SCREEN-AND-STORE")
      (install "SCREEN-AND-STORE" :screen-and-store)
      (format t "~&SCENE-INSTALL-DONE SCREEN-AND-STORE~%")
      (finish-output)
      (emit-line "INSTALL-DONE name=SCREEN-AND-STORE")
      ;; MAIN is only a finalization checkpoint; it does not inspect or alter
      ;; the scene.  The three required target markers remain distinct.
      (format t "~&SCENE-INSTALL-BEGIN MAIN~%")
      (finish-output)
      (emit-line "INSTALL-BEGIN name=MAIN")
      (install "MAIN" :main)
      (format t "~&SCENE-INSTALL-DONE MAIN~%")
      (finish-output)
      (emit-line "INSTALL-DONE name=MAIN")
      (if (and (= required-installed-count 3) main-installed)
          (progn
            (emit-form "READY required-targets=3 installed-targets=~D" required-installed-count)
            (emit-line "PROBE-READY"))
        (emit-form "NOT-READY required-targets=3 installed-targets=~D main-installed=~A"
                   required-installed-count (if main-installed "T" "NIL"))))))
