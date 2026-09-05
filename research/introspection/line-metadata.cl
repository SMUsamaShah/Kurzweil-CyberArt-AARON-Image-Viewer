;;; Candidate discovery prompted by Paul Cohen's Freehand Line Algorithm
;;; article. Record retained metadata only: do not invoke these application
;;; routines or assume that their names establish an FLA implementation.
(in-package :cl-user)
(unless (boundp 'aaron-line-metadata-loaded)
  (set 'aaron-line-metadata-loaded t)
  (with-open-file (report "C:\\temp\\aaron-line-metadata.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 80) (*print-level* 8) (*print-circle* t)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (arglist (find-symbol "ARGLIST" "EXCL"))
          (count 0) (failures 0))
      (format report "BEGIN line-metadata~%")
      (finish-output report)
      (dolist (name '("FOLLOW" "WIGGLE" "LOCK-WIGGLE" "PREP-LINE"
                      "HOP-OR-DRAW" "PARSE-HOP" "PARSE-P-HOP"
                      "DIRECTION" "ANGLE-DIF" "ANGLE-RANGE" "RESET-RANGE"
                      "FROM-ANGLE" "TO-ANGLE" "RAN" "RAN-HAND"
                      "BRUSH-STROKE" "SELECT-BRUSH" "RECORD-BRUSH"
                      "MAPLINE" "LINE-MAPPING" "DRAW-CFORM"
                      "BRUSH-FILL" "BRUSH-FILL-SUBPART"))
        (incf count)
        (format report "TRY routine ~S~%" name)
        (finish-output report)
        (handler-case
            (multiple-value-bind (symbol status) (find-symbol name owner)
              (unless (and symbol (fboundp symbol))
                (error "No function binding for ~A" name))
              (format report "ROUTINE ~S status=~S type=~S arglist=~S~%"
                      name status (type-of (symbol-function symbol))
                      (multiple-value-list (funcall arglist symbol))))
          (error (problem)
            (incf failures)
            (format report "ERROR ~S ~A~%" name problem)))
        (finish-output report))
      (format report "SUMMARY attempted=~D failures=~D~%" count failures)
      (when (= failures 0) (format report "SUCCESS line-metadata~%"))
      (format report "END line-metadata~%")
      (finish-output report))))
