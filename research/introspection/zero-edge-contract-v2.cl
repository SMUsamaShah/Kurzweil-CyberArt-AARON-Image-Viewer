;;; Read-only ZERO-EDGE metadata plus one gated MAKE-TRIPT contract sample.
;;; ZERO-EDGE is inspected but never called or replaced.
(in-package :cl-user)

(with-open-file (report "C:\\temp\\aaron-zero-edge-contract-v2.txt"
                        :direction :output :if-exists :supersede
                        :if-does-not-exist :create)
  (let ((*print-length* 128)
        (*print-level* 16)
        (*print-pretty* nil)
        (*print-circle* t)
        (*print-readably* nil)
        (owner (find-package "COMMON-GRAPHICS-USER"))
        (excl (find-package "EXCL"))
        (function-symbols (make-hash-table :test #'equal))
        (function-info (make-hash-table :test #'equal))
        (arglists (make-hash-table :test #'equal))
        (errors 0)
        (sample-attempted nil)
        (sample-returned nil)
        (sample-completed nil))
    (labels
        ((emit (control &rest arguments)
           (apply #'format report control arguments)
           (terpri report)
           (finish-output report))
         (condition-details (condition)
           (let ((function-identity
                   (if (typep condition 'undefined-function)
                       (handler-case
                           (let* ((cl-package (find-package "COMMON-LISP"))
                                  (cell-name-symbol
                                    (and cl-package
                                         (find-symbol "CELL-ERROR-NAME"
                                                      cl-package))))
                             (if (and cell-name-symbol
                                      (fboundp cell-name-symbol))
                                 (let ((name
                                         (funcall
                                          (symbol-function cell-name-symbol)
                                          condition)))
                                   (if (symbolp name)
                                       (list :symbol
                                             (if (symbol-package name)
                                                 (package-name
                                                  (symbol-package name))
                                               "UNINTERNED")
                                             (symbol-name name))
                                     (list :type (type-of name))))
                               :cell-error-name-unavailable))
                         (condition () :cell-error-name-failed))
                     :not-undefined-function))
                 (message
                   (handler-case
                       (if (typep condition 'simple-condition)
                           (let ((control
                                   (simple-condition-format-control condition)))
                             (if (stringp control)
                                 (list :kind :format-control
                                       :length (length control)
                                       :prefix (subseq control
                                                       0 (min 256
                                                              (length control)))
                                       :truncated (> (length control) 256))
                               :format-control-unavailable))
                         (list :kind :condition-type :type (type-of condition)))
                     (condition () :unavailable))))
             (list :undefined-function function-identity :message message)))
         (record-error (phase condition)
           (incf errors)
           (emit "ERROR phase=~S type=~S details=~S"
                 phase (type-of condition) (condition-details condition)))
         (value-summary (value)
           (let ((budget 256))
             (labels
                 ((walk (item depth)
                    (cond
                      ((<= budget 0) :node-limit)
                      (t
                       (decf budget)
                       (cond
                         ((null item) nil)
                         ((eq item t) t)
                         ((numberp item)
                          (list :number (type-of item) item))
                         ((characterp item)
                          (list :character (type-of item) (char-code item)))
                         ((stringp item)
                          (list :string :length (length item)
                                :prefix (subseq item 0
                                                (min 256 (length item)))
                                :truncated (> (length item) 256)))
                         ((symbolp item)
                          (list :symbol
                                (if (symbol-package item)
                                    (package-name (symbol-package item))
                                  "UNINTERNED")
                                (symbol-name item)))
                         ((consp item)
                          (if (>= depth 4)
                              (list :type :cons :depth-limit t)
                            (let ((rest item) (items nil) (count 0)
                                  (proper nil) (truncated nil)
                                  (tail :not-reached))
                              (dotimes (index 65)
                                (cond
                                  ((null rest)
                                   (setf proper t tail :none)
                                   (return))
                                  ((not (consp rest))
                                   (setf tail (walk rest (1+ depth)))
                                   (return))
                                  ((>= count 64)
                                   (setf truncated t tail :list-limit)
                                   (return))
                                  ((<= budget 0)
                                   (setf truncated t tail :node-limit)
                                   (return))
                                  (t
                                   (push (walk (car rest) (1+ depth)) items)
                                   (setf rest (cdr rest))
                                   (incf count))))
                              (list :list (nreverse items) :count count
                                    :proper proper :truncated truncated
                                    :tail tail))))
                         ((arrayp item)
                          (let* ((total (array-total-size item))
                                 (items nil) (shown 0)
                                 (truncated (> total 64)))
                            (when (<= total 64)
                              (dotimes (index total)
                                (when (> budget 0)
                                  (push (walk (row-major-aref item index)
                                              (1+ depth))
                                        items)
                                  (incf shown))))
                            (when (< shown total)
                              (setf truncated t))
                            (list :array (type-of item)
                                  :rank (array-rank item)
                                  :dimensions (array-dimensions item)
                                  :element-type (array-element-type item)
                                  :total total :values (nreverse items)
                                  :shown shown :truncated truncated)))
                         (t (list :object (type-of item))))))))
               (walk value 0))))
         (random-preview ()
           (let ((state (make-random-state *random-state*)))
             (list (random 100 state) (random 100 state) (random 100 state))))
         (inspect-function (name)
           (if (null owner)
               (record-error (list name :package) :owner-package-unavailable)
             (multiple-value-bind (symbol status) (find-symbol name owner)
               (cond
                 ((null symbol)
                  (emit "FUNCTION name=~S present=nil" name)
                  (record-error (list name :symbol) :symbol-unavailable))
                 ((not (fboundp symbol))
                  (setf (gethash name function-symbols) symbol)
                  (emit "FUNCTION name=~S present=t status=~S fbound=nil"
                        name status)
                  (record-error (list name :function) :function-unbound))
                 (t
                  (handler-case
                      (let* ((function (symbol-function symbol))
                             (compiled (typep function 'compiled-function))
                             (type (type-of function)))
                        (setf (gethash name function-symbols) symbol
                              (gethash name function-info)
                              (list :compiled compiled :type type))
                        (emit "FUNCTION name=~S present=t status=~S fbound=t type=~S compiled=~S"
                              name status type compiled)
                        (when (and (member name '("ZERO-EDGE" "MAKE-TRIPT")
                                           :test #'string=)
                                   (not compiled))
                          (record-error (list name :compiled-kind)
                                        :not-compiled-function))
                        (if (and excl (find-symbol "ARGLIST" excl)
                                 (fboundp (find-symbol "ARGLIST" excl)))
                            (handler-case
                                (let ((values
                                        (multiple-value-list
                                         (funcall
                                          (symbol-function
                                           (find-symbol "ARGLIST" excl))
                                          symbol))))
                                  (setf (gethash name arglists) values)
                                  (emit "ARGLIST name=~S values=~S"
                                        name values))
                              (condition (condition)
                                (record-error (list name :arglist) condition)))
                          (record-error (list name :arglist)
                                        :excl-arglist-unavailable)))
                    (condition (condition)
                      (record-error (list name :function-info) condition))))))))
         (inspect-binding (name)
           (if (null owner)
               (record-error (list name :package) :owner-package-unavailable)
             (multiple-value-bind (symbol status) (find-symbol name owner)
               (cond
                 ((null symbol)
                  (emit "BINDING name=~S present=nil" name))
                 ((not (boundp symbol))
                  (emit "BINDING name=~S present=t status=~S bound=nil"
                        name status))
                 (t
                  (handler-case
                      (let ((value (symbol-value symbol)))
                        (emit "BINDING name=~S present=t status=~S bound=t type=~S value=~S"
                              name status (type-of value)
                              (value-summary value)))
                    (condition (condition)
                      (record-error (list name :binding-value) condition))))))))
         (fixed-x-y-z-arglist-p ()
           (let* ((values (gethash "MAKE-TRIPT" arglists))
                  (parameters (and (consp values) (car values)))
                  (x (and (consp parameters) (car parameters)))
                  (y (and (consp parameters) (consp (cdr parameters))
                          (cadr parameters)))
                  (z (and (consp parameters) (consp (cdr parameters))
                          (consp (cddr parameters)) (caddr parameters))))
             (and (consp values) (consp (cdr values)) (null (cddr values))
                  (eq (cadr values) t)
                  (consp parameters) (consp (cdr parameters))
                  (consp (cddr parameters)) (null (cdddr parameters))
                  (symbolp x) (symbolp y) (symbolp z)
                  (equal (symbol-name x) "X")
                  (equal (symbol-name y) "Y")
                  (equal (symbol-name z) "Z")
                  (eq (symbol-package x) owner)
                  (eq (symbol-package y) owner)
                  (eq (symbol-package z) owner))))
         (typed-values (values)
           (let ((items nil))
             (dolist (value values (nreverse items))
               (push (list :type (type-of value)
                           :value (value-summary value))
                     items))))
         (sample-accessor (name object)
           (let* ((symbol (gethash name function-symbols))
                  (before (random-preview))
                  (values (multiple-value-list
                           (funcall (symbol-function symbol) object)))
                  (after (random-preview))
                  (stable (equal before after)))
             (emit "ACCESSOR name=~S arity=~D values=~S rng-preview-stable=~S"
                   name (length values) (typed-values values) stable)
             (unless stable
               (record-error (list name :random-state) :preview-changed))
             (unless (= (length values) 1)
               (record-error (list name :arity) :expected-one-value))
             (if (= (length values) 1) (car values) :no-single-value)))
         (sample-constructor ()
           (let* ((maker-symbol (gethash "MAKE-TRIPT" function-symbols))
                  (inputs '(17 23 6)))
             (setf sample-attempted t)
             (emit "SAMPLE-INPUT x=17 y=23 z=6")
             (let* ((before (random-preview))
                    (values (multiple-value-list
                             (apply (symbol-function maker-symbol) inputs)))
                    (after (random-preview))
                    (stable (equal before after)))
               (setf sample-returned t)
               (emit "SAMPLE-RETURN arity=~D values=~S rng-preview-stable=~S"
                     (length values) (typed-values values) stable)
               (unless stable
                 (record-error :constructor-random-state :preview-changed))
               (if (= (length values) 1)
                   (let* ((object (car values))
                          (object-type (type-of object))
                          (x (sample-accessor "X" object))
                          (y (sample-accessor "Y" object))
                          (z (sample-accessor "Z" object))
                          (matches (and (equal x (first inputs))
                                        (equal y (second inputs))
                                        (equal z (third inputs)))))
                     (emit "SAMPLE-POINT type=~S x=~S y=~S z=~S input-match=~S"
                           object-type (value-summary x) (value-summary y)
                           (value-summary z) matches)
                     (unless matches
                       (record-error :constructor-coordinate-order
                                     :returned-values-do-not-match-inputs))
                     (setf sample-completed t))
                 (record-error :constructor-return-arity :expected-one-value))))))
      (emit "BEGIN zero-edge-contract v2")
      (emit "SCOPE zero-edge-called=nil zero-edge-wrapped=nil constructor-sample=single-gated post-sample-state=unmeasured")
      (emit "LIMITS value-nodes=256 list-items=64 array-items=64 depth=4 string-prefix=256 condition-control-prefix=256")
      (let* ((arglist-symbol (and excl (find-symbol "ARGLIST" excl)))
             (arglist-function (and arglist-symbol (fboundp arglist-symbol)
                                    (symbol-function arglist-symbol))))
        (emit "HELPER name=EXCL:ARGLIST present=~S fbound=~S type=~S compiled=~S"
              (not (null arglist-symbol)) (not (null arglist-function))
              (when arglist-function (type-of arglist-function))
              (and arglist-function
                   (typep arglist-function 'compiled-function)))
        (unless arglist-function
          (record-error :arglist-helper :unavailable)))
      (dolist (name '("ZERO-EDGE" "MAKE-TRIPT" "X" "Y" "Z"))
        (handler-case (inspect-function name)
          (condition (condition) (record-error (list name :inspect) condition))))
      (dolist (name '("XINCS" "YINCS" "START"))
        (handler-case (inspect-binding name)
          (condition (condition) (record-error (list name :binding) condition))))
      (let* ((maker-info (gethash "MAKE-TRIPT" function-info))
             (maker-ready (and maker-info (getf maker-info :compiled)))
             (accessors-ready (every (lambda (name)
                                       (and (gethash name function-info)
                                            (gethash name function-symbols)))
                                     '("X" "Y" "Z")))
             (arglist-ready (fixed-x-y-z-arglist-p))
             (error-free (zerop errors))
             (gate (and error-free maker-ready accessors-ready arglist-ready)))
        (emit "GATE make-tript-fixed-positional-x-y-z=~S maker-compiled=~S accessors-fbound=~S errors-zero=~S"
              arglist-ready maker-ready accessors-ready error-free)
        (emit "READY metadata-errors=~D constructor-gate=~S" errors gate)
        (if gate
            (handler-case (sample-constructor)
              (condition (condition)
                (record-error :constructor-sample condition)))
          (emit "SAMPLE-SKIPPED reason=metadata-gate-not-established")))
      (emit "COMPLETE sample-attempted=~S sample-returned=~S sample-completed=~S zero-edge-calls=0 wrappers=0 errors=~D"
            sample-attempted sample-returned sample-completed errors)
      (emit "END zero-edge-contract v2"))))
