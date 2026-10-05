;;; Natural boundary-map call census. No extra coordinate/frame reader calls.
(in-package :cl-user)

(unless (boundp 'aaron-boundary-map-trace-loaded)
  (set 'aaron-boundary-map-trace-loaded t)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (report (open "C:\\temp\\aaron-boundary-map-trace.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (calls 0) (errors 0) (aborts 0) (stack nil)
         (counts (make-hash-table :test #'equal)))
    (labels
        ((emit (control &rest args)
           (let ((*print-length* nil) (*print-level* nil) (*print-pretty* nil)
                 (*print-circle* nil) (*print-readably* nil))
             (apply #'format report control args) (terpri report)))
         (install (name)
           (let* ((symbol (find-symbol name owner))
                  (original (symbol-function symbol)))
             (emit "INSTALL name=~S type=~S" name (format nil "~S" (type-of original)))
             (setf (symbol-function symbol)
                   (lambda (&rest args)
                     (let ((id (incf calls)) (completed nil))
                       (incf (gethash name counts 0))
                       (push id stack)
                       (handler-case
                           (emit "CALL id=~D name=~S args=~S" id name
                                 (if (string= name "WRITE-LIST-TO-FILL-MAP")
                                     (list :length (length (first args)) :value (second args))
                                   args))
                         (condition () (incf errors)))
                       (unwind-protect
                           (multiple-value-call
                               (lambda (&rest values)
                                 (setf completed t)
                                 (handler-case (emit "RETURN id=~D values=~S" id values)
                                   (condition () (incf errors)))
                                 (pop stack) (values-list values))
                             (apply original args))
                         (unless completed (incf aborts) (pop stack)))))))))
      (emit "BEGIN boundary-map-trace v1")
      (dolist (name '("CLEAR-FILL-MAP" "WRITE-LIST-TO-FILL-MAP")) (install name))
      (let* ((symbol (find-symbol "MAIN" owner)) (original (symbol-function symbol)))
        (setf (symbol-function symbol)
              (lambda (&rest args)
                (multiple-value-prog1 (apply original args)
                  (dolist (name '("CLEAR-FILL-MAP" "WRITE-LIST-TO-FILL-MAP"))
                    (emit "TOTAL name=~S calls=~D" name (gethash name counts 0)))
                  (emit "COMPLETE calls=~D errors=~D aborts=~D depth=~D"
                        calls errors aborts (length stack))
                  (emit "END boundary-map-trace v1")
                  (finish-output report) (close report)))))
      (emit "READY"))))
