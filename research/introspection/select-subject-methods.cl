;;; Read-only census of SELECT-SUBJECT's CLOS methods and their compiled bodies.
;;; It never invokes the generic function or any method body.
(in-package :cl-user)

(unless (boundp 'aaron-select-subject-methods-loaded)
  (set 'aaron-select-subject-methods-loaded t)
  (with-open-file (report "C:\\temp\\aaron-select-subject-methods.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 24) (*print-level* 8) (*print-pretty* nil)
          (*print-readably* nil) (*print-circle* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (error-count 0) (truncation-count 0) (method-count 0)
          (methods-truncated nil) (method-status :not-started)
          (max-methods 64))
      (labels ((helper (name package)
                 (let ((symbol (and package (find-symbol name package))))
                   (and symbol (fboundp symbol) symbol)))
               (record-error (scope stage problem)
                 (incf error-count)
                 (format report "ERROR scope=~A stage=~A problem=~S~%"
                         scope stage
                         (if (symbolp problem) problem (type-of problem)))
                 (finish-output report))
               (record-truncation (kind detail)
                 (incf truncation-count)
                 (format report "TRUNCATION kind=~A detail=~S~%" kind detail)
                 (finish-output report))
               (summary (value &optional (depth 0))
                 (cond ((numberp value) (list :number value))
                       ((symbolp value)
                        (list :symbol (and (symbol-package value)
                                           (package-name (symbol-package value)))
                              (symbol-name value)))
                       ((stringp value)
                        (list :string (length value)
                              (subseq value 0 (min 120 (length value)))))
                       ((and (consp value) (< depth 4))
                        (list :cons (summary (car value) (1+ depth))
                              (summary (cdr value) (1+ depth))))
                       (t (list :type (type-of value)))))
               (specializer-summary (specializer class-name eql-object)
                 (if (string= "EQL-SPECIALIZER"
                              (symbol-name (type-of specializer)))
                     (if eql-object
                         (list :eql (summary (funcall eql-object specializer)))
                       (list :eql-object-unavailable (summary specializer)))
                   (if class-name
                       (list :class (summary (funcall class-name specializer)))
                     (summary specializer))))
               (write-header (name function memref)
                 (if (null memref)
                     (record-error name "MEMREF" :helper-unavailable)
                   (handler-case
                       (let ((bytes
                               (with-output-to-string (out)
                                 (dotimes (i 64)
                                   (format out "~2,'0X"
                                           (funcall memref function 0 i
                                                    :unsigned-byte))))))
                         (format report "HEADER name=~S bytes=~A~%" name bytes)
                         (finish-output report))
                     (error (problem)
                       (record-error name "HEADER" problem)))))
               (write-method (index method method-function method-specializers
                                   method-qualifiers arglist class-name eql-object
                                   memref)
                 (format report "METHOD index=~D type=~S~%"
                         index (type-of method))
                 (if method-qualifiers
                     (handler-case
                         (format report "QUALIFIERS index=~D values=~S~%"
                                 index (funcall method-qualifiers method))
                       (error (problem)
                         (record-error (format nil "METHOD-~D" index)
                                       "QUALIFIERS" problem)))
                   (record-error (format nil "METHOD-~D" index)
                                 "QUALIFIERS" :helper-unavailable))
                 (if method-specializers
                     (handler-case
                         (format report "SPECIALIZERS index=~D values=~S~%"
                                 index
                                 (mapcar (lambda (specializer)
                                           (specializer-summary specializer
                                                                class-name
                                                                eql-object))
                                         (funcall method-specializers method)))
                       (error (problem)
                         (record-error (format nil "METHOD-~D" index)
                                       "SPECIALIZERS" problem)))
                   (record-error (format nil "METHOD-~D" index)
                                 "SPECIALIZERS" :helper-unavailable))
                 (if (null method-function)
                     (record-error (format nil "METHOD-~D" index)
                                   "METHOD-FUNCTION" :helper-unavailable)
                   (handler-case
                       (let* ((function (funcall method-function method))
                              (method-name
                                (format nil "SELECT-SUBJECT-METHOD-~D" index)))
                         (format report "METHOD-FUNCTION name=~S type=~S~%"
                                 method-name (type-of function))
                         (if arglist
                             (handler-case
                                 (format report "ARGLIST name=~S values=~S~%"
                                         method-name (funcall arglist function))
                               (error (problem)
                                 (record-error (format nil "METHOD-~D" index)
                                               "ARGLIST" problem)))
                           (record-error (format nil "METHOD-~D" index)
                                         "ARGLIST" :helper-unavailable))
                         (if (eq (type-of function) 'compiled-function)
                             (write-header method-name function memref)
                           (record-error method-name "METHOD-FUNCTION-TYPE"
                                         (type-of function))))
                     (error (problem)
                       (record-error (format nil "METHOD-~D" index)
                                      "METHOD-FUNCTION" problem))))))
        (format report "BEGIN select-subject-methods~%")
        (format report "INSTALL target=SELECT-SUBJECT mode=read-only~%")
        (finish-output report)
        (handler-case
            (let* ((gf-symbol (and owner (find-symbol "SELECT-SUBJECT" owner)))
                   (generic-function-methods
                     (helper "GENERIC-FUNCTION-METHODS" "CLOS"))
                   (method-function (helper "METHOD-FUNCTION" "CLOS"))
                   (method-specializers (helper "METHOD-SPECIALIZERS" "CLOS"))
                   (method-qualifiers (helper "METHOD-QUALIFIERS" "CLOS"))
                   (eql-object (helper "EQL-SPECIALIZER-OBJECT" "CLOS"))
                   (class-name (helper "CLASS-NAME" "COMMON-LISP"))
                   (arglist (helper "ARGLIST" "EXCL"))
                   (memref (helper "MEMREF" "SYSTEM")))
              (format report "HELPERS ~S~%"
                      (list generic-function-methods method-function
                            method-specializers method-qualifiers eql-object
                            class-name arglist memref))
              (unless (and gf-symbol (fboundp gf-symbol))
                (error "SELECT-SUBJECT is not fbound in COMMON-GRAPHICS-USER"))
              (let ((generic-function (symbol-function gf-symbol)))
                (format report "TARGET name=\"SELECT-SUBJECT\" package=~S type=~S arglist=~S~%"
                        (package-name (symbol-package gf-symbol))
                        (type-of generic-function)
                        (if arglist (funcall arglist gf-symbol) :unavailable))
                (unless (eq (type-of generic-function)
                            'standard-generic-function)
                  (error "SELECT-SUBJECT is not a STANDARD-GENERIC-FUNCTION"))
                (unless generic-function-methods
                  (error "CLOS:GENERIC-FUNCTION-METHODS unavailable"))
                (let ((remaining (funcall generic-function-methods
                                          generic-function)))
                  (setf method-status :enumerating)
                  (do ((index 0 (1+ index)))
                      ((or (null remaining) (>= index max-methods)))
                    (handler-case
                        (write-method index (car remaining) method-function
                                      method-specializers method-qualifiers arglist
                                      class-name eql-object memref)
                      (error (problem)
                        (record-error (format nil "METHOD-~D" index)
                                      "METHOD-REPORT" problem)))
                    (setf remaining (cdr remaining))
                    (incf method-count)
                    (finish-output report))
                  (when remaining
                    (setf methods-truncated t)
                    (setf method-status :truncated)
                    (record-truncation "methods"
                                       (list :emitted method-count
                                             :limit max-methods
                                             :more-methods-present t)))
                  (unless remaining
                    (setf method-status :complete))))
              (format report "METHOD-COUNT total=~A emitted=~D limit=~D status=~S truncated=~S~%"
                      (cond ((eq method-status :complete)
                             (format nil "~D" method-count))
                            ((eq method-status :truncated)
                             (format nil ">~D" max-methods))
                            (t "unknown"))
                      method-count max-methods method-status methods-truncated))
          (error (problem)
            (setf method-status :failed)
            (record-error "SELECT-SUBJECT" "ENUMERATION" problem)))
        (format report "ENUMERATION-STATUS ~S~%" method-status)
        (format report "ERROR-COUNT ~D~%" error-count)
        (format report "TRUNCATION-COUNT ~D~%" truncation-count)
        (format report "READY select-subject-methods~%")
        (finish-output report))))
  (unless (and (boundp 'aaron-pre-scene-probe-pause-seconds)
               (> aaron-pre-scene-probe-pause-seconds 0))
    (error "Expected the runner-owned positive pre-scene pause"))
  (let ((released nil))
    (dotimes (i (* 10 aaron-pre-scene-probe-pause-seconds))
      (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
        (setf released t)
        (return))
      (sleep 0.1))
    (unless released
      (error "Native capture parent did not release the probe"))
    (with-open-file (report "C:\\temp\\aaron-select-subject-methods.txt"
                            :direction :output :if-exists :append
                            :if-does-not-exist :create)
      (format report "CAPTURE-WAIT released=T~%")
      (format report "COMPLETE execution=finished~%")
      (format report "END select-subject-methods~%")
      (finish-output report))))
