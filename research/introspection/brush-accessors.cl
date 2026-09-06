;;; Checkpointed calls to existing PAINT-BRUSH readers.  There are no local
;;; MOP helpers, slot writes, brush selection, or fill-map bindings in this
;;; probe.  Results are bounded to scalar/type/shape summaries.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  (format report "BEGIN brush-accessors~%")
  (format report "INTERVENTION TINY-WIDTH-READER~%")
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (format report "SECOND-FORM-BEGIN~%")
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (format report "THIRD-FORM-BEGIN~%")
  (finish-output report)
  (handler-case
      (let* ((user (find-package "COMMON-GRAPHICS-USER"))
             (graphics (find-package "COMMON-GRAPHICS"))
             (all-symbol (find-symbol "ALL-BRUSHES" user))
             (width-symbol (find-symbol "WIDTH" graphics)))
        (format report "RESOLVED~%")
        (finish-output report)
        (let ((brush (car (symbol-value all-symbol))))
          (format report "BRUSH ~S~%" (type-of brush))
          (format report "BEFORE-WIDTH~%")
          (finish-output report)
          (format report "WIDTH-RESULT ~S~%"
                  (funcall (symbol-function width-symbol) brush))))
    (error (problem)
      (format report "ERROR ~S~%" (type-of problem))))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (format report "FOURTH-FORM-BEGIN~%")
  (finish-output report)
  (handler-case
      (let* ((user (find-package "COMMON-GRAPHICS-USER"))
             (graphics (find-package "COMMON-GRAPHICS"))
             (all-symbol (find-symbol "ALL-BRUSHES" user))
             (id-symbol (find-symbol "ID" graphics))
             (brush (car (symbol-value all-symbol))))
        (format report "RESOLVED-ID~%")
        (finish-output report)
        (let ((value (funcall (symbol-function id-symbol) brush)))
          (format report "ID-RESULT-TYPE ~S~%" (type-of value))
          (format report "ID-RESULT ~S~%" value)))
    (error (problem)
      (format report "ID-ERROR ~S~%" (type-of problem))))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (format report "END brush-accessors~%")
  (finish-output report))
