;;; Metadata-only probe for the delivered Allegro image. No application
;;; variables are changed, and no engine functions are invoked here.
;;; Use dynamic symbol lookup: an unavailable EXCL export is a read-time error
;;; which HANDLER-CASE around a function call cannot catch.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-runtime-census.txt"
                        :direction :output :if-exists :append
                        :if-does-not-exist :create)
  (let ((*print-length* 30) (*print-level* 5) (*print-circle* t))
    (format report "BEGIN runtime-census~%")
    (finish-output report)
    (dolist (name '("MAKE-RANDOM-STATE-FROM-SEED" "MAKE-RANDOM-STATE"
                    "INIT-RANDOM" "SET-RANDOM" "RANDOM-INT"
                    "NEW-RANDOM-FLOAT" "NEW-RANDOM-FIXNUM"
                    "ARGLIST" "DISASSEMBLE" "FUNCTION-LAMBDA-EXPRESSION"
                    "FUNCTION-NAME" "FUNCTION-ADDRESS"
                    "LISPVAL-TO-ADDRESS" "LISPVAL-TO-ALIGNED-MALLOC-ADDRESS"
                    "COMPOSE" "PAINT" "DRAW-FIGURE-CFORMS" "DRAW-LIST"
                    "PLAN-REPLACE" "PLACE-ARM" "SET-UP-SCREEN-SIZE"
                    "KCAT-CURRENT-DAY-TIME" "SET-FILE-ADDRESSES"
                    "*BUILD-PREMIUM*" "PREMIUM" "?RSEED?"
                    "SMALL-IMAGE-SCREEN-WIDTH" "SMALL-IMAGE-SCREEN-HEIGHT"
                    "*RANDOM-STATE*" "*INTERNAL-RANDOM-STATE*"))
      (do-all-symbols (symbol)
        (when (string= name (symbol-name symbol))
          (format report "SYMBOL ~S package=~S bound=~S function=~S~%"
                  name (package-name (symbol-package symbol))
                  (not (null (boundp symbol)))
                  (not (null (fboundp symbol))))
          (finish-output report)
          (handler-case
              (when (boundp symbol)
                (let ((value (symbol-value symbol)))
                  (format report "VALUE-TYPE ~S ~S~%" name (type-of value))
                  (when (or (numberp value) (symbolp value))
                    (format report "VALUE ~S ~S~%" name value))))
            (error (problem)
              (format report "ERROR value ~S ~A~%" name problem)))
          (finish-output report))))
    (format report "BEGIN application-functions~%")
    (finish-output report)
    (let ((package (find-package "COMMON-GRAPHICS-USER")))
      (when package
        (do-symbols (symbol package)
          (when (and (eq package (symbol-package symbol)) (fboundp symbol))
            (format report "FUNCTION ~S~%" (symbol-name symbol))))))
    (format report "END application-functions~%")
    (finish-output report)
    (format report "BEGIN signatures~%")
    (finish-output report)
    (let* ((package (find-package "EXCL"))
           (arglist (and package (find-symbol "ARGLIST" package))))
      (if (and arglist (fboundp arglist))
          (dolist (entry '(("EXCL" "MAKE-RANDOM-STATE-FROM-SEED")
                            ("EXCL" "RANDOM-INT")
                            ("EXCL" "NEW-RANDOM-FLOAT")
                            ("COMMON-GRAPHICS-USER" "INIT-RANDOM")
                            ("COMMON-GRAPHICS-USER" "SET-UP-SCREEN-SIZE")
                            ("COMMON-GRAPHICS-USER" "SET-FILE-ADDRESSES")))
            (let* ((owner (find-package (first entry)))
                   (symbol (and owner (find-symbol (second entry) owner))))
              (when (and symbol (fboundp symbol))
                (format report "TRY arglist ~S~%" entry)
                (finish-output report)
                (handler-case
                    (format report "ARGLIST ~S ~S~%" entry
                            (multiple-value-list (funcall arglist symbol)))
                  (error (problem)
                    (format report "ERROR arglist ~S ~A~%" entry problem)))
                (finish-output report))))
          (format report "UNAVAILABLE arglist~%")))
    (format report "END runtime-census~%")
    (finish-output report)))
