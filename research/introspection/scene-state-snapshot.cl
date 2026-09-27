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
         (pre-screen-written nil)
         (writer-enabled (and (boundp 'aaron-planning-extra-targets)
                              (member "PREP-LINE"
                                      (symbol-value 'aaron-planning-extra-targets)
                                      :test #'string=)))
         (writer-stream-enabled (and (boundp 'aaron-scene-writer-stream-enabled)
                                     (symbol-value 'aaron-scene-writer-stream-enabled)))
         (writer-sequence-limit (and (boundp 'aaron-scene-writer-sequence-limit)
                                     (symbol-value 'aaron-scene-writer-sequence-limit)))
         (writer-sequence-windows (and (boundp 'aaron-scene-writer-sequence-windows)
                                       (symbol-value 'aaron-scene-writer-sequence-windows)))
         (writer-sequence-total 0)
         (writer-sequence-recorded 0)
         (writer-sequence-active nil)
         (writer-selector-counts nil)
         (writer-full-enabled (and (boundp 'aaron-scene-writer-full-enabled)
                                   (symbol-value 'aaron-scene-writer-full-enabled)))
         (writer-full-limit 50000)
         (writer-full-total 0)
         (writer-full-recorded 0)
         (writer-full-overflow nil)
         (writer-full-active nil)
         (writer-full-stream nil)
         (first-prep-enter nil)
         (first-prep-exit nil)
         (first-store-enter nil)
         (first-store-exit nil)
         (transition-targets (and (boundp 'aaron-scene-transition-targets)
                                  (symbol-value 'aaron-scene-transition-targets)))
         (transition-depths nil)
         (transition-exits nil)
         (display-protocol-depth nil)
         (display-protocol-exit nil)
         (return-targets (and (boundp 'aaron-planning-return-targets)
                              (symbol-value 'aaron-planning-return-targets)))
         (return-seen nil)
         (script-nonnil-return-seen nil)
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
         (paint-brush-id-token (value)
           ;; COMMON-GRAPHICS:ID was exercised on PAINT-BRUSH in the retained
           ;; brush-accessor probe. Use it only in this optional selector
           ;; control, after checking the exact object type.
           (handler-case
               (let* ((graphics (find-package "COMMON-GRAPHICS"))
                      (id (and graphics (find-symbol "ID" graphics)))
                      (brush-type (and owner (find-symbol "PAINT-BRUSH" owner))))
                 (when (and id brush-type (fboundp id)
                            (typep value brush-type))
                   (safe-number-token (funcall (symbol-function id) value))))
             (condition () "READER-ERROR")))
         (emit-vispt (index value)
           ;; These three readers were exercised on VISPT in the retained
           ;; FREE-PATH validation. Only observe a naturally passed point.
           (handler-case
               (let ((point-type (and owner (find-symbol "VISPT" owner)))
                     (x (and owner (find-symbol "X" owner)))
                     (y (and owner (find-symbol "Y" owner)))
                     (vis (and owner (find-symbol "VIS" owner))))
                 (when (and point-type x y vis
                            (typep value point-type)
                            (fboundp x) (fboundp y) (fboundp vis))
                   (emit-form "ARGUMENT-VISPT index=~D x=~A y=~A vis=~A"
                              index
                              (shallow-token (funcall (symbol-function x) value))
                              (shallow-token (funcall (symbol-function y) value))
                              (shallow-token (funcall (symbol-function vis) value)))))
             (condition ()
               (emit-form "ARGUMENT-VISPT-ERROR index=~D" index))))
         (emit-writer-stream ()
           ;; FILE-POSITION is queried on the existing stream. No stream is
           ;; rebound, read, flushed, or consumed by this observer.
           (handler-case
               (let ((symbol (and owner (find-symbol "*TEMP*" owner))))
                 (cond
                   ((null symbol)
                    (emit-line "WRITER-STREAM status=MISSING type=NONE output=UNKNOWN position=UNAVAILABLE"))
                   ((not (boundp symbol))
                    (emit-line "WRITER-STREAM status=UNBOUND type=UNBOUND output=UNKNOWN position=UNAVAILABLE"))
                   (t
                    (let ((value (symbol-value symbol)))
                      (if (streamp value)
                          (let ((position (handler-case (file-position value)
                                            (condition () :error)))
                                (output (handler-case (output-stream-p value)
                                          (condition () :error))))
                            (emit-form "WRITER-STREAM status=STREAM type=~A output=~A position=~A"
                                       (safe-type-token value)
                                       (cond ((eq output :error) "ERROR")
                                             (output "T") (t "NIL"))
                                       (cond ((integerp position)
                                              (safe-number-token position))
                                             ((null position) "NIL")
                                             (t "ERROR"))))
                        (emit-form "WRITER-STREAM status=NONSTREAM type=~A output=UNKNOWN position=UNAVAILABLE"
                                   (safe-type-token value)))))))
             (condition ()
               (emit-line "WRITER-STREAM status=ERROR type=ERROR output=UNKNOWN position=ERROR"))))
         (writer-position-token ()
           (handler-case
               (let ((symbol (and owner (find-symbol "*TEMP*" owner))))
                 (if (and symbol (boundp symbol)
                          (streamp (symbol-value symbol)))
                     (let ((position (file-position (symbol-value symbol))))
                       (if (integerp position)
                           (safe-number-token position)
                         "UNAVAILABLE"))
                   "UNAVAILABLE"))
             (condition () "ERROR")))
         (writer-point-fields (value)
           (handler-case
               (let* ((vispt-type (and owner (find-symbol "VISPT" owner)))
                      (tript-type (and owner (find-symbol "TRIPT" owner)))
                      (twopt-type (and owner (find-symbol "TWOPT" owner)))
                      (vispt-p (and vispt-type (typep value vispt-type)))
                      (tript-p (and tript-type (typep value tript-type)))
                      (twopt-p (and twopt-type (typep value twopt-type)))
                     (x (and owner (find-symbol "X" owner)))
                     (y (and owner (find-symbol "Y" owner)))
                     (vis (and owner (find-symbol "VIS" owner))))
                 ;; The retained point-bearing STORE-IN-FILE methods read X/Y
                 ;; from TRIPT and TWOPT. VIS is only established for VISPT.
                 (if (and (or vispt-p tript-p twopt-p) x y
                          (fboundp x) (fboundp y))
                     (list (string-trim '(#\Space #\Tab)
                                        (safe-number-token (funcall (symbol-function x) value)))
                           (string-trim '(#\Space #\Tab)
                                        (safe-number-token (funcall (symbol-function y) value)))
                           (if (and vispt-p vis (fboundp vis))
                               (string-trim '(#\Space #\Tab)
                                            (safe-number-token (funcall (symbol-function vis) value)))
                             "UNAVAILABLE"))
                   '("UNAVAILABLE" "UNAVAILABLE" "UNAVAILABLE")))
             (condition () '("ERROR" "ERROR" "ERROR"))))
         (writer-previous-fields ()
           (handler-case
               (let ((symbol (and owner (find-symbol "PREV-STORED-PT" owner))))
                 (if (and symbol (boundp symbol))
                     (writer-point-fields (symbol-value symbol))
                   '("UNAVAILABLE" "UNAVAILABLE" "UNAVAILABLE")))
             (condition () '("ERROR" "ERROR" "ERROR"))))
         (writer-file-size-token ()
           (handler-case
               (let ((symbol (and owner (find-symbol "?FILE-SIZE?" owner))))
                 (cond ((null symbol) "MISSING")
                       ((not (boundp symbol)) "UNBOUND")
                       (t (shallow-token (symbol-value symbol)))))
             (condition () "ERROR")))
         (writer-sequence-selected-p (ordinal)
           (if writer-sequence-windows
               (some (lambda (window)
                       (and (<= (first window) ordinal)
                            (< ordinal (+ (first window) (second window)))))
                     writer-sequence-windows)
             (< ordinal writer-sequence-limit)))
         (writer-keyword-argument (plist key)
           ;; Other STORE-IN-FILE selectors need not use VECTOR's keyword
           ;; argument shape. Preserve the call and report missing details.
           (handler-case (getf plist key)
             (condition () nil)))
         (writer-global-number-token (name)
           (handler-case
               (let ((symbol (and owner (find-symbol name owner))))
                 (if (and symbol (boundp symbol)
                          (numberp (symbol-value symbol)))
                     (string-trim '(#\Space #\Tab)
                                  (safe-number-token (symbol-value symbol)))
                   "UNAVAILABLE"))
             (condition () "ERROR")))
         (writer-full-open ()
           (unless writer-full-stream
             (setf writer-full-stream
                   (open "C:\\temp\\aaron-writer-full.txt"
                         :direction :output :if-exists :supersede
                         :if-does-not-exist :create))
             (write-line "BEGIN writer-full" writer-full-stream)))
         (writer-full-scalar-token (selector plist)
           (let* ((key (cond ((and (symbolp selector)
                                  (string= (symbol-name selector) "BRUSH")) :width)
                             ((and (symbolp selector)
                                   (member (symbol-name selector)
                                           '("AARGB" "HUE") :test #'string=)) :hdex)))
                  (value (and key (writer-keyword-argument plist key))))
             (if (numberp value)
                 (string-trim '(#\Space #\Tab) (safe-number-token value))
               "UNAVAILABLE")))
         (writer-full-enter (ordinal entry-depth args)
           (writer-full-open)
           (let* ((selector (car args))
                  (plist (cdr args))
                  (pta (writer-point-fields (writer-keyword-argument plist :pta)))
                  (ptb (writer-point-fields (writer-keyword-argument plist :ptb)))
                  (previous (writer-previous-fields)))
             (format writer-full-stream
                     "WRITER-FULL-ENTER ordinal=~D depth=~D selector=~A redraw=~A pta-x=~A pta-y=~A pta-vis=~A ptb-x=~A ptb-y=~A ptb-vis=~A scalar=~A previous-x=~A previous-y=~A previous-vis=~A file-size=~A pic-wide=~A pic-high=~A position=~A~%"
                     ordinal entry-depth
                     (if (symbolp selector) (symbol-name selector) "NON-SYMBOL")
                     (if (writer-keyword-argument plist :redraw) "T" "NIL")
                     (first pta) (second pta) (third pta)
                     (first ptb) (second ptb) (third ptb)
                     (writer-full-scalar-token selector plist)
                     (first previous) (second previous) (third previous)
                     (writer-file-size-token)
                     (writer-global-number-token "*PIC-WIDE*")
                     (writer-global-number-token "*PIC-HIGH*")
                     (writer-position-token))
             (push (cons entry-depth ordinal) writer-full-active)
             (when (zerop (mod writer-full-recorded 128))
               (finish-output writer-full-stream))))
         (writer-full-exit (event entry-depth)
           (let ((entry (assoc entry-depth writer-full-active :test #'eql)))
             (when entry
               (let ((previous (writer-previous-fields)))
                 (format writer-full-stream
                         "WRITER-FULL-EXIT ordinal=~D depth=~D status=~A previous-x=~A previous-y=~A previous-vis=~A position=~A~%"
                         (cdr entry) entry-depth
                         (if (eq event :exit) "SUCCESS" "ERROR")
                         (first previous) (second previous) (third previous)
                         (writer-position-token)))
               (setf writer-full-active
                     (remove entry writer-full-active :count 1 :test #'eq)))))
         (emit-writer-sequence-enter (index ordinal entry-depth args)
           (let* ((selector (car args))
                  (plist (cdr args))
                  (pta (writer-point-fields (writer-keyword-argument plist :pta)))
                  (ptb (writer-point-fields (writer-keyword-argument plist :ptb)))
                  (previous (and writer-sequence-windows (writer-previous-fields))))
             (emit-form "WRITER-CALL-ENTER index=~D~A depth=~D selector=~A redraw=~A pta-x=~A pta-y=~A pta-vis=~A ptb-x=~A ptb-y=~A ptb-vis=~A position=~A~A~A"
                        index
                        (if writer-sequence-windows
                            (format nil " ordinal=~D" ordinal) "")
                        entry-depth
                        (if (symbolp selector) (symbol-name selector) "NON-SYMBOL")
                        (if (writer-keyword-argument plist :redraw) "T" "NIL")
                        (first pta) (second pta) (third pta)
                        (first ptb) (second ptb) (third ptb)
                        (writer-position-token)
                        (if previous
                            (format nil " previous-x=~A previous-y=~A previous-vis=~A"
                                    (first previous) (second previous) (third previous))
                          "")
                        (if writer-sequence-windows
                            (format nil " file-size=~A" (writer-file-size-token))
                          ""))
             ;; A sampled selector can use positional values instead of
             ;; VECTOR's :PTA/:PTB plist. Observe the existing arguments only;
             ;; never call a reader on an unverified object type.
             (when writer-sequence-windows
               (let ((rest args) (slot 0))
                 (do ()
                     ((or (null rest) (>= slot 8)))
                   (let* ((value (car rest))
                          (point (writer-point-fields value))
                          (summary (substitute #\_ #\Space (value-token value))))
                     (emit-form "WRITER-CALL-ARG index=~D slot=~D type=~A summary=~A x=~A y=~A vis=~A"
                                index slot (safe-type-token value) summary
                                (first point) (second point) (third point)))
                   (incf slot)
                   (setf rest (cdr rest)))))))
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
         (snapshot (label &optional args)
           (handler-case
               (progn
                 (emit-form "SNAPSHOT-BEGIN label=~A" label)
                 (let ((rest state-names) (rows 0))
                   (do ()
                       ((null rest))
                     (emit-binding (car rest))
                     (incf rows)
                     (setf rest (cdr rest)))
                   (let ((rest args) (index 0))
                     (do ()
                         ((or (null rest) (>= index 8)))
                       (emit-form "ARGUMENT index=~D type=~A summary=~A"
                                  index (safe-type-token (car rest))
                                  (value-token (car rest)))
                       (when (and writer-stream-enabled
                                  (string= label "FIRST-STORE-IN-FILE-ENTER"))
                         (emit-vispt index (car rest)))
                       (when (member "SELECT-BRUSH" return-targets :test #'string=)
                         (let ((id (paint-brush-id-token (car rest))))
                           (when id
                             (emit-form "ARGUMENT-BRUSH-ID index=~D value=~A"
                                        index id))))
                       (incf index)
                       (setf rest (cdr rest))))
                   (when (member "SELECT-BRUSH" return-targets :test #'string=)
                     (let ((brush-symbol (and owner (find-symbol "BRUSH" owner))))
                       (when (and brush-symbol (boundp brush-symbol))
                         (let ((id (paint-brush-id-token
                                    (symbol-value brush-symbol))))
                           (when id (emit-form "BRUSH-ID value=~A" id))))))
                   (when (and writer-stream-enabled
                              (or (string= label "FIRST-STORE-IN-FILE-ENTER")
                                  (string= label "FIRST-STORE-IN-FILE-EXIT")))
                     (emit-writer-stream))
                   ;; There is no verified PLAN reader allowlist in the
                   ;; retained evidence.  Keep this explicit and separate
                   ;; from the 15 binding rows.
                   (emit-line "PLAN-ACCESSORS-SKIPPED reason=NO-VERIFIED-READERS")
                   (emit-form "SNAPSHOT-END label=~A rows=~D" label rows)))
             (condition ()
               (emit-form "SNAPSHOT-ERROR label=~A" label))))
         (display-active-p ()
           (let ((stack (and (boundp 'aaron-trace-current-stack)
                             (symbol-value 'aaron-trace-current-stack))))
             (and (listp stack)
                  (member "DISPLAY-COLOR-PATCHES" stack :test #'string=))))
         (finish-probe (reason)
           (unless finalized
             (setf finalized t)
             (unless after-rparse
               (emit-form "BOUNDARY-NOT-OBSERVED label=AFTER-RPARSE reason=~A" reason))
             (unless first-draw-cform
               (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-DRAW-CFORM reason=~A" reason))
             (unless (or first-screen-and-store pre-screen-written)
               (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=~A" reason))
             (when writer-enabled
               (unless first-prep-enter
                 (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-PREP-LINE-ENTER reason=~A" reason))
               (unless first-prep-exit
                 (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-PREP-LINE-EXIT reason=~A" reason))
               (unless first-store-enter
                 (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-STORE-IN-FILE-ENTER reason=~A" reason))
               (unless first-store-exit
                 (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-STORE-IN-FILE-EXIT reason=~A" reason)))
             (let ((rest transition-targets))
               (do ()
                   ((null rest))
                 (let ((name (car rest)))
                   (unless (assoc name transition-depths :test #'string=)
                     (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-~A-ENTER reason=~A"
                                name reason))
                   (unless (member name transition-exits :test #'string=)
                     (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-~A-EXIT reason=~A"
                                name reason)))
                 (setf rest (cdr rest))))
             (when (member "DISPLAY-COLOR-PATCHES" transition-targets
                           :test #'string=)
               (unless display-protocol-depth
                 (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-DISPLAY-PROTOCOL-ENTER reason=~A"
                            reason))
               (unless display-protocol-exit
                 (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-DISPLAY-PROTOCOL-EXIT reason=~A"
                            reason)))
             (let ((rest return-targets))
               (do ()
                   ((null rest))
                 (let ((name (car rest)))
                   (unless (member name return-seen :test #'string=)
                     (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-~A-RETURN reason=~A"
                                name reason)))
                 (setf rest (cdr rest))))
             (when (and (member "SCRIPT" return-targets :test #'string=)
                        (not script-nonnil-return-seen))
               (emit-form "BOUNDARY-NOT-OBSERVED label=FIRST-SCRIPT-NONNIL-RETURN reason=~A"
                          reason))
             (when writer-sequence-limit
               (emit-form "WRITER-SEQUENCE-SUMMARY total=~D recorded=~D limit=~D"
                          writer-sequence-total
                          writer-sequence-recorded
                          writer-sequence-limit)
               (when writer-sequence-windows
                 (dolist (row (reverse writer-selector-counts))
                   (emit-form "WRITER-SELECTOR-SUMMARY selector=~A count=~D first-ordinal=~D"
                              (first row) (second row) (third row)))))
             (when writer-full-enabled
               (writer-full-open)
               (format writer-full-stream
                       "WRITER-FULL-SUMMARY total=~D recorded=~D limit=~D overflow=~A~%"
                       writer-full-total writer-full-recorded writer-full-limit
                       (if writer-full-overflow "T" "NIL"))
               (write-line "END writer-full" writer-full-stream)
               (finish-output writer-full-stream)
               (close writer-full-stream)
               (setf writer-full-stream nil))
             (emit-line "END scene-state-snapshot")))
         (scene-observer (event name args entry-depth)
           ;; The trace invokes this callback inside its own condition guard.
           ;; Keep this function defensive because it must never alter the
           ;; original engine's call, return, or condition path.
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
                            name (safe-package-name owner) name name))
                ((and writer-enabled
                      (or (string= name "PREP-LINE")
                          (string= name "STORE-IN-FILE")))
                 (emit-form "TARGET-INSTALLED name=~A actual-package=~A actual-name=~A kind=~A"
                            name (safe-package-name owner) name name))
                ((member name transition-targets :test #'string=)
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
              ;; The first DRAW-CFORM may precede the outermost RPARSE return.
              ;; Capture its entry regardless of that ordering, so the report
              ;; preserves the real boundary rather than losing this state.
              (unless first-draw-cform
                (setf first-draw-cform t)
                (emit-line "BOUNDARY label=FIRST-DRAW-CFORM")
                (snapshot "FIRST-DRAW-CFORM")))
             ((and (eq event :enter) (string= name "SCREEN-AND-STORE"))
              (if after-rparse
                  (unless first-screen-and-store
                    (setf first-screen-and-store t)
                    (emit-line "BOUNDARY label=FIRST-SCREEN-AND-STORE")
                    (snapshot "FIRST-SCREEN-AND-STORE"))
                (unless pre-screen-written
                  (setf pre-screen-written t)
                  (emit-line "BOUNDARY-NOT-OBSERVED label=FIRST-SCREEN-AND-STORE reason=PRE-RPARSE-BOUNDARY"))))
             ((and writer-enabled (eq event :enter) (string= name "PREP-LINE"))
              (unless first-prep-enter
                (setf first-prep-enter t)
                (emit-line "BOUNDARY label=FIRST-PREP-LINE-ENTER")
                (snapshot "FIRST-PREP-LINE-ENTER" args)))
             ((and writer-enabled (eq event :exit) (string= name "PREP-LINE"))
              (unless first-prep-exit
                (setf first-prep-exit t)
                (emit-line "BOUNDARY label=FIRST-PREP-LINE-EXIT")
                (snapshot "FIRST-PREP-LINE-EXIT")))
             ((and writer-enabled (eq event :enter) (string= name "STORE-IN-FILE"))
              (when writer-full-enabled
                (let ((ordinal writer-full-total))
                  (incf writer-full-total)
                  (if (< ordinal writer-full-limit)
                      (progn
                        (incf writer-full-recorded)
                        (writer-full-enter ordinal entry-depth args))
                    (setf writer-full-overflow t))))
              (when writer-sequence-limit
                (let ((ordinal writer-sequence-total))
                  (incf writer-sequence-total)
                  (when writer-sequence-windows
                    (let* ((selector (car args))
                           (name (if (symbolp selector)
                                     (symbol-name selector) "NON-SYMBOL"))
                           (row (assoc name writer-selector-counts :test #'string=)))
                      (if row (incf (second row))
                        (push (list name 1 ordinal) writer-selector-counts))))
                  (when (writer-sequence-selected-p ordinal)
                    (let ((index writer-sequence-recorded))
                      (incf writer-sequence-recorded)
                      (push (cons entry-depth index) writer-sequence-active)
                      (emit-writer-sequence-enter index ordinal entry-depth args)))))
              (unless first-store-enter
                (setf first-store-enter t)
                (emit-line "BOUNDARY label=FIRST-STORE-IN-FILE-ENTER")
                (snapshot "FIRST-STORE-IN-FILE-ENTER" args)))
             ((and writer-enabled (or (eq event :exit) (eq event :error))
                   (string= name "STORE-IN-FILE"))
              (when writer-full-enabled
                (writer-full-exit event entry-depth))
              (when writer-sequence-limit
                (let ((entry (assoc entry-depth writer-sequence-active :test #'eql)))
                  (when entry
                    (let ((previous (and writer-sequence-windows
                                         (writer-previous-fields))))
                      (emit-form "WRITER-CALL-EXIT index=~D depth=~D status=~A position=~A~A"
                                 (cdr entry) entry-depth
                                 (if (eq event :exit) "SUCCESS" "ERROR")
                                 (writer-position-token)
                                 (if previous
                                     (format nil " previous-x=~A previous-y=~A previous-vis=~A"
                                             (first previous) (second previous) (third previous))
                                   "")))
                    (setf writer-sequence-active
                          (remove entry writer-sequence-active :count 1 :test #'eq)))))
              (when (and (eq event :exit) (not first-store-exit))
                (setf first-store-exit t)
                (emit-line "BOUNDARY label=FIRST-STORE-IN-FILE-EXIT")
                (snapshot "FIRST-STORE-IN-FILE-EXIT")))
             ((and (member "DISPLAY-COLOR-PATCHES" transition-targets
                           :test #'string=)
                   (eq event :enter)
                   (string= name "PROTOCOL") (display-active-p))
              (unless display-protocol-depth
                (setf display-protocol-depth entry-depth)
                (emit-line "BOUNDARY label=FIRST-DISPLAY-PROTOCOL-ENTER")
                (snapshot "FIRST-DISPLAY-PROTOCOL-ENTER" args)))
             ((and (member "DISPLAY-COLOR-PATCHES" transition-targets
                           :test #'string=)
                   (eq event :exit)
                   (string= name "PROTOCOL") (display-active-p))
              (when (and display-protocol-depth
                         (eql display-protocol-depth entry-depth)
                         (not display-protocol-exit))
                (setf display-protocol-exit t)
                (emit-line "BOUNDARY label=FIRST-DISPLAY-PROTOCOL-EXIT")
                (snapshot "FIRST-DISPLAY-PROTOCOL-EXIT")))
             ((and (eq event :return)
                   (member name return-targets :test #'string=))
              (when (and (string= name "SCRIPT")
                         args (car args) (not script-nonnil-return-seen))
                (setf script-nonnil-return-seen t)
                (emit-line "BOUNDARY label=FIRST-SCRIPT-NONNIL-RETURN")
                (snapshot "FIRST-SCRIPT-NONNIL-RETURN" args))
              (unless (member name return-seen :test #'string=)
                (push name return-seen)
                (emit-form "BOUNDARY label=FIRST-~A-RETURN" name)
                (snapshot (format nil "FIRST-~A-RETURN" name) args)))
             ((and (eq event :enter)
                   (member name transition-targets :test #'string=))
              (unless (assoc name transition-depths :test #'string=)
                (push (cons name entry-depth) transition-depths)
                (emit-form "BOUNDARY label=FIRST-~A-ENTER" name)
                (snapshot (format nil "FIRST-~A-ENTER" name) args)))
             ((and (eq event :exit)
                   (member name transition-targets :test #'string=))
              (let ((entry (assoc name transition-depths :test #'string=)))
                (when (and entry
                           (eql (cdr entry) entry-depth)
                           (not (member name transition-exits :test #'string=)))
                  (push name transition-exits)
                  (emit-form "BOUNDARY label=FIRST-~A-EXIT" name)
                  (snapshot (format nil "FIRST-~A-EXIT" name)))))
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
