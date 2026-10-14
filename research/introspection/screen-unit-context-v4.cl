;;; Source-bound context observer for the third natural SCREEN-AND-STORE unit.
;;; Load this as the runner's pre-scene probe.  Its post-event hook is captured
;;; by planning-call-trace.cl; the trace remains the sole wrapper for the
;;; traced AARON functions.  The only direct wrapper here is engine-local RAN.
(in-package :cl-user)

(unless (boundp 'aaron-screen-unit-context-v4-loaded)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (ran-symbol (and owner (find-symbol "RAN" owner)))
         (report (open "C:\\temp\\aaron-screen-unit-context-v4.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (report-open t)
         (next-id 0)
         (frames nil)
         (store-ordinal 0)
         (rparse-depth 0)
         (after-rparse nil)
         (screen-ordinal 0)
         (selected-screen-id nil)
         (selected-ancestry-ids nil)
         (selected-screen-closed nil)
         (selected-screen-success nil)
         (selected-prep-count 0)
         (selected-store-count 0)
         (selected-first-writer-ordinal nil)
         (selected-last-writer-ordinal nil)
         (selected-ran-count 0)
         (ran-recorded 0)
         (ran-limit 10000)
         (ran-overflow-written nil)
         (row-count 0)
         (row-limit 100000)
         (row-overflow-written nil)
         (observer-errors 0)
         (ready-written nil)
         (main-finalized nil)
         (ran-installed nil)
         (ran-original nil)
         (optional-installed nil)
         (previous-hook (and (boundp 'aaron-planning-post-event-hook)
                             (symbol-value 'aaron-planning-post-event-hook)))
         (required-installed nil)
         (required-targets '("MAIN" "RPARSE" "SCREEN-AND-STORE"
                             "PREP-LINE" "STORE-IN-FILE")))
    (labels ((emit (control &rest arguments)
               (when report-open
                 (handler-case
                     (let ((*print-length* 64)
                           (*print-level* 10)
                           (*print-pretty* nil)
                           (*print-circle* t))
                       (apply #'format report control arguments)
                       (terpri report)
                       (finish-output report))
                   (condition () nil))))
             (finish-report ()
               (when report-open
                 (handler-case (finish-output report) (condition () nil))
                 (handler-case (close report) (condition () nil))
                 (setf report-open nil)))
             (safe-summary (value &optional (level 0))
               (handler-case
                   (cond
                     ((numberp value) (list :number (type-of value) value))
                     ((symbolp value)
                      (list :symbol
                            (and (symbol-package value)
                                 (package-name (symbol-package value)))
                            (symbol-name value)))
                     ((stringp value) (list :string-length (length value)))
                     ((and (consp value) (< level 3))
                      (let ((rest value) (items nil) (count 0))
                        (do () ((or (null rest) (not (consp rest))
                                    (>= count 8)))
                          (push (safe-summary (car rest) (1+ level)) items)
                          (setf rest (cdr rest))
                          (incf count))
                        (list :cons (nreverse items)
                              :tail (cond ((null rest) :nil)
                                          ((consp rest) :more)
                                          (t (type-of rest))))))
                     ((consp value) :cons-depth-limit)
                     ((arrayp value)
                      (list :array-type (type-of value)
                            :rank (array-rank value)
                            :dimensions (array-dimensions value)))
                     (t (list :object-type (type-of value))))
                 (condition (problem)
                   (list :summary-error (type-of problem)))))
             (frame-id (frame) (first frame))
             (frame-parent (frame) (second frame))
             (frame-name (frame) (third frame))
             (frame-depth (frame) (fourth frame))
             (frame-args (frame) (fifth frame))
             (color-write-frame-p (frame)
               (let ((summary (prin1-to-string (frame-args frame))))
                 (and (search "AARGB" summary) (search "HDEX" summary))))
             (next-call-id () (incf next-id))
             (current-parent-id ()
               (and frames (frame-id (car frames))))
             (frame-for (name entry-depth)
               (find-if (lambda (frame)
                          (and (string= (frame-name frame) name)
                               (eql (frame-depth frame) entry-depth)))
                        frames))
             (selected-frame-active-p ()
               (and selected-screen-id
                    (find selected-screen-id frames
                          :key #'frame-id :test #'eql)))
             (binding-summary (name)
               (handler-case
                   (let ((symbol (and owner (find-symbol name owner))))
                     (cond
                       ((null symbol) (list :name name :missing t))
                       ((not (boundp symbol)) (list :name name :bound nil))
                       (t (list :name name :bound t
                                :value (safe-summary (symbol-value symbol))))))
                 (condition (problem)
                   (list :name name :binding-error (type-of problem)))))
             (context-summary ()
               (mapcar #'binding-summary
                       '("MPLAN" "PREFS" "CFLIST" "COLORDEX" "RPLANE"
                         "BRUSH" "BRUSH-PATH" "CDEX" "SDEX" "HDEX"
                         "BOUNDARY-VALUE" "WIDTH" "PERIM" "CORE"
                         "IN-SUB-FRAME" "RGB-MAP" "FILL-MAP" "PATCH-MAP"
                         "PREVDEX")))
             (emit-ancestry ()
               (dolist (frame (reverse frames))
                 (emit "ANCESTOR id=~D parent-id=~A name=~A trace-depth=~A args=~S"
                       (frame-id frame)
                       (or (frame-parent frame) "NIL")
                       (frame-name frame) (frame-depth frame)
                       (frame-args frame))))
             (emit-call-enter (frame &optional writer-ordinal)
               (if (< row-count row-limit)
                   (progn
                     (incf row-count)
                     (emit "CALL-ENTER id=~D parent-id=~A name=~A trace-depth=~A writer-ordinal=~A args=~S"
                           (frame-id frame)
                           (or (frame-parent frame) "NIL")
                           (frame-name frame) (frame-depth frame)
                           (or writer-ordinal "NIL") (frame-args frame)))
                 (unless row-overflow-written
                   (setf row-overflow-written t)
                   (emit "OVERFLOW call-rows limit=~D" row-limit))))
             (emit-call-end (frame status)
               (if (< row-count row-limit)
                   (progn
                     (incf row-count)
                     (emit "CALL-END id=~D parent-id=~A name=~A trace-depth=~A status=~A"
                           (frame-id frame)
                           (or (frame-parent frame) "NIL")
                           (frame-name frame) (frame-depth frame) status))
                 (unless row-overflow-written
                   (setf row-overflow-written t)
                   (emit "OVERFLOW call-rows limit=~D" row-limit))))
             (maybe-ready ()
               (when (and ran-installed (not ready-written)
                          (every (lambda (name)
                                   (member name required-installed :test #'string=))
                                 required-targets))
                 (setf ready-written t)
                 (emit "READY screen-unit-context-v4 targets=~S optional-targets-installed=~S ran=T"
                       (reverse required-installed) (reverse optional-installed))))
             (finish-main (status)
               (unless main-finalized
                 (setf main-finalized t)
                 (if (and ready-written selected-screen-id
                          selected-screen-closed selected-screen-success
                          (> selected-prep-count 0)
                          (> selected-store-count 0)
                          (not row-overflow-written)
                          (not ran-overflow-written)
                          (zerop observer-errors)
                          (string= status "SUCCESS"))
                     (emit "COMPLETE unit-id=~D prep-count=~D store-count=~D writer-first=~A writer-last=~A ran-count=~D"
                           selected-screen-id selected-prep-count
                           selected-store-count
                           (or selected-first-writer-ordinal "NIL")
                           (or selected-last-writer-ordinal "NIL")
                           selected-ran-count)
                   (emit "INCOMPLETE main-status=~A ready=~A unit-id=~A unit-closed=~A unit-success=~A prep-count=~D store-count=~D observer-errors=~D call-overflow=~A ran-overflow=~A"
                         status (if ready-written "T" "NIL")
                         (or selected-screen-id "NIL")
                         (if selected-screen-closed "T" "NIL")
                         (if selected-screen-success "T" "NIL")
                         selected-prep-count selected-store-count
                         observer-errors
                         (if row-overflow-written "T" "NIL")
                         (if ran-overflow-written "T" "NIL")))
                 (emit "END screen-unit-context-v4")
                 (finish-report)))
             (observe-event (event name args entry-depth)
               (cond
                 ((eq event :install)
                  (when (string= name "BRUSH-STROKE")
                    (pushnew name optional-installed :test #'string=)
                    (emit "OPTIONAL-TARGET-INSTALLED name=~A" name))
                  (when (member name required-targets :test #'string=)
                    (pushnew name required-installed :test #'string=)
                    (emit "TARGET-INSTALLED name=~A" name)
                    (maybe-ready)))
                 ((and (eq event :enter) (string= name "RPARSE"))
                  (incf rparse-depth)
                  (let* ((id (next-call-id))
                         (frame (list id (current-parent-id) name entry-depth
                                      (safe-summary args))))
                    (push frame frames)
                    (when (selected-frame-active-p)
                      (emit-call-enter frame))))
                 ((eq event :enter)
                  (when (string= name "STORE-IN-FILE")
                    (incf store-ordinal))
                  (when (string= name "SCREEN-AND-STORE")
                    (incf screen-ordinal))
                  (let* ((id (next-call-id))
                         (frame (list id (current-parent-id) name entry-depth
                                      (safe-summary args)))
                         (new-unit-p (and (string= name "SCREEN-AND-STORE")
                                          after-rparse
                                          (= screen-ordinal 3)))
                         (writer-ordinal (and (string= name "STORE-IN-FILE")
                                              (1- store-ordinal))))
                    (when new-unit-p
                      (setf selected-screen-id id)
                      (setf selected-ancestry-ids (mapcar #'frame-id frames))
                      (emit "UNIT-SELECT ordinal=~D call-id=~D parent-id=~A"
                            screen-ordinal id
                            (or (current-parent-id) "NIL"))
                      (emit-ancestry)
                      (emit "UNIT-ENTER ordinal=~D id=~D parent-id=~A trace-depth=~A args=~S context=~S path-rng-source=aaron-screen-units.txt color-map-source=aaron-screen-color-data.txt writer-source=aaron-writer-full.txt"
                            screen-ordinal id
                            (or (current-parent-id) "NIL") entry-depth
                            (safe-summary args) (context-summary)))
                    (push frame frames)
                    (when (selected-frame-active-p)
                      (when (string= name "PREP-LINE")
                        (incf selected-prep-count))
                      (when (string= name "STORE-IN-FILE")
                        (incf selected-store-count)
                        (unless selected-first-writer-ordinal
                          (setf selected-first-writer-ordinal writer-ordinal))
                        (setf selected-last-writer-ordinal writer-ordinal))
                      (emit-call-enter frame writer-ordinal)
                      (when (and (string= name "STORE-IN-FILE")
                                 (color-write-frame-p frame))
                        (emit "COLOR-STATE id=~D writer-ordinal=~D args=~S context=~S"
                              (frame-id frame) writer-ordinal
                              (frame-args frame) (context-summary)))
                      (when (string= name "PREP-LINE")
                        (emit "PREP-STATE id=~D args=~S context=~S"
                              (frame-id frame) (frame-args frame)
                              (context-summary))))))
                 ((eq event :return)
                  (let ((frame (frame-for name entry-depth)))
                    (when (and frame
                               (or (selected-frame-active-p)
                                   (member (frame-id frame) selected-ancestry-ids
                                           :test #'eql)))
                      (emit "CALL-RETURN id=~D name=~A values=~S"
                            (frame-id frame) name (safe-summary args)))))
                 ((or (eq event :exit) (eq event :error))
                  (let ((frame (frame-for name entry-depth)))
                    (when frame
                      (let ((inside (or (eql (frame-id frame) selected-screen-id)
                                        (selected-frame-active-p)
                                        (member (frame-id frame)
                                                selected-ancestry-ids
                                                :test #'eql)))
                            (status (if (eq event :exit) "SUCCESS" "ERROR")))
                        (when inside (emit-call-end frame status))
                        (when (and (string= name "SCREEN-AND-STORE")
                                   (eql (frame-id frame) selected-screen-id))
                          (setf selected-screen-closed t
                                selected-screen-success (eq event :exit))
                          (emit "UNIT-EXIT id=~D status=~A prep-count=~D store-count=~D context=~S"
                                selected-screen-id status selected-prep-count
                                selected-store-count (context-summary)))
                        (when (string= name "RPARSE")
                          (when (and (eq event :exit) (= rparse-depth 1))
                            (setf after-rparse t))
                          (when (> rparse-depth 0)
                            (decf rparse-depth)))
                        (setf frames (remove frame frames :count 1 :test #'eq))
                        (when (and (string= name "MAIN")
                                   (not main-finalized))
                          (finish-main status)))))))))
      (emit "BEGIN screen-unit-context-v4")
      (emit "CAPS call-rows=~D ran-rows=~D selected-screen-ordinal=3-after-top-level-RPARSE writer-ordinal-base=0 optional-targets=(BRUSH-STROKE) parent-semantics=nearest-observed-target-not-direct-proof"
            row-limit ran-limit)
      ;; The exact additional target set exposes the brush parent while the
      ;; quiet whitelist prevents its high-fanout rows consuming the ordinary
      ;; planning trace event budget.  The post-event hook still sees it.
      (set 'aaron-planning-extra-targets
           '("PREP-LINE" "STORE-IN-FILE" "BRUSH-STROKE"))
      (set 'aaron-planning-quiet-targets '("BRUSH-STROKE"))
      (when (and ran-symbol (fboundp ran-symbol))
        (setf ran-original (symbol-function ran-symbol))
        (setf (symbol-function ran-symbol)
              (lambda (&rest args)
                (if (not (and selected-screen-id
                              (not selected-screen-closed)))
                    (apply ran-original args)
                  (let* ((id (next-call-id))
                         (parent-id (current-parent-id))
                         (frame (list id parent-id "RAN" :screen-unit
                                      (safe-summary args)))
                         (record-p (< ran-recorded ran-limit)))
                    (incf selected-ran-count)
                    (push frame frames)
                    (when record-p
                      (incf ran-recorded)
                      (emit "RAN-ENTER id=~D parent-id=~A screen-id=~D args=~S typed-args=~S context=~S"
                            id (or parent-id "NIL") selected-screen-id
                            args (mapcar #'safe-summary args) (context-summary)))
                    (when (and (not record-p) (not ran-overflow-written))
                      (setf ran-overflow-written t)
                      (emit "OVERFLOW ran-rows limit=~D" ran-limit))
                    (unwind-protect
                        (let ((values (multiple-value-list
                                       (apply ran-original args))))
                          (when record-p
                            (emit "RAN-RETURN id=~D values=~S typed-values=~S context=~S"
                                  id values (mapcar #'safe-summary values)
                                  (context-summary)))
                          (values-list values))
                      (setf frames (remove frame frames :count 1 :test #'eq)))))))
        (setf ran-installed t))
      (set 'aaron-planning-post-event-hook
           (lambda (event name args entry-depth)
             (when (functionp previous-hook)
               (handler-case
                   (funcall previous-hook event name args entry-depth)
                 (condition () nil)))
             (handler-case
                 (observe-event event name args entry-depth)
               (condition (problem)
                 (incf observer-errors)
                 (emit "OBSERVER-ERROR event=~A name=~A type=~A"
                       event name (type-of problem))))))
      (emit "INSTALL extra-targets=~S quiet-targets=~S ran=~A hook=post-event"
            '("PREP-LINE" "STORE-IN-FILE" "BRUSH-STROKE")
            '("BRUSH-STROKE") (if ran-installed "T" "NIL"))
      (when (not ran-installed)
        (emit "INSTALL-ERROR target=RAN"))
      (set 'aaron-screen-unit-context-v4-loaded t))))
