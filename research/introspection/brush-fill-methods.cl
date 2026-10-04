;;; Bounded, read-only inspection of MY-FILL's CLOS methods.
;;; This records method metadata and compiled constant tables only. It never
;;; invokes the generic function or any method body.
(in-package :cl-user)

(unless (boundp 'aaron-brush-fill-methods-loaded)
  (set 'aaron-brush-fill-methods-loaded t)
  (with-open-file (report "C:\\temp\\aaron-brush-fill-methods.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 24) (*print-level* 10) (*print-pretty* nil)
          (*print-readably* nil) (*print-circle* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (error-count 0) (truncation-count 0) (method-count 0)
          (methods-truncated nil) (method-status :not-started)
          (max-methods 64) (max-constants-per-function 256)
          (max-constants-per-method 512) (max-compiled-objects-per-method 16)
          (max-nested-depth 2))
      (labels ((helper (name package)
                 (let ((symbol (and package (find-symbol name package))))
                   (and symbol (fboundp symbol) symbol)))
                (record-error (scope stage problem)
                  (incf error-count)
                  (format report "ERROR scope=~A stage=~A problem=~S cell-error-name=~S~%"
                          scope stage
                          (if (symbolp problem) problem (type-of problem))
                          (if (and (not (symbolp problem))
                                   (typep problem 'cell-error))
                              (handler-case (cell-error-name problem)
                                (error () :unavailable))
                            :not-applicable))
                 (finish-output report))
               (record-truncation (kind path detail)
                 (incf truncation-count)
                 (format report "TRUNCATION kind=~A path=~A detail=~S~%"
                         kind path detail)
                 (finish-output report))
               (summary (value &optional (depth 0))
                 (cond ((numberp value) (list :number value))
                       ((symbolp value)
                        (list :symbol (and (symbol-package value)
                                           (package-name (symbol-package value)))
                              (symbol-name value)))
                       ((stringp value)
                        (list :string (length value)
                              (subseq value 0 (min 160 (length value)))))
                       ((and (consp value) (< depth 5))
                        (list :cons (summary (car value) (1+ depth))
                              (summary (cdr value) (1+ depth))))
                       (t (list :type (type-of value)))))
               (compiled-function-p (value)
                 ;; TYPEP is too broad in this Allegro build: some generic
                 ;; dispatchers satisfy COMPILED-FUNCTION despite not being
                 ;; ordinary compiled-function objects.
                 (eq (type-of value) 'compiled-function))
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
               (specializer-summary (specializer class-name eql-object)
                 (if (string= "EQL-SPECIALIZER"
                              (symbol-name (type-of specializer)))
                     (if eql-object
                         (list :eql (summary (funcall eql-object specializer)))
                       (list :eql-object-unavailable
                             (summary specializer)))
                   (if class-name
                       (list :class (summary (funcall class-name specializer)))
                     (summary specializer))))
               (write-function (name function depth visited budget
                                     count-helper constant-helper memref)
                 (multiple-value-bind (prior seen-p) (gethash function visited)
                   (cond
                     (seen-p
                      (format report "CODE-ALIAS name=~S refers-to=~S~%"
                              name prior))
                     ((>= (aref budget 0) max-compiled-objects-per-method)
                      (record-truncation "compiled-objects" name
                                         max-compiled-objects-per-method))
                     (t
                      (setf (gethash function visited) name)
                      (incf (aref budget 0))
                      (format report "FUNCTION name=~S type=~S~%"
                              name (type-of function))
                      (format report "FUNCTION-DEPTH name=~S depth=~D~%"
                              name depth)
                      (write-header name function memref)
                      (if (or (null count-helper) (null constant-helper))
                          (record-error name "FUNCTION-CONSTANT-HELPERS"
                                        :helper-unavailable)
                        (handler-case
                            (let ((count (funcall count-helper function))
                                  (emitted 0))
                              (unless (and (integerp count) (<= 0 count 4096))
                                (error "Unexpected constant count"))
                              (format report "CONSTANT-COUNT name=~S count=~D~%"
                                      name count)
                              (do ((i 0 (1+ i)))
                                  ((or (>= i count)
                                       (>= i max-constants-per-function)
                                       (>= (aref budget 1)
                                           max-constants-per-method)))
                                (handler-case
                                    (let ((value
                                            (funcall constant-helper function i)))
                                      (format report "CONSTANT name=~S index=~D value=~S~%"
                                              name i (summary value))
                                      (incf emitted)
                                      (incf (aref budget 1))
                                      (when (compiled-function-p value)
                                        (let ((child-name
                                                (format nil "~A-CONST-~D"
                                                        name i)))
                                          (if (< depth max-nested-depth)
                                              (write-function child-name value
                                                              (1+ depth) visited
                                                              budget count-helper
                                                              constant-helper memref)
                                            (record-truncation
                                             "nested-depth" child-name
                                             max-nested-depth)))))
                                  (error (problem)
                                    (record-error name
                                                  (format nil "CONSTANT-~D" i)
                                                  problem)))
                                (finish-output report))
                              (when (< emitted count)
                                (record-truncation
                                 "constants" name
                                 (list :total count :emitted emitted
                                       :per-function-limit
                                       max-constants-per-function
                                       :per-method-budget
                                       max-constants-per-method))))
                          (error (problem)
                            (record-error name "FUNCTION-CONSTANTS" problem))))))))
               (write-method (index method method-function method-specializers
                                   method-qualifiers arglist class-name eql-object
                                   count-helper constant-helper memref)
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
                       (let ((function (funcall method-function method)))
                         (let ((method-name
                                 (format nil "MY-FILL-METHOD-~D" index)))
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
                           (if (compiled-function-p function)
                               (write-function
                                method-name function 0 (make-hash-table :test 'eq)
                                (vector 0 0) count-helper constant-helper memref)
                             (format report
                                     "FUNCTION-BODY-STATUS index=~D reason=not-exact-compiled-function type=~S~%"
                                     index (type-of function)))))
                      (error (problem)
                        (record-error (format nil "METHOD-~D" index)
                                      "METHOD-FUNCTION" problem)))))
        )
        (format report "BEGIN brush-fill-methods~%")
        (finish-output report)
        (unwind-protect
            (handler-case
                (let* ((gf-symbol (and owner (find-symbol "MY-FILL" owner)))
                       (generic-function-methods
                         (helper "GENERIC-FUNCTION-METHODS" "CLOS"))
                       (method-function (helper "METHOD-FUNCTION" "CLOS"))
                       (method-specializers (helper "METHOD-SPECIALIZERS" "CLOS"))
                       (method-qualifiers (helper "METHOD-QUALIFIERS" "CLOS"))
                       (eql-object (helper "EQL-SPECIALIZER-OBJECT" "CLOS"))
                       (class-name (helper "CLASS-NAME" "COMMON-LISP"))
                       (arglist (helper "ARGLIST" "EXCL"))
                       (count-helper (helper "FUNCTION-CONSTANT-COUNT" "EXCL"))
                       (constant-helper (helper "FUNCTION-CONSTANT" "EXCL"))
                       (memref (helper "MEMREF" "SYSTEM")))
                  (format report "HELPERS ~S~%"
                          (list generic-function-methods method-function
                                method-specializers method-qualifiers eql-object
                                class-name arglist count-helper constant-helper
                                memref))
                  (unless (and gf-symbol (fboundp gf-symbol))
                    (error "MY-FILL is not fbound"))
                  (let ((generic-function (symbol-function gf-symbol)))
                    (format report "TARGET name=\"MY-FILL\" type=~S arglist=~S~%"
                            (type-of generic-function)
                            (if arglist (funcall arglist gf-symbol) :unavailable))
                    (unless (eq (type-of generic-function)
                                'standard-generic-function)
                      (error "MY-FILL is not a STANDARD-GENERIC-FUNCTION"))
                    (unless generic-function-methods
                      (error "CLOS:GENERIC-FUNCTION-METHODS unavailable"))
                    (let ((methods (funcall generic-function-methods
                                            generic-function))
                          (remaining nil))
                      (setf method-status :enumerating)
                      (setf remaining methods)
                      (do ((index 0 (1+ index)))
                          ((or (null remaining) (>= index max-methods)))
                        (handler-case
                            (write-method index (car remaining) method-function
                                          method-specializers method-qualifiers
                                          arglist class-name eql-object count-helper
                                          constant-helper memref)
                          (error (problem)
                            (record-error (format nil "METHOD-~D" index)
                                          "METHOD-REPORT" problem)))
                        (setf remaining (cdr remaining))
                        (incf method-count)
                        (finish-output report))
                      (when remaining
                        (setf methods-truncated t)
                        (setf method-status :truncated)
                        (record-truncation "methods" "MY-FILL"
                                           (list :emitted method-count
                                                 :limit max-methods
                                                 :more-methods-present t)))
                      (unless remaining
                        (setf method-status :complete)))))
              (error (problem)
                (setf method-status :failed)
                (record-error "MY-FILL" "ENUMERATION" problem)))
          (format report "METHOD-COUNT total=~A emitted=~D limit=~D status=~S truncated=~S~%"
                  (cond ((eq method-status :complete)
                         (format nil "~D" method-count))
                        ((eq method-status :truncated)
                         (format nil ">~D" max-methods))
                        (t "unknown"))
                  method-count max-methods method-status methods-truncated)
          (format report "ERROR-COUNT ~D~%" error-count)
          (format report "TRUNCATION-COUNT ~D~%" truncation-count)
          (format report "END brush-fill-methods~%")
          (finish-output report)))))
  (when (and (boundp 'aaron-pre-scene-probe-pause-seconds)
             (> aaron-pre-scene-probe-pause-seconds 0))
    (let ((released nil))
      (dotimes (i (* 10 aaron-pre-scene-probe-pause-seconds))
        (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
          (setf released t)
          (return))
        (sleep 0.1))
      (unless released (error "Native capture parent did not release the probe")))))
