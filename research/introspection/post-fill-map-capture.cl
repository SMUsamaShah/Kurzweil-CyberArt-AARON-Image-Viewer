;;; Exact bounded map observations around natural POST-FILL(SUBFORM, CDEX, SDEX).
;;; This probe reads the live maps and existing frame accessors; it never writes
;;; application bindings or invokes POST-FILL/readers except through natural calls.
(in-package :cl-user)

(unless (boundp 'aaron-post-fill-maps-capture-loaded)
  (set 'aaron-post-fill-maps-capture-loaded t)
  (defvar *aaron-post-fill-maps-owner* nil)
  (defvar *aaron-post-fill-maps-report* nil)
  (defvar *aaron-post-fill-maps-post-original* nil)
  (defvar *aaron-post-fill-maps-patchdex-original* nil)
  (defvar *aaron-post-fill-maps-cform-count-original* nil)
  (defvar *aaron-post-fill-maps-main-original* nil)
  (defvar *aaron-post-fill-maps-subform-symbol* nil)
  (defvar *aaron-post-fill-maps-cform-symbol* nil)
  (defvar *aaron-post-fill-maps-contexts* nil)
  (defvar *aaron-post-fill-maps-suppress-readers* nil)
  (defvar *aaron-post-fill-maps-finished* nil)
  (defvar *aaron-post-fill-maps-main-completed* nil)
  (defvar *aaron-post-fill-maps-failed* nil)
  (defvar *aaron-post-fill-maps-overflow* nil)
  (defvar *aaron-post-fill-maps-overflow-kinds* nil)
  (defvar *aaron-post-fill-maps-error-count* 0)
  (defvar *aaron-post-fill-maps-abort-count* 0)
  (defvar *aaron-post-fill-maps-post-count* 0)
  (defvar *aaron-post-fill-maps-subform-count* 0)
  (defvar *aaron-post-fill-maps-cform-count* 0)
  (defvar *aaron-post-fill-maps-other-count* 0)
  (defvar *aaron-post-fill-maps-reader-count* 0)
  (defvar *aaron-post-fill-maps-reader-observed* 0)
  (defvar *aaron-post-fill-maps-run-count* 0)
  (defvar *aaron-post-fill-maps-call-limit* 500)
  (defvar *aaron-post-fill-maps-rectangle-cell-limit* 153600)
  (defvar *aaron-post-fill-maps-run-limit* 1000000)
  (defvar *aaron-post-fill-maps-reader-limit* 10000000)

  (defun aaron-post-fill-maps-emit (control &rest arguments)
    (when *aaron-post-fill-maps-report*
      (handler-case
          (let ((*print-length* nil) (*print-level* nil) (*print-pretty* nil)
                (*print-circle* nil) (*print-readably* nil))
            (apply #'format *aaron-post-fill-maps-report* control arguments)
            (terpri *aaron-post-fill-maps-report*)
            (finish-output *aaron-post-fill-maps-report*))
        (condition ()
          (incf *aaron-post-fill-maps-error-count*)
          (setf *aaron-post-fill-maps-failed* t)))))

  (defun aaron-post-fill-maps-safe-value (value)
    (cond ((or (numberp value) (symbolp value) (stringp value)
               (characterp value)) value)
          (t (list :type (type-of value)))))

  (defun aaron-post-fill-maps-mark-error (scope stage problem)
    (incf *aaron-post-fill-maps-error-count*)
    (setf *aaron-post-fill-maps-failed* t)
    (aaron-post-fill-maps-emit "ERROR scope=~S stage=~S type=~S"
                               scope stage (type-of problem)))

  (defun aaron-post-fill-maps-mark-overflow (kind details)
    (setf *aaron-post-fill-maps-overflow* t
          *aaron-post-fill-maps-failed* t)
    (unless (and *aaron-post-fill-maps-overflow-kinds*
                 (gethash kind *aaron-post-fill-maps-overflow-kinds*))
      (when *aaron-post-fill-maps-overflow-kinds*
        (setf (gethash kind *aaron-post-fill-maps-overflow-kinds*) t))
      (aaron-post-fill-maps-emit "OVERFLOW kind=~S details=~S" kind details)))

  (defun aaron-post-fill-maps-global (name)
    (let ((symbol (and *aaron-post-fill-maps-owner*
                       (find-symbol name *aaron-post-fill-maps-owner*))))
      (cond ((null symbol)
             (values (list :bound nil :status :missing) nil nil))
            ((not (boundp symbol))
             (values (list :bound nil :status :unbound) nil nil))
            (t
             (let ((value (symbol-value symbol)))
               (values (list :bound t :value
                             (aaron-post-fill-maps-safe-value value))
                       value t))))))

  (defun aaron-post-fill-maps-read-frame ()
    (multiple-value-bind (binding frame bound-p)
        (aaron-post-fill-maps-global "SUB-FRAME")
      (unless bound-p
        (return-from aaron-post-fill-maps-read-frame
          (values (append binding (list :type :unavailable)) nil nil nil)))
      (handler-case
          (let ((coordinates nil))
            (dolist (name '("LX" "RX" "LY" "TY"))
              (let ((symbol (find-symbol name *aaron-post-fill-maps-owner*)))
                (unless (and symbol (fboundp symbol))
                  (error "Missing original frame getter"))
                (let ((results
                        (multiple-value-list
                         (funcall (symbol-function symbol) frame))))
                  (unless (and (= (length results) 1)
                               (integerp (car results)))
                    (error "Frame getter did not return one integer"))
                  (push (car results) coordinates))))
            (setf coordinates (nreverse coordinates))
            (let ((lx (first coordinates)) (rx (second coordinates))
                  (ly (third coordinates)) (ty (fourth coordinates)))
              (values (list :bound t :type (type-of frame)
                            :lx lx :rx rx :ly ly :ty ty
                            :bounds-status :complete)
                      frame (list :lx lx :rx rx :ly ly :ty ty) t)))
        (condition (problem)
          (aaron-post-fill-maps-mark-error "SUB-FRAME" "GETTERS" problem)
          (values (list :bound t :type (type-of frame)
                        :bounds-status :error :error-type (type-of problem))
                  frame nil t)))))

  (defun aaron-post-fill-maps-region (dimensions bounds)
    (unless (and bounds (integerp (getf bounds :lx))
                 (integerp (getf bounds :rx))
                 (integerp (getf bounds :ly))
                 (integerp (getf bounds :ty)))
      (return-from aaron-post-fill-maps-region (values nil :missing-bounds)))
    (let* ((x0 (min (getf bounds :lx) (getf bounds :rx)))
           (x1 (max (getf bounds :lx) (getf bounds :rx)))
           (y0 (min (getf bounds :ly) (getf bounds :ty)))
           (y1 (max (getf bounds :ly) (getf bounds :ty)))
           (width (first dimensions)) (height (second dimensions)))
      (when (< x1 (1- width)) (incf x1))
      (unless (and (integerp width) (integerp height) (plusp width)
                   (plusp height) (<= 0 x0) (< x0 width)
                   (<= 0 x1) (< x1 width) (<= 0 y0) (< y0 height)
                   (<= 0 y1) (< y1 height))
        (return-from aaron-post-fill-maps-region
          (values (list x0 x1 y0 y1) :out-of-bounds)))
      (let ((cells (* (1+ (- x1 x0)) (1+ (- y1 y0)))))
        (if (> cells *aaron-post-fill-maps-rectangle-cell-limit*)
            (values (list x0 x1 y0 y1 cells) :cell-limit)
          (values (list x0 x1 y0 y1 cells) :complete)))))

  (defun aaron-post-fill-maps-map-snapshot (name map bound-p bounds id phase)
    (unless bound-p
      (aaron-post-fill-maps-mark-error id (list phase name) :map-unbound)
      (return-from aaron-post-fill-maps-map-snapshot
        (list :bound nil :status :unbound)))
    (unless (and (arrayp map) (= (array-rank map) 2))
      (aaron-post-fill-maps-mark-error id (list phase name) :map-not-rank-two)
      (return-from aaron-post-fill-maps-map-snapshot
        (list :bound t :type (type-of map) :status :not-rank-two)))
    (let* ((dimensions (array-dimensions map))
           (element-type (array-element-type map)))
      (multiple-value-bind (region region-status)
          (aaron-post-fill-maps-region dimensions bounds)
        (unless (eq region-status :complete)
          (if (eq region-status :cell-limit)
              (aaron-post-fill-maps-mark-overflow
               :rectangle-cells (list id phase name (fifth region)
                                      *aaron-post-fill-maps-rectangle-cell-limit*))
            (aaron-post-fill-maps-mark-error id (list phase name) region-status))
          (return-from aaron-post-fill-maps-map-snapshot
            (list :bound t :type (type-of map) :dimensions dimensions
                  :element-type element-type :status region-status
                  :region region :cells (and region (fifth region))
                  :covered 0 :rows nil)))
        (let* ((x0 (first region)) (x1 (second region))
               (y0 (third region)) (y1 (fourth region))
               (width (1+ (- x1 x0))) (height (1+ (- y1 y0)))
               (cells (fifth region)) (rows nil) (run-count 0)
               (covered 0) (invalid-cell nil))
          (handler-case
              (dotimes (row-offset height)
                (let ((y (+ y0 row-offset))
                      (runs nil) (run-value nil) (run-length 0)
                      (row-covered 0))
                  (dotimes (column-offset width)
                    (let ((value (aref map (+ x0 column-offset) y)))
                      (unless (or (numberp value) (symbolp value)
                                  (stringp value) (characterp value))
                        (error "Map cell is not serializable"))
                      (if (and (plusp run-length) (eql value run-value))
                          (incf run-length)
                        (progn
                          (when (plusp run-length)
                            (push (list run-value run-length) runs)
                            (incf run-count))
                          (setf run-value value run-length 1))))
                    (incf row-covered))
                  (when (plusp run-length)
                    (push (list run-value run-length) runs)
                    (incf run-count))
                  (setf runs (nreverse runs))
                  (unless (= row-covered width)
                    (error "Map row coverage mismatch"))
                  (push (list y :runs runs :cells width :covered row-covered)
                        rows)
                  (incf covered row-covered)))
            (condition (problem)
              (setf invalid-cell t)
              (aaron-post-fill-maps-mark-error id (list phase name "CELLS")
                                               problem)))
          (setf rows (nreverse rows))
          (when invalid-cell
            (return-from aaron-post-fill-maps-map-snapshot
              (list :bound t :type (type-of map) :dimensions dimensions
                    :element-type element-type :status :cell-error
                    :region region :cells cells :covered 0 :rows nil)))
          (unless (and (= covered cells) (= (length rows) height))
            (aaron-post-fill-maps-mark-error id (list phase name) :coverage-mismatch)
            (return-from aaron-post-fill-maps-map-snapshot
              (list :bound t :type (type-of map) :dimensions dimensions
                    :element-type element-type :status :coverage-mismatch
                    :region region :cells cells :covered covered :rows nil)))
          (when (> (+ *aaron-post-fill-maps-run-count* run-count)
                   *aaron-post-fill-maps-run-limit*)
            (aaron-post-fill-maps-mark-overflow
             :serialized-runs
             (list id phase name *aaron-post-fill-maps-run-count* run-count
                   *aaron-post-fill-maps-run-limit*))
            (return-from aaron-post-fill-maps-map-snapshot
              (list :bound t :type (type-of map) :dimensions dimensions
                    :element-type element-type :status :run-limit
                    :region region :cells cells :covered 0 :runs 0 :rows nil)))
          (incf *aaron-post-fill-maps-run-count* run-count)
          (list :bound t :type (type-of map) :dimensions dimensions
                :element-type element-type :status :complete :region region
                :cells cells :covered covered :runs run-count :rows rows)))))

  (defun aaron-post-fill-maps-capture-state (id phase)
    (multiple-value-bind (frame-record frame bounds frame-bound-p)
        (aaron-post-fill-maps-read-frame)
      (multiple-value-bind (subp-record subp-value subp-bound-p)
          (aaron-post-fill-maps-global "SUBP-COUNT")
        (declare (ignore subp-value subp-bound-p))
        (multiple-value-bind (flag-record flag-value flag-bound-p)
            (aaron-post-fill-maps-global "FLAG-BIT")
          (declare (ignore flag-value flag-bound-p))
          (multiple-value-bind (fill-record fill-map fill-bound-p)
              (aaron-post-fill-maps-global "FILL-MAP")
            (multiple-value-bind (patch-record patch-map patch-bound-p)
                (aaron-post-fill-maps-global "PATCH-MAP")
              (let ((state
                      (list :sub-frame frame-record
                            :subp-count subp-record :flag-bit flag-record
                            :fill-map
                            (aaron-post-fill-maps-map-snapshot
                             "FILL-MAP" fill-map fill-bound-p bounds id phase)
                            :patch-map
                            (aaron-post-fill-maps-map-snapshot
                             "PATCH-MAP" patch-map patch-bound-p bounds id phase))))
                (values state frame fill-map patch-map frame-bound-p))))))))

  (defun aaron-post-fill-maps-safe-capture-state (id phase)
    (let ((*aaron-post-fill-maps-suppress-readers* t))
      (handler-case
          (multiple-value-list
           (aaron-post-fill-maps-capture-state id phase))
        (condition (problem)
          (aaron-post-fill-maps-mark-error id (list phase :state) problem)
          (list (list :status :observation-error :phase phase)
                nil nil nil nil)))))

  (defun aaron-post-fill-maps-reader-start (context kind arguments)
    (let* ((count-key (if (eq kind :patchdex) :patchdex-calls
                        :cform-count-calls))
           (observed-key (if (eq kind :patchdex) :patchdex-observed
                           :cform-count-observed)))
      (incf (getf context count-key))
      (incf *aaron-post-fill-maps-reader-count*)
      (if (>= *aaron-post-fill-maps-reader-observed*
              *aaron-post-fill-maps-reader-limit*)
          (progn
            (setf (getf context :reader-overflow) t)
            (aaron-post-fill-maps-mark-overflow
             :reader-observations
             (list *aaron-post-fill-maps-reader-count*
                   *aaron-post-fill-maps-reader-limit*))
            nil)
        (progn
          (incf *aaron-post-fill-maps-reader-observed*)
          (incf (getf context observed-key))
          (unless (= (length arguments) 1)
            (incf *aaron-post-fill-maps-error-count*)
            (incf (getf context :reader-errors))
            (incf (getf context
                        (if (eq kind :patchdex)
                            :patchdex-argument-count-violations
                          :cform-count-argument-count-violations)))
            (setf *aaron-post-fill-maps-failed* t))
          (let ((arg-key (if (eq kind :patchdex)
                             :patchdex-first-argument
                           :cform-count-first-argument))
                (set-key (if (eq kind :patchdex)
                             :patchdex-first-argument-set
                           :cform-count-first-argument-set))
                (mismatch-key (if (eq kind :patchdex)
                                  :patchdex-argument-eq-mismatches
                                :cform-count-argument-eq-mismatches)))
            (if (getf context set-key)
                (unless (and arguments
                             (eq (getf context arg-key) (car arguments)))
                  (incf (getf context mismatch-key)))
              (setf (getf context set-key) t
                    (getf context arg-key) (car arguments)))
            t)))))

  (defun aaron-post-fill-maps-reader-error (context)
    (incf *aaron-post-fill-maps-error-count*)
    (incf (getf context :reader-errors))
    (setf *aaron-post-fill-maps-failed* t))

  (defun aaron-post-fill-maps-reader-complete (context kind token results)
    (when token
      (let* ((calls-key (if (eq kind :patchdex)
                            :patchdex-observed-results
                          :cform-count-observed-results))
             (first-set-key (if (eq kind :patchdex)
                                :patchdex-first-result-set
                              :cform-count-first-result-set))
             (first-key (if (eq kind :patchdex)
                            :patchdex-first-result
                          :cform-count-first-result))
             (valid-key (if (eq kind :patchdex)
                            :patchdex-first-result-valid
                          :cform-count-first-result-valid))
             (mismatch-key (if (eq kind :patchdex)
                               :patchdex-result-mismatches
                             :cform-count-result-mismatches))
             (valid (and (= (length results) 1) (integerp (car results)))))
        (incf (getf context calls-key))
        (unless valid (aaron-post-fill-maps-reader-error context))
        (if (getf context first-set-key)
            (unless (and valid (getf context valid-key)
                         (eql (getf context first-key) (car results)))
              (incf (getf context mismatch-key)))
          (setf (getf context first-set-key) t
                (getf context valid-key) valid
                (getf context first-key) (and valid (car results)))))))

  (defun aaron-post-fill-maps-reader-abort (context kind token)
    (when token
      (let ((key (if (eq kind :patchdex)
                     :patchdex-no-return :cform-count-no-return)))
        (incf (getf context key))
        (aaron-post-fill-maps-reader-error context))))

  (defun aaron-post-fill-maps-reader-summary (context)
    (let* ((patch-calls (getf context :patchdex-calls))
           (cform-calls (getf context :cform-count-calls))
           (patch-present (plusp patch-calls))
           (patch-arg-eq
             (cond ((not patch-present) :absent)
                   ((zerop (getf context :patchdex-observed)) :unobserved)
                   ((plusp (getf context :patchdex-argument-eq-mismatches)) nil)
                   (t t)))
           (cform-patch-eq
             (cond ((not patch-present) :absent)
                   ((or (zerop (getf context :patchdex-observed))
                        (zerop (getf context :cform-count-observed)))
                    :unobserved)
                   ((not (getf context :cform-count-first-argument-set)) nil)
                   (t (eq (getf context :patchdex-first-argument)
                          (getf context :cform-count-first-argument)))))
           (summary
             (list :status (if (or (plusp (getf context :reader-errors))
                                   (getf context :reader-overflow))
                               :error :complete)
                   :reader-calls (+ patch-calls cform-calls)
                   :patchdex-calls patch-calls
                   :patchdex-present patch-present
                   :patchdex-observed-results
                   (getf context :patchdex-observed-results)
                   :patchdex-first-result
                   (cond ((not patch-present) :absent)
                         ((zerop (getf context :patchdex-observed)) :unobserved)
                         ((getf context :patchdex-first-result-valid)
                          (getf context :patchdex-first-result))
                         (t :invalid))
                   :patchdex-first-result-valid
                   (getf context :patchdex-first-result-valid)
                   :patchdex-result-mismatches
                   (getf context :patchdex-result-mismatches)
                   :patchdex-result-consistent
                   (cond ((not patch-present) :absent)
                         ((zerop (getf context :patchdex-observed)) :unobserved)
                         (t (zerop (getf context :patchdex-result-mismatches))))
                   :patchdex-argument-eq-first patch-arg-eq
                   :patchdex-argument-eq-mismatches
                   (getf context :patchdex-argument-eq-mismatches)
                   :patchdex-argument-count-violations
                   (getf context :patchdex-argument-count-violations)
                   :patchdex-no-return (getf context :patchdex-no-return)
                   :cform-count-calls cform-calls
                   :cform-count-observed-results
                   (getf context :cform-count-observed-results)
                   :cform-count-first-result
                   (cond ((zerop cform-calls) :absent)
                         ((zerop (getf context :cform-count-observed)) :unobserved)
                         ((getf context :cform-count-first-result-valid)
                          (getf context :cform-count-first-result))
                         (t :invalid))
                   :cform-count-first-result-valid
                   (getf context :cform-count-first-result-valid)
                   :cform-count-result-mismatches
                   (getf context :cform-count-result-mismatches)
                   :cform-count-argument-eq-patchdex cform-patch-eq
                   :cform-count-argument-eq-mismatches
                   (getf context :cform-count-argument-eq-mismatches)
                   :cform-count-argument-count-violations
                   (getf context :cform-count-argument-count-violations)
                   :cform-count-no-return (getf context :cform-count-no-return)
                   :reader-overflow (getf context :reader-overflow)
                   :reader-errors (getf context :reader-errors))))
      (unless (= cform-calls 1)
        (aaron-post-fill-maps-reader-error context))
      (when (and patch-present
                 (or (not (getf context :patchdex-first-result-valid))
                     (plusp (getf context :patchdex-result-mismatches))
                     (plusp (getf context :patchdex-argument-eq-mismatches))))
        (aaron-post-fill-maps-reader-error context))
      (when (or (not (getf context :cform-count-first-result-valid))
                (plusp (getf context :cform-count-result-mismatches))
                (plusp (getf context :cform-count-argument-eq-mismatches))
                (and patch-present (not cform-patch-eq)))
        (aaron-post-fill-maps-reader-error context))
      (setf (getf summary :status)
            (if (or (plusp (getf context :reader-errors))
                    (getf context :reader-overflow)) :error :complete)
            (getf summary :reader-errors) (getf context :reader-errors))
      summary))

  (defun aaron-post-fill-maps-new-reader-context (id)
    (list :id id
          :patchdex-calls 0 :patchdex-observed 0 :patchdex-observed-results 0
          :patchdex-first-argument nil :patchdex-first-argument-set nil
          :patchdex-argument-eq-mismatches 0
          :patchdex-argument-count-violations 0
          :patchdex-first-result nil :patchdex-first-result-set nil
          :patchdex-first-result-valid nil :patchdex-result-mismatches 0
          :patchdex-no-return 0
          :cform-count-calls 0 :cform-count-observed 0
          :cform-count-observed-results 0
          :cform-count-first-argument nil :cform-count-first-argument-set nil
          :cform-count-argument-eq-mismatches 0
          :cform-count-argument-count-violations 0
          :cform-count-first-result nil :cform-count-first-result-set nil
          :cform-count-first-result-valid nil :cform-count-result-mismatches 0
          :cform-count-no-return 0 :reader-overflow nil :reader-errors 0))

  (defun aaron-post-fill-maps-reader-wrapper (kind original arguments)
    (let* ((context (car *aaron-post-fill-maps-contexts*))
           (token (handler-case
                      (aaron-post-fill-maps-reader-start context kind arguments)
                    (condition (problem)
                      (aaron-post-fill-maps-mark-error
                       (getf context :id) (list kind :reader-start) problem)
                      nil)))
           (completed nil))
      (unwind-protect
          (multiple-value-call
              (lambda (&rest results)
                (setf completed t)
                (handler-case
                    (aaron-post-fill-maps-reader-complete
                     context kind token results)
                  (condition (problem)
                    (aaron-post-fill-maps-mark-error
                     (getf context :id) (list kind :reader-return) problem)))
                (values-list results))
            (apply original arguments))
        (unless completed
          (handler-case
              (aaron-post-fill-maps-reader-abort context kind token)
            (condition (problem)
              (aaron-post-fill-maps-mark-error
               (getf context :id) (list kind :reader-abort) problem)))))))

  (defun aaron-post-fill-maps-patchdex-wrapper (&rest arguments)
    (if (and (not *aaron-post-fill-maps-suppress-readers*)
             *aaron-post-fill-maps-contexts*
             *aaron-post-fill-maps-patchdex-original*)
        (aaron-post-fill-maps-reader-wrapper
         :patchdex *aaron-post-fill-maps-patchdex-original* arguments)
      (apply *aaron-post-fill-maps-patchdex-original* arguments)))

  (defun aaron-post-fill-maps-cform-count-wrapper (&rest arguments)
    (if (and (not *aaron-post-fill-maps-suppress-readers*)
             *aaron-post-fill-maps-contexts*
             *aaron-post-fill-maps-cform-count-original*)
        (aaron-post-fill-maps-reader-wrapper
         :cform-count *aaron-post-fill-maps-cform-count-original* arguments)
      (apply *aaron-post-fill-maps-cform-count-original* arguments)))

  (defun aaron-post-fill-maps-argument-record (arguments id)
    (if (and (= (length arguments) 3)
             (eq (first arguments) *aaron-post-fill-maps-subform-symbol*)
             (integerp (second arguments)) (integerp (third arguments)))
        arguments
      (progn
        (aaron-post-fill-maps-mark-error id :arguments :unexpected-shape)
        (list :unsupported
              (mapcar #'aaron-post-fill-maps-safe-value arguments)))))

  (defun aaron-post-fill-maps-values-record (values)
    (mapcar #'aaron-post-fill-maps-safe-value values))

  (defun aaron-post-fill-maps-add-entry-eq (state entry-frame entry-fill
                                            entry-patch frame fill patch)
    (append state
            (list :identity-eq-entry
                  (list :sub-frame (eq entry-frame frame)
                        :fill-map (eq entry-fill fill)
                        :patch-map (eq entry-patch patch)))))

  (defun aaron-post-fill-maps-post-fill-wrapper (&rest arguments)
    (let* ((original *aaron-post-fill-maps-post-original*)
           (id (incf *aaron-post-fill-maps-post-count*))
           (subform-p (and arguments
                           (eq (first arguments)
                               *aaron-post-fill-maps-subform-symbol*))))
      (cond (subform-p (incf *aaron-post-fill-maps-subform-count*))
            ((and arguments
                  (eq (first arguments) *aaron-post-fill-maps-cform-symbol*))
             (incf *aaron-post-fill-maps-cform-count*))
            (t (incf *aaron-post-fill-maps-other-count*)))
      (cond ((or (null *aaron-post-fill-maps-report*)
                 *aaron-post-fill-maps-finished*)
             (apply original arguments))
            ((> id *aaron-post-fill-maps-call-limit*)
             (aaron-post-fill-maps-mark-overflow
              :post-fill-calls (list id *aaron-post-fill-maps-call-limit*))
             (apply original arguments))
            ((not subform-p)
             (apply original arguments))
            (t
             (let* ((context (aaron-post-fill-maps-new-reader-context id))
                    (argument-record
                      (aaron-post-fill-maps-argument-record arguments id))
                    (before-values
                      (aaron-post-fill-maps-safe-capture-state id :before))
                    (before (first before-values))
                    (entry-frame (second before-values))
                    (entry-fill (third before-values))
                    (entry-patch (fourth before-values))
                    (completed nil) (context-active nil))
               (aaron-post-fill-maps-emit
                "CALL id=~D name=~S args=~S before=~S"
                id "POST-FILL" argument-record before)
               (push context *aaron-post-fill-maps-contexts*)
               (setf context-active t)
               (unwind-protect
                   (multiple-value-call
                       (lambda (&rest results)
                         (setf completed t)
                         (setf *aaron-post-fill-maps-contexts*
                               (cdr *aaron-post-fill-maps-contexts*)
                               context-active nil)
                         (handler-case
                             (let* ((readers
                                      (aaron-post-fill-maps-reader-summary context))
                                    (after-values
                                      (aaron-post-fill-maps-safe-capture-state
                                       id :after))
                                    (after
                                      (aaron-post-fill-maps-add-entry-eq
                                       (first after-values) entry-frame entry-fill
                                       entry-patch (second after-values)
                                       (third after-values) (fourth after-values)))
                                    (final-state
                                      (append after (list :readers readers))))
                               (aaron-post-fill-maps-emit
                                "RETURN id=~D values=~S after=~S"
                                id (aaron-post-fill-maps-values-record results)
                                final-state))
                           (condition (problem)
                             (aaron-post-fill-maps-mark-error
                              id :return-observation problem)
                             (aaron-post-fill-maps-emit
                              "RETURN id=~D values=~S after=~S"
                              id (aaron-post-fill-maps-values-record results)
                              (list :status :observation-error))))
                         (values-list results))
                     (apply original arguments))
                 (unless completed
                   (incf *aaron-post-fill-maps-abort-count*)
                   (when context-active
                     (setf *aaron-post-fill-maps-contexts*
                           (cdr *aaron-post-fill-maps-contexts*)
                           context-active nil))
                   (handler-case
                       (let* ((readers
                                (aaron-post-fill-maps-reader-summary context))
                              (after-values
                                (aaron-post-fill-maps-safe-capture-state id :abort))
                              (after
                                (aaron-post-fill-maps-add-entry-eq
                                 (first after-values) entry-frame entry-fill
                                 entry-patch (second after-values)
                                 (third after-values) (fourth after-values))))
                         (aaron-post-fill-maps-emit
                          "ABORT id=~D after=~S readers=~S" id after readers))
                     (condition (problem)
                       (aaron-post-fill-maps-mark-error
                        id :abort-observation problem)
                       (aaron-post-fill-maps-emit
                        "ABORT id=~D after=~S readers=~S" id
                        (list :status :observation-error)
                        (list :status :error)))))
                 (when context-active
                   (setf *aaron-post-fill-maps-contexts*
                         (cdr *aaron-post-fill-maps-contexts*)))))))))

  (defun aaron-post-fill-maps-finish (main-status)
    (unless *aaron-post-fill-maps-finished*
      (setf *aaron-post-fill-maps-finished* t)
      (when (and (eq main-status :normal)
                 (zerop *aaron-post-fill-maps-subform-count*))
        (incf *aaron-post-fill-maps-error-count*)
        (setf *aaron-post-fill-maps-failed* t))
      (let ((status
              (cond ((not (eq main-status :normal)) :main-aborted)
                    ((plusp *aaron-post-fill-maps-error-count*) :incomplete)
                    (*aaron-post-fill-maps-overflow* :incomplete)
                    ((plusp *aaron-post-fill-maps-abort-count*) :incomplete)
                    (*aaron-post-fill-maps-contexts* :unbalanced-calls)
                    ((zerop *aaron-post-fill-maps-subform-count*) :no-subform-posts)
                    (t :complete))))
        (aaron-post-fill-maps-emit
         "TOTAL post-fill=~D subform=~D cform=~D other=~D readers=~D observed-readers=~D runs=~D"
         *aaron-post-fill-maps-post-count* *aaron-post-fill-maps-subform-count*
         *aaron-post-fill-maps-cform-count* *aaron-post-fill-maps-other-count*
         *aaron-post-fill-maps-reader-count* *aaron-post-fill-maps-reader-observed*
         *aaron-post-fill-maps-run-count*)
        (aaron-post-fill-maps-emit
         "COMPLETE main=~S status=~S errors=~D aborts=~D overflow=~S depth=~D"
         main-status status *aaron-post-fill-maps-error-count*
         *aaron-post-fill-maps-abort-count* *aaron-post-fill-maps-overflow*
         (length *aaron-post-fill-maps-contexts*)))
      (aaron-post-fill-maps-emit "END post-fill-maps v1")
      (when *aaron-post-fill-maps-report*
        (handler-case (close *aaron-post-fill-maps-report*)
          (condition () (setf *aaron-post-fill-maps-failed* t)))
        (setf *aaron-post-fill-maps-report* nil))))

  (defun aaron-post-fill-maps-main-wrapper (&rest arguments)
    (let ((completed nil))
      (unwind-protect
          (multiple-value-prog1
              (apply *aaron-post-fill-maps-main-original* arguments)
            (setf completed t
                  *aaron-post-fill-maps-main-completed* t)
            (aaron-post-fill-maps-finish :normal))
        (unless completed
          (aaron-post-fill-maps-finish :aborted)))))

  (let* ((owner (find-package "COMMON-GRAPHICS-USER"))
         (post-symbol (and owner (find-symbol "POST-FILL" owner)))
         (patchdex-symbol (and owner (find-symbol "PATCHDEX" owner)))
         (cform-count-symbol (and owner (find-symbol "CFORM-COUNT" owner)))
         (main-symbol (and owner (find-symbol "MAIN" owner)))
         (subform-symbol (and owner (find-symbol "SUBFORM" owner)))
         (cform-symbol (and owner (find-symbol "CFORM" owner)))
         (report (open "C:\\temp\\aaron-post-fill-maps.txt"
                       :direction :output :if-exists :supersede
                       :if-does-not-exist :create)))
    (setf *aaron-post-fill-maps-owner* owner
          *aaron-post-fill-maps-report* report
          *aaron-post-fill-maps-overflow-kinds* (make-hash-table :test #'eq)
          *aaron-post-fill-maps-subform-symbol* subform-symbol
          *aaron-post-fill-maps-cform-symbol* cform-symbol)
    (dolist (symbol (list post-symbol patchdex-symbol cform-count-symbol main-symbol))
      (unless (and symbol (fboundp symbol))
        (incf *aaron-post-fill-maps-error-count*)
        (setf *aaron-post-fill-maps-failed* t)))
    (unless (and subform-symbol cform-symbol)
      (incf *aaron-post-fill-maps-error-count*)
      (setf *aaron-post-fill-maps-failed* t))
    (aaron-post-fill-maps-emit "BEGIN post-fill-maps v1")
    (aaron-post-fill-maps-emit
     "CAPS post-fill=~D rectangle-cells=~D serialized-runs=~D reader-observations=~D coordinate-order=XY inclusive=T extra-right-X=T"
     *aaron-post-fill-maps-call-limit*
     *aaron-post-fill-maps-rectangle-cell-limit*
     *aaron-post-fill-maps-run-limit*
     *aaron-post-fill-maps-reader-limit*)
    (if (plusp *aaron-post-fill-maps-error-count*)
        (progn
          (aaron-post-fill-maps-emit "ERROR stage=INSTALL type=:MISSING-FUNCTION")
          (aaron-post-fill-maps-finish :install-error))
      (let ((post-original (symbol-function post-symbol))
            (patchdex-original (symbol-function patchdex-symbol))
            (cform-count-original (symbol-function cform-count-symbol))
            (main-original (symbol-function main-symbol)))
        (setf *aaron-post-fill-maps-post-original* post-original
              *aaron-post-fill-maps-patchdex-original* patchdex-original
              *aaron-post-fill-maps-cform-count-original* cform-count-original
              *aaron-post-fill-maps-main-original* main-original)
        (handler-case
            (progn
              (setf (symbol-function patchdex-symbol)
                    #'aaron-post-fill-maps-patchdex-wrapper)
              (setf (symbol-function cform-count-symbol)
                    #'aaron-post-fill-maps-cform-count-wrapper)
              (setf (symbol-function post-symbol)
                    #'aaron-post-fill-maps-post-fill-wrapper)
              (setf (symbol-function main-symbol)
                    #'aaron-post-fill-maps-main-wrapper)
              (aaron-post-fill-maps-emit
               "INSTALL post-fill-type=~S patchdex-type=~S cform-count-type=~S main-type=~S"
               (type-of post-original) (type-of patchdex-original)
               (type-of cform-count-original) (type-of main-original))
              (aaron-post-fill-maps-emit "READY"))
          (condition (problem)
            (ignore-errors (setf (symbol-function main-symbol) main-original))
            (ignore-errors (setf (symbol-function post-symbol) post-original))
            (ignore-errors (setf (symbol-function patchdex-symbol) patchdex-original))
            (ignore-errors (setf (symbol-function cform-count-symbol)
                                 cform-count-original))
            (aaron-post-fill-maps-mark-error "INSTALL" :function-cell problem)
            (aaron-post-fill-maps-finish :install-error)))))))
