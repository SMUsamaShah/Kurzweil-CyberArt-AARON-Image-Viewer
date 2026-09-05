;;; Inspect method metadata and bounded constant summaries, never call an
;;; AARON method. Generic-function constants describe dispatch machinery;
;;; the method-function constants may expose the actual drawing rules.
(in-package :cl-user)
(unless (boundp 'aaron-generic-methods-loaded)
  (set 'aaron-generic-methods-loaded t)
  (with-open-file (report "C:\\temp\\aaron-generic-methods.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 24) (*print-level* 5) (*print-circle* nil)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER")))
      (labels ((helper (name)
                 (let ((found nil))
                   (do-all-symbols (symbol)
                     (when (and (not found) (string= name (symbol-name symbol))
                                (fboundp symbol))
                       (setf found symbol)))
                   found))
               (summary (value)
                 (cond ((numberp value) (list :number value))
                       ((symbolp value)
                        (list :symbol (and (symbol-package value)
                                           (package-name (symbol-package value)))
                              (symbol-name value)))
                       ((stringp value) (list :string (length value)))
                       (t (list :type (type-of value))))))
        (format report "BEGIN generic-methods~%")
        (let ((methods (helper "GENERIC-FUNCTION-METHODS"))
              (method-fn (helper "METHOD-FUNCTION"))
              (specializers (helper "METHOD-SPECIALIZERS"))
              (class-name (helper "CLASS-NAME"))
              (arglist (helper "ARGLIST"))
              (count-fn (helper "FUNCTION-CONSTANT-COUNT"))
              (constant-fn (helper "FUNCTION-CONSTANT")))
          (format report "HELPERS ~S~%"
                  (list methods method-fn specializers class-name arglist count-fn constant-fn))
          (finish-output report)
          (dolist (name '("WIGGLE" "PREP-LINE" "RAN" "SELECT-BRUSH"
                          "MAPLINE" "LINE-MAPPING" "SCRIPT"
                          "BUILD-FIGURE" "GENERATE-PERSON"))
            (format report "TRY ~S~%" name)
            (finish-output report)
            (handler-case
                (let ((items (funcall methods (symbol-function (find-symbol name owner)))))
                  (loop for item in items for index from 0 below 32 do
                    (format report "METHOD ~D~%" index)
                    (finish-output report)
                    (handler-case
                        (let ((fn (funcall method-fn item)))
                          (format report "SPECIALIZERS ~S~%"
                                  (mapcar (lambda (spec)
                                            (handler-case (summary (funcall class-name spec))
                                              (error () (list :type (type-of spec)))))
                                          (funcall specializers item)))
                          (format report "ARGLIST ~S~%" (funcall arglist fn))
                          (format report "FUNCTION ~S~%" (type-of fn))
                          (let ((count (funcall count-fn fn)))
                            (format report "COUNT ~S~%" count)
                            (when (and (integerp count) (<= 0 count 128))
                              (dotimes (i count)
                                (format report "CONSTANT ~D ~S~%" i
                                        (summary (funcall constant-fn fn i)))))))
                      (error (problem) (format report "METHOD-ERROR ~S ~A~%" (type-of problem) problem)))
                    (finish-output report)))
              (error (problem) (format report "ERROR ~S ~A~%" (type-of problem) problem)))
            (finish-output report)))
        (format report "END generic-methods~%")
        (finish-output report)))))
