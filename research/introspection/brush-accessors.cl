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
             (brush (car (symbol-value all-symbol)))
             (accessors '(("ID" "COMMON-GRAPHICS")
                          ("ENVIR" "COMMON-GRAPHICS-USER")
                          ("PERIM" "COMMON-GRAPHICS-USER")
                          ("CORE" "COMMON-GRAPHICS-USER")
                          ("WIDTH" "COMMON-GRAPHICS")
                          ("RAD" "COMMON-GRAPHICS-USER")
                          ("CELLS" "COMMON-GRAPHICS-USER"))))
        (format report "RESOLVED BRUSH ~S~%" (type-of brush))
        (finish-output report)
        (dolist (descriptor accessors)
          (let* ((name (first descriptor))
                 (package (find-package (second descriptor)))
                 (symbol (and package (find-symbol name package))))
            (format report "ACCESSOR-BEGIN ~A package=~A symbol=~S fbound=~S~%"
                    name (second descriptor) symbol (and symbol (fboundp symbol)))
            (finish-output report)
            (handler-case
                (if (and symbol (fboundp symbol))
                    (let ((value (funcall (symbol-function symbol) brush)))
                      (format report "ACCESSOR-RESULT ~A type=~S~%"
                              name (type-of value))
                      (cond
                        ((numberp value)
                         (format report "VALUE-NUMBER ~S~%" value))
                        ((symbolp value)
                         (format report "VALUE-SYMBOL package=~A name=~A~%"
                                 (and (symbol-package value)
                                      (package-name (symbol-package value)))
                                 (symbol-name value)))
                        ((stringp value)
                         (format report "VALUE-STRING length=~D prefix=~S~%"
                                 (length value)
                                 (subseq value 0 (min 80 (length value)))))
                        ((arrayp value)
                         (format report "VALUE-ARRAY rank=~D dimensions=~S element-type=~S~%"
                                 (array-rank value) (array-dimensions value)
                                 (array-element-type value)))
                        ((consp value)
                         (let ((*print-length* 8) (*print-level* 4)
                               (*print-pretty* nil))
                           (format report "VALUE-CONS ~S~%" value)))
                        (t
                         (format report "VALUE-SUMMARY type=~S~%" (type-of value))))
                    (format report "ACCESSOR-NOT-FOUND ~A~%" name))
              (error (problem)
                (format report "ACCESSOR-ERROR ~A type=~S~%"
                        name (type-of problem))))
            (finish-output report)))
        (format report "ACCESSOR-SUMMARY-END~%"))
    (error (problem)
      (format report "ERROR ~S~%" (type-of problem))))
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-accessors.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (format report "END brush-accessors~%")
  (finish-output report))
