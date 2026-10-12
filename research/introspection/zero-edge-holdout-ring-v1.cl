;;; ZERO-EDGE bounded 6-case post-MAIN ring holdout; outcomes are unmeasured.
;;; Reuses the reviewed matrix observer helpers and preserves MAIN behavior.
(in-package :cl-user)

(unless (boundp 'aaron-zero-edge-holdout-ring-v1-loaded)
  (set 'aaron-zero-edge-holdout-ring-v1-loaded t)
  (let* ((report (open "C:\\temp\\aaron-zero-edge-holdout-ring-v1.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (*print-length* 128)
        (*print-level* 16)
        (*print-pretty* nil)
         (*print-circle* nil)
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
         (matrix-batch "ring-v1")
         (matrix-ordinal-start 34)
         (matrix-ordinal-end 39)
         (matrix-planned 6)
         (matrix-case-attempted 0)
         (matrix-case-completed 0)
         (matrix-aborted nil)
         (matrix-complete nil)
         (matrix-ready nil)
         (zero-edge-calls 0)
         (case-active nil)
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
                  (*print-circle* nil)
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
                                 (truncated (> total 128)))
                            (when (<= total 128)
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
            (let ((items nil) (count 0))
              (dolist (value values (nreverse items))
                (if (>= count 64)
                    (progn
                      (setf overflow t)
                      (return (nreverse items)))
                  (let* ((summary (value-summary value))
                         (item (list :type (type-of value)
                                     :value summary)))
                    (when (summary-truncated-p summary)
                      (setf overflow t))
                    (push item items)
                    (incf count))))))
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
          (scratch-cells (map width height)
            (unless (and (arrayp map) (= (array-rank map) 2)
                         (equal (array-dimensions map) (list width height))
                         (= (* width height) (array-total-size map))
                         (<= (array-total-size map) 99)
                         (equal (array-element-type map) '(unsigned-byte 4)))
              (error "Scratch FILL-MAP fails bounded dimensioned UBYTE4 contract"))
            (let ((cells nil))
              (dotimes (x width)
                (dotimes (y height)
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
                   (let ((tail-summary (value-summary rest)))
                     (when (summary-truncated-p tail-summary)
                       (setf overflow t))
                     (setf improper t
                           tail (list :type (type-of rest)
                                      :summary tail-summary)))
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
          (summary-truncated-p (summary)
            (labels ((walk (item)
                       (cond
                         ((member item '(:node-limit :list-limit :depth-limit)
                                  :test #'eq)
                          t)
                         ((consp item)
                          (or (and (eq (car item) :truncated)
                                   (consp (cdr item))
                                   (eq (cadr item) t))
                              (walk (car item))
                              (walk (cdr item))))
                         (t nil))))
              (walk summary)))
          (case-spec (ordinal width height x y direction perim shape)
            (list :ordinal ordinal
                  :local-call (1+ (- ordinal matrix-ordinal-start))
                  :batch matrix-batch :width width :height height
                  :x x :y y :direction direction :perim perim :shape shape))
          (matrix-case-spec (ordinal)
            (cond
              ((and (integerp ordinal) (<= 34 ordinal) (<= ordinal 39))
               (let ((row (nth (- ordinal 34)
                               '((18 0) (18 2) (19 0)
                                 (19 2) (20 0) (20 2)))))
                 (case-spec ordinal 9 11 2 2 (second row) (first row)
                            :zero-rectangle-ring-rest-ones)))
              (t nil)))
          (matrix-shape-cell-value (shape x y)
            (case shape
              (:zero 0)
              (:single-4-3-value-0
               (if (and (= x 4) (= y 3)) 0 0))
              (:single-4-3-value-1
               (if (and (= x 4) (= y 3)) 1 0))
              (:single-4-3-value-15
               (if (and (= x 4) (= y 3)) 15 0))
              (:zero-rectangle-ring-rest-ones
               (if (or (and (or (= x 2) (= x 6))
                            (<= 2 y) (<= y 8))
                       (and (or (= y 2) (= y 8))
                            (<= 2 x) (<= x 6)))
                   0 1))
              (otherwise :invalid)))
          (make-matrix-scratch (width height shape)
            (let ((scratch
                    (make-array (list width height)
                                :element-type '(unsigned-byte 4)
                                :initial-element 0)))
              (dotimes (x width scratch)
                (dotimes (y height)
                  (setf (aref scratch x y)
                        (matrix-shape-cell-value shape x y))))))
          (matrix-scratch-matches-shape-p (scratch width height shape)
            (and (arrayp scratch)
                 (= (array-rank scratch) 2)
                 (equal (array-dimensions scratch) (list width height))
                 (= (* width height) (array-total-size scratch))
                 (<= (array-total-size scratch) 99)
                 (equal (array-element-type scratch) '(unsigned-byte 4))
                 (let ((matches t))
                   (dotimes (x width)
                     (dotimes (y height)
                       (unless (eql (aref scratch x y)
                                    (matrix-shape-cell-value shape x y))
                         (setf matches nil))))
                   matches)))
          (matrix-scratch-metadata-valid-p (scratch width height)
            (and (arrayp scratch)
                 (= (array-rank scratch) 2)
                 (equal (array-dimensions scratch) (list width height))
                 (= (* width height) (array-total-size scratch))
                 (<= (array-total-size scratch) 99)
                 (equal (array-element-type scratch) '(unsigned-byte 4))))
          (matrix-snapshot-size-valid-p (snapshot)
            (let* ((metadata (getf snapshot :metadata))
                   (dimensions (getf metadata :dimensions))
                   (total (getf metadata :total)))
              (and (consp dimensions) (consp (cdr dimensions))
                   (null (cddr dimensions))
                   (integerp (first dimensions))
                   (integerp (second dimensions))
                   (integerp total)
                   (= (* (first dimensions) (second dimensions)) total)
                   (= (length (getf snapshot :cells)) total))))
          (matrix-boundary (phase names baseline fill-snapshot
                                  patch-snapshot rng-baseline)
            (let* ((states (state-set names phase))
                   (rng (random-preview))
                   (rng-valid (random-preview-valid-p rng))
                   (rng-baseline-stable
                     (and rng-valid (equal rng rng-baseline)))
                   (states-recorded (state-set-captured-p names states))
                   (bindings-same
                     (state-set-deltas names baseline states))
                   (fill-same
                     (map-snapshot-matches-p
                      fill-snapshot (gethash "FILL-MAP" states) 4))
                   (patch-same
                     (map-snapshot-matches-p
                      patch-snapshot (gethash "PATCH-MAP" states) 16))
                   (ready (and states-recorded bindings-same fill-same
                               patch-same rng-valid rng-baseline-stable)))
              (emit "MATRIX-BOUNDARY phase=~S ready=~S states-recorded=~S bindings-same=~S fill-map-identity-and-full-cells-same=~S patch-map-identity-and-full-cells-same=~S rng-valid=~S rng-baseline-stable=~S rng-preview=~S"
                    phase ready states-recorded bindings-same fill-same
                    patch-same rng-valid rng-baseline-stable rng)
              (values ready states rng)))
          (matrix-dynamic-state-ready-p (names baseline states scratch
                                               width height)
            (let* ((fill-state (gethash "FILL-MAP" states))
                   (wide-state (gethash "*PIC-WIDE*" states))
                   (high-state (gethash "*PIC-HIGH*" states))
                   (fill-baseline (gethash "FILL-MAP" baseline))
                   (wide-baseline (gethash "*PIC-WIDE*" baseline))
                   (high-baseline (gethash "*PIC-HIGH*" baseline))
                   (static-same t))
              (dolist (name names)
                (unless (member name '("FILL-MAP" "*PIC-WIDE*" "*PIC-HIGH*")
                                :test #'string=)
                  (unless (same-binding-state-p
                           (gethash name baseline) (gethash name states))
                    (setf static-same nil))))
              (and (state-set-captured-p names states)
                   static-same
                   (eq (getf fill-state :symbol)
                       (getf fill-baseline :symbol))
                   (eq (getf fill-state :bound) t)
                   (eq (getf fill-state :value) scratch)
                   (equal (array-dimensions scratch) (list width height))
                   (= (* width height) (array-total-size scratch))
                   (<= (array-total-size scratch) 99)
                   (equal (array-element-type scratch) '(unsigned-byte 4))
                   (eq (getf wide-state :symbol)
                       (getf wide-baseline :symbol))
                   (eq (getf wide-state :bound) t)
                   (eql (getf wide-state :value) width)
                   (eq (getf high-state :symbol)
                       (getf high-baseline :symbol))
                   (eq (getf high-state :bound) t)
                   (eql (getf high-state :value) height))))
          (run-matrix-case (ordinal names baseline fill-snapshot
                              patch-snapshot rng-baseline seen-starts
                              seen-scratches maker-function zero-edge-function)
            (let* ((spec (matrix-case-spec ordinal))
                   (local-call (getf spec :local-call))
                   (batch (getf spec :batch))
                   (width (getf spec :width))
                   (height (getf spec :height))
                   (x (getf spec :x))
                   (y (getf spec :y))
                   (direction (getf spec :direction))
                   (perim (getf spec :perim))
                   (shape (getf spec :shape))
                   (inputs (list x y direction))
                   (constructor-values nil)
                   (constructor-condition nil)
                   (constructor-rng-check nil)
                   (start nil)
                   (start-slots nil)
                   (start-type-ok nil)
                   (start-slots-ok nil)
                   (start-unique nil)
                   (start-first-ordinal nil)
                   (constructor-ready nil)
                    (scratch nil)
                    (scratch-identity-checked nil)
                    (scratch-unique nil)
                    (scratch-first-ordinal nil)
                    (scratch-before nil)
                   (scratch-after nil)
                   (scratch-before-ready nil)
                   (scratch-after-ready nil)
                   (case-start-before nil)
                   (case-start-after nil)
                   (dynamic-state-before nil)
                   (dynamic-state-after nil)
                   (dynamic-before-ready nil)
                   (dynamic-after-ready nil)
                   (case-rng-before nil)
                   (case-rng-after nil)
                   (case-rng-before-valid nil)
                   (case-rng-baseline-stable nil)
                   (case-rng-check nil)
                   (case-return-values nil)
                   (case-returned nil)
                   (target-condition nil)
                   (path-summary-captured nil)
                   (call-gate nil)
                   (after-target-boundary-ok nil)
                   (case-observations-ready nil)
                   (calls-before zero-edge-calls)
                   (errors-before errors))
              (incf matrix-case-attempted)
              (setf case-active t)
               (emit "CASE-BEGIN ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S scratch-element-type=(UNSIGNED-BYTE 4)"
                    ordinal local-call batch width height x y direction perim
                    shape)
              (unwind-protect
                   (handler-case
                       (multiple-value-bind
                             (pre-constructor-ready pre-constructor-state
                              rng-before)
                           (matrix-boundary :before-constructor names baseline
                                            fill-snapshot patch-snapshot
                                            rng-baseline)
                         (declare (ignore pre-constructor-state))
                         (emit "CASE-PREFLIGHT ordinal=~D baseline-boundary-ready=~S"
                               ordinal pre-constructor-ready)
                         (when pre-constructor-ready
                           (handler-case
                               (setf constructor-values
                                     (multiple-value-list
                                      (apply maker-function inputs)))
                             (condition (condition)
                               (setf constructor-condition condition)
                                   (emit "CONSTRUCTOR-ERROR ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S type=~S details=~S"
                                     ordinal local-call batch width height x y
                                     direction perim shape (type-of condition)
                                     (condition-details condition))))
                           (multiple-value-bind
                                 (after-constructor-ready after-constructor-state
                                  constructor-rng)
                               (matrix-boundary :after-constructor names
                                                baseline fill-snapshot
                                                patch-snapshot rng-baseline)
                             (declare (ignore after-constructor-state))
                             (setf constructor-rng-check
                                   (random-preview-check
                                    :constructor rng-before constructor-rng))
                             (when (and (null constructor-condition)
                                        (= (length constructor-values) 1))
                               (setf start (car constructor-values)
                                     start-type-ok (tript-object-p start))
                               (when start-type-ok
                                 (handler-case
                                     (setf start-slots (tript-slots start))
                                   (condition (condition)
                                     (record-error
                                      (list :matrix-constructor-slots ordinal)
                                      condition)))
                                 (setf start-slots-ok
                                       (and (= (length start-slots) 3)
                                            (every
                                             (lambda (value)
                                               (typep value 'fixnum))
                                             start-slots)
                                            (equal start-slots inputs)))
                                 (multiple-value-bind (first-ordinal seen)
                                     (gethash start seen-starts)
                                   (setf start-first-ordinal first-ordinal
                                         start-unique (not seen))
                                   (unless seen
                                     (setf (gethash start seen-starts)
                                           ordinal))))
                             (emit "CONSTRUCTOR-RETURN ordinal=~D arity=~D values=~S"
                                   ordinal (length constructor-values)
                                   (typed-values constructor-values))
                             (emit "CONSTRUCTOR-POINT ordinal=~D type=~S type-is-tript=~S direct-xyz=~S expected-xyz=~S slots-match=~S identity-unique=~S first-ordinal=~S"
                                   ordinal
                                   (when (= (length constructor-values) 1)
                                     (type-of start))
                                   start-type-ok
                                   (if start-slots
                                       (typed-values start-slots)
                                     :unreadable)
                                   inputs start-slots-ok start-unique
                                   start-first-ordinal)
                             (setf constructor-ready
                                   (and after-constructor-ready
                                        (null constructor-condition)
                                        (= (length constructor-values) 1)
                                        start-type-ok start-slots-ok
                                        start-unique
                                        (getf constructor-rng-check :valid)
                                        (getf constructor-rng-check :stable)
                                        (zerop errors)
                                        (not overflow)))
                             (emit "CONSTRUCTOR-GATE ordinal=~D ready=~S type-is-tript=~S slots-match=~S identity-unique=~S rng-preview-valid=~S rng-preview-stable=~S baseline-state-and-maps-same=~S"
                                   ordinal constructor-ready start-type-ok
                                   start-slots-ok start-unique
                                   (getf constructor-rng-check :valid)
                                   (getf constructor-rng-check :stable)
                                   after-constructor-ready)
                             (when constructor-ready
                               (let* ((fill-symbol
                                        (and owner
                                             (find-symbol "FILL-MAP" owner)))
                                      (wide-symbol
                                        (and owner
                                             (find-symbol "*PIC-WIDE*" owner)))
                                      (high-symbol
                                        (and owner
                                             (find-symbol "*PIC-HIGH*" owner)))
                                      (fill-baseline
                                        (gethash "FILL-MAP" baseline))
                                      (wide-baseline
                                        (gethash "*PIC-WIDE*" baseline))
                                      (high-baseline
                                        (gethash "*PIC-HIGH*" baseline))
                                      (fill-state nil)
                                      (wide-state nil)
                                      (high-state nil)
                                      (dynamic-symbols-ready
                                        (and fill-symbol wide-symbol high-symbol
                                             (eq fill-symbol
                                                 (getf fill-baseline :symbol))
                                             (eq wide-symbol
                                                 (getf wide-baseline :symbol))
                                             (eq high-symbol
                                                 (getf high-baseline :symbol))
                                             (eq (getf fill-baseline :bound) t)
                                             (eq (getf wide-baseline :bound) t)
                                             (eq (getf high-baseline :bound) t))))
                                  (setf scratch
                                        (make-matrix-scratch width height shape))
                                  (when (arrayp scratch)
                                    (multiple-value-bind (first-ordinal seen)
                                        (gethash scratch seen-scratches)
                                      (setf scratch-first-ordinal first-ordinal
                                            scratch-unique (not seen)
                                            scratch-identity-checked t)
                                      (unless seen
                                        (setf (gethash scratch seen-scratches)
                                              ordinal))
                                      (unless scratch-unique
                                        (record-error
                                         (list :matrix-scratch-reused ordinal)
                                         (list :first-ordinal first-ordinal))))
                                    (emit "SCRATCH-IDENTITY ordinal=~D local-call=~D batch=~A unique=~S checked=~S first-ordinal=~S"
                                          ordinal local-call batch scratch-unique
                                          scratch-identity-checked
                                          scratch-first-ordinal))
                                 (emit "DYNAMIC-SYMBOL-GATE ordinal=~D ready=~S fill-symbol-eq-post-main=~S pic-wide-symbol-eq-post-main=~S pic-high-symbol-eq-post-main=~S"
                                       ordinal dynamic-symbols-ready
                                       (and fill-symbol
                                            (eq fill-symbol
                                                (getf fill-baseline :symbol)))
                                       (and wide-symbol
                                            (eq wide-symbol
                                                (getf wide-baseline :symbol)))
                                       (and high-symbol
                                            (eq high-symbol
                                                (getf high-baseline :symbol))))
                                 (unless dynamic-symbols-ready
                                   (record-error
                                    (list :matrix-dynamic-symbols ordinal)
                                    :required-symbol-unavailable))
                                 (when dynamic-symbols-ready
                                   (progv (list fill-symbol wide-symbol
                                                high-symbol)
                                          (list scratch width height)
                                     (setf scratch-before
                                           (scratch-cells scratch width height)
                                           scratch-before-ready
                                           (matrix-scratch-matches-shape-p
                                            scratch width height shape)
                                           case-start-before
                                           (tript-slots start)
                                           case-rng-before (random-preview)
                                           case-rng-before-valid
                                           (random-preview-valid-p
                                            case-rng-before)
                                           case-rng-baseline-stable
                                           (and case-rng-before-valid
                                                (equal case-rng-before
                                                       rng-baseline))
                                           dynamic-state-before
                                           (state-set names
                                                      :inside-progv-before)
                                           fill-state
                                           (gethash "FILL-MAP"
                                                    dynamic-state-before)
                                           wide-state
                                           (gethash "*PIC-WIDE*"
                                                    dynamic-state-before)
                                           high-state
                                           (gethash "*PIC-HIGH*"
                                                    dynamic-state-before)
                                           dynamic-before-ready
                                           (matrix-dynamic-state-ready-p
                                            names baseline dynamic-state-before
                                            scratch width height))
                                     (setf call-gate
                                           (and metadata-gate matrix-ready
                                                 constructor-ready
                                                 dynamic-before-ready
                                                 scratch-identity-checked
                                                 scratch-unique
                                                 scratch-before-ready
                                                case-rng-before-valid
                                                case-rng-baseline-stable
                                                (< zero-edge-calls
                                                   matrix-planned)
                                                (zerop errors)
                                                (not overflow)))
                                      (emit "CALL-GATE ordinal=~D local-call=~D batch=~A width=~D height=~D ready=~S metadata-ready=~S runtime-ready=~S constructor-ready=~S dynamic-state-ready=~S scratch-identity-checked=~S scratch-identity-unique=~S exact-scratch-shape=~S pre-call-rng-valid=~S pre-call-rng-baseline-stable=~S call-cap-available=~S"
                                           ordinal local-call batch width
                                           height call-gate metadata-gate
                                            matrix-ready constructor-ready
                                            dynamic-before-ready
                                            scratch-identity-checked
                                            scratch-unique
                                            scratch-before-ready
                                           case-rng-before-valid
                                           case-rng-baseline-stable
                                           (< zero-edge-calls matrix-planned))
                                     (emit "DYNAMIC-PREFLIGHT ordinal=~D local-call=~D batch=~A width=~D height=~D temporary-bindings-recorded=~S fill-map-eq-scratch=~S pic-wide=~S pic-high=~S scratch-before=~S"
                                           ordinal
                                           local-call batch width height
                                           (state-set-captured-p
                                            names dynamic-state-before)
                                           (eq (getf fill-state :value) scratch)
                                           (getf wide-state :value)
                                           (getf high-state :value)
                                           scratch-before)
                                     (when call-gate
                                       (setf case-active t)
                                       (finish-output report)
                                       (incf zero-edge-calls)
                                       (handler-case
                                           (setf case-return-values
                                                 (multiple-value-list
                                                  (funcall zero-edge-function
                                                           start perim))
                                                 case-returned t)
                                         (condition (condition)
                                           (setf target-condition condition)
                                           (emit "CASE-ERROR ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S type=~S details=~S"
                                                 ordinal local-call batch
                                                 width height x y direction
                                                 perim shape (type-of condition)
                                                 (condition-details condition))))
                                       (when case-returned
                                         (emit "CASE-RETURN ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S arity=~D values=~S"
                                               ordinal local-call batch
                                               width height x y direction
                                               perim shape
                                               (length case-return-values)
                                               (typed-values
                                                case-return-values))
                                         (if case-return-values
                                             (progn
                                               (emit "RETURNED-TRIPT-PATH ordinal=~D local-call=~D batch=~A summary=~S"
                                                     ordinal local-call batch
                                                     (point-list-summary
                                                      (car case-return-values)
                                                      start))
                                               (setf path-summary-captured t))
                                           (progn
                                             (emit "RETURNED-TRIPT-PATH ordinal=~D local-call=~D batch=~A present=nil reason=no-primary-value"
                                                   ordinal local-call batch)
                                             (setf path-summary-captured t))))
                                       (setf case-active nil
                                           scratch-after
                                             (scratch-cells scratch width height)
                                            scratch-after-ready
                                            (matrix-scratch-metadata-valid-p
                                             scratch width height)
                                             case-start-after
                                             (tript-slots start)
                                             case-rng-after (random-preview)
                                             dynamic-state-after
                                             (state-set names
                                                        :inside-progv-after)
                                             dynamic-after-ready
                                             (matrix-dynamic-state-ready-p
                                             names baseline
                                              dynamic-state-after scratch
                                              width height))
                                       (setf case-rng-check
                                             (random-preview-check
                                              :zero-edge case-rng-before
                                              case-rng-after))
                                       (emit "START-DIRECT-XYZ ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S before=~S after=~S unchanged=~S expected-before=~S"
                                             ordinal local-call batch width
                                             height x y direction perim shape
                                             (typed-values case-start-before)
                                             (typed-values case-start-after)
                                             (equalp case-start-before
                                                     case-start-after)
                                             inputs)
                                        (emit "SCRATCH-MAP ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S dimensions=~S element-type=~S exact-shape-before=~S metadata-valid-after=~S cells-before=~S cells-after=~S changed-cells=~S"
                                             ordinal local-call batch width
                                             height x y direction perim shape
                                             (list width height)
                                             (array-element-type scratch)
                                             scratch-before-ready
                                             scratch-after-ready
                                             scratch-before scratch-after
                                             (changed-scratch-cells
                                              scratch-before scratch-after))
                                       (emit "CASE-RNG ordinal=~D before-valid=~S after-valid=~S stable=~S baseline-stable=~S preview-before=~S preview-after=~S"
                                             ordinal case-rng-before-valid
                                             (random-preview-valid-p
                                              case-rng-after)
                                             (getf case-rng-check :stable)
                                             case-rng-baseline-stable
                                             case-rng-before case-rng-after)
                                       (emit "DYNAMIC-OBSERVATION ordinal=~D before-recorded=~S after-recorded=~S before-ready=~S after-ready=~S"
                                             ordinal
                                             (state-set-captured-p
                                              names dynamic-state-before)
                                             (state-set-captured-p
                                              names dynamic-state-after)
                                             dynamic-before-ready
                                             dynamic-after-ready)))
                                   (unless call-gate
                                     (emit "CASE-SKIPPED ordinal=~D reason=call-gate"
                                           ordinal))))))
                             (multiple-value-bind
                                   (after-target-ready after-target-state
                                    after-target-rng)
                                 (matrix-boundary :after-target names baseline
                                                  fill-snapshot patch-snapshot
                                                  rng-baseline)
                               (declare (ignore after-target-state
                                                after-target-rng))
                               (setf after-target-boundary-ok
                                     after-target-ready))
                             (setf case-observations-ready
                                   (and call-gate
                                        (= zero-edge-calls
                                           (1+ calls-before))
                                        (or case-returned target-condition)
                                        (or path-summary-captured
                                            (not (null target-condition)))
                                        (= (length scratch-before)
                                           (* width height))
                                        (= (length scratch-after)
                                           (* width height))
                                        scratch-before-ready
                                        scratch-after-ready
                                        (= (length case-start-before) 3)
                                        (= (length case-start-after) 3)
                                        dynamic-before-ready
                                        dynamic-after-ready
                                        (state-set-captured-p
                                         names dynamic-state-before)
                                        (state-set-captured-p
                                         names dynamic-state-after)
                                        (getf case-rng-check :valid)
                                        (getf case-rng-check :stable)
                                        case-rng-baseline-stable
                                        after-target-boundary-ok
                                        (zerop errors)
                                        (= errors errors-before)
                                        (not overflow)))
                             (emit "CASE-OBSERVATIONS-READY ordinal=~D ready=~S return-or-condition=~S starts-recorded=~S scratch-recorded=~S dynamic-state-recorded=~S original-state-and-maps-same=~S rng-valid=~S rng-stable=~S rng-baseline-stable=~S overflow=~S"
                                   ordinal case-observations-ready
                                   (or case-returned
                                       (not (null target-condition)))
                                   (and (= (length case-start-before) 3)
                                        (= (length case-start-after) 3))
                                   (and (= (length scratch-before)
                                           (* width height))
                                        (= (length scratch-after)
                                           (* width height)))
                                   (and (state-set-captured-p
                                         names dynamic-state-before)
                                        (state-set-captured-p
                                         names dynamic-state-after))
                                   after-target-boundary-ok
                                   (getf case-rng-check :valid)
                                   (getf case-rng-check :stable)
                                   case-rng-baseline-stable overflow))))
                     (condition (condition)
                       (record-error (list :matrix-case ordinal) condition)
                       (setf matrix-aborted t)
                       (emit "CASE-OBSERVER-ERROR ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S type=~S details=~S"
                             ordinal local-call batch width height x y
                             direction perim shape (type-of condition)
                             (condition-details condition))))
                (setf case-active nil))
              (when case-observations-ready
                (incf matrix-case-completed))
              (emit "CASE-END ordinal=~D local-call=~D batch=~A width=~D height=~D x=~D y=~D direction=~D perim=~D shape=~S attempted=t returned=~S completed=~S calls=~D active=~S overflow=~S observer-errors=~D target-condition=~S"
                    ordinal local-call batch width height x y direction
                    perim shape case-returned case-observations-ready
                    zero-edge-calls case-active overflow errors
                    (when target-condition (type-of target-condition)))
              (and case-observations-ready
                   (null target-condition)
                   (not overflow)
                   (= errors errors-before))))
          (run-zero-edge-input-matrix ()
            (let* ((names '("START" "XINCS" "YINCS" "FILL-MAP"
                            "PATCH-MAP" "*PIC-WIDE*" "*PIC-HIGH*"))
                   (baseline (state-set names :post-main-baseline))
                   (runtime-ready (required-runtime-state-p baseline))
                   (rng-before (random-preview))
                   (rng-before-valid (random-preview-valid-p rng-before))
                   (initial-matrix-preview
                     (and rng-before-valid rng-before))
                   (rng-baseline-ready
                     (and rng-before-valid
                          (equal initial-matrix-preview rng-before)))
                   (maker-symbol (gethash "MAKE-TRIPT" function-symbols))
                   (zero-edge-symbol (gethash "ZERO-EDGE" function-symbols))
                   (maker-function (and maker-symbol
                                        (symbol-function maker-symbol)))
                   (zero-edge-function (and zero-edge-symbol
                                             (symbol-function
                                              zero-edge-symbol)))
                   (metadata-ready
                     (not (null
                           (and metadata-gate (fixed-x-y-z-arglist-p)
                                (fixed-zero-edge-arglist-p)
                                maker-function zero-edge-function))))
                   (fill-snapshot nil)
                   (patch-snapshot nil)
                    (seen-starts (make-hash-table :test #'eq))
                    (seen-scratches (make-hash-table :test #'eq))
                   (initial-ready nil)
                   (final-boundary-ready nil))
              (setf matrix-case-attempted 0
                    matrix-case-completed 0
                    zero-edge-calls 0
                    matrix-aborted nil
                    matrix-complete nil
                    case-active nil
                    overflow nil
                    matrix-ready nil)
              (emit "POST-MAIN-GATE metadata-ready=~S runtime-ready=~S rng-preview-valid=~S rng-baseline-ready=~S rng-preview=~S rng-baseline=~S planned-cases=~D"
                    metadata-ready runtime-ready rng-before-valid
                    rng-baseline-ready rng-before initial-matrix-preview
                    matrix-planned)
              (unless rng-before-valid
                (record-error :post-main-rng-preview :unavailable-or-invalid))
              (setf initial-ready
                    (and metadata-ready runtime-ready rng-before-valid
                         rng-baseline-ready
                         (zerop errors)))
              (if (not initial-ready)
                  (progn
                    (setf matrix-aborted t)
                    (emit "MATRIX-SKIPPED reason=metadata-runtime-rng-or-error-gate"))
                (handler-case
                    (progn
                      (setf fill-snapshot
                            (map-snapshot "FILL-MAP"
                                          (gethash "FILL-MAP" baseline) 4)
                            patch-snapshot
                            (map-snapshot "PATCH-MAP"
                                          (gethash "PATCH-MAP" baseline) 16))
                      (setf matrix-ready
                            (and (matrix-snapshot-size-valid-p fill-snapshot)
                                 (matrix-snapshot-size-valid-p patch-snapshot)
                                 (zerop errors)))
                      (emit "ORIGINAL-MAP-PREFLIGHT ready=~S fill=~S patch=~S snapshots=one-immutable-baseline-per-map cell-cap=1048576"
                            matrix-ready (getf fill-snapshot :metadata)
                            (getf patch-snapshot :metadata))
                      (unless matrix-ready
                        (setf matrix-aborted t)
                        (emit "MATRIX-SKIPPED reason=invalid-original-map-baseline"))
                      (when matrix-ready
                        (dotimes (index matrix-planned)
                          (unless matrix-aborted
                            (unless
                                (run-matrix-case
                                 (+ matrix-ordinal-start index)
                                  names baseline fill-snapshot
                                  patch-snapshot initial-matrix-preview
                                  seen-starts seen-scratches maker-function
                                  zero-edge-function)
                              (setf matrix-aborted t))))))
                  (condition (condition)
                    (record-error :matrix-baseline condition)
                    (setf matrix-aborted t)
                    (emit "MATRIX-BASELINE-ERROR type=~S details=~S"
                          (type-of condition)
                          (condition-details condition)))))
              (when (and fill-snapshot patch-snapshot)
                (handler-case
                    (multiple-value-bind
                          (final-ready final-state final-rng)
                        (matrix-boundary :final names baseline fill-snapshot
                                         patch-snapshot initial-matrix-preview)
                      (declare (ignore final-state))
                      (setf final-boundary-ready final-ready)
                      (emit "MATRIX-FINAL-BOUNDARY batch=~A global-ordinal-start=~D global-ordinal-end=~D ready=~S rng-preview=~S"
                            matrix-batch matrix-ordinal-start
                            matrix-ordinal-end final-ready final-rng))
                  (condition (condition)
                    (record-error :matrix-final-boundary condition)
                    (setf matrix-aborted t)
                    (emit "MATRIX-FINAL-BOUNDARY-ERROR type=~S details=~S"
                          (type-of condition)
                          (condition-details condition)))))
              (unless (= matrix-case-attempted matrix-planned)
                (setf matrix-aborted t))
              (setf matrix-complete
                    (and matrix-ready
                         (not matrix-aborted)
                         (= matrix-case-attempted matrix-planned)
                         (= matrix-case-completed matrix-planned)
                         (= zero-edge-calls matrix-planned)
                         (= errors 0)
                         (not overflow)
                         (not case-active)
                         final-boundary-ready))
              (emit "MATRIX-ACCOUNTING batch=~A global-ordinal-start=~D global-ordinal-end=~D planned=~D attempted=~D completed=~D calls=~D ready=~S aborted=~S final-boundary=~S active=~S overflow=~S errors=~D complete=~S"
                    matrix-batch matrix-ordinal-start matrix-ordinal-end
                    matrix-planned matrix-case-attempted
                    matrix-case-completed zero-edge-calls matrix-ready
                    matrix-aborted final-boundary-ready case-active overflow
                    errors matrix-complete)
              matrix-complete))
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
                     (run-zero-edge-input-matrix)
                   (condition (condition)
                     (record-error :post-main-input-matrix condition)
                     (setf matrix-aborted t
                           matrix-complete nil)
                     (setf case-active nil)
                     (emit "MATRIX-FINALIZATION-ERROR type=~S details=~S"
                           (type-of condition)
                           (condition-details condition))))
               (progn
                 (setf matrix-aborted t
                       matrix-complete nil)
                 (emit "MATRIX-SKIPPED reason=~S"
                       (if (eq status :aborted) :main-aborted :main-not-run))))
             (setf finalized t)
             (emit "COMPLETE batch=~A global-ordinal-start=~D global-ordinal-end=~D main-status=~S main-wrapper-installed=~S planned=~D attempted=~D completed=~D zero-edge-calls=~D active=~S overflow=~S errors=~D complete=~S aborted=~S ready=~S"
                   matrix-batch matrix-ordinal-start matrix-ordinal-end
                   status wrapper-installed matrix-planned
                   matrix-case-attempted matrix-case-completed
                   zero-edge-calls case-active overflow errors
                   matrix-complete matrix-aborted matrix-ready)
              (emit "END zero-edge-holdout-ring-v1")
             (close-report)))
         (safe-main-finish (status)
           (let ((*print-length* 128)
                 (*print-level* 16)
                 (*print-pretty* nil)
                 (*print-circle* nil)
                 (*print-readably* nil))
             (handler-case
                 (finish-main-capture status)
               (condition (condition)
                 (ignore-errors
                   (record-error :main-wrapper-finish condition))
                 (unless finalized
                   (setf matrix-complete nil matrix-aborted t)
                   (setf finalized t)
                   (ignore-errors
                     (emit "COMPLETE batch=~A global-ordinal-start=~D global-ordinal-end=~D main-status=~S main-wrapper-installed=~S planned=~D attempted=~D completed=~D zero-edge-calls=~D active=~S overflow=~S errors=~D complete=~S aborted=~S ready=~S"
                           matrix-batch matrix-ordinal-start matrix-ordinal-end
                           status wrapper-installed matrix-planned
                           matrix-case-attempted matrix-case-completed
                           zero-edge-calls case-active overflow errors
                           matrix-complete matrix-aborted matrix-ready))
                   (ignore-errors
                       (emit "END zero-edge-holdout-ring-v1")))
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
       (emit "BEGIN zero-edge-holdout-ring-v1")
       (emit "SCOPE post-main-bounded-zero-edge-holdout batch=ring-v1 planned=6 global-ordinal-start=34 global-ordinal-end=39 zero-edge-wrapped=nil outcomes=unknown fresh-start-and-scratch-per-case original-map-checks=full rng-reset=none state-reset=none")
       (emit "LIMITS calls=6 cases=6 value-nodes=256 list-items=64 array-items=128 multiple-values=64 depth=4 string-prefix=256 condition-control-prefix=256 state-bindings=7 original-map-cells=1048576 scratch-map-cells=99 returned-path-items=64")
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
              (emit "READY batch=~A global-ordinal-start=~D global-ordinal-end=~D metadata-errors=~D zero-edge-holdout-gate=~S planned-cases=~D main-wrapper-installed=t"
                    matrix-batch matrix-ordinal-start matrix-ordinal-end
                    errors metadata-gate matrix-planned)
              (finish-output report))
          (progn
            (unless main-ready
              (record-error :main-wrapper :main-unbound))
            (emit "READY batch=~A global-ordinal-start=~D global-ordinal-end=~D metadata-errors=~D zero-edge-holdout-gate=~S planned-cases=~D main-wrapper-installed=nil"
                  matrix-batch matrix-ordinal-start matrix-ordinal-end
                  errors metadata-gate matrix-planned)
             (safe-main-finish :install-error)))))))
