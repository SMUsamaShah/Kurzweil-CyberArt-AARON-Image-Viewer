;;; Bounded natural IN-SUB-FRAME false-result census, version 2.
;;;
;;; Use as a pre-scene probe with the seed-1234 scene mode.  The seed companion
;;; is loaded here first so the lifecycle wrapper can be placed outside the
;;; already-installed scene trace; the runner's later load is a guarded no-op.
;;; The runner-visible report is staged under a dedicated name and published
;;; only after its final stream has flushed and closed.  The stage name is not
;;; evidence of acceptance.
;;; The host can load this source more than once; claim the guard before setup.
;;; Declare both the final and stage names in the runner's -ProbeOutputNames so
;;; its collision check and cleanup also cover an interrupted run.
;;; IN-SUB-FRAME is the only behavior target.  MAIN is wrapped only to delimit
;;; one scene, restore both function cells by identity, and write a strict
;;; completion footer.  The target wrapper records at most the first 1,400
;;; natural entries, then restores after all those target evaluations return.  No extra
;;; AARON function is called for observation.
(in-package :cl-user)

(unless (boundp 'aaron-in-sub-frame-initial-window-v2-loaded)
  (set 'aaron-in-sub-frame-initial-window-v2-loaded t)
  (let* ((report-path "C:\\temp\\aaron-in-sub-frame-initial-window-v2.txt")
         (report-staging-path
            "C:\\temp\\aaron-in-sub-frame-initial-window-v2-stage.txt")
         (call-window 1400)
         (report
           (handler-case
             (open report-staging-path
                     ;; The runner preflights this unique staging name.  Use
                     ;; the Allegro-supported output mode used by the other
                     ;; probes; only the final rename publishes accepted data.
                     :direction :output :if-exists :supersede
                     :if-does-not-exist :create)
             (condition () nil)))
         (staging-owned (not (null report)))
         (owner nil)
         (target-symbol nil) (target-original nil) (target-wrapper nil)
         (main-symbol nil) (main-original nil) (main-wrapper nil)
         (scene-active nil) (main-depth 0)
         (calls 0) (completed-count 0) (false-count 0) (truthy-count 0)
         (samples 0)
         (sample-truncated nil) (detail-truncated nil) (cap-noted nil)
         (errors 0) (call-aborts 0) (main-aborts 0)
         (objects 0) (object-ids (make-hash-table :test #'eq))
         (report-broken nil) (finished nil))
    (labels
        ((emit (control &rest arguments)
           (when (and report (not report-broken))
             (handler-case
                 ;; Descriptor lists are already bounded per value.  Keep the
                 ;; top-level argument/value lists untruncated so every
                 ;; argument and multiple value is represented.
                 (let ((*print-length* nil)
                       (*print-level* 16)
                       (*print-pretty* nil)
                       (*print-circle* t)
                       (*print-readably* nil))
                   (apply #'format report control arguments)
                   (terpri report)
                   (finish-output report)
                   t)
               (condition ()
                  (incf errors)
                  (setf report-broken t)
                  nil))))
         (short-string (value limit)
           (subseq value 0 (min limit (length value))))
         (symbol-record (value)
           (let* ((package (symbol-package value))
                  (package-name (and package (package-name package)))
                  (name (symbol-name value))
                  (clipped (or (> (length name) 160)
                               (and package-name (> (length package-name) 96)))))
             (when clipped (setf detail-truncated t))
             (list :symbol
                   (if package-name (short-string package-name 96) "UNINTERNED")
                   (short-string name 160) :clipped clipped)))
         (type-record (value)
           (let ((type (handler-case (type-of value) (condition () nil))))
             (if (symbolp type)
                 (symbol-record type)
               :non-symbol-type)))
         (object-id (value)
           (or (gethash value object-ids)
               (let ((id (incf objects)))
                 (setf (gethash value object-ids) id)
                 id)))
         (integer-record (value)
           (if (<= (integer-length (abs value)) 256)
               (list :integer value)
             (progn
               (setf detail-truncated t)
               (list :integer
                     (if (minusp value) :negative :positive)
                     :bits (integer-length (abs value))
                     :digits-omitted t))))
         (bounded-value (value &optional (depth 0) (seen (make-hash-table :test #'eq)))
           ;; Never invoke an AARON object's printer.  Scalars remain exact
           ;; where practical; opaque objects carry stable identity and type.
           (cond
             ((null value) :nil)
             ((integerp value) (integer-record value))
             ((rationalp value)
              (list :ratio (integer-record (numerator value))
                    (integer-record (denominator value))))
             ((floatp value)
              (list :float :type (type-record value)
                    :value (format nil "~S" value)))
             ((complexp value)
              (list :complex (bounded-value (realpart value) (1+ depth) seen)
                    (bounded-value (imagpart value) (1+ depth) seen)))
             ((characterp value) (list :character (char-code value)))
             ((symbolp value) (symbol-record value))
             ((stringp value)
              (let ((clipped (> (length value) 160)))
                (when clipped (setf detail-truncated t))
                (list :string (short-string value 160)
                      :length (length value) :clipped clipped)))
             ((consp value)
              (let ((id (object-id value)))
                (cond
                  ((gethash value seen) (list :cons :id id :repeated t))
                  ((>= depth 4)
                   (setf detail-truncated t)
                   (list :cons :id id :contents :depth-cap))
                  (t
                   (let ((tail value) (items nil) (count 0))
                     (do ()
                         ((or (not (consp tail)) (>= count 8)
                              (gethash tail seen)))
                       (setf (gethash tail seen) t)
                       (push (bounded-value (car tail) (1+ depth) seen) items)
                       (setf tail (cdr tail))
                       (incf count))
                     (let ((tail-record
                             (cond
                               ((null tail) :proper-end)
                               ((gethash tail seen) :repeated-tail)
                               ((consp tail)
                                (setf detail-truncated t)
                                :more-than-8-cells)
                               (t (list :dotted-tail
                                        (bounded-value tail (1+ depth) seen))))))
                       (list :cons :id id :items (nreverse items)
                             :tail tail-record)))))))
             ((hash-table-p value)
              (list :hash-table :id (object-id value)
                    :count (hash-table-count value)))
             ((arrayp value)
              (list :array :id (object-id value) :type (type-record value)
                    :rank (array-rank value)
                    :dimensions (array-dimensions value)))
             (t (list :object :id (object-id value)
                      :type (type-record value)))))
         (record-false (id arguments values)
           (if (< samples 128)
               (handler-case
                   (let ((argument-records (mapcar #'bounded-value arguments))
                         (value-records (mapcar #'bounded-value values)))
                     (when (emit "FALSE id=~D argc=~D args=~S value-count=~D values=~S"
                                 id (length arguments) argument-records
                                 (length values) value-records)
                       (incf samples)))
                 (condition (condition)
                   (incf errors)
                   (setf detail-truncated t)
                   (emit "SAMPLE-ERROR id=~D type=~S" id (type-record condition))))
             (progn
               (setf sample-truncated t)
               (unless cap-noted
                 (setf cap-noted t)
                 (emit "TRUNCATED kind=:FALSE-SAMPLE first-omitted=~D cap=128"
                       (1+ samples)))))
           nil)
         (restore-binding (name symbol original wrapper)
           (let ((status
                   (cond
                     ((null symbol) :missing-symbol)
                     ((not (fboundp symbol)) :unbound)
                     ((and wrapper (eq (symbol-function symbol) wrapper))
                      (handler-case
                          (progn
                            (setf (symbol-function symbol) original)
                            (if (and (fboundp symbol)
                                     (eq (symbol-function symbol) original))
                                :restored
                              :restore-check-failed))
                        (condition () :restore-error)))
                     ((and original (eq (symbol-function symbol) original))
                      :already-original)
                     (t :changed))))
             (unless (member status '(:restored :already-original))
               (incf errors))
             (emit "RESTORE name=~S status=~S" name status)
             (member status '(:restored :already-original))))
         (close-report-stream ()
           (let ((stream report))
             (setf report nil)
             (if (null stream)
                 nil
               (handler-case
                   (progn
                     (finish-output stream)
                     (close stream)
                     t)
                 (condition ()
                   (incf errors)
                   (setf report-broken t)
                    (handler-case (close stream :abort t)
                      (condition () nil))
                    nil)))))
         (cleanup-staging-file ()
           (when staging-owned
             (handler-case
                 (when (probe-file report-staging-path)
                   (delete-file report-staging-path))
               (condition () nil))
             (setf staging-owned nil)))
         (write-finished-report (status eligible target-restored main-restored)
           ;; First close all data records.  Only then write the acceptance
           ;; footer to the staging file.  Publish it under the runner's
           ;; required name only after that footer also flushes and closes.
           (let ((published nil)
                 (data-closed (close-report-stream)))
             (when (and data-closed (not report-broken))
               (setf report
                     (handler-case
                         (open report-staging-path
                               :direction :output :if-exists :append
                               :if-does-not-exist :error)
                       (condition ()
                         (incf errors)
                         (setf report-broken t)
                         nil)))
               (when report
                 (let ((accepted
                         (and eligible (= errors 0)
                              (= (+ call-aborts main-aborts) 0)
                              (not report-broken))))
                    (emit "COMPLETE main=~S accepted=~S scope=:INITIAL-CALL-WINDOW call-window=~D calls=~D completed=~D false=~D truthy=~D samples=~D sample-cap=128 sample-truncated=~S detail-truncated=~S errors=~D aborts=~D call-aborts=~D main-aborts=~D target-restored=~S main-restored=~S report-broken=~S"
                          status accepted call-window calls completed-count false-count truthy-count
                         samples sample-truncated detail-truncated errors
                         (+ call-aborts main-aborts) call-aborts main-aborts
                         target-restored main-restored report-broken)
                   (when (and accepted (not report-broken))
                    (emit "END in-sub-frame-initial-window-v2"))
                   (let ((footer-closed (close-report-stream)))
                     (when (and footer-closed (not report-broken))
                       (handler-case
                           (progn
                             (when (probe-file report-path)
                               (error "Report destination already exists"))
                             (rename-file report-staging-path report-path)
                             (setf published t staging-owned nil))
                         (condition ()
                           (incf errors)
                            (setf report-broken t))))))))
             (unless published
               (cleanup-staging-file))
             published))
         (record-finish (status)
           (unless finished
             (setf finished t scene-active nil)
             (let* ((target-restored
                      (restore-binding "IN-SUB-FRAME" target-symbol
                                       target-original target-wrapper))
                    (main-restored
                      (restore-binding "MAIN" main-symbol
                                       main-original main-wrapper))
                    (accepted
                       (and (eq status :window-complete)
                            (= calls call-window)
                            (= calls completed-count)
                           target-restored main-restored
                           (= errors 0)
                           (= (+ call-aborts main-aborts) 0)
                           (not report-broken))))
               (write-finished-report status accepted
                                      target-restored main-restored))))
         (setup-symbol (name)
           (let ((symbol (and owner (find-symbol name owner))))
             (unless (and symbol (fboundp symbol))
               (error "Missing function binding ~A" name))
             symbol)))
      (when report
         (emit "BEGIN in-sub-frame-initial-window-v2")
         (emit "CAPS false-samples=128 call-window=~D list-depth=4 list-items=8 string-chars=160"
               call-window)
        (handler-case
            (progn
              ;; This probe is loaded before the seed-mode source by the
              ;; runner.  Load that guarded source now so MAIN below can wrap
              ;; the trace wrapper and restore to it after the full scene.
              (load "C:\\temp\\scene-state-snapshot-seeded-1234.cl")
              (setf owner (find-package "COMMON-GRAPHICS-USER"))
              (unless owner (error "Missing COMMON-GRAPHICS-USER package"))
              (setf target-symbol (setup-symbol "IN-SUB-FRAME")
                    main-symbol (setup-symbol "MAIN")
                    target-original (symbol-function target-symbol)
                    main-original (symbol-function main-symbol))
              (setf target-wrapper
                    (lambda (&rest arguments)
                       (if (or (not scene-active) (>= calls call-window))
                          (apply target-original arguments)
                        (let ((id (incf calls)) (completed nil))
                          (unwind-protect
                              (handler-bind
                                  ((error
                                     (lambda (condition)
                                       (incf errors)
                                       (emit "CALL-ERROR id=~D type=~S"
                                             id (type-record condition)))))
                                (multiple-value-call
                                    (lambda (&rest values)
                                      (setf completed t)
                                      (incf completed-count)
                                      ;; Zero values act like NIL in a
                                      ;; single-value context; otherwise only
                                      ;; a NIL primary value is classified false.
                                       (when (or (null values) (null (car values)))
                                         (incf false-count)
                                         (record-false id arguments values))
                                       (unless (or (null values) (null (car values)))
                                         (incf truthy-count))
                                       ;; Restore after the first fixed set of
                                       ;; natural entries has fully returned.
                                       ;; Calls nested after the cap are passed
                                       ;; straight through above, so this window
                                       ;; remains exactly call-window entries.
                                       (when (and (= calls call-window)
                                                  (= calls completed-count)
                                                  (not finished))
                                         (handler-case
                                             (record-finish :window-complete)
                                           (condition ()
                                             (incf errors)
                                             (setf report-broken t))))
                                       (values-list values))
                                  (apply target-original arguments)))
                            (unless completed
                              (incf call-aborts)
                              (emit "ABORT kind=:IN-SUB-FRAME id=~D" id)))))))
              (setf main-wrapper
                    (lambda (&rest arguments)
                      (let ((prior-active scene-active)
                            (completed nil))
                        (incf main-depth)
                        (setf scene-active t)
                        (unwind-protect
                            (multiple-value-prog1
                                (apply main-original arguments)
                              (setf completed t)
                              (when (= main-depth 1)
                                (record-finish :normal)))
                          (unless completed
                            (when (= main-depth 1)
                              (incf main-aborts)
                              (record-finish :aborted)))
                          (decf main-depth)
                          (setf scene-active prior-active)))))
              (emit "INSTALL name=~S package=~S type=~S"
                    "IN-SUB-FRAME" (package-name (symbol-package target-symbol))
                    (type-record target-original))
              (setf (symbol-function target-symbol) target-wrapper)
              (emit "INSTALL name=~S package=~S type=~S lifecycle-only=T"
                    "MAIN" (package-name (symbol-package main-symbol))
                    (type-record main-original))
              (setf (symbol-function main-symbol) main-wrapper)
              (emit "READY target=~S lifecycle=~S seed=1234"
                    target-symbol main-symbol))
          (condition (condition)
            (incf errors)
            (emit "SETUP-ERROR type=~S" (type-record condition))
            (let ((target-restored
                    (restore-binding "IN-SUB-FRAME" target-symbol
                                     target-original target-wrapper))
                  (main-restored
                    (restore-binding "MAIN" main-symbol main-original main-wrapper)))
              (write-finished-report :setup-error nil
                                     target-restored main-restored))))))))
