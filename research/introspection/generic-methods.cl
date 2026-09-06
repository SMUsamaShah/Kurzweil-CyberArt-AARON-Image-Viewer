;;; Inspect method metadata and bounded constant summaries, never call an
;;; AARON method. Generic-function constants describe dispatch machinery;
;;; the method-function constants may expose the actual drawing rules.
(in-package :cl-user)
(unless (boundp 'aaron-generic-methods-loaded)
  (set 'aaron-generic-methods-loaded t)
  (with-open-file (report "C:\\temp\\aaron-generic-methods.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 24) (*print-level* 10) (*print-circle* nil)
          (*print-pretty* nil)
          (owner (find-package "COMMON-GRAPHICS-USER")))
      (labels ((helper (name)
                 (let ((found nil))
                   (do-all-symbols (symbol)
                     (when (and (not found) (string= name (symbol-name symbol))
                                (fboundp symbol))
                       (setf found symbol)))
                   found))
               (summary (value &optional (depth 0))
                 (cond ((numberp value) (list :number value))
                       ((symbolp value)
                        (list :symbol (and (symbol-package value)
                                           (package-name (symbol-package value)))
                              (symbol-name value)))
                       ((stringp value)
                        (list :string (length value) (subseq value 0 (min 160 (length value)))))
                       ((and (consp value) (< depth 5))
                        (list :cons (summary (car value) (1+ depth))
                              (summary (cdr value) (1+ depth))))
                       (t (list :type (type-of value))))))
        (format report "BEGIN generic-methods~%")
        (let ((methods (helper "GENERIC-FUNCTION-METHODS"))
              (method-fn (helper "METHOD-FUNCTION"))
              (specializers (helper "METHOD-SPECIALIZERS"))
              (eql-object (helper "EQL-SPECIALIZER-OBJECT"))
              (class-name (helper "CLASS-NAME"))
              (arglist (helper "ARGLIST"))
              (count-fn (helper "FUNCTION-CONSTANT-COUNT"))
              (constant-fn (helper "FUNCTION-CONSTANT")))
          (format report "HELPERS ~S~%"
                  (list methods method-fn specializers eql-object class-name arglist count-fn constant-fn))
          (finish-output report)
          (dolist (name '("WIGGLE" "PREP-LINE" "RAN"
                          "MAPLINE" "LINE-MAPPING" "SCRIPT"
                          "BUILD-FIGURE" "GENERATE-PERSON"))
            (format report "TRY ~S~%" name)
            (finish-output report)
            (handler-case
                (let ((items (funcall methods (symbol-function (find-symbol name owner)))))
                  ;; Extended LOOP tries to autoload the absent loop.fasl.
                  ;; DO and CAR/CDR keep this probe within the shipped runtime.
                  (do ((remaining items (cdr remaining)) (index 0 (1+ index)))
                      ((or (null remaining) (>= index 32)))
                    (format report "METHOD ~D~%" index)
                    (finish-output report)
                    (handler-case
                        (let* ((item (car remaining)) (fn (funcall method-fn item)))
                          (format report "SPECIALIZERS ~S~%"
                                  (mapcar (lambda (spec)
                                            (handler-case
                                                (if (and eql-object
                                                         (string= "EQL-SPECIALIZER"
                                                                  (symbol-name (type-of spec))))
                                                    (list :eql (summary (funcall eql-object spec)))
                                                  (summary (funcall class-name spec)))
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
                      (error (problem) (format report "METHOD-ERROR ~S~%" (type-of problem))))
                    (finish-output report)))
              (error (problem) (format report "ERROR ~S~%" (type-of problem))))
            (finish-output report))
          ;; These candidates have ordinary retained signatures; do not
          ;; assume GENERIC-FUNCTION-METHODS applies to every compiled function.
          (dolist (name '("SELECT-BRUSH" "MAKE-TWOPT" "SCORE-MAP"))
            (format report "DIRECT ~S~%" name)
            (finish-output report)
            (handler-case
                (let* ((fn (symbol-function (find-symbol name owner)))
                       (count (funcall count-fn fn)))
                  (format report "ARGLIST ~S~%" (funcall arglist fn))
                  (format report "FUNCTION ~S~%" (type-of fn))
                  (format report "COUNT ~S~%" count)
                  (when (and (integerp count) (<= 0 count 128))
                    (dotimes (i count)
                      (format report "CONSTANT ~D ~S~%" i
                              (summary (funcall constant-fn fn i))))))
              (error (problem) (format report "ERROR ~S~%" (type-of problem))))
            (finish-output report)))
        (format report "END generic-methods~%")
        (finish-output report)))))
