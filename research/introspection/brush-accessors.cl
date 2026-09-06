;;; Minimal reader probe after the PAINT-BRUSH class census.  The BEGIN form
;;; is intentionally a separate top-level form so a later load/compile error
;;; cannot hide the first checkpoint.  Only the existing WIDTH reader is
;;; called; no brush selection, fill-map binding, drawing, or mutation occurs.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  (format report "BEGIN brush-accessors~%")
  (format report "INTERVENTION MINIMAL-WIDTH-READER~%")
  (finish-output report))

(unless (boundp 'aaron-brush-accessors-loaded)
  (set 'aaron-brush-accessors-loaded t)
  (with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                          :direction :output :if-exists :append
                          :if-does-not-exist :create)
    (let* ((user (find-package "COMMON-GRAPHICS-USER"))
           (graphics (find-package "COMMON-GRAPHICS"))
           (all-symbol (and user (find-symbol "ALL-BRUSHES" user)))
           (width-symbol (and graphics (find-symbol "WIDTH" graphics))))
      (labels ((summary (value &optional (depth 0))
                 (cond
                   ((numberp value) value)
                   ((symbolp value)
                    (list :symbol (and (symbol-package value)
                                       (package-name (symbol-package value)))
                          (symbol-name value)))
                   ((arrayp value)
                    (list :array (type-of value)
                          :dimensions (array-dimensions value)
                          :element-type (array-element-type value)))
                   ((and (consp value) (< depth 3))
                    (list (summary (car value) (1+ depth))
                          (summary (cdr value) (1+ depth))))
                   (t (list :type (type-of value))))))
        (format report "ALL-BRUSHES bound=~S WIDTH fbound=~S~%"
                (and all-symbol (boundp all-symbol))
                (and width-symbol (fboundp width-symbol)))
        (finish-output report)
        (handler-case
            (if (and all-symbol (boundp all-symbol)
                     (consp (symbol-value all-symbol)))
                (let ((brush (car (symbol-value all-symbol))))
                  (format report "BRUSH shape=~S~%" (type-of brush))
                  (format report "BEFORE-WIDTH~%")
                  (finish-output report)
                  (if (and width-symbol (fboundp width-symbol))
                      (format report "WIDTH-RESULT ~S~%"
                              (summary (funcall (symbol-function width-symbol)
                                                brush)))
                    (format report "WIDTH-SKIPPED~%")))
              (format report "BRUSH-SKIPPED~%"))
          (error (problem)
            (format report "ERROR ~S~%" (type-of problem))))
        (finish-output report)
        (format report "END brush-accessors~%")
        (finish-output report)))))
