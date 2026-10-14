;;; Source-bound PRE-CALL metadata for the SELECT-SUBJECT PREMIUM method and
;;; PICK. This is a read-only CLOS census plus 64-byte function-object headers;
;;; it never invokes either function or edits Lisp/native memory.
(in-package :cl-user)

(defvar *aaron-premium-callsite-metadata-report* nil)

(defun aaron-premium-callsite-metadata-emit (control &rest args)
  (apply #'format *aaron-premium-callsite-metadata-report* control args)
  (terpri *aaron-premium-callsite-metadata-report*)
  nil)

(defun aaron-premium-callsite-function-header (name function memref)
  (unless (eq (type-of function) 'compiled-function)
    (error "~A is not a compiled function" name))
  (let ((header
          (with-output-to-string (out)
            (dotimes (index 64)
              (format out "~2,'0X"
                      (funcall memref function 0 index :unsigned-byte)))))
        (*print-length* 24) (*print-level* 8) (*print-circle* nil)
        (*print-pretty* nil) (*print-readably* nil))
    (aaron-premium-callsite-metadata-emit
     "FUNCTION name=~S type=~S" name (type-of function))
    (aaron-premium-callsite-metadata-emit
     "HEADER name=~S bytes=~A" name header)))

(defun aaron-premium-callsite-summary (value &optional (depth 0))
  (cond ((numberp value) (list :number value))
        ((symbolp value)
         (list :symbol (and (symbol-package value)
                            (package-name (symbol-package value)))
               (symbol-name value)))
        ((stringp value)
         (list :string (length value)
               (subseq value 0 (min 120 (length value)))))
        ((and (consp value) (< depth 4))
         (list :cons (aaron-premium-callsite-summary (car value) (1+ depth))
               (aaron-premium-callsite-summary (cdr value) (1+ depth))))
        (t (list :type (type-of value)))))

(unless (boundp 'aaron-premium-callsite-metadata-v1-loaded)
  (set 'aaron-premium-callsite-metadata-v1-loaded t)
  (with-open-file (*aaron-premium-callsite-metadata-report*
                    "C:\\temp\\aaron-premium-callsite-metadata-v1.txt"
                    :direction :output :if-exists :supersede
                    :if-does-not-exist :create)
    (let* ((*print-length* 24) (*print-level* 8) (*print-pretty* nil)
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
                 (aaron-premium-callsite-metadata-emit
                  "ERROR scope=~A stage=~A problem=~S"
                  scope stage
                  (if (symbolp problem) problem (type-of problem)))
                 (finish-output *aaron-premium-callsite-metadata-report*))
               (specializer-summary (specializer class-name eql-object)
                 (if (string= "EQL-SPECIALIZER"
                              (symbol-name (type-of specializer)))
                     (if eql-object
                         (list :eql (aaron-premium-callsite-summary
                                    (funcall eql-object specializer)))
                       (list :eql-object-unavailable
                             (aaron-premium-callsite-summary specializer)))
                   (if class-name
                       (list :class (aaron-premium-callsite-summary
                                     (funcall class-name specializer)))
                     (aaron-premium-callsite-summary specializer))))
               (write-method (index method method-function method-specializers
                                   method-qualifiers arglist class-name eql-object
                                   memref)
                 (aaron-premium-callsite-metadata-emit
                  "METHOD index=~D type=~S" index (type-of method))
                 (handler-case
                     (aaron-premium-callsite-metadata-emit
                      "QUALIFIERS index=~D values=~S"
                      index (funcall method-qualifiers method))
                   (error (problem)
                     (record-error (format nil "METHOD-~D" index)
                                   "QUALIFIERS" problem)))
                 (handler-case
                     (aaron-premium-callsite-metadata-emit
                      "SPECIALIZERS index=~D values=~S" index
                      (mapcar (lambda (specializer)
                                (specializer-summary specializer class-name
                                                     eql-object))
                              (funcall method-specializers method)))
                   (error (problem)
                     (record-error (format nil "METHOD-~D" index)
                                   "SPECIALIZERS" problem)))
                 (handler-case
                     (let* ((function (funcall method-function method))
                            (method-name
                              (format nil "SELECT-SUBJECT-METHOD-~D" index)))
                       (when arglist
                         (aaron-premium-callsite-metadata-emit
                          "ARGLIST name=~S values=~S" method-name
                          (funcall arglist function)))
                       (aaron-premium-callsite-function-header
                        method-name function memref))
                   (error (problem)
                     (record-error (format nil "METHOD-~D" index)
                                   "METHOD-FUNCTION" problem)))))
        (aaron-premium-callsite-metadata-emit
         "BEGIN premium-callsite-metadata-v1")
        (aaron-premium-callsite-metadata-emit
         "INSTALL target=SELECT-SUBJECT+PICK mode=READ-ONLY-METADATA")
        (finish-output *aaron-premium-callsite-metadata-report*)
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
              (unless (and owner gf-symbol (fboundp gf-symbol)
                           generic-function-methods method-function
                           method-specializers method-qualifiers eql-object
                           class-name arglist memref)
                (error "SELECT-SUBJECT metadata helpers unavailable"))
              (let ((generic-function (symbol-function gf-symbol)))
                (unless (eq (type-of generic-function)
                            'standard-generic-function)
                  (error "SELECT-SUBJECT is not a STANDARD-GENERIC-FUNCTION"))
                (aaron-premium-callsite-metadata-emit
                 "TARGET name=\"SELECT-SUBJECT\" package=~S type=~S arglist=~S"
                 (package-name (symbol-package gf-symbol))
                 (type-of generic-function) (funcall arglist gf-symbol))
                (let ((remaining (funcall generic-function-methods
                                          generic-function)))
                  (setf method-status :enumerating)
                  (do ((index 0 (1+ index)))
                      ((or (null remaining) (>= index max-methods)))
                    (write-method index (car remaining) method-function
                                  method-specializers method-qualifiers arglist
                                  class-name eql-object memref)
                    (setf remaining (cdr remaining))
                    (incf method-count)
                    (finish-output *aaron-premium-callsite-metadata-report*))
                  (when remaining
                    (setf methods-truncated t method-status :truncated)
                    (incf truncation-count))
                  (unless remaining (setf method-status :complete)))
                (aaron-premium-callsite-metadata-emit
                 "METHOD-COUNT total=~A emitted=~D limit=~D status=~S truncated=~S"
                 (if (eq method-status :complete)
                     (format nil "~D" method-count)
                   (if (eq method-status :truncated)
                       (format nil ">~D" max-methods) "unknown"))
                 method-count max-methods method-status methods-truncated)
                (aaron-premium-callsite-metadata-emit
                 "ENUMERATION-STATUS ~S" method-status))
              (let* ((pick-symbol (find-symbol "PICK" owner))
                     (pick-function
                       (and pick-symbol (fboundp pick-symbol)
                            (symbol-function pick-symbol))))
                (unless pick-function (error "PICK is unavailable"))
                (aaron-premium-callsite-function-header
                 "PICK" pick-function memref)))
          (error (problem)
            (setf method-status :failed)
            (record-error "PREMIUM-CALLSITE" "ENUMERATION" problem)))
        (aaron-premium-callsite-metadata-emit
         "ERROR-COUNT ~D" error-count)
        (aaron-premium-callsite-metadata-emit
         "TRUNCATION-COUNT ~D" truncation-count)
        (aaron-premium-callsite-metadata-emit
         "READY premium-callsite-metadata-v1")
        (finish-output *aaron-premium-callsite-metadata-report*))))
  (unless (and (boundp 'aaron-pre-scene-probe-pause-seconds)
               (> aaron-pre-scene-probe-pause-seconds 0))
    (error "Expected the runner-owned positive pre-scene pause"))
  (let ((released nil))
    (dotimes (index (* 10 aaron-pre-scene-probe-pause-seconds))
      (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
        (setf released t)
        (return))
      (sleep 0.1))
    (unless released (error "PREMIUM callsite capture parent did not release the probe"))
    (with-open-file (report "C:\\temp\\aaron-premium-callsite-metadata-v1.txt"
                            :direction :output :if-exists :append
                            :if-does-not-exist :create)
      (format report "CAPTURE-WAIT released=T~%")
      (format report "COMPLETE execution=finished~%")
      (format report "END premium-callsite-metadata-v1~%")
      (finish-output report))))
