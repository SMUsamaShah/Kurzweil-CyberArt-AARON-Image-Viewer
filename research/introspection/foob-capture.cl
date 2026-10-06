;;; Natural FOOB tape plus a one-shot boundary matrix on its saved original.
;;; The matrix runs on the first natural entry after the scene is initialized.
(in-package :cl-user)

(unless (boundp 'aaron-foob-capture-loaded)
  (set 'aaron-foob-capture-loaded t)
  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (foob-symbol (and owner (find-symbol "FOOB" owner)))
         (foob-original (and foob-symbol (fboundp foob-symbol)
                             (symbol-function foob-symbol)))
         (main-symbol (and owner (find-symbol "MAIN" owner)))
         (main-original (and main-symbol (fboundp main-symbol)
                             (symbol-function main-symbol)))
         (arglist-helper (find-symbol "ARGLIST" "EXCL"))
         (report (open "C:\\temp\\aaron-foob.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create))
         (natural-call-cap 300000) (matrix-call-cap 300000)
         (matrix-margin 20) (map-cells-per-copy 1000000)
         (natural-calls 0) (logged-calls 0) (active 0)
         (matrix-started nil) (matrix-complete nil) (matrix-state-ok nil)
         (matrix-integer-calls 0) (matrix-integer-rows 0)
         (matrix-float-calls 0) (matrix-float-points 0)
         (matrix-errors 0) (errors 0) (aborts 0) (overflow nil))
    (labels
        ((emit (control &rest args)
           (when report
             (handler-case
                 (let ((*print-length* nil) (*print-level* nil)
                       (*print-pretty* nil) (*print-circle* nil)
                       (*print-readably* nil))
                   (apply #'format report control args)
                   (terpri report))
               (condition () (incf errors)))))
         (safe-log (phase thunk)
           (handler-case (funcall thunk)
             (condition (condition)
               (incf errors)
               (handler-case
                   (emit "ERROR phase=~S type=~S text=~S"
                         phase (format nil "~S" (type-of condition))
                         (format nil "~A" condition))
                 (condition () nil))
               nil)))
         (mark-overflow (kind amount)
           (unless overflow
             (setf overflow t)
             (emit "OVERFLOW kind=~S amount=~D" kind amount)))
         (descriptor (value)
           (cond ((null value) (list :nil))
                 ((eq value t) (list :boolean t))
                 ((integerp value) (list :integer value))
                 ((numberp value)
                  (list :number (format nil "~S" value)
                        (format nil "~S" (type-of value))))
                 ((characterp value) (list :character (char-code value)))
                 ((stringp value)
                  (list :string (length value)
                        (subseq value 0 (min 256 (length value)))))
                 ((symbolp value)
                  (list :symbol (if (symbol-package value)
                                    (package-name (symbol-package value))
                                    "UNINTERNED")
                        (symbol-name value)))
                 (t (list :object (format nil "~S" (type-of value))))))
         (descriptors (values)
           (if (> (length values) 16)
               (progn
                 (mark-overflow :values (length values))
                 (mapcar #'descriptor (subseq values 0 16)))
             (mapcar #'descriptor values)))
         (global-symbol (name)
           (and owner (find-symbol name owner)))
         (global-value (name)
           (let ((symbol (global-symbol name)))
             (if (and symbol (boundp symbol))
                 (values (symbol-value symbol) t)
               (values nil nil))))
         (binding-snapshot (name)
           (multiple-value-bind (value bound) (global-value name)
             (list :bound bound :value (if bound value :unbound))))
         (binding-summary (binding)
           (let ((bound (getf binding :bound))
                 (value (getf binding :value)))
             (if bound
                 (list :bound t :type (format nil "~S" (type-of value))
                       :value (descriptor value))
               (list :bound nil :type :unbound :value (list :unbound)))))
         (array-copy (array)
           (let ((cells (array-total-size array)))
             (when (> cells map-cells-per-copy)
               (error "Map copy exceeds cell cap: ~D" cells))
             (copy-seq (make-array cells
                                   :element-type (array-element-type array)
                                   :displaced-to array))))
         (array-metadata (array)
           (if (arrayp array)
               (list :bound t :type (format nil "~S" (type-of array))
                     :rank (array-rank array) :dimensions (array-dimensions array)
                     :element-type (array-element-type array)
                     :cells (array-total-size array))
             (list :bound t :type (format nil "~S" (type-of array))
                   :rank nil :dimensions nil :element-type nil :cells 0)))
         (map-snapshot (name)
           (let ((binding (binding-snapshot name)))
             (cond ((not (getf binding :bound))
                    (list :binding binding :metadata
                          (list :bound nil :type :unbound :rank nil
                                :dimensions nil :element-type nil :cells 0)
                          :copy nil))
                   ((null (getf binding :value))
                    (list :binding binding :metadata
                          (array-metadata nil) :copy nil))
                   ((arrayp (getf binding :value))
                    (list :binding binding
                          :metadata (array-metadata (getf binding :value))
                          :copy (array-copy (getf binding :value))))
                   (t (error "Bound map ~A is not an array" name)))))
         (state-snapshot ()
           (list :width (binding-snapshot "*PIC-WIDE*")
                 :height (binding-snapshot "*PIC-HIGH*")
                 :fill-map (map-snapshot "FILL-MAP")
                 :patch-map (map-snapshot "PATCH-MAP")
                 :brush (binding-snapshot "BRUSH")
                 :sub-frame (binding-snapshot "SUB-FRAME")
                 :rng-preview (aaron-random-state-preview)))
         (map-summary (snapshot)
           (getf snapshot :metadata))
         (state-summary (state)
           (list :width (binding-summary (getf state :width))
                 :height (binding-summary (getf state :height))
                 :fill-map (map-summary (getf state :fill-map))
                 :patch-map (map-summary (getf state :patch-map))
                 :brush (binding-summary (getf state :brush))
                 :sub-frame (binding-summary (getf state :sub-frame))
                 :rng-preview (getf state :rng-preview)))
         (state-checks (before after)
           (let* ((before-width (getf (getf before :width) :value))
                  (after-width (getf (getf after :width) :value))
                  (before-height (getf (getf before :height) :value))
                  (after-height (getf (getf after :height) :value))
                  (before-fill (getf before :fill-map))
                  (after-fill (getf after :fill-map))
                  (before-patch (getf before :patch-map))
                  (after-patch (getf after :patch-map)))
             (list :fill-map-eq
                   (eq (getf (getf before-fill :binding) :value)
                       (getf (getf after-fill :binding) :value))
                   :fill-map-equalp
                   (equalp (getf before-fill :copy) (getf after-fill :copy))
                   :fill-map-meta-equalp
                   (equalp (getf before-fill :metadata) (getf after-fill :metadata))
                   :patch-map-eq
                   (eq (getf (getf before-patch :binding) :value)
                       (getf (getf after-patch :binding) :value))
                   :patch-map-equalp
                   (equalp (getf before-patch :copy) (getf after-patch :copy))
                   :patch-map-meta-equalp
                   (equalp (getf before-patch :metadata)
                           (getf after-patch :metadata))
                   :brush-eq
                   (eq (getf (getf before :brush) :value)
                       (getf (getf after :brush) :value))
                   :sub-frame-eq
                   (eq (getf (getf before :sub-frame) :value)
                       (getf (getf after :sub-frame) :value))
                   :dimensions-equal
                   (and (getf (getf before :width) :bound)
                        (getf (getf after :width) :bound)
                        (getf (getf before :height) :bound)
                        (getf (getf after :height) :bound)
                        (equalp before-width after-width)
                        (equalp before-height after-height))
                   :rng-equal
                   (equalp (getf before :rng-preview)
                           (getf after :rng-preview)))))
         (checks-pass-p (checks)
           (and (getf checks :fill-map-eq)
                (getf checks :fill-map-equalp)
                (getf checks :fill-map-meta-equalp)
                (getf checks :patch-map-eq)
                (getf checks :patch-map-equalp)
                (getf checks :patch-map-meta-equalp)
                (getf checks :brush-eq)
                (getf checks :sub-frame-eq)
                (getf checks :dimensions-equal)
                (getf checks :rng-equal)))
         (record-matrix-error (phase detail &optional condition)
           (incf matrix-errors)
           (incf errors)
           (emit "MATRIX-ERROR phase=~S detail=~S type=~S message=~S"
                 phase detail
                 (if condition (format nil "~S" (type-of condition)) :none)
                 (if condition (format nil "~A" condition) :none)))
         (matrix-value (original phase x-precision y-precision xi yi x y)
           (when (>= (+ matrix-integer-calls matrix-float-calls)
                     matrix-call-cap)
             (record-matrix-error phase (list :cap matrix-call-cap :x x :y y))
             (return-from matrix-value (values nil nil)))
           (if (eq phase :integer)
               (incf matrix-integer-calls)
             (incf matrix-float-calls))
           (handler-case
               (let ((values (multiple-value-list (funcall original x y))))
                 (if (and (= (length values) 1)
                          (or (null (first values)) (eq (first values) t)))
                     (values (first values) t)
                   (progn
                     (record-matrix-error
                      phase
                      (list :x-precision x-precision :y-precision y-precision
                            :xi xi :yi yi :x (descriptor x) :y (descriptor y)
                            :values (descriptors values))
                      nil)
                     (values nil nil))))
             (condition (condition)
               (record-matrix-error
                phase
                (list :x-precision x-precision :y-precision y-precision
                      :xi xi :yi yi :x (descriptor x) :y (descriptor y))
                condition)
               (values nil nil))))
         (float-axis-samples (dimension precision)
           (mapcar (lambda (value) (coerce value precision))
                   (list -1 -1/2 0 1/2
                         (+ dimension -3/2) (+ dimension -1)
                         (+ dimension -1/2) dimension
                         (+ dimension 1/2))))
         (run-integer-matrix (original width height)
           (let* ((x-start (- matrix-margin))
                  (y-start (- matrix-margin))
                  (x-end (+ width matrix-margin))
                  (y-end (+ height matrix-margin))
                  (x-count (1+ (- x-end x-start)))
                  (y-count (1+ (- y-end y-start)))
                  (expected-calls (* x-count y-count))
                  (expected-rows y-count)
                  (first-call-count matrix-integer-calls)
                  (first-row-count matrix-integer-rows)
                  (complete nil))
             (emit "MATRIX-INTEGER-BEGIN x-start=~D x-end=~D x-count=~D y-start=~D y-end=~D y-count=~D expected-calls=~D"
                   x-start x-end x-count y-start y-end y-count expected-calls)
             (if (> (+ expected-calls 324) matrix-call-cap)
                 (record-matrix-error :integer-preflight
                                      (list :expected expected-calls
                                            :float-points 324
                                            :cap matrix-call-cap))
               (catch 'foob-matrix-stop
                 (dotimes (y-index y-count)
                   (unless (or overflow (> matrix-errors 0))
                     (let ((y (+ y-start y-index)) (runs nil)
                           (last-value nil) (run-length 0))
                       (dotimes (x-index x-count)
                         (unless (or overflow (> matrix-errors 0))
                           (let ((x (+ x-start x-index)))
                             (multiple-value-bind (result good)
                                 (matrix-value original :integer nil nil nil nil x y)
                               (unless good (throw 'foob-matrix-stop nil))
                               (if (and (> run-length 0)
                                        (eq result last-value))
                                   (incf run-length)
                                 (progn
                                   (when (> run-length 0)
                                     (push (list last-value run-length) runs))
                                   (setf last-value result run-length 1)))))))
                       (unless (or overflow (> matrix-errors 0))
                         (when (> run-length 0)
                           (push (list last-value run-length) runs))
                         (emit "MATRIX-ROW y=~D x-start=~D x-count=~D calls=~D runs=~S"
                               y x-start x-count x-count (nreverse runs))
                          (incf matrix-integer-rows)))))))
             (setf complete
                   (and (= (- matrix-integer-calls first-call-count)
                           expected-calls)
                        (= (- matrix-integer-rows first-row-count)
                           expected-rows)
                        (zerop matrix-errors)))
             (emit "MATRIX-INTEGER-END rows=~D calls=~D expected-rows=~D expected-calls=~D complete=~S"
                   (- matrix-integer-rows first-row-count)
                   (- matrix-integer-calls first-call-count)
                   expected-rows expected-calls complete)
             complete))
         (run-float-matrices (original width height)
           (let ((all-complete t))
             (dolist (x-precision '(single-float double-float))
               (dolist (y-precision '(single-float double-float))
                 (let* ((x-samples (float-axis-samples width x-precision))
                        (y-samples (float-axis-samples height y-precision))
                        (first-calls matrix-float-calls)
                        (first-points matrix-float-points)
                        (complete nil))
                   (emit "MATRIX-FLOAT-BEGIN x-precision=~S y-precision=~S x-samples=9 y-samples=9 expected-points=81"
                         x-precision y-precision)
                   (unless (or overflow (> matrix-errors 0))
                     (catch 'foob-matrix-stop
                       (dotimes (yi 9)
                         (unless (or overflow (> matrix-errors 0))
                           (dotimes (xi 9)
                             (unless (or overflow (> matrix-errors 0))
                               (let ((x (nth xi x-samples))
                                     (y (nth yi y-samples)))
                                 (multiple-value-bind (result good)
                                     (matrix-value original :float
                                                   x-precision y-precision
                                                   xi yi x y)
                                   (unless good (throw 'foob-matrix-stop nil))
                                   (emit "MATRIX-POINT x-precision=~S y-precision=~S xi=~D yi=~D x=~S y=~S values=~S"
                                         x-precision y-precision xi yi
                                         (descriptor x) (descriptor y)
                                         (descriptors (list result)))
                                   (incf matrix-float-points))))))))
                   (setf complete
                         (and (= (- matrix-float-calls first-calls) 81)
                              (= (- matrix-float-points first-points) 81)
                              (zerop matrix-errors)))
                   (unless complete (setf all-complete nil))
                   (emit "MATRIX-FLOAT-END x-precision=~S y-precision=~S points=~D calls=~D expected-points=81 complete=~S"
                         x-precision y-precision
                         (- matrix-float-points first-points)
                          (- matrix-float-calls first-calls) complete)))))
             all-complete))
         (run-matrix (original trigger-id)
           (let ((before nil) (after nil) (checks nil)
                 (width nil) (height nil)
                 (integer-complete nil) (float-complete nil)
                 (matrix-errors-before matrix-errors))
             (emit "MATRIX-BEGIN invocation=1 trigger-natural-id=~D" trigger-id)
             (handler-case
                 (progn
                   (setf before (state-snapshot))
                   (setf width (getf (getf before :width) :value)
                         height (getf (getf before :height) :value))
                   (unless (and (getf (getf before :width) :bound)
                                (getf (getf before :height) :bound)
                                (integerp width) (> width 0)
                                (integerp height) (> height 0))
                     (error "FOOB dimensions are not positive bound integers"))
                   (let* ((x-start (- matrix-margin))
                          (y-start (- matrix-margin))
                          (x-end (+ width matrix-margin))
                          (y-end (+ height matrix-margin))
                          (x-count (1+ (- x-end x-start)))
                          (y-count (1+ (- y-end y-start))))
                     (emit "DIMENSIONS width=~S height=~S x-start=~D x-end=~D x-count=~D y-start=~D y-end=~D y-count=~D expected-calls=~D"
                           (descriptor width) (descriptor height)
                           x-start x-end x-count y-start y-end y-count
                           (* x-count y-count)))
                   (setf integer-complete
                         (run-integer-matrix original width height))
                   (setf float-complete
                         (run-float-matrices original width height)))
               (condition (condition)
                 (record-matrix-error :driver nil condition)))
             (handler-case (setf after (state-snapshot))
               (condition (condition)
                 (record-matrix-error :state-after nil condition)))
             (when (and before after)
               (setf checks (state-checks before after)
                     matrix-state-ok (checks-pass-p checks)))
             (unless matrix-state-ok
               (when (= matrix-errors matrix-errors-before)
                 (record-matrix-error :state-checks checks)))
             (safe-log :matrix-state
               (lambda ()
                 (emit "MATRIX-STATE before=~S after=~S checks=~S"
                       (if before (state-summary before) (list :unavailable))
                       (if after (state-summary after) (list :unavailable))
                       (or checks (list :unavailable)))))
             (setf matrix-complete
                   (and integer-complete float-complete matrix-state-ok
                        (= matrix-errors matrix-errors-before)))
             (emit "MATRIX-END integer-rows=~D integer-calls=~D expected-integer-rows=~D expected-integer-calls=~D float-points=~D float-calls=~D expected-float-points=324 expected-float-calls=324 complete=~S state-ok=~S errors=~D"
                   matrix-integer-rows matrix-integer-calls
                   (if (and width height) (+ height 41) 0)
                   (if (and width height) (* (+ width 41) (+ height 41)) 0)
                   matrix-float-points matrix-float-calls matrix-complete
                   matrix-state-ok matrix-errors)
             (safe-log :matrix-flush (lambda () (finish-output report)))))
         (dimension-descriptor (name)
           (multiple-value-bind (value bound) (global-value name)
             (if bound (descriptor value) (list :unbound))))
         (finish-main (status)
           (emit "COMPLETE main=~S natural-calls=~D logged-calls=~D matrix-integer-calls=~D matrix-float-calls=~D matrix-errors=~D errors=~D aborts=~D overflow=~S active=~D matrix-started=~S matrix-complete=~S matrix-state-ok=~S"
                 status natural-calls logged-calls matrix-integer-calls
                 matrix-float-calls matrix-errors errors aborts overflow active
                 matrix-started matrix-complete matrix-state-ok)
           (emit "END foob-capture v1")
           (when report
             (finish-output report)
             (close report)
             (setf report nil)))
         (call-wrapper (original args)
           (incf natural-calls)
           (let* ((id natural-calls)
                  (record-p (and (<= id natural-call-cap) (not overflow)))
                  (completed nil))
             (when (= id 1)
               (setf matrix-started t)
               (safe-log :first-natural-matrix
                 (lambda () (run-matrix original id))))
             (when (> id natural-call-cap)
               (mark-overflow :natural-call-cap id))
             (incf active)
             (when record-p
               (incf logged-calls)
               (safe-log :call-begin
                 (lambda ()
                   (emit "CALL-BEGIN id=~D argc=~D width=~S height=~S args=~S"
                         id (length args)
                         (dimension-descriptor "*PIC-WIDE*")
                         (dimension-descriptor "*PIC-HIGH*")
                         (descriptors args)))))
             (unwind-protect
                 (multiple-value-call
                     (lambda (&rest values)
                       (setf completed t)
                       (when record-p
                         (safe-log :call-return
                           (lambda ()
                             (emit "CALL-RETURN id=~D nvalues=~D values=~S"
                                   id (length values) (descriptors values)))))
                       (values-list values))
                   (apply original args))
               (unless completed
                 (incf aborts)
                 (when record-p
                   (safe-log :call-abort
                     (lambda () (emit "CALL-ABORT id=~D" id)))))
               (decf active))))
         (install-foob ()
           (cond ((null owner)
                  (incf errors) (emit "INSTALL-ERROR name=\"FOOB\" reason=:NO-PACKAGE"))
                 ((or (null foob-symbol) (null foob-original))
                  (incf errors) (emit "INSTALL-ERROR name=\"FOOB\" reason=:UNBOUND"))
                 (t
                  (emit "INSTALL name=\"FOOB\" package=~S original-type=~S"
                        (package-name (symbol-package foob-symbol))
                        (format nil "~S" (type-of foob-original)))
                  (setf (symbol-function foob-symbol)
                        (let ((saved-original foob-original))
                          (lambda (&rest args)
                            (call-wrapper saved-original args)))))))
         (install-main ()
           (cond ((or (null main-symbol) (null main-original))
                  (incf errors) (emit "INSTALL-ERROR name=\"MAIN\" reason=:UNBOUND"))
                 (t
                  (emit "INSTALL name=\"MAIN\" original-type=~S"
                        (format nil "~S" (type-of main-original)))
                  (setf (symbol-function main-symbol)
                        (let ((saved-main main-original))
                          (lambda (&rest args)
                            (let ((completed nil))
                              (unwind-protect
                                  (multiple-value-call
                                      (lambda (&rest values)
                                        (setf completed t)
                                        (safe-log :main-finish
                                          (lambda () (finish-main :normal)))
                                        (values-list values))
                                    (apply saved-main args))
                                (unless completed
                                  (safe-log :main-abort
                                    (lambda () (finish-main :aborted))))))))))))
         )
      (emit "BEGIN foob-capture v1")
      (emit "CAPS natural-call-cap=300000 matrix-call-cap=300000 matrix-margin=20 float-sample-points=324 state-map-cells-per-copy=1000000 values-per-call=16")
      (when foob-original
        (emit "TARGET name=\"FOOB\" package=~S type=~S"
              (package-name (symbol-package foob-symbol))
              (format nil "~S" (type-of foob-original)))
        (if (null arglist-helper)
            (progn
              (incf errors)
              (emit "ERROR phase=:arglist problem=:helper-unavailable"))
          (safe-log :arglist
            (lambda ()
              (emit "ARGLIST values=~S"
                    (multiple-value-list (funcall arglist-helper foob-symbol)))))))
      (install-foob)
      (install-main)
      (emit "READY")
      (finish-output report))))
