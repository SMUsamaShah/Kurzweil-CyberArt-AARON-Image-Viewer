;;; Read-only ZERO-EDGE metadata plus a gated post-MAIN MAKE-TRIPT sample.
;;; ZERO-EDGE is inspected but never called or replaced.
(in-package :cl-user)

(unless (boundp 'aaron-zero-edge-contract-v3-loaded)
  (set 'aaron-zero-edge-contract-v3-loaded t)
  (let* ((report (open "C:\\temp\\aaron-zero-edge-contract-v3.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (*print-length* 128)
        (*print-level* 16)
        (*print-pretty* nil)
        (*print-circle* t)
        (*print-readably* nil)
        (owner (find-package "COMMON-GRAPHICS-USER"))
        (excl (find-package "EXCL"))
        (main-symbol (and owner (find-symbol "MAIN" owner)))
        (main-original (and main-symbol (fboundp main-symbol)
                            (symbol-function main-symbol)))
        (function-symbols (make-hash-table :test #'equal))
        (function-info (make-hash-table :test #'equal))
        (arglists (make-hash-table :test #'equal))
        (errors 0)
        (sample-attempted nil)
        (sample-returned nil)
        (sample-completed nil)
        (metadata-gate nil)
        (wrapper-installed nil)
        (main-depth 0)
        (finalized nil))
    (labels
        ((emit (control &rest arguments)
           (let ((*print-length* 128)
                 (*print-level* 16)
                 (*print-pretty* nil)
                 (*print-circle* t)
                 (*print-readably* nil))
             (when report
               (handler-case
                   (progn
                     (apply #'format report control arguments)
                     (terpri report)
                     (finish-output report))
                 (condition () (incf errors))))
             nil))
         (close-report ()
           (when report
             (ignore-errors (finish-output report))
             (ignore-errors (close report))
             (setf report nil)))
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
         (random-preview-helper-ready-p ()
           (let* ((package (find-package "CL-USER"))
                  (symbol (and package
                               (find-symbol "AARON-RANDOM-STATE-PREVIEW"
                                            package))))
             (and symbol (fboundp symbol))))
         (random-preview ()
           (let* ((package (find-package "CL-USER"))
                  (symbol (and package
                               (find-symbol "AARON-RANDOM-STATE-PREVIEW"
                                            package))))
             (cond
               ((null symbol) '(:unavailable :helper-symbol-missing))
               ((not (fboundp symbol)) '(:unavailable :helper-unbound))
               (t
                (handler-case
                    (let ((values
                            (multiple-value-list
                             (funcall (symbol-function symbol)))))
                      (if (= (length values) 1)
                          (car values)
                        (list :error :multiple-values :arity
                              (length values))))
                  (condition (condition)
                    (list :error :condition-type (type-of condition))))))))
         (random-preview-valid-p (preview)
           (handler-case
               (and (consp preview)
                    (= (length preview) 6)
                    (eq (first preview) :random-100-1)
                    (eq (third preview) :random-100-2)
                    (eq (fifth preview) :random-100-3)
                    (every (lambda (index)
                             (let ((value (nth index preview)))
                               (and (integerp value)
                                    (<= 0 value) (< value 100))))
                           '(1 3 5))
                    t)
             (condition () nil)))
         (random-preview-check (phase before after)
           (let* ((before-valid (random-preview-valid-p before))
                  (after-valid (random-preview-valid-p after))
                  (valid (and before-valid after-valid))
                  (stable (and valid (equal before after))))
             (emit "RNG-CHECK phase=~S valid=~S stable=~S preview-before=~S preview-after=~S"
                   phase valid stable before after)
             (unless before-valid
               (record-error (list phase :preview-before)
                             :unavailable-or-invalid))
             (unless after-valid
               (record-error (list phase :preview-after)
                             :unavailable-or-invalid))
             (when (and valid (not stable))
               (record-error (list phase :random-state)
                             :preview-changed))
             (list :valid valid :stable stable)))
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
                  (check (random-preview-check (list :accessor name)
                                               before after)))
             (emit "ACCESSOR name=~S arity=~D values=~S rng-preview-valid=~S rng-preview-stable=~S"
                   name (length values) (typed-values values)
                   (getf check :valid) (getf check :stable))
             (unless (= (length values) 1)
               (record-error (list name :arity) :expected-one-value))
             (if (= (length values) 1) (car values) :no-single-value)))
         (sample-slot (name object phase)
           (handler-case
               (let* ((slot-symbol (and owner (find-symbol name owner)))
                      (before (random-preview))
                      (values (if slot-symbol
                                  (multiple-value-list
                                   (slot-value object slot-symbol))
                                (error "TRIPT slot symbol unavailable: ~A"
                                       name)))
                      (after (random-preview))
                      (check (random-preview-check
                              (list :slot name phase) before after)))
                 (emit "SLOT-READ phase=~S name=~S arity=~D values=~S rng-preview-valid=~S rng-preview-stable=~S"
                       phase name (length values) (typed-values values)
                       (getf check :valid) (getf check :stable))
                 (unless (= (length values) 1)
                   (record-error (list name :slot-arity phase)
                                 :expected-one-value))
                 (if (= (length values) 1) (car values) :no-single-value))
             (condition (condition)
               (record-error (list name :slot-read phase) condition)
               :slot-read-error)))
         (sample-constructor ()
           (let* ((maker-symbol (gethash "MAKE-TRIPT" function-symbols))
                  (inputs '(17 23 6)))
             (setf sample-attempted t)
             (emit "SAMPLE-INPUT x=17 y=23 z=6")
             (let* ((before (random-preview))
                    (values (multiple-value-list
                             (apply (symbol-function maker-symbol) inputs)))
                    (after (random-preview))
                    (check (random-preview-check :constructor before after)))
               (setf sample-returned t)
               (emit "SAMPLE-RETURN arity=~D values=~S rng-preview-valid=~S rng-preview-stable=~S"
                     (length values) (typed-values values)
                     (getf check :valid) (getf check :stable))
               (if (= (length values) 1)
                   (let* ((object (car values))
                          (object-type (type-of object))
                          (slot-x-before
                            (sample-slot "X" object :before-accessors))
                          (slot-y-before
                            (sample-slot "Y" object :before-accessors))
                          (slot-z-before
                            (sample-slot "Z" object :before-accessors))
                          (x (sample-accessor "X" object))
                          (y (sample-accessor "Y" object))
                          (z (sample-accessor "Z" object))
                          (slot-x-after
                            (sample-slot "X" object :after-accessors))
                          (slot-y-after
                            (sample-slot "Y" object :after-accessors))
                          (slot-z-after
                            (sample-slot "Z" object :after-accessors))
                          (matches (and (equal x (first inputs))
                                        (equal y (second inputs))
                                        (equal z (third inputs))))
                          (slots-before-match
                            (and (equal slot-x-before (first inputs))
                                 (equal slot-y-before (second inputs))
                                 (equal slot-z-before (third inputs))))
                          (slots-after-stable
                            (and (equal slot-x-before slot-x-after)
                                 (equal slot-y-before slot-y-after)
                                 (equal slot-z-before slot-z-after)))
                          (accessors-match-before-slots
                            (and (equal x slot-x-before)
                                 (equal y slot-y-before)
                                 (equal z slot-z-before))))
                     (emit "SAMPLE-POINT type=~S x=~S y=~S z=~S accessor-input-match=~S slot-before-input-match=~S accessor-slot-match=~S slots-after-getters-equal=~S"
                           object-type (value-summary x) (value-summary y)
                           (value-summary z) matches slots-before-match
                           accessors-match-before-slots slots-after-stable)
                     (unless matches
                       (record-error :constructor-coordinate-order
                                     :returned-values-do-not-match-inputs))
                     (setf sample-completed t))
                 (record-error :constructor-return-arity :expected-one-value)))))
         (binding-state (name phase)
           (multiple-value-bind (symbol status)
               (if owner (find-symbol name owner) (values nil nil))
             (cond
               ((null symbol)
                (emit "STATE-BINDING phase=~S name=~S present=nil bound=nil"
                      phase name)
                (list :name name :present nil :bound nil :symbol nil))
               ((not (boundp symbol))
                (emit "STATE-BINDING phase=~S name=~S present=t status=~S bound=nil"
                      phase name status)
                (list :name name :present t :status status :bound nil
                      :symbol symbol))
               (t
                (handler-case
                    (let* ((value (symbol-value symbol))
                           (summary (value-summary value)))
                      (emit "STATE-BINDING phase=~S name=~S present=t status=~S bound=t type=~S value=~S"
                            phase name status (type-of value) summary)
                      (list :name name :present t :status status :bound t
                            :symbol symbol :value value :summary summary))
                  (condition (condition)
                    (record-error (list name :state-binding phase) condition)
                    (list :name name :present t :status status :bound :read-error
                          :symbol symbol)))))))
         (binding-state-delta (name before after)
           (let* ((before-bound (eq (getf before :bound) t))
                  (after-bound (eq (getf after :bound) t))
                  (value-eq (and before-bound after-bound
                                 (eq (getf before :value)
                                     (getf after :value))))
                  (summary-equalp (and before-bound after-bound
                                       (equalp (getf before :summary)
                                               (getf after :summary)))))
             (emit "STATE-DELTA name=~S present-same=~S symbol-eq=~S bound-before=~S bound-after=~S value-eq=~S summary-equalp=~S"
                   name (eql (getf before :present) (getf after :present))
                   (eq (getf before :symbol) (getf after :symbol))
                   (getf before :bound) (getf after :bound) value-eq
                   summary-equalp)))
         (finish-main-capture (status)
           (unless finalized
             (emit "MAIN-FINISH status=~S" status)
             (if (eq status :normal)
                 (let* ((names '("START" "XINCS" "YINCS"))
                        (before (make-hash-table :test #'equal))
                        (after (make-hash-table :test #'equal))
                        (rng-helper-ready (random-preview-helper-ready-p))
                        (rng-before (random-preview))
                        (rng-before-valid (random-preview-valid-p rng-before)))
                   (emit "RNG-HELPER phase=:after-main fbound=~S"
                         rng-helper-ready)
                   (emit "RNG-PREVIEW phase=:post-main-before-sample valid=~S preview=~S"
                         rng-before-valid rng-before)
                   (unless rng-before-valid
                     (record-error :post-main-rng-preview
                                   :unavailable-or-invalid))
                   (dolist (name names)
                     (setf (gethash name before)
                           (binding-state name :before-sample)))
                   (cond
                     ((not rng-before-valid)
                      (emit "SAMPLE-SKIPPED reason=rng-preview-unavailable-or-invalid"))
                     ((not metadata-gate)
                      (emit "SAMPLE-SKIPPED reason=metadata-gate-not-established"))
                     (t
                      (handler-case (sample-constructor)
                        (condition (condition)
                          (record-error :post-main-constructor-sample
                                        condition)))))
                   (dolist (name names)
                     (setf (gethash name after)
                           (binding-state name :after-sample)))
                   (dolist (name names)
                     (binding-state-delta name (gethash name before)
                                          (gethash name after)))
                   (let* ((rng-after (random-preview))
                          (check (random-preview-check :post-main
                                                       rng-before rng-after)))
                     (emit "POST-SAMPLE-RNG valid=~S stable=~S"
                           (getf check :valid) (getf check :stable))))
               (emit "SAMPLE-SKIPPED reason=~S"
                     (if (eq status :aborted) :main-aborted :main-not-run)))
             (setf finalized t)
             (emit "COMPLETE main-status=~S main-wrapper-installed=~S sample-attempted=~S sample-returned=~S sample-completed=~S zero-edge-calls=0 zero-edge-wrappers=0 errors=~D"
                   status wrapper-installed sample-attempted sample-returned
                   sample-completed errors)
             (emit "END zero-edge-contract v3")
             (close-report)))
         (safe-main-finish (status)
           (let ((*print-length* 128)
                 (*print-level* 16)
                 (*print-pretty* nil)
                 (*print-circle* t)
                 (*print-readably* nil))
             (handler-case (finish-main-capture status)
               (condition (condition)
                 (ignore-errors
                   (record-error :main-wrapper-finish condition))
                 (unless finalized
                   (setf finalized t)
                   (ignore-errors
                     (emit "COMPLETE main-status=~S main-wrapper-installed=~S sample-attempted=~S sample-returned=~S sample-completed=~S zero-edge-calls=0 zero-edge-wrappers=0 errors=~D"
                           status wrapper-installed sample-attempted
                           sample-returned sample-completed errors))
                   (ignore-errors (emit "END zero-edge-contract v3")))
                 (close-report)))))
         (install-main-wrapper ()
           (cond
             ((or (null main-symbol) (null main-original))
              (record-error :main-wrapper :main-unbound)
              nil)
             (t
              (handler-case
                  (progn
                    (setf (symbol-function main-symbol)
                          (let ((saved-main main-original))
                            (lambda (&rest arguments)
                              (let ((depth (incf main-depth))
                                    (completed nil))
                                (unwind-protect
                                     (multiple-value-prog1
                                         (apply saved-main arguments)
                                       (setf completed t)
                                       (when (= depth 1)
                                         (safe-main-finish :normal)))
                                  (unless completed
                                    (when (= depth 1)
                                      (safe-main-finish :aborted)))
                                  (decf main-depth)))))
                    (setf wrapper-installed t)
                    (emit "INSTALL name=MAIN original-type=~S"
                          (type-of main-original))
                    t)
                (condition (condition)
                  (record-error :main-wrapper-install condition)
                  nil)))))))
      (emit "BEGIN zero-edge-contract v3")
      (emit "SCOPE zero-edge-called=nil zero-edge-wrapped=nil constructor-sample=single-gated-after-main main-values=preserved main-errors=propagated state-restoration=none")
      (emit "LIMITS value-nodes=256 list-items=64 array-items=64 depth=4 string-prefix=256 condition-control-prefix=256 state-bindings=3")
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
      (dolist (name '("ZERO-EDGE" "MAKE-TRIPT" "X" "Y" "Z" "MAIN"))
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
             (main-ready (and main-symbol main-original))
             (gate (and error-free maker-ready accessors-ready arglist-ready)))
        (setf metadata-gate gate)
        (emit "GATE make-tript-fixed-positional-x-y-z=~S maker-compiled=~S accessors-fbound=~S errors-zero=~S"
              arglist-ready maker-ready accessors-ready error-free)
        (emit "MAIN-GATE present=~S fbound=~S original-type=~S"
              (not (null main-symbol)) (not (null main-original))
              (when main-original (type-of main-original)))
        (if (and main-ready (install-main-wrapper))
            (progn
              (emit "READY metadata-errors=~D constructor-gate=~S main-wrapper-installed=t"
                    errors metadata-gate)
              (finish-output report))
          (progn
            (unless main-ready
              (record-error :main-wrapper :main-unbound))
            (emit "READY metadata-errors=~D constructor-gate=~S main-wrapper-installed=nil"
                  errors metadata-gate)
            (safe-main-finish :install-error)))))))
