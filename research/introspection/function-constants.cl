;;; Bounded, read-only inspection of retained compiled-function constants.
;;; The helper names were found by object-probe; no application routine is
;;; invoked. Values are summarized rather than printed as arbitrary objects.
(in-package :cl-user)

(unless (boundp 'aaron-function-constants-loaded)
  (set 'aaron-function-constants-loaded t)
  (with-open-file (report "C:\\temp\\aaron-function-constants.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 12) (*print-level* 4) (*print-circle* t)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (candidate-names
           '("FOLLOW" "WIGGLE" "LOCK-WIGGLE" "PREP-LINE"
             "HOP-OR-DRAW" "PARSE-HOP" "PARSE-P-HOP" "DIRECTION"
             "ANGLE-DIF" "ANGLE-RANGE" "RESET-RANGE" "FROM-ANGLE"
             "TO-ANGLE" "RAN" "RAN-HAND" "BRUSH-STROKE" "SELECT-BRUSH"
             "RECORD-BRUSH" "MAPLINE" "LINE-MAPPING" "DRAW-CFORM"
             "BRUSH-FILL" "BRUSH-FILL-SUBPART" "SCRIPT" "MASTER-PLAN"
             "MAKE-PLAN" "BUILD-FIGURE" "GENERATE-PERSON"
             "MAKE-PAINTING-COLORS" "PAINT-FILL" "MAKE-POTTED-PLANT"
             "TREE" "INIT-RANDOM" "SET-RANDOM" "GET-RANDOM"
             "SET-UP-SCREEN-SIZE" "SELECT-CANVAS")))
      (labels
          ((helper (name)
             (let ((found nil))
               (do-all-symbols (symbol)
                 (when (and (not found)
                            (string= name (symbol-name symbol))
                            (fboundp symbol))
                   (setf found symbol)))
               found))
           (short-value (value)
             (cond
               ((numberp value) (list :number value))
               ((stringp value) (list :string (length value)))
               ((symbolp value)
                (list :symbol (and (symbol-package value)
                                   (package-name (symbol-package value)))
                      (symbol-name value)))
               ((consp value) (list :list (type-of value)))
               (t (list :type (type-of value)))))
           (try-count (count-fn fn label)
             (handler-case
                 (funcall count-fn fn)
               (error ()
                 (handler-case
                     (funcall count-fn label)
                   (error () nil)))))
           (try-constant (constant-fn fn index label)
             (handler-case
                 (short-value (funcall constant-fn fn index))
               (error ()
                 (handler-case
                     (short-value (funcall constant-fn label index))
                   (error (problem) (list :error (type-of problem))))))))
        (let ((count-fn (helper "FUNCTION-CONSTANT-COUNT"))
              (constant-fn (helper "FUNCTION-CONSTANT")))
          (format report "BEGIN function-constants~%")
          (format report "HELPERS count=~S constant=~S~%"
                  (and count-fn (package-name (symbol-package count-fn)))
                  (and constant-fn (package-name (symbol-package constant-fn))))
          (finish-output report)
          (dolist (name candidate-names)
            (format report "TRY ~S~%" name)
            (finish-output report)
            (handler-case
                (let* ((symbol (find-symbol name owner))
                       (fn (and symbol (fboundp symbol) (symbol-function symbol))))
                  (unless (and symbol fn) (error "No function binding"))
                  (format report "FUNCTION type=~S~%" (type-of fn))
                  ;; TYPEP keeps this independent of which package names the
                  ;; implementation uses for the COMPILED-FUNCTION type.
                  (if (and count-fn constant-fn (typep fn 'compiled-function))
                      (let ((count (try-count count-fn fn symbol)))
                        (format report "COUNT ~S~%" count)
                        (when (and (integerp count) (<= 0 count) (<= count 256))
                          (dotimes (index count)
                            (format report "CONSTANT ~D ~S~%"
                                    index (try-constant constant-fn fn index symbol)))))
                      (format report "UNAVAILABLE~%")))
              (error (problem) (format report "ERROR ~S~%" (type-of problem))))
            (finish-output report))
          (format report "END function-constants~%")
          (finish-output report))))))
