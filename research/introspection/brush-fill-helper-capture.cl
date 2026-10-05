;;; Bounded observation of real brush-fill calls in a complete painting.
;;; Original arguments, multiple values, and error propagation are preserved.
;;; Load before the standard scene trace; only this disposable process changes.
(in-package :cl-user)

(unless (boundp 'aaron-brush-fill-helper-capture-loaded)
  (set 'aaron-brush-fill-helper-capture-loaded t)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (brush-type (find-symbol "PAINT-BRUSH" owner))
         (id-reader (find-symbol "ID" "COMMON-GRAPHICS"))
         (all-symbol (find-symbol "ALL-BRUSHES" owner))
         (brushes (and all-symbol (boundp all-symbol)
                       (copy-list (symbol-value all-symbol))))
         (report (open "C:\\temp\\aaron-brush-fill-helpers.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (targets '("BRUSH-FILL" "SCAN-ROW" "LIST-FRAME" "MY-FILL"
                    "FILL-IRIS" "SELECT-BRUSH" "BRUSH-FILL-SUBPART" "RECORD-BRUSH"
                    "SET-MEDIANS" "GOOD-START" "FLASH-SPOT" "FILL-STRATEGY" "POST-FILL"))
         (call-limit 50000) (call-count 0) (errors 0) (aborts 0) (overflow nil)
         (stack nil) (counts (make-hash-table :test #'equal))
         (selections (make-hash-table :test #'eql)))
    (labels
        ((type-name (value) (format nil "~S" (type-of value)))
         (emit (control &rest args)
           (when report
             (handler-case
                 (let ((*print-length* nil) (*print-level* nil)
                       (*print-pretty* nil) (*print-circle* nil)
                       (*print-readably* nil))
                   (apply #'format report control args)
                   (terpri report))
               (condition () (incf errors)))))
         (brush-info (value)
           (let ((index (position value brushes :test #'eq)))
             (list :brush :index index
                   :id (funcall (symbol-function id-reader) value))))
         (datum (value &optional (depth 0))
           (handler-case
               (cond
                 ((null value) (list :nil))
                 ((numberp value) (list :number (type-name value) value))
                 ((symbolp value) (list :symbol
                                       (and (symbol-package value)
                                            (package-name (symbol-package value)))
                                       (symbol-name value)))
                 ((and brush-type (typep value brush-type)) (brush-info value))
                 ((consp value)
                  (if (>= depth 3) (list :list :omitted t)
                    (let ((rest value) (items nil) (shown 0))
                      (do () ((or (not (consp rest)) (>= shown 128)))
                        (push (datum (car rest) (1+ depth)) items)
                        (setf rest (cdr rest))
                        (incf shown))
                      (list :list :items (nreverse items) :shown shown
                            :proper (null rest) :truncated (consp rest)))))
                 (t (list :object (type-name value))))
             (condition () (incf errors) (list :observation-error))))
         (binding (name)
           (let ((symbol (find-symbol name owner)))
             (cond ((null symbol) (list name :missing))
                   ((not (boundp symbol)) (list name :unbound))
                   (t (list name :bound (datum (symbol-value symbol)))))))
         (summaries (values)
           (let ((rest values) (items nil) (shown 0))
             (do () ((or (null rest) (>= shown 16)))
               (push (datum (car rest)) items)
               (setf rest (cdr rest))
               (incf shown))
             (list :items (nreverse items) :shown shown :truncated (not (null rest)))))
         (fill-id ()
           (let ((rest stack) (found nil))
             (do () ((or found (null rest)))
               (when (string= (caar rest) "BRUSH-FILL")
                 (setf found (cdar rest)))
               (setf rest (cdr rest)))
             (or found 0)))
         (state ()
           (handler-case
               (let* ((fill (fill-id))
                      (brush-symbol (find-symbol "BRUSH" owner)))
                 (multiple-value-bind (selected known)
                     (if (plusp fill) (gethash fill selections) (values nil nil))
                   (list :bindings
                         (mapcar #'binding '("SUBP-COUNT" "CFORM-COUNT" "BRUSH" "HEAD-DONE"))
                         :selection-known known
                         :brush-eq-selected (and known brush-symbol (boundp brush-symbol)
                                                  (eq selected (symbol-value brush-symbol))))))
             (condition () (incf errors) (list :observation-error))))
         (finish ()
           (dolist (name targets)
             (emit "TOTAL name=~S calls=~D" name (gethash name counts 0)))
           (emit "COMPLETE calls=~D errors=~D aborts=~D overflow=~S depth=~D"
                 call-count errors aborts overflow (length stack))
           (emit "END brush-fill-helpers")
           (when report (finish-output report) (close report) (setf report nil)))
         (install (name)
           (let* ((symbol (find-symbol name owner))
                  (original (and symbol (fboundp symbol) (symbol-function symbol))))
             (unless original (error "Missing natural brush boundary ~A" name))
             (emit "INSTALL name=~S original-type=~S" name (type-name original))
             (setf (symbol-function symbol)
                   (lambda (&rest args)
                     (if (null report) (apply original args)
                       (let* ((id (incf call-count))
                              (parent (if stack (cdar stack) 0))
                              (record-p (<= id call-limit)) (completed nil))
                         (setf (gethash name counts) (1+ (gethash name counts 0)))
                         (push (cons name id) stack)
                         (when record-p
                           (emit "CALL id=~D name=~S parent=~D fill=~D args=~S before=~S"
                                 id name parent (fill-id) (summaries args) (state)))
                         (unless record-p
                           (unless overflow (emit "OVERFLOW first-omitted-call=~D" id))
                           (setf overflow t))
                         (unwind-protect
                             (multiple-value-call
                                 (lambda (&rest results)
                                   (when (and (string= name "SELECT-BRUSH") (plusp (fill-id)))
                                     (if (and results (null (cdr results)))
                                         (setf (gethash (fill-id) selections) (car results))
                                       (progn (remhash (fill-id) selections) (incf errors))))
                                   (when record-p
                                     (emit "RETURN id=~D values=~S after=~S"
                                           id (summaries results) (state)))
                                   (setf completed t)
                                   (values-list results))
                               (apply original args))
                           (unless completed (incf aborts) (emit "ABORT id=~D" id))
                           (pop stack)
                           (when (and report (zerop (mod id 256)))
                             (handler-case (finish-output report)
                               (condition () (incf errors))))))))))))
      (emit "BEGIN brush-fill-helpers v2")
      (emit "CAPS calls=~D list-items=128 list-depth=3 values=16" call-limit)
      (dolist (name targets) (install name))
      (let* ((main (find-symbol "MAIN" owner))
             (original (symbol-function main)))
        (setf (symbol-function main)
              (lambda (&rest args)
                (let ((completed nil))
                  (unwind-protect
                      (multiple-value-prog1 (apply original args)
                        (setf completed t)
                        (handler-case (finish) (condition () (incf errors))))
                    (unless completed
                      (emit "ABORT-MAIN")
                      (when report
                        (handler-case (finish-output report)
                          (condition () (incf errors))))))))))
      (emit "READY")
      (finish-output report))))
