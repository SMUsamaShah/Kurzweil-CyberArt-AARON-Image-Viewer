;;; Bounded, read-only metadata for the brush-fill helper boundary.
;;; Target functions and method bodies are never invoked or replaced.
(in-package :cl-user)

(unless (boundp 'aaron-brush-fill-helper-links-loaded)
  (set 'aaron-brush-fill-helper-links-loaded t)
  (with-open-file (report "C:\\temp\\aaron-brush-fill-helper-links.txt"
                          :direction :output :if-exists :supersede
                          :if-does-not-exist :create)
    (let ((*print-length* 24) (*print-level* 10) (*print-pretty* nil)
          (*print-readably* nil) (*print-circle* nil)
          (owner (find-package "COMMON-GRAPHICS-USER"))
          (error-count 0) (truncation-count 0)
          (target-count 0) (method-count 0)
          (header-count 0) (header-attempt-count 0)
          (header-limit-noted nil)
          (max-headers 64) (max-methods-per-generic 64)
          (max-constants-per-function 256)
          (max-constants-per-scope 512)
          (max-compiled-objects-per-scope 16)
          (max-nested-depth 2))
      (labels ((helper (name package)
                 (let ((symbol (and package (find-symbol name package))))
                   (and symbol (fboundp symbol) symbol)))
               (record-error (scope stage problem)
                 (incf error-count)
                 (format report
                         "ERROR scope=~A stage=~A problem=~S cell-error-name=~S~%"
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
               (ordinary-compiled-function-p (value)
                 ;; Some Allegro generic dispatchers satisfy TYPEP here.
                 ;; Only exact ordinary compiled-function objects are scanned.
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
                         (incf header-count)
                         (format report "HEADER name=~S bytes=~A~%"
                                 name bytes)
                         (finish-output report))
                      (error (problem)
                        (record-error name "HEADER" problem)))))
               (specializer-summary (specializer class-name eql-object)
                 (let ((specializer-type (type-of specializer)))
                   (if (and (symbolp specializer-type)
                            (string= "EQL-SPECIALIZER"
                                     (symbol-name specializer-type)))
                       (if eql-object
                           (list :eql (summary (funcall eql-object specializer)))
                         (list :eql-object-unavailable (summary specializer)))
                     (if class-name
                         (list :class (summary (funcall class-name specializer)))
                       (list :class-name-unavailable
                             (summary specializer))))))
               (record-arglist (name subject arglist)
                 (if (null arglist)
                     (record-error name "ARGLIST" :helper-unavailable)
                   (handler-case
                       (format report "ARGLIST name=~S values=~S~%"
                               name (multiple-value-list
                                     (funcall arglist subject)))
                      (error (problem)
                        (record-error name "ARGLIST" problem)))))
               (write-function (name function depth visited budget
                                     count-helper constant-helper memref)
                 (multiple-value-bind (prior seen-p) (gethash function visited)
                   (cond
                     (seen-p
                      (format report "CODE-ALIAS name=~S refers-to=~S~%"
                              name prior))
                     ((>= header-attempt-count max-headers)
                      (unless header-limit-noted
                        (setf header-limit-noted t)
                        (record-truncation "code-headers" name
                                           (list :limit max-headers))))
                     ((>= (aref budget 0) max-compiled-objects-per-scope)
                      (record-truncation "compiled-objects" name
                                         max-compiled-objects-per-scope))
                     (t
                      (setf (gethash function visited) name)
                      (incf (aref budget 0))
                      (incf header-attempt-count)
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
                                           max-constants-per-scope)))
                                (handler-case
                                    (let ((value
                                            (funcall constant-helper function i)))
                                      (format report
                                              "CONSTANT name=~S index=~D value=~S~%"
                                              name i (summary value))
                                      (incf emitted)
                                      (incf (aref budget 1))
                                      (when (ordinary-compiled-function-p value)
                                        (let ((child-name
                                                (format nil "~A-CONST-~D"
                                                        name i)))
                                          (if (< depth max-nested-depth)
                                              (write-function
                                               child-name value (1+ depth)
                                               visited budget count-helper
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
                                       :per-scope-budget
                                       max-constants-per-scope))))
                          (error (problem)
                            (record-error name "FUNCTION-CONSTANTS"
                                          problem))))))))
               (write-method (generic-name index method method-function
                                           method-specializers method-qualifiers
                                           arglist class-name eql-object
                                           count-helper constant-helper memref)
                 (let ((method-name
                         (format nil "~A-METHOD-~D" generic-name index)))
                   (format report "METHOD name=~S index=~D type=~S~%"
                           method-name index (type-of method))
                   (if method-qualifiers
                       (handler-case
                           (format report "QUALIFIERS name=~S values=~S~%"
                                   method-name
                                   (funcall method-qualifiers method))
                         (error (problem)
                           (record-error method-name "QUALIFIERS" problem)))
                     (record-error method-name "QUALIFIERS"
                                   :helper-unavailable))
                   (if method-specializers
                       (handler-case
                           (format report "SPECIALIZERS name=~S values=~S~%"
                                   method-name
                                   (mapcar (lambda (specializer)
                                             (specializer-summary specializer
                                                                  class-name
                                                                  eql-object))
                                           (funcall method-specializers method)))
                         (error (problem)
                           (record-error method-name "SPECIALIZERS" problem)))
                     (record-error method-name "SPECIALIZERS"
                                   :helper-unavailable))
                   (if (null method-function)
                       (record-error method-name "METHOD-FUNCTION"
                                     :helper-unavailable)
                     (handler-case
                         (let ((function (funcall method-function method)))
                           (format report
                                   "METHOD-FUNCTION name=~S type=~S~%"
                                   method-name (type-of function))
                           (record-arglist method-name function arglist)
                           (if (ordinary-compiled-function-p function)
                               (write-function
                                method-name function 0
                                (make-hash-table :test 'eq) (vector 0 0)
                                count-helper constant-helper memref)
                             (format report
                                     "METHOD-BODY-STATUS name=~S reason=not-exact-compiled-function type=~S~%"
                                     method-name (type-of function))))
                       (error (problem)
                         (record-error method-name "METHOD-FUNCTION"
                                       problem))))))
               (write-generic-methods (name generic-function
                                       generic-function-methods method-function
                                       method-specializers method-qualifiers
                                       arglist class-name eql-object count-helper
                                       constant-helper memref)
                 (if (null generic-function-methods)
                     (record-error name "GENERIC-FUNCTION-METHODS"
                                   :helper-unavailable)
                   (handler-case
                       (let ((methods
                               (funcall generic-function-methods
                                        generic-function))
                             (remaining nil) (index 0) (status :enumerating))
                         (setf remaining methods)
                         (do () ((or (not (consp remaining))
                                     (>= index max-methods-per-generic)))
                           (handler-case
                               (write-method
                                name index (car remaining) method-function
                                method-specializers method-qualifiers arglist
                                class-name eql-object count-helper
                                constant-helper memref)
                             (error (problem)
                               (record-error
                                (format nil "~A-METHOD-~D" name index)
                                "METHOD-REPORT" problem)))
                           (setf remaining (cdr remaining))
                           (incf index)
                           (incf method-count)
                           (finish-output report))
                         (cond ((and remaining (not (consp remaining)))
                                (setf status :invalid-list)
                                (record-error name "METHOD-LIST"
                                              :improper-list))
                               ((consp remaining)
                                (setf status :truncated)
                                (record-truncation
                                 "methods" name
                                 (list :emitted index
                                       :limit max-methods-per-generic)))
                               (t (setf status :complete)))
                         (format report
                                 "METHOD-ENUMERATION name=~S emitted=~D limit=~D status=~S~%"
                                 name index max-methods-per-generic status))
                      (error (problem)
                        (record-error name "METHOD-ENUMERATION" problem)))))
                (inspect-target (name generic-function-methods method-function
                                     method-specializers method-qualifiers
                                     eql-object class-name arglist count-helper
                                     constant-helper memref)
                 (incf target-count)
                 (let* ((symbol (and owner (find-symbol name owner)))
                        (function (and symbol (fboundp symbol)
                                       (symbol-function symbol))))
                   (if (null function)
                       (record-error name "TARGET" :missing-or-unbound)
                     (progn
                       (format report "TARGET name=~S type=~S~%"
                               name (type-of function))
                       (record-arglist name symbol arglist)
                       (cond
                         ((eq (type-of function) 'standard-generic-function)
                          (format report
                                  "TARGET-KIND name=~S kind=STANDARD-GENERIC-FUNCTION~%"
                                  name)
                          (write-generic-methods
                           name function generic-function-methods method-function
                           method-specializers method-qualifiers arglist
                           class-name eql-object count-helper constant-helper
                           memref))
                         ((ordinary-compiled-function-p function)
                          (format report
                                  "TARGET-KIND name=~S kind=ORDINARY-COMPILED-FUNCTION~%"
                                  name)
                          (write-function name function 0
                                          (make-hash-table :test 'eq)
                                          (vector 0 0) count-helper
                                          constant-helper memref))
                         (t
                          (format report
                                  "TARGET-BODY-STATUS name=~S reason=not-exact-ordinary-compiled-function type=~S~%"
                                  name (type-of function))))))))
               (finish-report ()
                 (format report
                         "TOTALS targets=~D methods=~D code-headers=~D header-attempts=~D header-limit=~D errors=~D truncations=~D~%"
                         target-count method-count header-count
                         header-attempt-count max-headers error-count
                         truncation-count)
                 (format report "ERROR-COUNT ~D~%" error-count)
                 (format report "TRUNCATION-COUNT ~D~%" truncation-count)
                 (format report "END brush-fill-helper-links~%")
                 (finish-output report)))
        (format report "BEGIN brush-fill-helper-links~%")
        (format report
                "LIMITS targets=5 methods-per-generic=~D headers=~D constants-per-function=~D constants-per-scope=~D objects-per-scope=~D nested-depth=~D~%"
                max-methods-per-generic max-headers max-constants-per-function
                max-constants-per-scope max-compiled-objects-per-scope
                max-nested-depth)
        (unwind-protect
            (handler-case
                (let* ((generic-function-methods
                         (helper "GENERIC-FUNCTION-METHODS" "CLOS"))
                       (method-function (helper "METHOD-FUNCTION" "CLOS"))
                       (method-specializers (helper "METHOD-SPECIALIZERS" "CLOS"))
                       (method-qualifiers (helper "METHOD-QUALIFIERS" "CLOS"))
                       (eql-object (helper "EQL-SPECIALIZER-OBJECT" "CLOS"))
                       (class-name (helper "CLASS-NAME" "COMMON-LISP"))
                       (arglist (helper "ARGLIST" "EXCL"))
                       (count-helper
                         (helper "FUNCTION-CONSTANT-COUNT" "EXCL"))
                       (constant-helper (helper "FUNCTION-CONSTANT" "EXCL"))
                       (memref (helper "MEMREF" "SYSTEM")))
                  (format report "HELPERS ~S~%"
                          (list generic-function-methods method-function
                                method-specializers method-qualifiers eql-object
                                class-name arglist count-helper constant-helper
                                memref))
                  (dolist (name '("POST-FILL" "FILL-STRATEGY" "SET-MEDIANS"
                                  "GOOD-START" "FLASH-SPOT"))
                    (handler-case
                        (inspect-target
                         name generic-function-methods method-function
                         method-specializers method-qualifiers eql-object
                         class-name arglist count-helper constant-helper memref)
                      (error (problem)
                        (record-error name "TARGET-REPORT" problem)))
                    (finish-output report)))
              (error (problem)
                (record-error "HELPER-LINKS" "ENUMERATION" problem)))
          (finish-report)))))
  (when (and (boundp 'aaron-pre-scene-probe-pause-seconds)
             (> aaron-pre-scene-probe-pause-seconds 0))
    (let ((released nil))
      (dotimes (i (* 10 aaron-pre-scene-probe-pause-seconds))
        (when (probe-file "C:\\temp\\aaron-native-code-release.txt")
          (setf released t)
          (return))
        (sleep 0.1))
      (unless released
        (error "Native capture parent did not release the probe")))))
