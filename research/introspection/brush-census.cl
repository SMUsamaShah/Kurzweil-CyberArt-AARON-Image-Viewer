;;; Read every startup PAINT-BRUSH through its existing generated readers.
;;; This probe is read-only: it never selects a brush, writes a slot, calls a
;;; fill/map routine, or traverses more than four printed list elements.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-brush-census.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  (format report "BEGIN brush-census~%")
  (format report "INTERVENTION READ-ONLY-ALL-BRUSHES~%")
  (finish-output report))

(with-open-file (report "C:\\temp\\aaron-brush-census.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (handler-case
      (let* ((user (find-package "COMMON-GRAPHICS-USER"))
             (graphics (find-package "COMMON-GRAPHICS"))
             (all-symbol (find-symbol "ALL-BRUSHES" user))
             (id-symbol (find-symbol "ID" graphics))
             (width-symbol (find-symbol "WIDTH" graphics))
             (envir-symbol (find-symbol "ENVIR" user))
             (perim-symbol (find-symbol "PERIM" user))
             (core-symbol (find-symbol "CORE" user))
             (rad-symbol (find-symbol "RAD" user))
             (cells-symbol (find-symbol "CELLS" user))
             (brushes (symbol-value all-symbol)))
        (format report "ALL-BRUSHES-COUNT ~S~%" (length brushes))
        (finish-output report)
        (handler-case
            (let ((brush (nth 0 brushes)))
              (format report "BRUSH-BEGIN 0 type=~S~%" (type-of brush))
              (format report "BRUSH-SCALARS 0 ID=~S WIDTH=~S RAD=~S CELLS=~S~%"
                      (funcall (symbol-function id-symbol) brush)
                      (funcall (symbol-function width-symbol) brush)
                      (funcall (symbol-function rad-symbol) brush)
                      (funcall (symbol-function cells-symbol) brush))
              (let ((envir (funcall (symbol-function envir-symbol) brush))
                    (perim (funcall (symbol-function perim-symbol) brush))
                    (core (funcall (symbol-function core-symbol) brush)))
                (let ((*print-length* 4) (*print-level* 4)
                      (*print-circle* t) (*print-pretty* nil))
                  (format report
                          "BRUSH-SHAPES 0 ENVIR-TYPE=~S ENVIR=~S PERIM-TYPE=~S PERIM=~S CORE-TYPE=~S CORE=~S~%"
                          (type-of envir) envir (type-of perim) perim
                          (type-of core) core)))
              (format report "BRUSH-END 0~%"))
          (error (problem)
            (format report "BRUSH-ERROR 0 ~S~%" (type-of problem))))
        (finish-output report)
        (handler-case
            (let ((brush (nth 1 brushes)))
              (format report "BRUSH-BEGIN 1 type=~S~%" (type-of brush))
              (format report "BRUSH-SCALARS 1 ID=~S WIDTH=~S RAD=~S CELLS=~S~%"
                      (funcall (symbol-function id-symbol) brush)
                      (funcall (symbol-function width-symbol) brush)
                      (funcall (symbol-function rad-symbol) brush)
                      (funcall (symbol-function cells-symbol) brush))
              (let ((envir (funcall (symbol-function envir-symbol) brush))
                    (perim (funcall (symbol-function perim-symbol) brush))
                    (core (funcall (symbol-function core-symbol) brush)))
                (let ((*print-length* 4) (*print-level* 4)
                      (*print-circle* t) (*print-pretty* nil))
                  (format report
                          "BRUSH-SHAPES 1 ENVIR-TYPE=~S ENVIR=~S PERIM-TYPE=~S PERIM=~S CORE-TYPE=~S CORE=~S~%"
                          (type-of envir) envir (type-of perim) perim
                          (type-of core) core)))
              (format report "BRUSH-END 1~%"))
          (error (problem)
            (format report "BRUSH-ERROR 1 ~S~%" (type-of problem))))
        (finish-output report)
        (handler-case
            (let ((brush (nth 2 brushes)))
              (format report "BRUSH-BEGIN 2 type=~S~%" (type-of brush))
              (format report "BRUSH-SCALARS 2 ID=~S WIDTH=~S RAD=~S CELLS=~S~%"
                      (funcall (symbol-function id-symbol) brush)
                      (funcall (symbol-function width-symbol) brush)
                      (funcall (symbol-function rad-symbol) brush)
                      (funcall (symbol-function cells-symbol) brush))
              (let ((envir (funcall (symbol-function envir-symbol) brush))
                    (perim (funcall (symbol-function perim-symbol) brush))
                    (core (funcall (symbol-function core-symbol) brush)))
                (let ((*print-length* 4) (*print-level* 4)
                      (*print-circle* t) (*print-pretty* nil))
                  (format report
                          "BRUSH-SHAPES 2 ENVIR-TYPE=~S ENVIR=~S PERIM-TYPE=~S PERIM=~S CORE-TYPE=~S CORE=~S~%"
                          (type-of envir) envir (type-of perim) perim
                          (type-of core) core)))
              (format report "BRUSH-END 2~%"))
          (error (problem)
            (format report "BRUSH-ERROR 2 ~S~%" (type-of problem))))
        (finish-output report)
        (handler-case
            (let ((brush (nth 3 brushes)))
              (format report "BRUSH-BEGIN 3 type=~S~%" (type-of brush))
              (format report "BRUSH-SCALARS 3 ID=~S WIDTH=~S RAD=~S CELLS=~S~%"
                      (funcall (symbol-function id-symbol) brush)
                      (funcall (symbol-function width-symbol) brush)
                      (funcall (symbol-function rad-symbol) brush)
                      (funcall (symbol-function cells-symbol) brush))
              (let ((envir (funcall (symbol-function envir-symbol) brush))
                    (perim (funcall (symbol-function perim-symbol) brush))
                    (core (funcall (symbol-function core-symbol) brush)))
                (let ((*print-length* 4) (*print-level* 4)
                      (*print-circle* t) (*print-pretty* nil))
                  (format report
                          "BRUSH-SHAPES 3 ENVIR-TYPE=~S ENVIR=~S PERIM-TYPE=~S PERIM=~S CORE-TYPE=~S CORE=~S~%"
                          (type-of envir) envir (type-of perim) perim
                          (type-of core) core)))
              (format report "BRUSH-END 3~%"))
          (error (problem)
            (format report "BRUSH-ERROR 3 ~S~%" (type-of problem))))
        (finish-output report)
        (handler-case
            (let ((brush (nth 4 brushes)))
              (format report "BRUSH-BEGIN 4 type=~S~%" (type-of brush))
              (format report "BRUSH-SCALARS 4 ID=~S WIDTH=~S RAD=~S CELLS=~S~%"
                      (funcall (symbol-function id-symbol) brush)
                      (funcall (symbol-function width-symbol) brush)
                      (funcall (symbol-function rad-symbol) brush)
                      (funcall (symbol-function cells-symbol) brush))
              (let ((envir (funcall (symbol-function envir-symbol) brush))
                    (perim (funcall (symbol-function perim-symbol) brush))
                    (core (funcall (symbol-function core-symbol) brush)))
                (let ((*print-length* 4) (*print-level* 4)
                      (*print-circle* t) (*print-pretty* nil))
                  (format report
                          "BRUSH-SHAPES 4 ENVIR-TYPE=~S ENVIR=~S PERIM-TYPE=~S PERIM=~S CORE-TYPE=~S CORE=~S~%"
                          (type-of envir) envir (type-of perim) perim
                          (type-of core) core)))
              (format report "BRUSH-END 4~%"))
          (error (problem)
            (format report "BRUSH-ERROR 4 ~S~%" (type-of problem))))
        (finish-output report)
        (handler-case
            (let ((brush (nth 5 brushes)))
              (format report "BRUSH-BEGIN 5 type=~S~%" (type-of brush))
              (format report "BRUSH-SCALARS 5 ID=~S WIDTH=~S RAD=~S CELLS=~S~%"
                      (funcall (symbol-function id-symbol) brush)
                      (funcall (symbol-function width-symbol) brush)
                      (funcall (symbol-function rad-symbol) brush)
                      (funcall (symbol-function cells-symbol) brush))
              (let ((envir (funcall (symbol-function envir-symbol) brush))
                    (perim (funcall (symbol-function perim-symbol) brush))
                    (core (funcall (symbol-function core-symbol) brush)))
                (let ((*print-length* 4) (*print-level* 4)
                      (*print-circle* t) (*print-pretty* nil))
                  (format report
                          "BRUSH-SHAPES 5 ENVIR-TYPE=~S ENVIR=~S PERIM-TYPE=~S PERIM=~S CORE-TYPE=~S CORE=~S~%"
                          (type-of envir) envir (type-of perim) perim
                          (type-of core) core)))
              (format report "BRUSH-END 5~%"))
          (error (problem)
            (format report "BRUSH-ERROR 5 ~S~%" (type-of problem))))
        (finish-output report))
    (error (problem)
      (format report "SETUP-ERROR ~S~%" (type-of problem))))
  (format report "END brush-census~%")
  (finish-output report))
