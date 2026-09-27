;;; Opt-in wrapper for complete natural FREE-PATH calls.
;;; Load after planning-call-trace.cl has installed its transparent wrappers and
;;; before the normal scene call. The wrapper calls the current function cell
;;; once, preserves every returned value, and only observes verified VISPTs.
(in-package :cl-user)

(unless (boundp 'aaron-natural-free-path-capture-loaded)
  (set 'aaron-natural-free-path-capture-loaded t)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (target (and owner (find-symbol "FREE-PATH" owner)))
         (point-type (and owner (find-symbol "VISPT" owner)))
         (x-accessor (and owner (find-symbol "X" owner)))
         (y-accessor (and owner (find-symbol "Y" owner)))
         (vis-accessor (and owner (find-symbol "VIS" owner)))
         (report-path "C:\\temp\\aaron-free-path-natural.txt")
         (report (handler-case
                     (open report-path
                           :direction :output
                           :if-exists :supersede
                           :if-does-not-exist :create)
                   (condition () nil)))
         (call-count 0)
         (call-limit 256)
         (point-limit 256)
         (call-overflow-written nil))
    (labels
        ((safe-type (value)
           (handler-case (type-of value)
             (condition () :type-error)))
         (safe-scalar (value)
           (cond
             ((numberp value) (list :type (safe-type value) :value value))
             ((symbolp value) (list :type :symbol :value value))
             (t (list :type (safe-type value)))))
         (emit (control &rest arguments)
           (when report
             (handler-case
                 (let ((*print-length* nil)
                       (*print-level* 12)
                       (*print-circle* t)
                       (*print-pretty* nil))
                   (apply #'format report control arguments)
                   (terpri report))
               (condition () nil))))
         (flush-report ()
           (when report
             (handler-case (finish-output report)
               (condition () nil))))
         (point-summary (value)
           (handler-case
               (if (and point-type
                        x-accessor y-accessor vis-accessor
                        (fboundp x-accessor)
                        (fboundp y-accessor)
                        (fboundp vis-accessor)
                        (typep value point-type))
                   (list :point-type (safe-type value)
                         :x (safe-scalar
                             (funcall (symbol-function x-accessor) value))
                         :y (safe-scalar
                             (funcall (symbol-function y-accessor) value))
                         :vis (safe-scalar
                               (funcall (symbol-function vis-accessor) value)))
                 (list :unverified-point-type (safe-type value)))
              (condition (problem)
                (list :point-read-error (safe-type problem)
                      :value-type (safe-type value)))))
         (point-list-summary (value)
           (if (null value)
               (list :points nil :shown 0 :truncated nil :proper t)
             (if (not (consp value))
                 (list :not-a-point-list (safe-scalar value))
               (let ((rest value)
                     (items nil)
                     (shown 0)
                     (truncated nil)
                     (proper t)
                     (tail nil))
                 (do ()
                     ((null rest))
                   (cond
                     ((>= shown point-limit)
                      (setf truncated t
                            rest nil))
                     ((consp rest)
                      (push (point-summary (car rest)) items)
                      (setf rest (cdr rest))
                      (incf shown))
                     (t
                      (setf proper nil
                            tail rest
                            rest nil))))
                 (list :points (nreverse items)
                       :shown shown
                       :truncated truncated
                       :proper proper
                       :improper-tail (when tail (safe-scalar tail)))))))
         (binding-summary (name)
           (handler-case
               (let ((symbol (and owner (find-symbol name owner))))
                 (cond
                   ((null symbol) (list :name name :symbol-missing t))
                   ((not (boundp symbol)) (list :name name :bound nil))
                   (t (list :name name
                            :bound t
                            :value (safe-scalar (symbol-value symbol))))))
              (condition (problem)
                (list :name name :binding-error (safe-type problem)))))
         (index-bindings ()
           (mapcar #'binding-summary '("FDEX" "TDEX" "FROM" "TO")))
         (rng-preview ()
           ;; Make a copy and draw only from that copy. The scene's live state
           ;; is never advanced by this observation.
           (handler-case
               (let ((copy (make-random-state *random-state*)))
                 (list :random-100
                       (list (random 100 copy)
                             (random 100 copy)
                             (random 100 copy))))
             (condition (problem)
               (list :preview-error (safe-type problem)))))
         (value-summary (value)
           (if (or (null value) (consp value))
               (point-list-summary value)
             (safe-scalar value)))
         (result-summary (results)
           (list :values-count (length results)
                 :first (if results (value-summary (car results)) :no-values)
                 :extra (mapcar #'safe-scalar (cdr results))))
         (emit-point-overflow (call-id field summary)
           (when (and (listp summary) (getf summary :truncated))
             (emit "OVERFLOW call=~D field=~A reason=POINT-LIMIT limit=~D"
                   call-id field point-limit))))
      (cond
        ((null report)
         nil)
        ((or (null target) (not (fboundp target)))
         (emit "BEGIN natural-free-path-capture v1")
         (emit "INSTALL-ERROR target=FREE-PATH reason=UNAVAILABLE"))
         (t
          (let ((original (symbol-function target)))
            (emit "BEGIN natural-free-path-capture v1")
            (emit "CAPS calls=~D points-per-list=~D" call-limit point-limit)
            (emit "INSTALL target=FREE-PATH original-type=~S" (safe-type original))
            (flush-report)
            (setf (symbol-function target)
                  (lambda (&rest args)
                    (let* ((call-id (incf call-count))
                           (capture-p (<= call-id call-limit))
                           (edge (car args))
                           (completed nil)
                           (condition-logged nil)
                           (edge-before (when capture-p
                                          (point-list-summary edge)))
                           (bindings-before (when capture-p (index-bindings)))
                           (rng-before (when capture-p (rng-preview))))
                     (when capture-p
                       (emit "CALL id=~D arg-count=~D edge=~S bindings=~S rng-before=~S"
                             call-id (length args) edge-before
                             bindings-before rng-before)
                       (emit-point-overflow call-id "EDGE" edge-before))
                     (when (and (not capture-p) (not call-overflow-written))
                       (setf call-overflow-written t)
                       (emit "OVERFLOW reason=CALL-LIMIT limit=~D next-call=~D"
                             call-limit call-id))
                      (unwind-protect
                          (handler-bind
                              ((error
                                (lambda (problem)
                                  (when (and capture-p (not condition-logged))
                                    (setf condition-logged t)
                                    (emit "CONDITION id=~D type=~S"
                                          call-id (safe-type problem))))))
                            (multiple-value-call
                                (lambda (&rest results)
                                  (when capture-p
                                    (handler-case
                                        (let* ((result (result-summary results))
                                               (edge-after (point-list-summary edge))
                                               (bindings-after (index-bindings))
                                               (rng-after (rng-preview)))
                                          (emit "RETURN id=~D result=~S edge-after=~S bindings-after=~S rng-after=~S"
                                                call-id result edge-after
                                                bindings-after rng-after)
                                          (emit-point-overflow call-id "RESULT"
                                                               (getf result :first))
                                          (emit-point-overflow call-id "EDGE-AFTER"
                                                               edge-after))
                                      (condition () nil)))
                                  (setf completed t)
                                  (flush-report)
                                  (values-list results))
                              (apply original args)))
                        (unless completed
                          (when capture-p
                            (emit "ABORT id=~D reason=NONRETURNING-CALL" call-id))
                          (flush-report))))))))
         (set 'aaron-natural-free-path-capture-installed t)))))
