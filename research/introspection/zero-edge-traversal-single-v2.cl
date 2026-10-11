;;; ZERO-EDGE metadata plus one gated post-MAIN observational traversal call.
;;; V2 adds bounded map-snapshot stages and condition text diagnostics.
(in-package :cl-user)

(unless (boundp 'aaron-zero-edge-traversal-single-v2-loaded)
  (set 'aaron-zero-edge-traversal-single-v2-loaded t)
  (let* ((report (open "C:\\temp\\aaron-zero-edge-traversal-single-v2.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (*print-length* 128)
        (*print-level* 16)
        (*print-pretty* nil)
        (*print-circle* t)
         (*print-readably* nil)
         (owner (find-package "COMMON-GRAPHICS-USER"))
         (tript-type-lookup (and owner
                                 (multiple-value-list
                                  (find-symbol "TRIPT" owner))))
         (tript-type-symbol (first tript-type-lookup))
         (tript-type-status (second tript-type-lookup))
         (excl (find-package "EXCL"))
        (main-symbol (and owner (find-symbol "MAIN" owner)))
        (main-original (and main-symbol (fboundp main-symbol)
                            (symbol-function main-symbol)))
        (function-symbols (make-hash-table :test #'equal))
        (function-info (make-hash-table :test #'equal))
        (arglists (make-hash-table :test #'equal))
        (errors 0)
         (case-attempted nil)
         (case-returned nil)
         (case-completed nil)
         (zero-edge-calls 0)
         (case-active nil)
         (case-condition-type nil)
         (overflow nil)
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
                        (let* ((*print-length* 8)
                               (*print-level* 4)
                               (*print-array* nil)
                               (*print-readably* nil)
                               (*print-pretty* nil)
                               (text (format nil "~A" condition))
                               (text-length (length text)))
                          (list :kind :condition-text
                                :prefix (subseq text 0 (min 256 text-length))
                                :truncated (> text-length 256)))
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
          (fixed-zero-edge-arglist-p ()
            (let* ((values (gethash "ZERO-EDGE" arglists))
                   (parameters (and (consp values) (car values)))
                   (start (and (consp parameters) (car parameters)))
                   (perim (and (consp parameters) (consp (cdr parameters))
                               (cadr parameters))))
              (and (consp values) (consp (cdr values)) (null (cddr values))
                   (eq (cadr values) t)
                   (consp parameters) (consp (cdr parameters))
                   (null (cddr parameters))
                   (symbolp start) (symbolp perim)
                   (equal (symbol-name start) "START")
                   (equal (symbol-name perim) "PERIM")
                   (eq (symbol-package start) owner)
                   (eq (symbol-package perim) owner))))
          (tript-slots (object)
            (let ((x-symbol (and owner (find-symbol "X" owner)))
                  (y-symbol (and owner (find-symbol "Y" owner)))
                  (z-symbol (and owner (find-symbol "Z" owner))))
              (unless (and x-symbol y-symbol z-symbol)
                (error "TRIPT coordinate slot symbols are unavailable"))
              (list (slot-value object x-symbol)
                    (slot-value object y-symbol)
                    (slot-value object z-symbol))))
          (tript-object-p (object)
            (let ((type (type-of object)))
              (and tript-type-symbol (eq type tript-type-symbol))))
          (flat-map (map bits)
            (unless (and (arrayp map) (= (array-rank map) 2)
                         (equal (array-element-type map)
                                (list 'unsigned-byte bits))
                         (<= (array-total-size map) 1048576))
              (error "Map fails bounded typed rank-two contract"))
            (make-array (array-total-size map)
                        :element-type (list 'unsigned-byte bits)
                        :displaced-to map))
          (map-metadata (map)
            (list :type (type-of map) :rank (array-rank map)
                  :dimensions (array-dimensions map)
                  :element-type (array-element-type map)
                  :total (array-total-size map)))
          (map-snapshot (name state bits)
            (unless (eq (getf state :bound) t)
              (error "Required original map binding is unavailable"))
            (let* ((map (getf state :value)))
              (emit "MAP-SNAPSHOT-STAGE map=~S stage=:BEGIN dimension-limit=~S total-size-limit=~S"
                    name array-dimension-limit array-total-size-limit)
              (let ((metadata
                      (handler-case
                          (map-metadata map)
                        (condition (condition)
                          (emit "MAP-SNAPSHOT-ERROR map=~S stage=:METADATA details=~S"
                                name (condition-details condition))
                          (error condition)))))
                (emit "MAP-SNAPSHOT-STAGE map=~S stage=:METADATA metadata=~S"
                      name metadata)
                (emit "MAP-SNAPSHOT-STAGE map=~S stage=:FLATTEN-BEGIN"
                      name)
                (let ((flat
                        (handler-case
                            (flat-map map bits)
                          (condition (condition)
                            (emit "MAP-SNAPSHOT-ERROR map=~S stage=:FLATTEN details=~S"
                                  name (condition-details condition))
                            (error condition)))))
                  (emit "MAP-SNAPSHOT-STAGE map=~S stage=:FLATTEN-AFTER type=~S rank=~D total=~D"
                        name (type-of flat) (array-rank flat)
                        (array-total-size flat))
                  (emit "MAP-SNAPSHOT-STAGE map=~S stage=:COPY-BEGIN length=~D"
                        name (length flat))
                  (let ((cells
                          (handler-case
                              (copy-seq flat)
                            (condition (condition)
                              (emit "MAP-SNAPSHOT-ERROR map=~S stage=:COPY details=~S"
                                    name (condition-details condition))
                              (error condition)))))
                    (emit "MAP-SNAPSHOT-STAGE map=~S stage=:COPY-AFTER type=~S length=~D"
                          name (type-of cells) (length cells))
                    (list :map map :metadata metadata :cells cells))))))
          (map-snapshot-matches-p (snapshot state bits)
            (handler-case
                (let* ((map (getf state :value))
                       (flat (flat-map map bits)))
                  (and (eq (getf state :bound) t)
                       (eq map (getf snapshot :map))
                       (equalp (map-metadata map) (getf snapshot :metadata))
                        (equalp (getf snapshot :cells) flat)))
              (condition () nil)))
          (map-state-capturable-p (state bits)
            (handler-case
                (let ((map (getf state :value)))
                  (and (eq (getf state :bound) t)
                       (arrayp map) (= (array-rank map) 2)
                       (equal (array-element-type map)
                              (list 'unsigned-byte bits))
                        (<= (array-total-size map) 1048576)))
              (condition () nil)))
          (scratch-cells (map)
            (unless (and (arrayp map) (= (array-rank map) 2)
                         (equal (array-dimensions map) '(7 7))
                         (equal (array-element-type map) '(unsigned-byte 4)))
              (error "Scratch FILL-MAP does not match 7x7 UBYTE4 contract"))
            (let ((cells nil))
              (dotimes (x 7)
                (dotimes (y 7)
                  (push (list x y (aref map x y)) cells)))
              (nreverse cells)))
          (changed-scratch-cells (before after)
            (let ((changed nil))
              (dolist (cell before (nreverse changed))
                (let* ((x (first cell)) (y (second cell))
                       (next (find-if
                              (lambda (candidate)
                                (and (= x (first candidate))
                                     (= y (second candidate))))
                              after)))
                  (unless (and next (eql (third cell) (third next)))
                    (push (list x y (third cell)
                                (if next (third next) :missing))
                          changed))))))
          (point-list-summary (primary start)
            (let ((rest primary) (seen-cons (make-hash-table :test #'eq))
                  (seen-points (make-hash-table :test #'eq))
                  (previous-cons nil) (items nil) (count 0)
                  (proper nil) (circular nil) (improper nil) (truncated nil)
                  (tail :not-reached))
              (dotimes (index 65)
                (cond
                  ((null rest)
                   (setf proper t tail :none)
                   (return))
                  ((not (consp rest))
                   (setf improper t
                         tail (list :type (type-of rest)
                                    :summary (value-summary rest)))
                   (return))
                  ((gethash rest seen-cons)
                   (setf circular t tail :repeated-cons)
                   (return))
                  ((>= index 64)
                   (setf truncated t tail :point-limit overflow t)
                   (return))
                  (t
                   (setf (gethash rest seen-cons) index)
                   (let* ((object (car rest))
                          (first-index nil)
                          (point-seen nil)
                          (point-type (type-of object))
                          (point-is-tript (tript-object-p object))
                          (slots (when point-is-tript
                                   (handler-case (tript-slots object)
                                     (condition (condition)
                                       (list :slot-error (type-of condition)))))))
                     (multiple-value-setq (first-index point-seen)
                       (gethash object seen-points))
                     (unless point-seen
                       (setf (gethash object seen-points) index))
                     (push (list :index index
                                 :cons-eq-start (eq rest start)
                                 :cons-cdr-eq-start (eq (cdr rest) start)
                                 :cons-eq-previous-cdr
                                 (and previous-cons
                                      (eq (cdr previous-cons) rest))
                                 :point-type point-type
                                 :point-is-tript point-is-tript
                                 :point-eq-start (eq object start)
                                 :point-first-eq-index
                                 (if point-seen first-index index)
                                 :xyz (if (and slots (not (eq (car slots)
                                                             :slot-error)))
                                          (typed-values slots)
                                        slots))
                           items))
                   (setf previous-cons rest
                         rest (cdr rest))
                   (incf count))))
              (list :proper proper :circular circular :improper improper
                    :truncated truncated :count count :tail tail
                    :result-eq-start (eq primary start)
                    :tail-eq-start (eq rest start)
                    :items (nreverse items))))
          (same-binding-state-p (before after)
            (and (eql (getf before :present) (getf after :present))
                 (eq (getf before :symbol) (getf after :symbol))
                 (eql (getf before :bound) (getf after :bound))
                 (if (eq (getf before :bound) t)
                     (and (eq (getf before :value) (getf after :value))
                          (equalp (getf before :summary)
                                  (getf after :summary)))
                   t)))
          (state-set (names phase)
            (let ((states (make-hash-table :test #'equal)))
              (dolist (name names states)
                (setf (gethash name states) (binding-state name phase)))))
          (state-set-captured-p (names states)
            (and (hash-table-p states)
                 (every (lambda (name)
                          (let ((state (gethash name states)))
                            (and (listp state)
                                 (eq (getf state :present) t)
                                 (symbolp (getf state :symbol))
                                 (member (getf state :bound) '(t nil)
                                         :test #'eq))))
                        names)))
          (state-set-deltas (names before after)
            (let ((same t))
              (dolist (name names same)
                (let ((before-state (gethash name before))
                      (after-state (gethash name after)))
                  (binding-state-delta name before-state after-state)
                  (unless (same-binding-state-p before-state after-state)
                    (setf same nil))))))
          (required-runtime-state-p (states)
            (let* ((start-state (gethash "START" states))
                   (wide-state (gethash "*PIC-WIDE*" states))
                   (high-state (gethash "*PIC-HIGH*" states))
                   (fill-state (gethash "FILL-MAP" states))
                   (patch-state (gethash "PATCH-MAP" states))
                   (x-state (gethash "XINCS" states))
                   (y-state (gethash "YINCS" states))
                   (fill (getf fill-state :value))
                    (patch (getf patch-state :value))
                    (xincs (getf x-state :value))
                    (yincs (getf y-state :value))
                    (width (getf wide-state :value))
                    (height (getf high-state :value)))
              (and (eq (getf start-state :present) t)
                   (eq (getf start-state :bound) nil)
                   (eq (getf wide-state :bound) t)
                   (eq (getf high-state :bound) t)
                    (typep width 'fixnum) (> width 0)
                    (typep height 'fixnum) (> height 0)
                   (eq (getf fill-state :bound) t)
                   (eq (getf patch-state :bound) t)
                   (arrayp fill) (= (array-rank fill) 2)
                    (equal (array-dimensions fill) (list width height))
                    (equal (array-element-type fill) '(unsigned-byte 4))
                    (<= (array-total-size fill) 1048576)
                    (arrayp patch) (= (array-rank patch) 2)
                    (equal (array-dimensions patch) (list width height))
                    (equal (array-element-type patch) '(unsigned-byte 16))
                    (<= (array-total-size patch) 1048576)
                   (eq (getf x-state :bound) t)
                   (eq (getf y-state :bound) t)
                   (equal xincs '(1 1 0 -1 -1 -1 0 1))
                   (equal yincs '(0 1 1 1 0 -1 -1 -1))
                   (every (lambda (value) (typep value 'fixnum)) xincs)
                   (every (lambda (value) (typep value 'fixnum)) yincs))))
          (run-zero-edge-case ()
            (let* ((names '("START" "XINCS" "YINCS" "FILL-MAP" "PATCH-MAP"
                            "*PIC-WIDE*" "*PIC-HIGH*"))
                   (before (state-set names :after-main-before-case))
                   (runtime-ready (required-runtime-state-p before))
                   (rng-before (random-preview))
                   (rng-before-valid (random-preview-valid-p rng-before))
                   (maker-symbol (gethash "MAKE-TRIPT" function-symbols))
                   (zero-edge-symbol (gethash "ZERO-EDGE" function-symbols))
                   (maker-function (and maker-symbol
                                        (symbol-function maker-symbol)))
                   (zero-edge-function (and zero-edge-symbol
                                             (symbol-function zero-edge-symbol)))
                    (metadata-ready
                      (not (null
                            (and metadata-gate (fixed-x-y-z-arglist-p)
                                 (fixed-zero-edge-arglist-p)
                                 maker-function zero-edge-function))))
                   (case-finished nil))
              (setf case-attempted t)
              (unwind-protect
                   (handler-case
                       (progn
                         (emit "POST-MAIN-GATE metadata-ready=~S runtime-ready=~S rng-preview-valid=~S rng-preview=~S"
                               metadata-ready runtime-ready rng-before-valid
                               rng-before)
                         (unless rng-before-valid
                           (record-error :post-main-rng-preview
                                         :unavailable-or-invalid))
                         (if (not (and metadata-ready runtime-ready
                                       rng-before-valid))
                             (emit "CASE-SKIPPED reason=metadata-runtime-or-rng-gate")
                            (let* ((fill-before
                                     (map-snapshot "FILL-MAP"
                                                   (gethash "FILL-MAP" before) 4))
                                   (patch-before
                                     (map-snapshot "PATCH-MAP"
                                                   (gethash "PATCH-MAP" before) 16))
                                   (inputs '(3 3 0))
                                   (constructor-values nil)
                                   (constructor-condition nil))
                              (emit "ORIGINAL-MAP-PREFLIGHT fill=~S patch=~S total-cell-cap=1048576"
                                    (getf fill-before :metadata)
                                    (getf patch-before :metadata))
                              (handler-case
                                 (setf constructor-values
                                       (multiple-value-list
                                        (apply maker-function inputs)))
                               (condition (condition)
                                 (setf constructor-condition condition)
                                 (emit "CONSTRUCTOR-ERROR type=~S details=~S"
                                       (type-of condition)
                                       (condition-details condition))))
                             (let* ((after-constructor
                                      (state-set names :after-constructor))
                                    (constructor-rng (random-preview))
                                    (rng-check
                                      (random-preview-check
                                       :constructor rng-before constructor-rng))
                                    (bindings-unchanged
                                      (state-set-deltas names before
                                                        after-constructor))
                                    (fill-unchanged
                                      (map-snapshot-matches-p
                                       fill-before
                                       (gethash "FILL-MAP" after-constructor) 4))
                                    (patch-unchanged
                                      (map-snapshot-matches-p
                                       patch-before
                                       (gethash "PATCH-MAP" after-constructor)
                                       16))
                                    (start nil)
                                    (slots nil)
                                    (slot-readable nil)
                                    (type-ok nil)
                                    (slots-ok nil)
                                    (constructor-ready nil))
                               (when (and (null constructor-condition)
                                          (= (length constructor-values) 1))
                                 (setf start (car constructor-values)
                                       type-ok (tript-object-p start))
                                 (when type-ok
                                   (handler-case
                                       (setf slots (tript-slots start)
                                             slot-readable t)
                                     (condition (condition)
                                       (record-error
                                        :constructor-direct-slots condition))))
                                 (setf slots-ok
                                       (and slot-readable
                                            (every (lambda (value)
                                                     (typep value 'fixnum))
                                                   slots)
                                            (equal slots inputs))))
                               (emit "CONSTRUCTOR-RETURN arity=~D values=~S"
                                     (length constructor-values)
                                     (typed-values constructor-values))
                               (when (= (length constructor-values) 1)
                                 (emit "CONSTRUCTOR-POINT type=~S type-is-tript=~S direct-xyz=~S expected-xyz=~S slots-match=~S"
                                       (type-of start) type-ok
                                       (if slot-readable
                                           (typed-values slots) :unreadable)
                                       inputs slots-ok))
                               (setf constructor-ready
                                     (and (null constructor-condition)
                                          (= (length constructor-values) 1)
                                          type-ok slots-ok
                                          (getf rng-check :valid)
                                          (getf rng-check :stable)
                                          bindings-unchanged
                                          fill-unchanged patch-unchanged))
                               (emit "CONSTRUCTOR-GATE ready=~S type-is-tript=~S slots-match=~S rng-preview-valid=~S rng-preview-stable=~S bindings-unchanged=~S fill-map-identity-and-full-cells-same=~S patch-map-identity-and-full-cells-same=~S"
                                     constructor-ready type-ok slots-ok
                                     (getf rng-check :valid)
                                     (getf rng-check :stable)
                                     bindings-unchanged fill-unchanged
                                     patch-unchanged)
                               (unless constructor-ready
                                 (emit "CASE-SKIPPED reason=constructor-gate"))
                               (when constructor-ready
                                 (let* ((fill-symbol (find-symbol "FILL-MAP"
                                                                 owner))
                                        (wide-symbol (find-symbol "*PIC-WIDE*"
                                                                 owner))
                                        (high-symbol (find-symbol "*PIC-HIGH*"
                                                                 owner))
                                        (scratch
                                          (make-array '(7 7)
                                                      :element-type
                                                      '(unsigned-byte 4)
                                                      :initial-element 0))
                                         (symbols-ready
                                           (and fill-symbol wide-symbol
                                                high-symbol
                                                (eq fill-symbol
                                                    (getf
                                                     (gethash "FILL-MAP"
                                                              before)
                                                     :symbol))
                                                (eq wide-symbol
                                                    (getf
                                                     (gethash "*PIC-WIDE*"
                                                              before)
                                                     :symbol))
                                                (eq high-symbol
                                                    (getf
                                                     (gethash "*PIC-HIGH*"
                                                              before)
                                                     :symbol))
                                                (eq (getf
                                                     (gethash "FILL-MAP"
                                                              before)
                                                     :bound)
                                                    t)
                                                (eq (getf
                                                     (gethash "*PIC-WIDE*"
                                                              before)
                                                     :bound)
                                                    t)
                                                (eq (getf
                                                     (gethash "*PIC-HIGH*"
                                                              before)
                                                     :bound)
                                                    t))))
                                    (if (not symbols-ready)
                                       (record-error :dynamic-symbols
                                                     :required-symbol-unavailable)
                                     (let ((scratch-before nil)
                                           (scratch-after nil)
                                           (case-return-values nil)
                                            (case-rng-before nil)
                                            (case-rng-after nil)
                                            (case-rng-check nil)
                                            (case-start-before nil)
                                            (case-start-after nil)
                                            (target-condition nil)
                                            (dynamic-state-before nil)
                                            (dynamic-state-after nil)
                                            (case-observer-finished nil))
                                       (progv (list fill-symbol wide-symbol
                                                    high-symbol)
                                              (list scratch 7 7)
                                         (setf scratch-before
                                               (scratch-cells scratch)
                                                case-start-before
                                                (tript-slots start)
                                                case-rng-before
                                                (random-preview)
                                                dynamic-state-before
                                                (state-set names
                                                           :inside-progv-before))
                                          (let* ((dynamic-ready
                                                   (and
                                                    (eq (getf
                                                         (gethash "FILL-MAP"
                                                                  dynamic-state-before)
                                                         :symbol)
                                                        fill-symbol)
                                                    (eq (getf
                                                         (gethash "FILL-MAP"
                                                                  dynamic-state-before)
                                                         :bound)
                                                        t)
                                                    (eq (getf
                                                         (gethash "FILL-MAP"
                                                                  dynamic-state-before)
                                                         :value)
                                                        scratch)
                                                    (eq (getf
                                                         (gethash "*PIC-WIDE*"
                                                                  dynamic-state-before)
                                                         :symbol)
                                                        wide-symbol)
                                                    (eq (getf
                                                         (gethash "*PIC-WIDE*"
                                                                  dynamic-state-before)
                                                         :bound)
                                                        t)
                                                    (eql (getf
                                                          (gethash "*PIC-WIDE*"
                                                                   dynamic-state-before)
                                                          :value)
                                                         7)
                                                    (eq (getf
                                                         (gethash "*PIC-HIGH*"
                                                                  dynamic-state-before)
                                                         :symbol)
                                                        high-symbol)
                                                    (eq (getf
                                                         (gethash "*PIC-HIGH*"
                                                                  dynamic-state-before)
                                                         :bound)
                                                        t)
                                                    (eql (getf
                                                          (gethash "*PIC-HIGH*"
                                                                   dynamic-state-before)
                                                          :value)
                                                         7)
                                                    (eq (symbol-value
                                                         fill-symbol) scratch)
                                                   (eql (symbol-value
                                                         wide-symbol) 7)
                                                   (eql (symbol-value
                                                         high-symbol) 7)
                                                   (equal
                                                    (array-dimensions
                                                     (symbol-value fill-symbol))
                                                    '(7 7))
                                                   (equal
                                                    (array-element-type
                                                     (symbol-value fill-symbol))
                                                    '(unsigned-byte 4))
                                                    (every
                                                     #'zerop
                                                     (mapcar #'third
                                                             scratch-before))))
                                                 (case-rng-before-valid
                                                   (random-preview-valid-p
                                                    case-rng-before))
                                                 (call-gate
                                                   (and metadata-ready
                                                        runtime-ready
                                                        constructor-ready
                                                        dynamic-ready
                                                        case-rng-before-valid)))
                                            (emit "CALL-GATE ready=~S metadata-ready=~S runtime-ready=~S constructor-ready=~S zero-edge-fixed-start-perim-arglist=~S scratch-zero-49-cells=~S pre-call-rng-preview-valid=~S"
                                                  call-gate metadata-ready
                                                  runtime-ready
                                                  constructor-ready
                                                  (fixed-zero-edge-arglist-p)
                                                  (and (= (length scratch-before)
                                                          49)
                                                       (every
                                                        #'zerop
                                                        (mapcar #'third
                                                                scratch-before)))
                                                  case-rng-before-valid)
                                            (emit "DYNAMIC-PREFLIGHT ready=~S temporary-bindings-recorded=~S fill-symbol-eq-post-main=~S pic-wide-symbol-eq-post-main=~S pic-high-symbol-eq-post-main=~S fill-map-eq-scratch=~S pic-wide=~S pic-high=~S scratch-before=~S"
                                                  dynamic-ready
                                                  (state-set-captured-p
                                                   names dynamic-state-before)
                                                  (eq fill-symbol
                                                      (getf
                                                       (gethash "FILL-MAP"
                                                                before)
                                                       :symbol))
                                                  (eq wide-symbol
                                                      (getf
                                                       (gethash "*PIC-WIDE*"
                                                                before)
                                                       :symbol))
                                                  (eq high-symbol
                                                      (getf
                                                       (gethash "*PIC-HIGH*"
                                                                before)
                                                       :symbol))
                                                  (eq (symbol-value
                                                       fill-symbol) scratch)
                                                 (symbol-value wide-symbol)
                                                 (symbol-value high-symbol)
                                                 scratch-before)
                                           (if (not call-gate)
                                               (progn
                                                 (unless dynamic-ready
                                                   (record-error
                                                    :dynamic-preflight
                                                    :binding-or-map-mismatch))
                                                 (emit "CASE-SKIPPED reason=call-gate"))
                                             (progn
                                               (setf case-active t)
                                               (incf zero-edge-calls)
                                               (emit "CASE-BEGIN call=1 function=ZERO-EDGE start-type=~S start-is-tript=~S start-direct-xyz=~S expected-xyz=(3 3 0) budget-type=~S perim=0 perim-is-hypothesis=t scratch-dimensions=(7 7) scratch-element-type=~S scratch-cells=49"
                                                     (type-of start)
                                                     (tript-object-p start)
                                                     (typed-values
                                                      case-start-before)
                                                     (type-of 0)
                                                     (array-element-type
                                                      scratch))
                                               (finish-output report)
                                               (unwind-protect
                                                    (progn
                                                        (handler-case
                                                            (progn
                                                              (setf case-return-values
                                                                    (multiple-value-list
                                                                     (funcall
                                                                      zero-edge-function
                                                                      start 0))
                                                                    case-returned t))
                                                          (condition (condition)
                                                            (setf target-condition
                                                                  condition
                                                                  case-condition-type
                                                                  (type-of condition))
                                                            (emit "CASE-ERROR type=~S details=~S"
                                                                  (type-of condition)
                                                                  (condition-details
                                                                   condition))))
                                                       (when case-returned
                                                              (emit "CASE-RETURN arity=~D values=~S"
                                                                    (length
                                                                     case-return-values)
                                                                    (typed-values
                                                                     case-return-values)))
                                                       (setf case-active nil)
                                                      (when case-returned
                                                        (when case-return-values
                                                          (handler-case
                                                              (emit "RETURNED-TRIPT-PATH summary=~S"
                                                                    (point-list-summary
                                                                     (car case-return-values)
                                                                     start))
                                                            (condition
                                                             (condition)
                                                              (record-error
                                                                :returned-path-summary
                                                                condition)))))
                                                      (setf scratch-after
                                                            (scratch-cells scratch)
                                                            case-start-after
                                                            (tript-slots start)
                                                            case-rng-after
                                                            (random-preview)
                                                            dynamic-state-after
                                                            (state-set names
                                                                       :inside-progv-after))
                                                      (emit "START-DIRECT-XYZ before=~S after=~S unchanged=~S"
                                                            (typed-values
                                                             case-start-before)
                                                            (typed-values
                                                             case-start-after)
                                                            (equalp
                                                             case-start-before
                                                             case-start-after))
                                                      (emit "SCRATCH-MAP dimensions=(7 7) element-type=~S cells-before=~S cells-after=~S changed-cells=~S"
                                                            (array-element-type
                                                             scratch)
                                                            scratch-before
                                                            scratch-after
                                                            (changed-scratch-cells
                                                             scratch-before
                                                             scratch-after))
                                                       (setf case-rng-check
                                                             (random-preview-check
                                                              :zero-edge
                                                              case-rng-before
                                                              case-rng-after)))
                                                  (setf case-active nil)
                                                  (emit "CASE-OBSERVATION inside-progv-before-state-recorded=~S inside-progv-after-state-recorded=~S"
                                                        (state-set-captured-p
                                                         names dynamic-state-before)
                                                        (state-set-captured-p
                                                         names dynamic-state-after)))))))
                                       (let* ((after-case
                                                (state-set names :after-progv))
                                          (bindings-unchanged
                                                (state-set-deltas
                                                 names after-constructor
                                                 after-case))
                                               (after-maps-capturable
                                                 (and
                                                  (map-state-capturable-p
                                                   (gethash "FILL-MAP" after-case)
                                                   4)
                                                  (map-state-capturable-p
                                                   (gethash "PATCH-MAP" after-case)
                                                   16)))
                                               (dynamic-restored
                                                (and bindings-unchanged
                                                     (map-snapshot-matches-p
                                                      fill-before
                                                      (gethash "FILL-MAP"
                                                               after-case) 4)
                                                     (map-snapshot-matches-p
                                                      patch-before
                                                      (gethash "PATCH-MAP"
                                                               after-case)
                                                      16))))
                                         (emit "ORIGINAL-BINDINGS-AFTER-PROGV unchanged=~S"
                                               bindings-unchanged)
                                         (emit "DYNAMIC-RESTORATION restored=~S"
                                               dynamic-restored)
                                         (emit "ORIGINAL-MAP-CHECK fill-map-identity-and-full-cells-same=~S patch-map-identity-and-full-cells-same=~S"
                                               (map-snapshot-matches-p
                                                fill-before
                                                (gethash "FILL-MAP"
                                                         after-case) 4)
                                               (map-snapshot-matches-p
                                                patch-before
                                                (gethash "PATCH-MAP"
                                                         after-case) 16))
                                          (emit "STATE-AND-MAP-OUTCOME start-binding-and-directions-captured=t fill-map-copy-elements=~D patch-map-copy-elements=~D"
                                               (length (getf fill-before
                                                             :cells))
                                                (length (getf patch-before
                                                              :cells)))
                                          (setf case-observer-finished
                                                (and (= zero-edge-calls 1)
                                                     (or case-returned
                                                         target-condition)
                                                     (state-set-captured-p
                                                      names before)
                                                     (state-set-captured-p
                                                      names after-constructor)
                                                     (state-set-captured-p
                                                      names dynamic-state-before)
                                                     (state-set-captured-p
                                                      names dynamic-state-after)
                                                     (state-set-captured-p
                                                      names after-case)
                                                     (= (length scratch-before) 49)
                                                     (= (length scratch-after) 49)
                                                     (= (length case-start-before) 3)
                                                     (= (length case-start-after) 3)
                                                     (getf case-rng-check :valid)
                                                     (= (length (getf fill-before
                                                                      :cells))
                                                        (getf
                                                         (getf fill-before
                                                               :metadata)
                                                         :total))
                                                     (= (length (getf patch-before
                                                                      :cells))
                                                        (getf
                                                         (getf patch-before
                                                               :metadata)
                                                         :total))
                                                     after-maps-capturable))
                                          (emit "CASE-OBSERVATIONS-READY ready=~S return-or-condition=~S start-before-after=~S scratch-before-after=~S state-sets-captured=~S original-maps-capturable=~S rng-preview-valid=~S"
                                                case-observer-finished
                                                (or case-returned
                                                    (not (null target-condition)))
                                                (and (= (length case-start-before) 3)
                                                     (= (length case-start-after) 3))
                                                (and (= (length scratch-before) 49)
                                                     (= (length scratch-after) 49))
                                                (and (state-set-captured-p
                                                      names before)
                                                     (state-set-captured-p
                                                      names after-constructor)
                                                     (state-set-captured-p
                                                      names dynamic-state-before)
                                                     (state-set-captured-p
                                                      names dynamic-state-after)
                                                     (state-set-captured-p
                                                      names after-case))
                                                after-maps-capturable
                                                (getf case-rng-check :valid))
                                          (setf case-completed
                                                (and case-observer-finished
                                                     t)))))))))
                          (setf case-finished t)))
                     (condition (condition)
                       (record-error :case-observer condition)
                        (emit "CASE-OBSERVER-ERROR type=~S details=~S"
                              (type-of condition)
                              (condition-details condition))))
                 (setf case-active nil
                       case-completed (and case-finished case-completed))
                (emit "CASE-END attempted=~S returned=~S completed=~S calls=~D active=~S overflow=~S observer-errors=~D target-condition=~S"
                      case-attempted case-returned case-completed
                      zero-edge-calls case-active overflow errors
                        case-condition-type))))
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
                 (handler-case
                     (run-zero-edge-case)
                   (condition (condition)
                     (record-error :post-main-single-call condition)
                     (setf case-active nil)
                     (emit "CASE-FINALIZATION-ERROR type=~S details=~S"
                           (type-of condition)
                           (condition-details condition))))
               (emit "CASE-SKIPPED reason=~S"
                     (if (eq status :aborted) :main-aborted :main-not-run)))
             (setf finalized t)
             (emit "COMPLETE main-status=~S main-wrapper-installed=~S case-attempted=~S case-returned=~S case-completed=~S zero-edge-calls=~D case-active=~S overflow=~S errors=~D"
                   status wrapper-installed case-attempted case-returned
                   case-completed zero-edge-calls case-active overflow errors)
             (emit "END zero-edge-traversal-single v2")
             (close-report)))
         (safe-main-finish (status)
           (let ((*print-length* 128)
                 (*print-level* 16)
                 (*print-pretty* nil)
                 (*print-circle* t)
                 (*print-readably* nil))
             (handler-case
                 (finish-main-capture status)
               (condition (condition)
                 (ignore-errors
                   (record-error :main-wrapper-finish condition))
                 (unless finalized
                   (setf finalized t)
                   (ignore-errors
                     (emit "COMPLETE main-status=~S main-wrapper-installed=~S case-attempted=~S case-returned=~S case-completed=~S zero-edge-calls=~D case-active=~S overflow=~S errors=~D"
                           status wrapper-installed case-attempted
                           case-returned case-completed zero-edge-calls
                           case-active overflow errors))
                   (ignore-errors
                      (emit "END zero-edge-traversal-single v2")))
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
                                  (decf main-depth))))))
                    (setf wrapper-installed t)
                    (emit "INSTALL name=MAIN original-type=~S"
                          (type-of main-original))
                    t)
                (condition (condition)
                  (record-error :main-wrapper-install condition)
                   nil))))))
      (emit "BEGIN zero-edge-traversal-single v2")
      (emit "SCOPE one-post-main-zero-edge-call gated-by-metadata-runtime-constructor zero-edge-wrapped=nil candidate-perim=0 hypothesis-only scratch=7x7-ubyte4-zero main-values=preserved main-errors=propagated rng-reset=none state-reset=none")
      (emit "LIMITS value-nodes=256 list-items=64 array-items=64 depth=4 string-prefix=256 condition-control-prefix=256 state-bindings=7 original-map-cells=1048576 scratch-map-cells=49 returned-path-items=64")
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
      (emit "TRIPT-TYPE lookup-status=~S resolved=~S symbol-name=~S symbol-package=~S"
            tript-type-status
            (not (null tript-type-symbol))
            (when tript-type-symbol (symbol-name tript-type-symbol))
            (when (and tript-type-symbol
                       (symbol-package tript-type-symbol))
              (package-name (symbol-package tript-type-symbol))))
      (dolist (name '("ZERO-EDGE" "MAKE-TRIPT" "X" "Y" "Z" "MAIN"))
        (handler-case (inspect-function name)
          (condition (condition) (record-error (list name :inspect) condition))))
      (dolist (name '("XINCS" "YINCS" "START" "FILL-MAP" "PATCH-MAP"
                      "*PIC-WIDE*" "*PIC-HIGH*"))
        (handler-case (inspect-binding name)
          (condition (condition) (record-error (list name :binding) condition))))
      (let* ((maker-info (gethash "MAKE-TRIPT" function-info))
             (maker-ready (and maker-info (getf maker-info :compiled)))
             (zero-edge-info (gethash "ZERO-EDGE" function-info))
             (zero-edge-ready (and zero-edge-info
                                   (getf zero-edge-info :compiled)))
             (accessors-ready (every (lambda (name)
                                        (and (gethash name function-info)
                                             (gethash name function-symbols)))
                                      '("X" "Y" "Z")))
             (maker-arglist-ready (fixed-x-y-z-arglist-p))
             (zero-edge-arglist-ready (fixed-zero-edge-arglist-p))
             (error-free (zerop errors))
             (main-ready (and main-symbol main-original))
             (gate (and error-free maker-ready zero-edge-ready accessors-ready
                        maker-arglist-ready zero-edge-arglist-ready)))
        (setf metadata-gate gate)
        (emit "GATE maker-fixed-positional-x-y-z=~S maker-compiled=~S zero-edge-fixed-start-perim=~S zero-edge-compiled=~S accessors-fbound=~S errors-zero=~S"
              maker-arglist-ready maker-ready zero-edge-arglist-ready
              zero-edge-ready accessors-ready error-free)
        (emit "MAIN-GATE present=~S fbound=~S original-type=~S"
              (not (null main-symbol)) (not (null main-original))
              (when main-original (type-of main-original)))
        (if (and main-ready (install-main-wrapper))
            (progn
              (emit "READY metadata-errors=~D zero-edge-case-gate=~S main-wrapper-installed=t"
                    errors metadata-gate)
              (finish-output report))
          (progn
            (unless main-ready
              (record-error :main-wrapper :main-unbound))
            (emit "READY metadata-errors=~D zero-edge-case-gate=~S main-wrapper-installed=nil"
                  errors metadata-gate)
            (safe-main-finish :install-error)))))))
