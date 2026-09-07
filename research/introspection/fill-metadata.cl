;;; Read-only signatures for the brush/fill map boundary.  No candidate is
;;; invoked; this only asks Allegro's existing ARGLIST helper for callable
;;; names retained by the original image.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-fill-metadata.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  (let ((owner (find-package "COMMON-GRAPHICS-USER"))
        (arglist (find-symbol "ARGLIST" "EXCL")))
    (format report "BEGIN fill-metadata~%")
    (finish-output report)
    (dolist (name '("INIT-MAPS" "CLEAR-FILL-MAP" "WRITE-LIST-TO-FILL-MAP"
                    "SELECT-BRUSH" "BRUSH-STROKE" "SCREEN-AND-STORE"
                    "PAINT-FILL" "EDGE-PATH" "BRUSH-FILL"
                    "BRUSH-FILL-SUBPART" "RECORD-BRUSH"))
      (format report "TRY ~S~%" name)
      (finish-output report)
      (handler-case
          (multiple-value-bind (symbol status) (find-symbol name owner)
            (unless (and symbol (fboundp symbol))
              (error "No function binding for ~A" name))
            (format report "ROUTINE ~S status=~S type=~S arglist=~S~%"
                    name status (type-of (symbol-function symbol))
                    (multiple-value-list (funcall arglist symbol))))
        (error (problem)
          (format report "ERROR ~S ~A~%" name problem)))
      (finish-output report))
    (format report "END fill-metadata~%")
    (finish-output report)))
